import * as THREE from "three";
import { paperShader } from "./paintedMaterial";

const noiseShader = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p) { return noise(p) * .6 + noise(p * 2.1) * .27 + noise(p * 4.3) * .13; }
`;

// Depths are measured from the camera; every backdrop stays behind the brain.
export const washLayers = [
  { tint: "#83b4cc", opacity: .20, latent: 0, depth: 13, x: 0, y: -2.47, width: 24, height: 7, tilt: 0, travel: .8 },
  { tint: "#ad97c2", opacity: .26, latent: 0, depth: 19, x: -5.0, y: 2.5, width: 15, height: 11, tilt: -.22, travel: .65 },
  { tint: "#e0b36b", opacity: .24, latent: 0, depth: 17, x: 4.8, y: 2.4, width: 13, height: 10, tilt: .25, travel: .9 },
  { tint: "#8fb9d2", opacity: .10, latent: 0, depth: 17, x: -3.0, y: -3.23, width: 28, height: 9.15, tilt: 0, travel: 1.2 },
  { tint: "#d58e94", opacity: .38, latent: 1, depth: 16, x: -1.0, y: 3.0, width: 12, height: 9, tilt: .18, travel: 1.0 },
  { tint: "#8ba6ce", opacity: .40, latent: 1, depth: 13, x: 4.2, y: .0, width: 10, height: 8, tilt: -.28, travel: 1.6 },
  { tint: "#d4ad6d", opacity: .36, latent: 1, depth: 12, x: -4.4, y: .1, width: 9, height: 7, tilt: .32, travel: 1.9 },
  { tint: "#b6a2cc", opacity: .09, latent: 0, depth: 14, x: 2.3, y: -2.66, width: 25, height: 7.54, tilt: 0, travel: 1.4 },
];

export function createWorldPaint(paint: THREE.ShaderMaterial) {
  const shared = {
    uPaper: paint.uniforms.uPaper,
    uResolution: paint.uniforms.uResolution,
    uPaperColor: paint.uniforms.uPaperColor,
    uMouse: { value: new THREE.Vector2(.5, .5) },
    uHover: { value: 0 },
    uTime: { value: 0 },
  };
  const ground = new THREE.ShaderMaterial({
    uniforms: shared,
    depthTest: false,
    depthWrite: false,
    vertexShader: `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${paperShader}
      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;
        gl_FragColor = vec4(paperAt(uv), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const washes = washLayers.map((layer, index) => new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uMode: { value: index === 0 ? 0 : index === 3 || index === 7 ? 2 : 1 },
      uSeed: { value: index * 13.7 },
      uOpacity: { value: layer.opacity },
      uLatent: { value: layer.latent },
      uTint: { value: new THREE.Color(layer.tint) },
      uSecondaryTint: { value: new THREE.Color(index === 0 || index === 3 || index === 7 ? "#b2a0ce" : index % 2 === 0 ? "#b69bc8" : "#79b7b5") },
      uWarmTint: { value: new THREE.Color(index === 0 || index === 3 || index === 7 ? "#efb69d" : "#d6aa85") },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vWashHover;
      uniform vec2 uMouse, uResolution;
      uniform float uHover;
      vec2 screenPoint(vec3 point) {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
        return clip.xy / clip.w * .5 + .5;
      }
      void main() {
        vUv = uv;
        // Proximity lifts an entire irregular wash, rather than painting a cursor disk.
        vec2 center = screenPoint(vec3(0.0));
        vec2 extent = abs(screenPoint(vec3(.35, 0.0, 0.0)) - center)
                    + abs(screenPoint(vec3(0.0, .35, 0.0)) - center);
        vec2 gap = max(abs(uMouse - center) - extent, vec2(0.0));
        float proximity = length(gap * vec2(uResolution.x / uResolution.y, 1.0));
        vWashHover = (1.0 - smoothstep(.035, .49, proximity)) * uHover;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${paperShader}
      ${noiseShader}
      varying vec2 vUv;
      varying float vWashHover;
      uniform float uMode, uSeed, uOpacity, uTime, uLatent;
      uniform vec3 uTint, uSecondaryTint, uWarmTint;
      void main() {
        vec2 uv = vUv;
        float grain = fbm(uv * 30.0 + uSeed);
        if (uMode < .5 || uMode > 1.5) {
          // A level pool of diluted pigment: only color drifts, not the contour.
          float current = fbm(vec2(uv.x * 4.5 - uTime * .025, uv.y * 5.0) + uSeed);
          float edge = abs(uv.y - .5) - .29 + (grain - .5) * .025;
          float wash = .35 * (1.0 - smoothstep(-.025, .085, edge))
                     + .30 * (1.0 - smoothstep(-.070, .010, edge))
                     + .15 * (1.0 - smoothstep(-.140, -.050, edge));
          vec3 pigment = mix(uTint, uSecondaryTint, smoothstep(.32, .68, current) * .75);
          pigment = mix(pigment, uWarmTint, (1.0 - smoothstep(.25, .48, current)) * .65);
          pigment = pow(pigment, vec3(1.0 + vWashHover * .20));
          float boundary = smoothstep(.0, .13, uv.x) * (1.0 - smoothstep(.87, 1.0, uv.x))
                         * smoothstep(.0, .08, uv.y) * (1.0 - smoothstep(.92, 1.0, uv.y));
          float alpha = wash * uOpacity * (.85 + current * .20) * boundary * (1.0 + vWashHover * .15);
          gl_FragColor = vec4(paperAt(gl_FragCoord.xy / uResolution) * pigment, alpha);
          #include <colorspace_fragment>
          return;
        }
        // Quiet cloud washes behind the more defined water layers.
        float flow = uTime * .018;
        float n = fbm(uv * 9.0 + uSeed + vec2(uTime * .012, sin(uTime * .08) * .08));
        float breath = sin(uTime * .42 + uSeed);
        vec2 washedUV = uv - .5 + vec2(n - .5, grain - .5) * .10;
        float d = length(washedUV * vec2(2.0, 2.6));
        d += (grain - .5) * .27;
        float deposits = .45 * (1.0 - smoothstep(.73, 1.05, d))
                       + .28 * (1.0 - smoothstep(.43, .79, d))
                       + .20 * (1.0 - smoothstep(.12, .50, d));
        deposits *= smoothstep(.0, .12, uv.x) * (1.0 - smoothstep(.85, 1.0, uv.x));
        float hover = vWashHover;
        // Slow pigment currents keep the layered edges and exposed paper intact.
        float current = fbm(uv * vec2(4.5, 7.0) + uSeed + vec2(-flow, 0.0));
        float colorAmount = .35;
        vec3 pigment = mix(uTint, uSecondaryTint, smoothstep(.30, .68, current) * colorAmount);
        pigment = mix(pigment, uWarmTint, (1.0 - smoothstep(.26, .47, current)) * colorAmount);
        pigment = pow(pigment, vec3(1.0 + hover * .20));
        // Paper-colored deposits become pigment in a broad area near the cursor.
        vec3 tint = mix(vec3(1.0), pigment, mix(1.0, hover * .60, uLatent));
        vec3 paper = paperAt(gl_FragCoord.xy / uResolution);
        gl_FragColor = vec4(paper * tint, deposits * uOpacity * (.86 + grain * .24) * (1.0 + breath * .045) * (1.0 + hover * .25));
        #include <colorspace_fragment>
      }
    `,
  }));
  return { ground, washes, shared };
}
