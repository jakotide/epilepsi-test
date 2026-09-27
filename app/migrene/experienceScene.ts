import * as THREE from "three";
import gsap from "gsap";
import { paperShader } from "./brain/paintedMaterial";
import { createGroveLayers } from "./groveLayers";
import { createPaintJourney } from "./paintJourney";
import { createMugOrbit, createPaintedOrbit } from "./mugOrbit";

export type ExperienceScene = { select: (index: number) => void; setEffect: (enabled: boolean) => void; dispose: () => void };

const noise = /* glsl */ `
  float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float noise(vec3 p) {
    vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
`;

export function createExperienceScene(host: HTMLDivElement, onAssetError?: () => void, onSceneVisible?: (index: number) => void): ExperienceScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f8f5ef");
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 60);
  const groveCamera = new THREE.PerspectiveCamera(35, 1, .1, 60);
  const journeyCamera = new THREE.PerspectiveCamera();
  camera.position.set(3.4, 3.1, 7.0);
  camera.lookAt(0, .4, 0);
  const mug = new THREE.Group(), grove = new THREE.Group(), bouquet = new THREE.Group();
  scene.add(mug, grove, bouquet);
  grove.visible = bouquet.visible = false;
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const add = (group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); group.add(mesh); return mesh;
  };
  // Adjacent Blender angles preserve the rose shader as the actual mug turns.
  // Blend premultiplied colors so transparent silhouettes stay clean.
  const mugMaterial = new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{uViewA:{value:null},uViewB:{value:null},uBlend:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D uViewA,uViewB;uniform float uBlend;varying vec2 vUv;
      void main(){
        vec4 a=texture2D(uViewA,vUv),b=texture2D(uViewB,vUv);
        float alpha=mix(a.a,b.a,uBlend);
        vec3 color=mix(a.rgb*a.a,b.rgb*b.a,uBlend)/max(alpha,.00001);
        gl_FragColor=vec4(color,alpha);
      }`,
  });
  materials.push(mugMaterial);
  const mugPainting = add(mug,new THREE.PlaneGeometry(5.6,5.6),mugMaterial,[0,.4,0]);
  mugPainting.visible = false;
  const bouquetMaterial=mugMaterial.clone();materials.push(bouquetMaterial);
  bouquetMaterial.uniforms.uWashTime={value:0};
  bouquetMaterial.fragmentShader=`${noise}
    uniform sampler2D uViewA;uniform float uWashTime;varying vec2 vUv;
    void main(){
      vec4 paint=texture2D(uViewA,vUv);
      // Layered paper-white washes dissolve the cut ends into the same paper
      // as the background. The mask follows the bouquet through every journey.
      float bloom=noise(vec3(vUv*vec2(11.,9.)+vec2(uWashTime*.012,0.),6.));
      float tooth=noise(vec3(vUv*vec2(61.,35.),12.));
      float edge=.235+(bloom-.5)*.065+(tooth-.5)*.020;
      float tipEdge=.237+(bloom-.5)*.012;
      float tips=1.-smoothstep(tipEdge,tipEdge+.033,vUv.y);
      float wisps=(.18+.30*bloom)*(1.-smoothstep(edge-.010,edge+.065,vUv.y));
      paint.a*=1.-max(tips,wisps);
      gl_FragColor=paint;
    }`;
  const bouquetPainting=add(bouquet,new THREE.PlaneGeometry(5.1,5.7375),bouquetMaterial,[0,.4,0]);
  bouquetPainting.visible=false;
  const washMaterial = (tint: string, opacity: number) => {
    const material = new THREE.ShaderMaterial({ transparent:true,depthWrite:false,
      uniforms:{ uColor:{value:new THREE.Color(tint)},uOpacity:{value:opacity} },
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`${noise} varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;
        void main(){float n=noise(vec3(vUv*17.,2.));float d=length((vUv-.5)*2.)+(n-.5)*.18;
        float a=.45*(1.-smoothstep(.65,1.,d))+.30*(1.-smoothstep(.35,.8,d));gl_FragColor=vec4(uColor,a*uOpacity);}`,
    }); materials.push(material); return material;
  };
  const backwash=add(mug,new THREE.PlaneGeometry(5.6,4),washMaterial("#c9b5b8",.16),[0,.5,-1.6]);
  backwash.rotation.y=.25;
  // Each Blender angle now includes its own area-light cast/contact shadow.
  backwash.renderOrder=-3;
  host.dataset.groveLoaded="false";
  const groveLayers=createGroveLayers(grove,()=>{
    host.dataset.groveLoaded="true";requestDraw();
  },()=>{host.dataset.groveLoaded="error";onAssetError?.();});
  const target = new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});
  const blurTarget = new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  // Keep a sharp scene alongside the soft periphery of the bouquet's field of vision.
  const softTarget = new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  // Separable Gaussian blur stays smooth at large radii without sparse echoes.
  const blurMaterial = new THREE.ShaderMaterial({
    uniforms:{uSource:{value:target.texture},uStep:{value:new THREE.Vector2()}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform sampler2D uSource;uniform vec2 uStep;
      void main(){
        vec3 color=vec3(0.);float total=0.;
        for(int i=-12;i<=12;i++){
          float f=float(i),weight=exp(-f*f/46.08);
          color+=texture2D(uSource,vUv+uStep*f).rgb*weight;total+=weight;
        }
        gl_FragColor=vec4(color/total,1.);
      }`,
    depthTest:false,depthWrite:false,
  });
  const neutral = new THREE.DataTexture(new Uint8Array([210,210,210,255]),1,1);neutral.needsUpdate=true;
  let paper: THREE.Texture | undefined;
  const post = new THREE.ShaderMaterial({
    uniforms: { uScene:{value:target.texture},uSoftScene:{value:softTarget.texture},uTime:{value:0},uAuraReveal:{value:1},uAuraMotion:{value:0},uAuraTurn:{value:0}, uResolution:{value:new THREE.Vector2(1,1)},uPortrait:{value:0},uPaper:{value:neutral},uPaperColor:{value:new THREE.Color("#f8f5ef")},uStrength:{value:1},uMode:{value:0},uFade:{value:1},uEffectVisibility:{value:1} },
    vertexShader:`void main(){gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: /* glsl */ `${paperShader} ${noise}
      uniform sampler2D uScene,uSoftScene; uniform float uStrength,uMode,uFade,uEffectVisibility,uPortrait,uTime;
      uniform float uAuraReveal,uAuraMotion,uAuraTurn;
      void main(){
        vec2 uv=gl_FragCoord.xy/uResolution;
        float strength=uStrength*uEffectVisibility;
        vec3 color=texture2D(uScene,uv).rgb;
        if(uMode>.5&&uMode<1.5&&strength>.001){
          // Six stable spots belong to the visual field, so trees move behind
          // them while orbiting. Mobile positions follow its raised clearing.
          for(int i=0;i<6;i++){
            float f=float(i);
            vec2 p=vec2(.16,.68);
            if(i==1)p=vec2(.35,.72);
            if(i==2)p=vec2(.51,.58);
            if(i==3)p=vec2(.23,.43);
            if(i==4)p=vec2(.40,.32);
            if(i==5)p=vec2(.10,.29);
            vec2 mobile=vec2(.5+(p.x-.30)*1.55,.64+(p.y-.50)*.54);
            p=mix(p,mobile,uPortrait);
            float r=(.081+mod(f*2.,3.)*.013)*mix(1.,.61,uPortrait);
            vec2 d=(uv-p)*vec2(uResolution.x/uResolution.y,1.)/r;
            if(length(d)>1.5)continue;
            float pigment=noise(vec3(d*4.5,f*3.+2.));
            float edge=length(d)+(noise(vec3(d*2.8,f+8.))-.5)*.17;
            float halo=(1.-smoothstep(.65,1.40,edge))*.18;
            float wash=1.-smoothstep(.70,1.07,edge);
            float pool=smoothstep(.53,.78,edge)*(1.-smoothstep(.82,1.04,edge));
            vec3 tint=mix(vec3(.84,.91,.88),vec3(.96,.86,.72),mod(f,3.)*.5);
            if(i==2||i==4)tint=vec3(.83,.85,.94);
            tint=mix(tint,vec3(.985,.975,.94),(1.-smoothstep(.2,.85,edge))*.65);
            tint*=1.-pool*.07-(pigment-.5)*.055;
            float opacity=clamp(halo+wash*(.86+pigment*.10),0.,.98);
            color=mix(color,tint,opacity*strength);
          }
        }
        if(uMode>1.5&&uMode<2.5&&strength>.001){
          // A clear central window with a broken, painted zigzag crescent.
          // This is fixed in the visual field while the bouquet rotates behind it.
          vec2 center=mix(vec2(.33,.57),vec2(.5,.68),uPortrait);
          float scale=mix(1.,.61,uPortrait);
          vec2 p=(uv-center)*vec2(uResolution.x/uResolution.y,1.)/scale;
          float radius=length(p),angle=atan(p.y,p.x);
          float flow=uTime*.20;
          float arrival=smoothstep(0.,1.,uAuraReveal);
          float breath=sin(uTime*.58)*.014;
          float wash=noise(vec3(p*12.,3.));
          float periphery=smoothstep(.17,.37,radius+(wash-.5)*.025);
          color=mix(color,texture2D(uSoftScene,uv).rgb,periphery*.96*strength);
          float phase=angle+sin(flow)*.035+uAuraTurn*.075;
          float zig=abs(fract(phase/6.2831853*14.)*2.-1.);
          float contour=.255+zig*(.074+uAuraMotion*.014)+.014*sin(angle*3.+flow)
            +breath+uAuraMotion*.020-(1.-arrival)*.045;
          float brush=noise(vec3(p*49.,7.));
          float grain=noise(vec3(p*230.,13.));
          // Stronger at the upper left; gaps and dilution avoid a closed hard ring.
          float arc=smoothstep(-.93,-.25,sin(angle))*(.58+.42*smoothstep(-.4,.7,-cos(angle)));
          float broken=mix(.28,1.,smoothstep(.23,.57,noise(vec3(p*17.,8.))));
          for(int i=0;i<10;i++){
            float f=float(i);
            float spacing=.020+sin(uTime*.43)*.0015+uAuraMotion*.003;
            float distance=abs(radius-contour-f*spacing+(brush-.5)*.006);
            float width=.0055+mod(f,3.)*.0012;
            float tooth=(grain-.5)*.0025;
            float stroke=1.-smoothstep(width+tooth,width+.003+fwidth(radius),distance);
            float bleed=(1.-smoothstep(width,width+.012,distance))*.17;
            vec3 pigment=vec3(.70,.37,.48);
            if(i==1||i==5||i==8)pigment=vec3(.54,.49,.71);
            if(i==2||i==6||i==9)pigment=vec3(.43,.65,.73);
            if(i==3)pigment=vec3(.79,.69,.39);
            if(i==4)pigment=vec3(.61,.70,.54);
            pigment*=.97+(brush-.5)*.10;
            float paintedIn=smoothstep(f*.048,f*.048+.48,uAuraReveal);
            float outerDilution=1.-smoothstep(4.,10.,f)*.40;
            float opacity=(stroke*.52+bleed)*arc*broken*(.72+grain*.28)
              *paintedIn*outerDilution*(1.+uAuraMotion*.15);
            color=mix(color,pigment,opacity*strength);
          }
        }
        if(uMode>2.5)color=mix(color,vec3(.94,.935,.91),strength*.36);
        // Effects soften the subject; the final paper fibers stay crisp.
        vec3 paper=paperAt(uv);
        // Stronger fiber contrast here only; preserve the earlier hero/brain paper.
        paper=uPaperColor*clamp(vec3(.96)+(paper/uPaperColor-vec3(.96))*1.7,vec3(.65),vec3(1.045));
        color*=paper/uPaperColor;
        color=mix(paper,color,uFade);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
    depthTest:false,depthWrite:false,
  });
  const screenScene=new THREE.Scene(), screenCamera=new THREE.Camera();
  const screenGeometry=new THREE.PlaneGeometry(2,2);
  screenScene.add(new THREE.Mesh(screenGeometry,post));
  const blurScene=new THREE.Scene();
  blurScene.add(new THREE.Mesh(screenGeometry,blurMaterial));
  const journey=createPaintJourney(post.uniforms);
  const travel={active:false,swapped:false,forest:false,length:3.4,distance:0,turn:0,exit:0,direction:1};
  let travelLift=0;
  const baseCamera=new THREE.Vector3(),baseMug=new THREE.Vector3(),baseGrove=new THREE.Vector3();
  const cameraRight=new THREE.Vector3(),cameraUp=new THREE.Vector3(),cameraForward=new THREE.Vector3();
  const groveForward=new THREE.Vector3(),groveFocus=new THREE.Vector3();
  const journeyUp=new THREE.Vector3(),journeyForward=new THREE.Vector3();
  const preference=matchMedia("(prefers-reduced-motion: reduce)");
  let alive=true, visible=false, frame=0, selection=0, displayed=0;
  let lastTime=0, motionTime=0, pointer=0, pointerTarget=0, selectionVersion=0;
  let mugAngle=0, mugTouched=false, groveAngle=0, bouquetAngle=0;
  let auraImpulse=0, auraTurnTarget=0;
  const turnBouquet=(angle:number)=>{
    const change=angle-bouquetAngle;bouquetAngle=angle;
    if(preference.matches)return;
    auraImpulse=Math.min(1,auraImpulse+Math.abs(change)/32);
    auraTurnTarget=THREE.MathUtils.clamp(change/12,-1,1);
  };
  let drag: { id:number; x:number; y:number; start:number; moved:boolean } | undefined;
  let transition: gsap.core.Timeline | undefined;
  host.dataset.journey="idle";
  const positionWorld=()=>{
    const forest=travel.active&&travel.forest;
    const lift=forest?0:travelLift;
    mug.position.copy(baseMug);bouquet.position.copy(baseMug);grove.position.copy(baseGrove);
    // Orbit a fixed clearing. Its roots, grass and ground never rotate or slide.
    const yaw=-THREE.MathUtils.degToRad(groveAngle);
    groveFocus.set(0,.6*grove.scale.x,0).applyQuaternion(grove.quaternion).add(baseGrove);
    groveCamera.position.set(Math.sin(yaw)*8.5,.85,Math.cos(yaw)*8.5)
      .applyQuaternion(grove.quaternion).add(groveFocus);
    groveCamera.up.set(0,1,0).applyQuaternion(grove.quaternion);
    groveCamera.lookAt(groveFocus);groveCamera.updateMatrixWorld();
    groveCamera.getWorldDirection(groveForward);
    camera.position.copy(baseCamera);camera.updateMatrixWorld();
    // The brush continues along the outgoing view even after the hidden swap.
    journeyCamera.copy(forest?groveCamera:camera);
    journeyCamera.getWorldDirection(journeyForward);
    journeyUp.setFromMatrixColumn(journeyCamera.matrixWorld,1);
    journeyCamera.position.addScaledVector(journeyForward,travel.distance)
      .addScaledVector(journeyUp,travel.distance*lift);
    journeyCamera.updateMatrixWorld();
    camera.position.addScaledVector(cameraForward,travel.distance).addScaledVector(cameraUp,travel.distance*lift);
    camera.updateMatrixWorld();
    groveCamera.position.addScaledVector(groveForward,travel.distance);groveCamera.updateMatrixWorld();
    if(travel.active){
      const subject=grove.visible?grove:bouquet.visible?bouquet:mug;
      if(travel.swapped){
        if(subject===grove)subject.position.addScaledVector(groveForward,travel.length);
        else subject.position.addScaledVector(cameraForward,travel.length).addScaledVector(cameraUp,travel.length*lift);
      }else if(!forest){
        subject.position.addScaledVector(cameraForward,travel.exit*.5).addScaledVector(cameraRight,-travel.exit*.20*travel.direction);
      }
    }
    // Trees stay anchored as the camera crosses their depth planes. The wash
    // trails just behind the motion instead of appearing before departure.
    if(forest){
      journey.root.position.copy(baseGrove).addScaledVector(journeyUp,.25)
        .addScaledVector(journeyForward,travel.distance*.82);
    }else journey.root.position.copy(baseMug).addScaledVector(cameraUp,host.clientWidth<=700?-.4:.4);
    journey.root.quaternion.copy(journeyCamera.quaternion);
    journey.uniforms.uFlow.value=travel.distance;
  };
  const draw=(time:number)=>{
    frame=0;if(!alive||!visible||document.hidden)return;
    const animate=((mug.visible&&orbit.ready)||(grove.visible&&groveLayers.ready)||(bouquet.visible&&bouquetOrbit.ready))&&!preference.matches;
    const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;
    lastTime=animate?time:0;
    if(animate){
      motionTime+=dt;
      pointer+=(pointerTarget-pointer)*(1.-Math.exp(-dt*3));
    }
    if(bouquet.visible){
      if(preference.matches){
        post.uniforms.uAuraReveal.value=1;
        post.uniforms.uAuraMotion.value=post.uniforms.uAuraTurn.value=0;
      }else{
        const ease=1.-Math.exp(-dt*5);
        post.uniforms.uAuraMotion.value+=(auraImpulse-post.uniforms.uAuraMotion.value)*ease;
        post.uniforms.uAuraTurn.value+=(auraTurnTarget-post.uniforms.uAuraTurn.value)*ease;
        auraImpulse*=Math.exp(-dt*1.5);auraTurnTarget*=Math.exp(-dt*2);
        if(post.uniforms.uEffectVisibility.value>.55)
          post.uniforms.uAuraReveal.value=Math.min(1,post.uniforms.uAuraReveal.value+dt/1.8);
      }
    }
    const angle=mugAngle+travel.turn*2+(preference.matches||mugTouched?0:Math.sin(motionTime*.32)*5+pointer*2);
    if(mug.visible){
      const view=orbit.sample(angle);
      if(view){
        mugMaterial.uniforms.uViewA.value=view.textureA;mugMaterial.uniforms.uViewB.value=view.textureB;
        mugMaterial.uniforms.uBlend.value=view.blend;mugPainting.visible=true;
      }
    }
    if(bouquet.visible){
      bouquetMaterial.uniforms.uWashTime.value=preference.matches?0:motionTime;
      // Fine single views keep petal silhouettes crisp even when a drag stops
      // between angles; overlapping view-dependent paint causes ghosting.
      const viewAngle=Math.round((bouquetAngle+travel.turn*2)/2.5)*2.5;
      const view=bouquetOrbit.sample(viewAngle);
      if(view){
        bouquetMaterial.uniforms.uViewA.value=view.textureA;bouquetMaterial.uniforms.uViewB.value=view.textureB;
        bouquetMaterial.uniforms.uBlend.value=0;bouquetPainting.visible=true;
      }
    }
    const passage=travel.active&&travel.forest&&!travel.swapped?travel.distance/travel.length:0;
    positionWorld();
    groveLayers.update(motionTime,preference.matches,groveCamera,groveAngle,passage);
    renderer.setRenderTarget(target);renderer.render(scene,grove.visible?groveCamera:camera);
    const strength=post.uniforms.uStrength.value*post.uniforms.uEffectVisibility.value;
    post.uniforms.uTime.value=preference.matches?0:motionTime;
    const radius=([46,7,34,4][displayed]??0)*strength*renderer.getPixelRatio();
    if(radius>.01){
      const resolution=post.uniforms.uResolution.value;
      blurMaterial.uniforms.uSource.value=target.texture;
      blurMaterial.uniforms.uStep.value.set(radius/12/resolution.x,0);
      renderer.setRenderTarget(blurTarget);renderer.render(blurScene,screenCamera);
      blurMaterial.uniforms.uSource.value=blurTarget.texture;
      blurMaterial.uniforms.uStep.value.set(0,radius/12/resolution.y);
      renderer.setRenderTarget(displayed===2?softTarget:target);renderer.render(blurScene,screenCamera);
    }
    renderer.setRenderTarget(null);renderer.render(screenScene,screenCamera);
    if(journey.root.visible&&journey.uniforms.uOpacity.value>.001){
      renderer.autoClear=false;renderer.clearDepth();renderer.render(journey.scene,journeyCamera);renderer.autoClear=true;
    }
    host.dataset.loaded="true";
    host.dataset.effectStrength=post.uniforms.uStrength.value.toFixed(3);
    host.dataset.scene=String(displayed);
    host.dataset.mugView=angle.toFixed(3);
    host.dataset.mugFrames=String(orbit.size);
    host.dataset.bouquetAngle=bouquetAngle.toFixed(3);
    host.dataset.auraMotion=post.uniforms.uAuraMotion.value.toFixed(3);
    host.dataset.auraReveal=post.uniforms.uAuraReveal.value.toFixed(3);
    host.dataset.bouquetFrames=String(bouquetOrbit.size);
    host.dataset.groveAngle=groveAngle.toFixed(3);
    host.dataset.groveFrames=String(groveLayers.frames);
    host.dataset.groveTime=(preference.matches?0:motionTime).toFixed(3);
    host.dataset.travelDistance=travel.distance.toFixed(3);
    host.dataset.passage=passage.toFixed(3);
    host.dataset.journeyType=travel.forest?"woodland":"brush";
    host.dataset.paintProgress=journey.uniforms.uProgress.value.toFixed(3);
    if(animate||travel.active)frame=requestAnimationFrame(draw);
  };
  const requestDraw=()=>{if(alive&&visible&&!frame)frame=requestAnimationFrame(draw);};
  const resize=()=>{
    const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);
    renderer.getDrawingBufferSize(post.uniforms.uResolution.value);
    target.setSize(post.uniforms.uResolution.value.x,post.uniforms.uResolution.value.y);
    blurTarget.setSize(post.uniforms.uResolution.value.x,post.uniforms.uResolution.value.y);
    softTarget.setSize(post.uniforms.uResolution.value.x,post.uniforms.uResolution.value.y);
    post.uniforms.uPortrait.value=w<=700?1:0;
    camera.aspect=w/h;camera.fov=w<=700?42:35;camera.updateProjectionMatrix();
    groveCamera.fov=camera.fov;
    groveCamera.setViewOffset(w,h,w<=700?0:w*.17,w<=700?h*.12:0,w,h);
    camera.position.set(3.4,w<=700?5:3.1,7);
    camera.lookAt(0,.4,0);camera.updateMatrixWorld();
    mugPainting.quaternion.copy(camera.quaternion);
    bouquetPainting.quaternion.copy(camera.quaternion);
    grove.quaternion.copy(camera.quaternion);
    baseCamera.copy(camera.position);
    const right=cameraRight.setFromMatrixColumn(camera.matrixWorld,0);
    const up=cameraUp.setFromMatrixColumn(camera.matrixWorld,1);
    camera.getWorldDirection(cameraForward);
    for(const group of [mug,grove,bouquet]){
      group.position.copy(right).multiplyScalar(w<=700?0:-1.25);
      const isGrove=group===grove;
      if(w<=700)group.position.addScaledVector(up,isGrove?.85:1.2);
      else if(isGrove)group.position.addScaledVector(up,-.20);
      group.scale.setScalar(isGrove?(w<=700?.39:.70):group===bouquet?(w<=700?.64:1.05):(w<=700?.72:1.12));
    }
    baseMug.copy(mug.position);baseGrove.copy(grove.position);
    travelLift=w<=700?.15:0;
    journey.uniforms.uPortrait.value=w<=700?1:0;
    journey.root.position.copy(baseMug).addScaledVector(up,w<=700?-.4:.4);
    journey.root.quaternion.copy(camera.quaternion);
    requestDraw();
  };
  camera.updateMatrixWorld();
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const intersection=new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;lastTime=0;
    transition?.paused(!visible||document.hidden);
    if(visible)void groveLayers.load();
    requestDraw();
  });intersection.observe(host);
  host.dataset.mugLoaded="false";
  const orbit=createMugOrbit(()=>{
    host.dataset.mugLoaded="true";requestDraw();
  },()=>{host.dataset.mugLoaded="error";onAssetError?.();});
  orbit.sample(0);
  host.dataset.bouquetLoaded="false";
  const bouquetOrbit=createPaintedOrbit(index=>`/models/bouquet/orbit-airy/view-${String(index).padStart(2,"0")}.webp`,()=>{
    host.dataset.bouquetLoaded="true";requestDraw();
  },()=>{host.dataset.bouquetLoaded="error";onAssetError?.();},4,144);
  new THREE.TextureLoader().load("/models/brain/rose-paper.jpg",texture=>{
    if(!alive){texture.dispose();return;}paper=texture;paper.colorSpace=THREE.SRGBColorSpace;paper.wrapS=paper.wrapT=THREE.MirroredRepeatWrapping;post.uniforms.uPaper.value=paper;requestDraw();
  });
  const showScene=(index:number)=>{
    if(index===2&&displayed!==2){
      post.uniforms.uAuraReveal.value=preference.matches?1:0;
      post.uniforms.uAuraMotion.value=post.uniforms.uAuraTurn.value=0;
      auraImpulse=auraTurnTarget=0;
    }
    displayed=index;mug.visible=index===0;bouquet.visible=index===2;grove.visible=index%2===1;
    post.uniforms.uMode.value=index;onSceneVisible?.(index);
  };
  const settle=(index:number)=>{
    showScene(index);travel.active=false;travel.swapped=false;travel.forest=false;travel.length=3.4;travel.distance=0;travel.turn=0;travel.exit=0;
    journey.reset();post.uniforms.uFade.value=1;post.uniforms.uEffectVisibility.value=1;
    host.dataset.journey="idle";requestDraw();
  };
  const onVisibility=()=>{lastTime=0;transition?.paused(!visible||document.hidden);requestDraw();};document.addEventListener("visibilitychange",onVisibility);
  const onPointer=(event:PointerEvent)=>{
    if(drag?.id===event.pointerId){
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved&&Math.abs(dx)>5&&Math.abs(dx)>Math.abs(dy)){
        drag.moved=true;host.setPointerCapture(event.pointerId);host.dataset.dragging="true";
      }
      if(drag.moved){
        if(mug.visible){mugTouched=true;mugAngle=drag.start+dx/host.clientWidth*360;}
        else if(bouquet.visible)turnBouquet(drag.start+dx/host.clientWidth*360);
        else groveAngle=drag.start+dx/host.clientWidth*360;
        requestDraw();
      }
      return;
    }
    if(event.pointerType!=="mouse"||preference.matches)return;
    const bounds=host.getBoundingClientRect();
    pointerTarget=THREE.MathUtils.clamp((event.clientX-bounds.left)/bounds.width*2-1,-1,1)*1.1;
    requestDraw();
  };
  const onDown=(event:PointerEvent)=>{
    if(travel.active||!event.isPrimary||event.button!==0)return;
    host.focus({preventScroll:true});
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,start:grove.visible?groveAngle:bouquet.visible?bouquetAngle:mugAngle,moved:false};
  };
  const endDrag=()=>{
    if(drag&&host.hasPointerCapture(drag.id))host.releasePointerCapture(drag.id);
    drag=undefined;host.dataset.dragging="false";
  };
  // Touch starts with implicit capture on the child canvas. Transferring it to
  // the host emits a bubbling loss event from that child, not the end of a drag.
  const onLostCapture=(event:PointerEvent)=>{if(event.target===host)endDrag();};
  const onKey=(event:KeyboardEvent)=>{
    if(travel.active||!["ArrowLeft","ArrowRight","Home"].includes(event.key))return;
    event.preventDefault();
    const step=event.key==="ArrowLeft"?-1:1;
    if(mug.visible){mugTouched=true;mugAngle=event.key==="Home"?0:mugAngle+step*15;}
    else if(bouquet.visible)turnBouquet(event.key==="Home"?0:bouquetAngle+step*15);
    else groveAngle=event.key==="Home"?0:groveAngle+step*15;
    requestDraw();
  };
  const onLeave=()=>{pointerTarget=0;requestDraw();};
  const onPreference=()=>{
    pointer=pointerTarget=0;lastTime=0;
    auraImpulse=auraTurnTarget=0;
    if(preference.matches&&travel.active){
      transition?.kill();settle(displayed);select(selection);
    }
    requestDraw();
  };
  host.addEventListener("pointermove",onPointer);host.addEventListener("pointerleave",onLeave);
  host.addEventListener("pointerdown",onDown);host.addEventListener("pointerup",endDrag);
  host.addEventListener("pointercancel",endDrag);host.addEventListener("lostpointercapture",onLostCapture);
  host.addEventListener("keydown",onKey);
  preference.addEventListener("change",onPreference);
  const select=(index:number)=>{
    endDrag();
    selection=index;
    // Begin loading even when this selection is queued during another journey.
    if(index===2)void bouquetOrbit.load();
    // Keep the current journey continuous; the midpoint takes the latest choice.
    if(travel.active)return;
    const version=++selectionVersion;
    const show=()=>{
      if(!alive||version!==selectionVersion)return;
      if(selection===displayed)return;
      if(preference.matches){settle(selection);return;}
      travel.active=true;travel.swapped=false;travel.distance=0;travel.exit=0;travel.turn=0;
      travel.forest=displayed%2===1;
      travel.length=travel.forest?9.6:3.4;
      travel.direction=selection>displayed?1:-1;
      journey.root.visible=true;journey.uniforms.uDirection.value=travel.direction;
      journey.uniforms.uFollow.value=travel.forest?1:0;
      host.dataset.journey="depart";
      const swap=()=>{
        const ready=selection===2?bouquetOrbit.ready:selection===0||groveLayers.ready;
        const destination=ready?selection:displayed;
        showScene(destination);travel.swapped=true;
      };
      transition=gsap.timeline({onUpdate:requestDraw,onComplete:()=>{
        settle(displayed);
        if(selection!==displayed)select(selection);
      }});
      if(travel.forest){
        transition
          .to(travel,{distance:travel.length,duration:2.65,ease:"power2.inOut"},0)
          .to(post.uniforms.uEffectVisibility,{value:0,duration:.4},0)
          .to(post.uniforms.uFade,{value:0,duration:.70,ease:"power1.inOut"},1.35)
          .to(journey.uniforms.uOpacity,{value:.88,duration:.55},.48)
          .to(journey.uniforms.uProgress,{value:1,duration:1.55,ease:"power1.inOut"},.45)
          .call(()=>{host.dataset.journey="travel";},[],.55)
          .call(swap,[],2.08)
          .to(journey.uniforms.uOpacity,{value:0,duration:.70,ease:"power1.inOut"},2.40)
          .call(()=>{host.dataset.journey="arrive";},[],2.40)
          .to(post.uniforms.uFade,{value:1,duration:.75,ease:"power1.inOut"},2.40)
          .to(post.uniforms.uEffectVisibility,{value:1,duration:.65},2.50);
      }else transition
        .to(travel,{turn:travel.direction*3,exit:1,duration:.65,ease:"power2.inOut"},0)
        .to(post.uniforms.uFade,{value:0,duration:.52,ease:"power1.inOut"},.12)
        .to(post.uniforms.uEffectVisibility,{value:0,duration:.35},.12)
        .to(journey.uniforms.uOpacity,{value:1,duration:.35},.28)
        .to(journey.uniforms.uProgress,{value:1,duration:1.05,ease:"power1.inOut"},.28)
        .to(travel,{distance:travel.length,duration:1.65,ease:"power2.inOut"},.32)
        .call(()=>{host.dataset.journey="travel";},[],.58)
        .call(swap,[],.87)
        .to(journey.uniforms.uOpacity,{value:0,duration:.65,ease:"power1.inOut"},1.27)
        .call(()=>{host.dataset.journey="arrive";},[],1.50)
        .to(post.uniforms.uFade,{value:1,duration:.72,ease:"power1.inOut"},1.50)
        .to(post.uniforms.uEffectVisibility,{value:1,duration:.60},1.62)
        .to(travel,{turn:0,duration:.6},1.62);
      transition.paused(!visible||document.hidden);requestDraw();
    };
    if(index===2&&!bouquetOrbit.ready)void bouquetOrbit.load().then(()=>{if(bouquetOrbit.ready)show();});
    else if(index%2===1&&!groveLayers.ready)void groveLayers.load().then(()=>{if(groveLayers.ready)show();});
    else show();
  };
  return {select,setEffect(enabled){
    if(enabled&&displayed===2)post.uniforms.uAuraReveal.value=preference.matches?1:0;
    gsap.to(post.uniforms.uStrength,{value:enabled?1:0,duration:preference.matches?0:.45,overwrite:true,onUpdate:requestDraw});
  },dispose(){
    alive=false;cancelAnimationFrame(frame);transition?.kill();gsap.killTweensOf(post.uniforms.uStrength);
    observer.disconnect();intersection.disconnect();document.removeEventListener("visibilitychange",onVisibility);
    host.removeEventListener("pointermove",onPointer);host.removeEventListener("pointerleave",onLeave);preference.removeEventListener("change",onPreference);
    endDrag();host.removeEventListener("pointerdown",onDown);host.removeEventListener("pointerup",endDrag);
    host.removeEventListener("pointercancel",endDrag);host.removeEventListener("lostpointercapture",onLostCapture);
    host.removeEventListener("keydown",onKey);
    groveLayers.dispose();
    bouquetOrbit.dispose();
    journey.dispose();
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());target.dispose();blurTarget.dispose();softTarget.dispose();blurMaterial.dispose();post.dispose();screenGeometry.dispose();paper?.dispose();orbit.dispose();neutral.dispose();renderer.dispose();renderer.domElement.remove();
  }};
}
