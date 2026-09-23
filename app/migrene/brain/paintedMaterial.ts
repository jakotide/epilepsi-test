import * as THREE from "three";

// One screen-space sheet under both the brain and the background, as in the rose.
export const paperShader = /* glsl */ `
  uniform sampler2D uPaper;
  uniform vec2 uResolution;
  uniform vec3 uPaperColor;
  vec3 paperAt(vec2 screenUV) {
    float aspect = uResolution.x / uResolution.y;
    vec2 uv = screenUV * vec2(aspect * 1.84, 1.38) + vec2(.61, .12);
    vec3 tex = texture2D(uPaper, uv).rgb;
    float gray = dot(tex, vec3(.2126, .7152, .0722));
    // Remove the photograph's broad lighting gradient, retaining paper fibers.
    float localBase = dot(texture2D(uPaper, uv, 5.0).rgb, vec3(.2126, .7152, .0722));
    float tooth = clamp(.96 + (gray - localBase) * 1.15, .72, 1.035);
    return uPaperColor * tooth;
  }
`;

export function createPaintedMaterial(paper: THREE.Texture) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uPaper: { value: paper },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPaperColor: { value: new THREE.Color("#f8f5ef") },
      uLight: { value: new THREE.Vector3(-3, 5, 4).normalize() },
      uRose: { value: new THREE.Color("#b9787b") },
      uCool: { value: new THREE.Color("#8898ae") },
      uScreenFlow: { value: 1 },
      uOpacity: { value: 1 },
      uHighlightCenter: { value: new THREE.Vector3(.6, .7, .8) },
      uHighlightColor: { value: new THREE.Color("#459cab") },
      uHighlightRadius: { value: .85 },
      uHighlightStrength: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPigment;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vPoint;
      void main() {
        vPigment = color.rgb;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vPoint = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${paperShader}
      uniform vec3 uLight;
      uniform vec3 uRose;
      uniform vec3 uCool;
      uniform float uScreenFlow;
      uniform float uOpacity;
      uniform vec3 uHighlightCenter;
      uniform vec3 uHighlightColor;
      uniform float uHighlightRadius;
      uniform float uHighlightStrength;
      varying vec3 vPigment;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vPoint;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(.1, .2, .3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        return noise(p) * .65 + noise(p * 2.03 + 7.0) * .25 + noise(p * 4.11) * .10;
      }
      float wetBorder(float value, float edge, float width) {
        float d = (value - edge) / width;
        return exp(-d * d);
      }
      void main() {
        vec2 screenUV = gl_FragCoord.xy / uResolution;
        vec3 paper = paperAt(screenUV);
        vec3 view = normalize(cameraPosition - vWorldPosition);
        // Window + object coordinates gently re-form paint during rotation.
        // There is no clock or flashing while the camera rests.
        vec3 p = vPoint * .57 + vec3(screenUV * .82, .0) * uScreenFlow;
        vec3 warp = vec3(fbm(p * 3.66), fbm(p * 5.9 + 12.0), fbm(p * 8.5 + 23.0)) - .5;
        vec3 normal = normalize(vWorldNormal + warp * .48);
        float light = dot(normal, uLight) * .5 + .5;
        float facing = abs(dot(normal, view));
        float bloom = fbm(p * 17.0 + warp * 2.0);
        float fine = noise(vec3(gl_FragCoord.xy * .47, 8.0));
        // Dissolve through the paper grain while retaining correct mesh depth.
        if (fine > uOpacity || uOpacity <= .001) discard;
        // Light-to-dark painting: highlights expose paper, not a cream fill.
        float wash = .045 + .44 * pow(1.0 - smoothstep(.20, .97, light), 1.45);
        wash += (bloom - .5) * .055;
        // Dark pigment lips immediately beside pale gaps, like the rose ramps.
        float borders = .085 * wetBorder(light, .43, .030)
                      + .065 * wetBorder(light, .65, .022)
                      + .035 * wetBorder(light, .81, .016);
        float gaps = .045 * wetBorder(light, .475, .026)
                   + .030 * wetBorder(light, .688, .019);
        float rim = pow(1.0 - facing, 3.0);
        float edge = .20 * smoothstep(.14, .83, rim) * (.6 + bloom * .55);
        float density = clamp(wash + borders - gaps + edge, .015, .87);
        // The earlier vertex paint now contributes only quiet hue variation.
        float cool = smoothstep(.02, .16, vPigment.b - vPigment.r) * .42;
        vec3 ink = mix(uRose, uCool, cool);
        ink = mix(ink, clamp(vPigment * .70, .08, .8), .10);
        // A local pigment wash follows the mesh through every camera view.
        float regionDistance = length((vPoint - uHighlightCenter) / vec3(1.0, .88, 1.0));
        regionDistance += (bloom - .5) * .15;
        float region = (1.0 - smoothstep(uHighlightRadius * .48, uHighlightRadius, regionDistance)) * uHighlightStrength;
        ink = mix(ink, uHighlightColor, region * .93);
        density += region * .20;
        float paperTooth = dot(paper / uPaperColor, vec3(.3333));
        density *= 1.0 + (1.0 - paperTooth) * 1.8 + (fine - .5) * .19;
        vec3 absorb = -log(max(ink, vec3(.03)));
        vec3 result = paper * exp(-absorb * density * 1.4);
        gl_FragColor = vec4(result, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createPaperMaterial(paint: THREE.ShaderMaterial) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPaper: paint.uniforms.uPaper,
      uResolution: paint.uniforms.uResolution,
      uPaperColor: paint.uniforms.uPaperColor,
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${paperShader}
      void main() {
        gl_FragColor = vec4(paperAt(gl_FragCoord.xy / uResolution), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
