import * as THREE from "three";

/** A small grove composed of independent Blender watercolor renders. */
export function createGroveLayers(group: THREE.Group, onReady: () => void, onError: () => void) {
  const textures = new Set<THREE.Texture>();
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const layers: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; x: number; depth: number }[] = [];
  const loader = new THREE.TextureLoader();
  let alive = true, ready = false, pending: Promise<void> | undefined;
  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    uniform float uTime,uSway,uPhase;
    void main(){
      vUv=uv;
      vec3 p=position;
      p.x+=sin(uTime*.48+uPhase+uv.y*.7)*uSway*pow(uv.y,2.);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }
  `;
  const fragmentShader = /* glsl */ `
    varying vec2 vUv;uniform sampler2D uImage;uniform float uOpacity;
    void main(){
      vec4 paint=texture2D(uImage,vUv);
      float foot=smoothstep(.02,.115,vUv.y);
      gl_FragColor=vec4(paint.rgb,paint.a*uOpacity*foot);
    }
  `;
  function layer(file: string, width: number, height: number, x: number, y: number, z: number, opacity: number, phase: number, sway: number, order: number) {
    const material = new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:false,toneMapped:false,
      uniforms:{uImage:{value:null},uOpacity:{value:opacity},uTime:{value:0},uSway:{value:sway},uPhase:{value:phase}},
      vertexShader,fragmentShader,
    });
    const geometry = new THREE.PlaneGeometry(width,height,12,18);
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);mesh.renderOrder=order;mesh.visible=false;group.add(mesh);
    layers.push({mesh,material,x,depth:z});materials.push(material);geometries.push(geometry);
    return {file,mesh,material};
  }
  const paintings = [
    layer("tree-blue",3.05,3.355,-1.12,.53,-.65,.48,2.1,.028,1),
    layer("tree-gold",2.65,2.915,1.20,.55,-.40,.65,4.2,.024,2),
    layer("tree-sage",3.95,4.345,-.16,.55,.16,.97,.3,.021,3),
    layer("grass-tufts",3.15,1.05,-.25,-1.20,.30,.78,1.2,.016,4),
    layer("grass-tufts",2.2,.733,.84,-.70,-.25,.36,3.1,.012,0),
  ];
  function ground(width: number, height: number, x: number, y: number, color: string, opacity: number) {
    const material = new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:false,
      uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:opacity}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          float d=length((vUv-.5)*2.)+(noise(vUv*19.)-.5)*.19;
          float wash=(1.-smoothstep(.4,1.,d))*.55+(1.-smoothstep(.35,.72,d))*.20;
          gl_FragColor=vec4(uColor,wash*uOpacity);
        }`,
    });
    const geometry = new THREE.PlaneGeometry(width,height);
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,-.05);mesh.renderOrder=-2;group.add(mesh);
    materials.push(material);geometries.push(geometry);
  }
  ground(5.5,1.25,0,-1.03,"#acbca1",.23);
  ground(3.7,.48,-.12,-1.28,"#7e9b94",.19);
  ground(3.5,.78,.9,-.77,"#d4c79b",.16);

  function load() {
    if (pending) return pending;
    const files = [...new Set(paintings.map(p=>p.file))];
    pending = Promise.all(files.map(async file=>{
      const texture = await loader.loadAsync(`/models/grove/${file}.webp`);
      if(!alive){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
      for(const painting of paintings.filter(p=>p.file===file))painting.material.uniforms.uImage.value=texture;
    })).then(()=>{
      if(!alive)return;
      ready=true;paintings.forEach(p=>{p.mesh.visible=true;});onReady();
    }).catch(()=>{if(alive)onError();});
    return pending;
  }
  return {
    load,
    get ready(){return ready;},
    update(time: number, pointer: number, reduced: boolean){
      for(const {mesh,material,x,depth} of layers){
        material.uniforms.uTime.value=reduced?0:time;
        mesh.position.x=x+(reduced?0:pointer*(.055+depth*.05));
      }
    },
    dispose(){alive=false;textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());group.clear();},
  };
}
