import * as THREE from "three";
import { paperShader } from "./brain/paintedMaterial";

/** A painted ribbon extending into world depth, rendered over the paper pass. */
export function createPaintJourney(paperUniforms: Record<string, THREE.IUniform>) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const geometry = new THREE.PlaneGeometry(1, 1, 8, 80);
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const t = uv.getY(i), cross = uv.getX(i) * 2 - 1;
    const bend = Math.sin(t * 4.7) * .9 + t * .8;
    const width = 1.18 + Math.sin(t * Math.PI) * .36;
    positions.setXYZ(i, bend + cross * width, -.55 + t * 3.6, 2.5 - t * 15);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
  const uniforms = {
    uPaper: paperUniforms.uPaper,
    uResolution: paperUniforms.uResolution,
    uPaperColor: paperUniforms.uPaperColor,
    uProgress: { value: 0 },
    uOpacity: { value: 0 },
    uDirection: { value: 1 },
    uPortrait: { value: 0 },
    uFollow: { value: 0 },
    uFlow: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    uniforms,
    vertexShader: `varying vec2 vUv;uniform float uDirection,uPortrait,uFollow;
      void main(){vUv=uv;vec3 p=position;p.x*=uDirection;p.y+=uPortrait*uv.y*1.4;
        // Forest passage: a low ribbon beneath the viewpoint, extending back
        // along our route as its origin follows the advancing camera.
        p.y=mix(p.y,-1.35+uv.y*.85,uFollow);
        p.x=mix(p.x,p.x*.72,uFollow);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: /* glsl */ `${paperShader}
      varying vec2 vUv;uniform float uProgress,uOpacity,uFlow,uFollow;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 uv=vUv;
        vec2 flowing=uv+vec2(sin(uv.y*8.-uFlow)*.008,-uFlow*.012)*uFollow;
        float bloom=noise(flowing*vec2(13.,43.))*.65+noise(flowing*vec2(36.,110.))*.35;
        float cross=abs(uv.x-.5)*2.+(bloom-.5)*.24;
        float wash=(1.-smoothstep(.79,.95,cross))*.28
          +(1.-smoothstep(.56,.64,cross))*.32+(1.-smoothstep(.27,.36,cross))*.20;
        float tip=1.-smoothstep(uProgress-.035,uProgress+.018,uv.y+(bloom-.5)*.024);
        float ends=smoothstep(0.,.045,uv.y)*(1.-smoothstep(.91,1.,uv.y));
        float dry=1.-smoothstep(.69,.87,noise(uv*vec2(190.,350.)))*.4;
        vec3 blue=vec3(.28,.47,.58),sage=vec3(.47,.63,.49),ochre=vec3(.85,.68,.39);
        vec3 pigment=mix(blue,sage,smoothstep(.25,.78,uv.y+bloom*.2));
        pigment=mix(pigment,ochre,smoothstep(.52,.90,uv.x)*.42);
        vec3 paper=paperAt(gl_FragCoord.xy/uResolution);
        vec3 color=mix(paper,pigment,.76+(bloom-.5)*.16);
        gl_FragColor=vec4(color,wash*tip*ends*dry*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  root.add(new THREE.Mesh(geometry, material));
  root.visible = false;
  return {
    scene, root, uniforms,
    reset(){root.visible=false;uniforms.uProgress.value=0;uniforms.uOpacity.value=0;uniforms.uFollow.value=0;uniforms.uFlow.value=0;},
    dispose(){geometry.dispose();material.dispose();},
  };
}
