import * as THREE from "three";
import gsap from "gsap";
import { paperShader } from "./brain/paintedMaterial";
import { createGroveLayers } from "./groveLayers";
import { createPaintJourney } from "./paintJourney";
import { createMugOrbit } from "./mugOrbit";

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
  const mug = new THREE.Group(), grove = new THREE.Group();
  scene.add(mug, grove);
  grove.visible = false;
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
  const neutral = new THREE.DataTexture(new Uint8Array([210,210,210,255]),1,1);neutral.needsUpdate=true;
  let paper: THREE.Texture | undefined;
  const post = new THREE.ShaderMaterial({
    uniforms: { uScene:{value:target.texture}, uResolution:{value:new THREE.Vector2(1,1)},uPaper:{value:neutral},uPaperColor:{value:new THREE.Color("#f8f5ef")},uStrength:{value:1},uMode:{value:0},uFade:{value:1},uEffectVisibility:{value:1} },
    vertexShader:`void main(){gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: /* glsl */ `${paperShader}
      uniform sampler2D uScene; uniform float uStrength,uMode,uFade,uEffectVisibility;
      vec3 blur(vec2 uv,float radius){
        vec3 result=texture2D(uScene,uv).rgb*.20;
        for(int i=0;i<12;i++){
          float a=float(i)*2.399963;float r=sqrt((float(i)+.5)/12.)*radius;
          result+=texture2D(uScene,uv+vec2(cos(a),sin(a))*r/uResolution).rgb*(.8/12.);
        }return result;
      }
      void main(){
        vec2 uv=gl_FragCoord.xy/uResolution;
        float strength=uStrength*uEffectVisibility;
        float radius=(uMode<.5?7.:uMode<1.5?2.5:uMode<2.5?1.:4.)*strength;
        vec3 color=blur(uv,radius);
        if(uMode>.5&&uMode<1.5){
          for(int i=0;i<12;i++){
            float f=float(i);vec2 p=vec2(.13+fract(sin(f*12.3+1.)*43.)*.50,.33+fract(sin(f*5.7+2.)*31.)*.42);
            vec2 d=(uv-p)*vec2(uResolution.x/uResolution.y,1.);
            float r=.013+mod(f,3.)*.009;float disk=1.-smoothstep(r*.72,r,length(d));
            color=mix(color,vec3(1.,.92,.73),disk*strength*.24);
          }
        }
        if(uMode>1.5&&uMode<2.5){float glow=exp(-length((uv-vec2(.37,.65))*vec2(1.2,1.))*3.);color=mix(color,vec3(1.,.94,.80),glow*strength*.34);}
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
  let mugAngle=0, mugTouched=false, groveAngle=0;
  let drag: { id:number; x:number; y:number; start:number; moved:boolean } | undefined;
  let transition: gsap.core.Timeline | undefined;
  host.dataset.journey="idle";
  const positionWorld=()=>{
    const forest=travel.active&&travel.forest;
    const lift=forest?0:travelLift;
    mug.position.copy(baseMug);grove.position.copy(baseGrove);
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
      const subject=mug.visible?mug:grove;
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
    const animate=((mug.visible&&orbit.ready)||(grove.visible&&groveLayers.ready))&&!preference.matches;
    const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;
    lastTime=animate?time:0;
    if(animate){
      motionTime+=dt;
      pointer+=(pointerTarget-pointer)*(1.-Math.exp(-dt*3));
    }
    const angle=mugAngle+travel.turn*2+(preference.matches||mugTouched?0:Math.sin(motionTime*.32)*5+pointer*2);
    if(mug.visible){
      const view=orbit.sample(angle);
      if(view){
        mugMaterial.uniforms.uViewA.value=view.textureA;mugMaterial.uniforms.uViewB.value=view.textureB;
        mugMaterial.uniforms.uBlend.value=view.blend;mugPainting.visible=true;
      }
    }
    const passage=travel.active&&travel.forest&&!travel.swapped?travel.distance/travel.length:0;
    positionWorld();
    groveLayers.update(motionTime,preference.matches,groveCamera,groveAngle,passage);
    renderer.setRenderTarget(target);renderer.render(scene,grove.visible?groveCamera:camera);
    renderer.setRenderTarget(null);renderer.render(screenScene,screenCamera);
    if(journey.root.visible&&journey.uniforms.uOpacity.value>.001){
      renderer.autoClear=false;renderer.clearDepth();renderer.render(journey.scene,journeyCamera);renderer.autoClear=true;
    }
    host.dataset.loaded="true";
    host.dataset.effectStrength=post.uniforms.uStrength.value.toFixed(3);
    host.dataset.scene=String(displayed);
    host.dataset.mugView=angle.toFixed(3);
    host.dataset.mugFrames=String(orbit.size);
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
    camera.aspect=w/h;camera.fov=w<=700?42:35;camera.updateProjectionMatrix();
    groveCamera.fov=camera.fov;
    groveCamera.setViewOffset(w,h,w<=700?0:w*.17,w<=700?h*.12:0,w,h);
    camera.position.set(3.4,w<=700?5:3.1,7);
    camera.lookAt(0,.4,0);camera.updateMatrixWorld();
    mugPainting.quaternion.copy(camera.quaternion);
    grove.quaternion.copy(camera.quaternion);
    baseCamera.copy(camera.position);
    const right=cameraRight.setFromMatrixColumn(camera.matrixWorld,0);
    const up=cameraUp.setFromMatrixColumn(camera.matrixWorld,1);
    camera.getWorldDirection(cameraForward);
    for(const group of [mug,grove]){
      group.position.copy(right).multiplyScalar(w<=700?0:-1.25);
      const isGrove=group===grove;
      if(w<=700)group.position.addScaledVector(up,isGrove?.85:1.2);
      else if(isGrove)group.position.addScaledVector(up,-.20);
      group.scale.setScalar(isGrove?(w<=700?.39:.70):(w<=700?.72:1.12));
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
  new THREE.TextureLoader().load("/models/brain/rose-paper.jpg",texture=>{
    if(!alive){texture.dispose();return;}paper=texture;paper.colorSpace=THREE.SRGBColorSpace;paper.wrapS=paper.wrapT=THREE.MirroredRepeatWrapping;post.uniforms.uPaper.value=paper;requestDraw();
  });
  const showScene=(index:number)=>{
    displayed=index;mug.visible=index%2===0;grove.visible=!mug.visible;
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
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,start:mug.visible?mugAngle:groveAngle,moved:false};
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
    else groveAngle=event.key==="Home"?0:groveAngle+step*15;
    requestDraw();
  };
  const onLeave=()=>{pointerTarget=0;requestDraw();};
  const onPreference=()=>{
    pointer=pointerTarget=0;lastTime=0;
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
        const destination=selection%2===0||groveLayers.ready?selection:displayed;
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
    if(index%2===1&&!groveLayers.ready)void groveLayers.load().then(()=>{if(groveLayers.ready)show();});
    else show();
  };
  return {select,setEffect(enabled){
    gsap.to(post.uniforms.uStrength,{value:enabled?1:0,duration:preference.matches?0:.45,overwrite:true,onUpdate:requestDraw});
  },dispose(){
    alive=false;cancelAnimationFrame(frame);transition?.kill();gsap.killTweensOf(post.uniforms.uStrength);
    observer.disconnect();intersection.disconnect();document.removeEventListener("visibilitychange",onVisibility);
    host.removeEventListener("pointermove",onPointer);host.removeEventListener("pointerleave",onLeave);preference.removeEventListener("change",onPreference);
    endDrag();host.removeEventListener("pointerdown",onDown);host.removeEventListener("pointerup",endDrag);
    host.removeEventListener("pointercancel",endDrag);host.removeEventListener("lostpointercapture",onLostCapture);
    host.removeEventListener("keydown",onKey);
    groveLayers.dispose();
    journey.dispose();
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());target.dispose();post.dispose();screenGeometry.dispose();paper?.dispose();orbit.dispose();neutral.dispose();renderer.dispose();renderer.domElement.remove();
  }};
}
