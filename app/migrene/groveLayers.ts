import * as THREE from "three";
import { createPaintedOrbit } from "./mugOrbit";

/** Fixed woodland anchors; the camera orbits the clearing, never the plants. */
export function createGroveLayers(group: THREE.Group, onReady: () => void, onError: () => void) {
  const textures = new Set<THREE.Texture>();
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const layers: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; opacity: number; file: string; tree: boolean; distance: number; depth: number }[] = [];
  const orbits = new Map<string, ReturnType<typeof createPaintedOrbit>>();
  const grounds: { material: THREE.ShaderMaterial; opacity: number }[] = [];
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
    varying vec2 vUv;uniform sampler2D uImage,uImageB;uniform float uOpacity,uBlend;
    void main(){
      vec4 a=texture2D(uImage,vUv),b=texture2D(uImageB,vUv);
      float alpha=mix(a.a,b.a,uBlend);
      vec4 paint=vec4(mix(a.rgb*a.a,b.rgb*b.a,uBlend)/max(alpha,.00001),alpha);
      float foot=smoothstep(.08,.22,vUv.y);
      gl_FragColor=vec4(paint.rgb,paint.a*uOpacity*foot);
    }
  `;
  function layer(file: string, width: number, height: number, x: number, y: number, z: number, opacity: number, phase: number, sway: number, heading=0) {
    const tree=file.startsWith("woodland/");
    if(file.startsWith("woodland/")&&!orbits.has(file)){
      const tree=file.split("/").pop();
      orbits.set(file,createPaintedOrbit(index=>`/models/grove/woodland/orbit/${tree}/view-${String(index).padStart(2,"0")}.webp`,()=>{if(ready)onReady();},onError));
    }
    const material = new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide,
      uniforms:{uImage:{value:null},uImageB:{value:null},uBlend:{value:0},uOpacity:{value:opacity},uTime:{value:0},uSway:{value:sway},uPhase:{value:phase}},
      vertexShader,fragmentShader,
    });
    const geometry = new THREE.PlaneGeometry(width,height,12,18);
    // Place the painted root at the anchor, so facing the camera cannot move it.
    geometry.translate(0,height*(tree?.38:.28),0);
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);mesh.rotation.y=heading;mesh.visible=false;group.add(mesh);
    layers.push({mesh,material,opacity,file,tree,distance:0,depth:0});materials.push(material);geometries.push(geometry);
    return {file,mesh,material};
  }
  const paintings = [
    layer("woodland/birch-ink",3.60,5.40,-1.88,-1.45,1.03,.97,.3,.012),
    layer("woodland/birch-blue",3.25,4.875,-.14,-1.45,-2.12,.97,4.2,.018),
    layer("woodland/birch-gold",3.30,4.95,1.87,-1.45,1.18,.97,1.5,.014),
    layer("woodland/birch-ink",2.90,4.35,-1.73,-1.45,-1.28,.97,2.1,.019),
    layer("woodland/birch-gold",3.05,4.575,1.65,-1.45,-1.31,.97,3.1,.019),
  ];
  // Crossed painted tufts occupy fixed patches on the ground. They retain their
  // scene headings instead of following the camera or sliding with mouse input.
  for(const [index,[x,z,size]] of [[-1.7,.8,1],[-.65,1.55,.8],[.7,1.45,.9],[1.65,.6,1],[-1.6,-1,.8],[.1,-1.8,.9],[1.4,-1.3,.85],[-.4,-.35,.65],[.85,.1,.6]].entries()){
    for(let crossed=0;crossed<3;crossed++)paintings.push(layer("grass-tufts",size,size/3,x,-1.45,z,.40,index*.8,.010,index*.53+crossed*Math.PI/3));
  }
  function ground(width: number, height: number, x: number, z: number, color: string, opacity: number) {
    const material = new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:false,side:THREE.DoubleSide,
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
    mesh.rotation.x=-Math.PI/2;
    mesh.position.set(x,-1.48,z);mesh.renderOrder=-100;group.add(mesh);
    materials.push(material);geometries.push(geometry);
    grounds.push({material,opacity});
  }
  ground(6.0,5.8,0,0,"#acbca1",.15);
  ground(3.2,2.4,-1.05,.6,"#7e9b94",.12);
  ground(2.9,3.4,1.2,-.65,"#d4c79b",.10);
  const cameraLocal=new THREE.Vector3(),forwardLocal=new THREE.Vector3(),toPlant=new THREE.Vector3();
  const inverseRotation=new THREE.Quaternion();
  const clearingCenter=new THREE.Vector3(0,-1.45,0);

  function load() {
    if (pending) return pending;
    const files = [...new Set(paintings.map(p=>p.file))].filter(file=>!orbits.has(file));
    pending = Promise.all([...orbits.values()].map(orbit=>orbit.load()).concat(files.map(async file=>{
      const texture = await loader.loadAsync(`/models/grove/${file}.webp`);
      if(!alive){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
      for(const painting of paintings.filter(p=>p.file===file)){
        painting.material.uniforms.uImage.value=texture;painting.material.uniforms.uImageB.value=texture;
      }
    }))).then(()=>{
      if(!alive)return;
      if([...orbits.values()].some(orbit=>!orbit.ready))return;
      ready=true;paintings.forEach(p=>{p.mesh.visible=true;});onReady();
    }).catch(()=>{if(alive)onError();});
    return pending;
  }
  return {
    load,
    get ready(){return ready;},
    get frames(){return [...orbits.values()].reduce((sum,orbit)=>sum+orbit.size,0);},
    update(time: number, reduced: boolean, camera: THREE.Camera, angle = 0, passage = 0){
      if(!ready)return;
      group.updateWorldMatrix(true,false);
      cameraLocal.copy(camera.position);group.worldToLocal(cameraLocal);
      group.getWorldQuaternion(inverseRotation).invert();
      camera.getWorldDirection(forwardLocal).applyQuaternion(inverseRotation);
      const centerDistance=cameraLocal.distanceTo(clearingCenter);
      const views=new Map([...orbits].map(([file,orbit])=>[file,orbit.sample(angle)]));
      for(const plant of layers){
        const {mesh,material,opacity,file,tree}=plant;
        const view=views.get(file);
        if(view){material.uniforms.uImage.value=view.textureA;material.uniforms.uImageB.value=view.textureB;material.uniforms.uBlend.value=view.blend;}
        material.uniforms.uTime.value=reduced?0:time;
        if(tree)mesh.rotation.y=-THREE.MathUtils.degToRad(angle);
        toPlant.copy(mesh.position).sub(cameraLocal);
        plant.distance=toPlant.length();plant.depth=toPlant.dot(forwardLocal);
        const relativeDistance=plant.distance-centerDistance;
        const atmosphere=1-.78*THREE.MathUtils.smoothstep(relativeDistance,-1.7,2.0);
        const delay=THREE.MathUtils.clamp(relativeDistance,0,2.5)*.06;
        const passageFade=1-THREE.MathUtils.smoothstep(passage,.35+delay,.77+delay);
        material.uniforms.uOpacity.value=opacity*atmosphere*passageFade*THREE.MathUtils.smoothstep(plant.depth,.15,.75);
      }
      [...layers].sort((a,b)=>b.depth-a.depth).forEach(({mesh},index)=>{mesh.renderOrder=index;});
      for(const {material,opacity} of grounds)material.uniforms.uOpacity.value=opacity*(1-THREE.MathUtils.smoothstep(passage,.15,.55));
    },
    dispose(){alive=false;orbits.forEach(orbit=>orbit.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());group.clear();},
  };
}
