"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const coverVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coverFragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uDissolve;
  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uGrayscale;
  uniform float uEdgeIntensity;
  uniform float uEdgeBrightness;
  varying vec2 vUv;

  mat3 sobelX = mat3(
    -1.0, 0.0, 1.0,
    -2.0, 0.0, 2.0,
    -1.0, 0.0, 1.0
  );

  mat3 sobelY = mat3(
    -1.0, -2.0, -1.0,
     0.0,  0.0,  0.0,
     1.0,  2.0,  1.0
  );

  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  float sobel(sampler2D tex, vec2 uv, vec2 texelSize) {
    float gx = 0.0;
    float gy = 0.0;
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 offset = vec2(float(i), float(j)) * texelSize;
        float lum = getLuminance(texture2D(tex, uv + offset).rgb);
        gx += lum * sobelX[i + 1][j + 1];
        gy += lum * sobelY[i + 1][j + 1];
      }
    }
    return sqrt(gx * gx + gy * gy);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }

  void main() {
    vec2 ratio = vec2(
      min((uResolution.x / uResolution.y) / (uImageResolution.x / uImageResolution.y), 1.0),
      min((uResolution.y / uResolution.x) / (uImageResolution.y / uImageResolution.x), 1.0)
    );

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );

    vec4 texColor = texture2D(uTexture, uv);

    float gray = getLuminance(texColor.rgb);
    vec3 grayscaleColor = vec3(gray);
    texColor.rgb = mix(texColor.rgb, grayscaleColor, uGrayscale);

    vec2 centeredUv = vUv - uCenter;
    float aspect = uResolution.x / uResolution.y;
    centeredUv.x *= aspect;
    float dist = length(centeredUv);

    float angle = atan(centeredUv.y, centeredUv.x);

    float smoothNoise = fbm(vUv * 8.0) * 0.1;
    float angularNoise = fbm(vec2(angle * 3.0, dist * 2.0)) * 0.08;
    float totalNoise = smoothNoise + angularNoise;
    float noisyDist = dist + totalNoise;

    float maxDist = length(vec2(aspect * 0.5, 0.5));
    float normalizedDist = noisyDist / maxDist;

    // Before dissolve starts, show fully opaque — no glow, no edge
    if (uDissolve < 0.001) {
      gl_FragColor = vec4(texColor.rgb, texColor.a);
      return;
    }

    float dissolveThreshold = uDissolve * 1.5;

    float dissolveMask = smoothstep(dissolveThreshold - 0.12, dissolveThreshold, normalizedDist);

    vec3 finalColor = texColor.rgb;

    // Soft glow halo at dissolve boundary
    float glowWidth = 0.25 * (1.0 - uDissolve * 0.5);
    float innerGlow = smoothstep(dissolveThreshold - glowWidth, dissolveThreshold - 0.02, normalizedDist)
                    * smoothstep(dissolveThreshold + 0.05, dissolveThreshold - 0.02, normalizedDist);
    float outerGlow = smoothstep(dissolveThreshold - glowWidth * 1.5, dissolveThreshold - 0.01, normalizedDist)
                    * smoothstep(dissolveThreshold + 0.1, dissolveThreshold, normalizedDist);

    float glow = innerGlow * 0.7 + outerGlow * 0.3;
    vec3 glowColor = vec3(1.0, 0.97, 0.95);
    finalColor += glowColor * glow * uEdgeBrightness * 1.5;

    float alpha = dissolveMask * texColor.a;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Interactive gradient shaders
const gradientVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fluidShader = `
  uniform float iTime;
  uniform vec2 iResolution;
  uniform vec4 iMouse;
  uniform int iFrame;
  uniform sampler2D iPreviousFrame;
  uniform float uBrushSize;
  uniform float uBrushStrength;
  uniform float uFluidDecay;
  uniform float uTrailLength;
  uniform float uStopDecay;
  varying vec2 vUv;

  vec2 ur, U;

  float ln(vec2 p, vec2 a, vec2 b) {
    return length(p-a-(b-a)*clamp(dot(p-a,b-a)/dot(b-a,b-a),0.,1.));
  }

  vec4 t(vec2 v, int a, int b) {
    return texture2D(iPreviousFrame, fract((v+vec2(float(a),float(b)))/ur));
  }

  vec4 t(vec2 v) {
    return texture2D(iPreviousFrame, fract(v/ur));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      val += amp * noise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  float area(vec2 a, vec2 b, vec2 c) {
    float A = length(b-c), B = length(c-a), C = length(a-b), s = 0.5*(A+B+C);
    return sqrt(s*(s-A)*(s-B)*(s-C));
  }

  void main() {
    U = vUv * iResolution;
    ur = iResolution.xy;

    if (iFrame < 1) {
      float w = 0.5+sin(0.2*U.x)*0.5;
      float q = length(U-0.5*ur);
      gl_FragColor = vec4(0.1*exp(-0.001*q*q),0,0,w);
    } else {
      vec2 v = U,
           A = v + vec2( 1, 1),
           B = v + vec2( 1,-1),
           C = v + vec2(-1, 1),
           D = v + vec2(-1,-1);

      for (int i = 0; i < 8; i++) {
        v -= t(v).xy;
        A -= t(A).xy;
        B -= t(B).xy;
        C -= t(C).xy;
        D -= t(D).xy;
      }

      vec4 me = t(v);
      vec4 n = t(v, 0, 1),
          e = t(v, 1, 0),
          s = t(v, 0, -1),
          w = t(v, -1, 0);
      vec4 ne = .25*(n+e+s+w);
      me = mix(t(v), ne, vec4(0.15,0.15,0.95,0.));
      me.z = me.z - 0.01*((area(A,B,C)+area(B,C,D))-4.);

      vec4 pr = vec4(e.z,w.z,n.z,s.z);
      me.xy = me.xy + 100.*vec2(pr.x-pr.y, pr.z-pr.w)/ur;

      me.xy *= uFluidDecay;
      me.z *= uTrailLength;

      if (iMouse.z > 0.0) {
        vec2 mousePos = iMouse.xy;
        vec2 mousePrev = iMouse.zw;
        vec2 mouseVel = mousePos - mousePrev;
        float velMagnitude = length(mouseVel);
        float q = ln(U, mousePos, mousePrev);
        vec2 m = mousePos - mousePrev;
        float l = length(m);
        if (l > 0.0) m = min(l, 10.0) * m / l;

        float brushSizeFactor = 1e-4 / uBrushSize;
        float strengthFactor = 0.03 * uBrushStrength;

        float falloff = exp(-brushSizeFactor*q*q*q);
        falloff = pow(falloff, 0.5);

        // Break up brush edge with noise — cloudy, sparse wisps
        vec2 noiseCoord = U * 0.015 + iTime * 0.3;
        float brushNoise = fbm(noiseCoord);
        // Erode the falloff: noise carves holes in the brush shape
        falloff *= smoothstep(0.25, 0.55, brushNoise + falloff * 0.5);

        me.xyw += strengthFactor * falloff * vec3(m, 10.);

        // Scatter the velocity direction slightly with noise
        float angNoise = (noise(U * 0.02 + iTime * 0.5) - 0.5) * 0.6;
        float cs = cos(angNoise);
        float sn = sin(angNoise);
        me.xy = vec2(me.x * cs - me.y * sn, me.x * sn + me.y * cs);

        if (velMagnitude < 2.0) {
          float distToCursor = length(U - mousePos);
          float influence = exp(-distToCursor * 0.01);
          float cursorDecay = mix(1.0, uStopDecay, influence);
          me.xy *= cursorDecay;
          me.z *= cursorDecay;
        }
      }

      gl_FragColor = clamp(me, -0.4, 0.4);
    }
  }
`;

const displayShader = `
  uniform float iTime;
  uniform vec2 iResolution;
  uniform sampler2D iFluid;
  uniform float uDistortionAmount;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform float uColorIntensity;
  uniform float uSoftness;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 6; i++) {
      value += amp * noise(p * freq);
      amp *= 0.5;
      freq *= 2.0;
    }
    return value;
  }

  void main() {
    vec2 fragCoord = vUv * iResolution;

    vec4 fluid = texture2D(iFluid, vUv);
    vec2 fluidVel = fluid.xy;
    float fluidMag = length(fluidVel);

    float mr = min(iResolution.x, iResolution.y);
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / mr;

    // --- Fluid distortion (mouse trail warps the UV) ---
    vec2 noiseOffset = vec2(
      fbm(vUv * 4.0 + iTime * 0.05),
      fbm(vUv * 4.0 + 50.0 + iTime * 0.05)
    ) - 0.5;
    uv += fluidVel * (0.2 * uDistortionAmount); // Trail distortion strength (tweak uDistortionAmount in config)
    uv += noiseOffset * fluidMag * 0.8; // Noise-amplified warping around trail

    // --- Sine wave pattern ---
    // Speed: controls how fast the pattern drifts (higher = faster)
    float sineSpeed = 0.55;
    // Intensity: controls how much the sine iterations compound (higher = more complex/intense pattern)
    float sineIntensity = 0.9;
    // Damping: how much later iterations fade out (higher = more damping, subtler pattern)
    float sineDamping = 0.08;

    float d = -iTime * sineSpeed;
    float a = 0.0;
    for (float i = 0.0; i < 8.0; ++i) {
      float phase = i * sineIntensity + 1.0;
      a += cos(phase * uv.x - d + a * 0.3) * (1.0 - i * sineDamping);
      d += sin(phase * uv.y * 0.8 + a * 0.5 + i * 0.4) * (1.0 - i * (sineDamping * 0.75));
    }
    d += iTime * sineSpeed;

    // --- Mixer contrast: how strongly the sines map to color blending ---
    // Scale: multiplier on the sine output (higher = sharper color transitions)
    float mixerScale = 0.6;
    float mixer1 = cos(uv.x * d * 0.7 + uv.y * 0.3) * mixerScale + 0.5;
    float mixer2 = sin(uv.y * a * 0.6 - uv.x * 0.2) * mixerScale + 0.5;
    float mixer3 = cos(d * 0.5 + a * 0.5 + uv.x * uv.y * 0.1) * mixerScale + 0.5;

    // --- Fog: blends mixers toward 0.5 (0.0 = full contrast, 1.0 = flat/no pattern) ---
    float fog = 0.08;
    mixer1 = mix(mixer1, 0.5, fog);
    mixer2 = mix(mixer2, 0.5, fog);
    mixer3 = mix(mixer3, 0.5, fog);

    // --- Mixer clamping: prevents dark valleys from sequential color mixing ---
    // Range is 0.0-1.0. Raising the min (e.g. 0.3) removes dark greys.
    // Lowering the max (e.g. 0.7) removes bright peaks. Default unclamped would be 0.0-1.0.
    float mixerMin = 0.2;
    float mixerMax = 1.0;
    mixer1 = clamp(mixer1, mixerMin, mixerMax);
    mixer2 = clamp(mixer2, mixerMin, mixerMax);
    mixer3 = clamp(mixer3, mixerMin, mixerMax);

    // --- Color blending: sequential mix of 4 colors driven by mixer values ---
    // mixer1 blends uColor1 → uColor2
    // mixer2 blends result → uColor3
    // mixer3 blends result → uColor4 (scaled by 0.4 so uColor4 is subtle)
    vec3 col = mix(uColor1, uColor2, mixer1);
    col = mix(col, uColor3, mixer2);
    col = mix(col, uColor4, mixer3 * 0.4);

    // Overall brightness multiplier (tweak uColorIntensity in config)
    col *= uColorIntensity;

    // --- Noise overlay layer (cloudy FBM noise on top of gradient) ---
    // vec2 cloudUv = vUv * 3.0 + iTime * 0.03;
    // cloudUv += fluidVel * 0.4;
    // float cloud = fbm(cloudUv);
    // float sparsity = fbm(vUv * 6.0 - fluidVel * 0.3 + iTime * 0.02);
    // float wispMask = smoothstep(0.3, 0.6, sparsity + fluidMag * 2.0);
    // col = mix(col, col * (0.6 + cloud * 0.8), wispMask * 0.6);

    // --- Fine film grain overlay ---
    // float grain = hash(vUv * iResolution + fract(iTime * 137.0)) - 0.5;
    // col += grain * 0.07;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Exit dissolve — top-to-bottom cloudy dissolve (same as Hero but flipped)
const exitDissolveShader = `
  uniform float uProgress;
  uniform vec2 uResolution;
  uniform vec3 uColor;
  varying vec2 vUv;

  float Hash(vec2 p) {
    vec3 p2 = vec3(p.xy, 1.0);
    return fract(sin(dot(p2, vec3(37.1, 61.7, 12.4))) * 3758.5453123);
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f *= f * (3.0 - 2.0 * f);
    return mix(
      mix(Hash(i + vec2(0.0, 0.0)), Hash(i + vec2(1.0, 0.0)), f.x),
      mix(Hash(i + vec2(0.0, 1.0)), Hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  vec2 rot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p = rot(p, 0.75) * 2.0 + 3.1;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 centeredUv = (uv - 0.5) * vec2(aspect, 1.0);

    // Dissolve from top down: flip y so it comes from the top
    float dissolveEdge = (1.0 - uv.y) - uProgress * 1.5;

    float cloudNoise = fbm(centeredUv * 6.0) * 0.6;
    float detailNoise = fbm(centeredUv * 14.0 + 50.0) * 0.3;
    float fineNoise = fbm(centeredUv * 30.0 + 100.0) * 0.1;

    float noiseValue = cloudNoise + detailNoise + fineNoise;
    float d = dissolveEdge + noiseValue * 0.5;

    float softEdge = 0.08;
    float alpha = 1.0 - smoothstep(-softEdge, softEdge, d);

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

const gradientConfig = {
  brushSize: 25.0,
  brushStrength: 0.5,
  distortionAmount: 5.5,
  fluidDecay: 0.98,
  trailLength: 0.8,
  stopDecay: 0.85,
  color1: "#fdeefcff",
  color2: "#ebc5f0ff",
  color3: "#f9ecffff",
  color4: "#ffd7ffff",
  colorIntensity: 1.0,
  softness: 1.0,
};

export default function DissolveSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvas1Ref = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<(HTMLDivElement | null)[]>([]);
  const triggersRef = useRef<(HTMLDivElement | null)[]>([]);
  const fusePathsRef = useRef<(SVGPathElement | null)[]>([]);
  const tunnelWordsRef = useRef<HTMLDivElement>(null);
  const exitCanvasRef = useRef<HTMLCanvasElement>(null);
  const exitTextRef = useRef<HTMLDivElement>(null);
  const exitCharsRef = useRef<(HTMLSpanElement | null)[]>([]);

  const exitText = "Generaliserte anfall";
  const exitChars = exitText.split("");

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const container1 = canvas1Ref.current;
    const gradientContainer = gradientRef.current;
    if (!wrapper || !container1 || !gradientContainer) return;

    // --- Dissolve layer (canvas1 - blue.jpg on top) ---
    const scene1 = new THREE.Scene();
    const camera1 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera1.position.z = 1;

    const renderer1 = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer1.setSize(window.innerWidth, window.innerHeight);
    container1.appendChild(renderer1.domElement);

    const geometry = new THREE.PlaneGeometry(2, 2);

    // Solid color texture instead of image
    const solidCanvas = document.createElement("canvas");
    solidCanvas.width = 4;
    solidCanvas.height = 4;
    const solidCtx = solidCanvas.getContext("2d")!;
    solidCtx.fillStyle = "#1D1D1D";
    solidCtx.fillRect(0, 0, 4, 4);
    const solidTexture = new THREE.CanvasTexture(solidCanvas);
    solidTexture.minFilter = THREE.LinearFilter;

    const dissolveMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: solidTexture },
        uResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        uImageResolution: {
          value: new THREE.Vector2(4, 4),
        },
        uDissolve: { value: 0.0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uTime: { value: 0.0 },
        uGrayscale: { value: 0.0 },
        uEdgeIntensity: { value: 0.0 },
        uEdgeBrightness: { value: 1.0 },
      },
      vertexShader: coverVertexShader,
      fragmentShader: coverFragmentShader,
      transparent: true,
    });

    const mesh1 = new THREE.Mesh(geometry, dissolveMaterial);
    scene1.add(mesh1);

    // --- Interactive gradient layer (behind dissolve) ---
    const gradientCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const gradientRenderer = new THREE.WebGLRenderer({ antialias: true });
    gradientRenderer.setSize(window.innerWidth, window.innerHeight);
    gradientContainer.appendChild(gradientRenderer.domElement);

    const fluidTarget1 = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      },
    );
    const fluidTarget2 = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      },
    );

    let currentFluidTarget = fluidTarget1;
    let previousFluidTarget = fluidTarget2;
    let frameCount = 0;

    const fluidMaterial = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
        iFrame: { value: 0 },
        iPreviousFrame: { value: null },
        uBrushSize: { value: gradientConfig.brushSize },
        uBrushStrength: { value: gradientConfig.brushStrength },
        uFluidDecay: { value: gradientConfig.fluidDecay },
        uTrailLength: { value: gradientConfig.trailLength },
        uStopDecay: { value: gradientConfig.stopDecay },
      },
      vertexShader: gradientVertexShader,
      fragmentShader: fluidShader,
    });

    const gradientDisplayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        iFluid: { value: null },
        uDistortionAmount: { value: gradientConfig.distortionAmount },
        uColor1: {
          value: new THREE.Vector3(...hexToRgb(gradientConfig.color1)),
        },
        uColor2: {
          value: new THREE.Vector3(...hexToRgb(gradientConfig.color2)),
        },
        uColor3: {
          value: new THREE.Vector3(...hexToRgb(gradientConfig.color3)),
        },
        uColor4: {
          value: new THREE.Vector3(...hexToRgb(gradientConfig.color4)),
        },
        uColorIntensity: { value: gradientConfig.colorIntensity },
        uSoftness: { value: gradientConfig.softness },
      },
      vertexShader: gradientVertexShader,
      fragmentShader: displayShader,
    });

    const fluidPlane = new THREE.Mesh(geometry, fluidMaterial);
    const gradientDisplayPlane = new THREE.Mesh(
      geometry,
      gradientDisplayMaterial,
    );

    // --- Exit dissolve overlay ---
    const exitCanvas = exitCanvasRef.current;
    let exitRenderer: THREE.WebGLRenderer | null = null;
    let exitMaterial: THREE.ShaderMaterial | null = null;
    const exitScene = new THREE.Scene();
    const exitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    if (exitCanvas) {
      exitRenderer = new THREE.WebGLRenderer({
        canvas: exitCanvas,
        alpha: true,
        antialias: false,
      });
      exitRenderer.setSize(window.innerWidth, window.innerHeight);
      exitRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const nextSectionColor = hexToRgb("#1D1D1D");
      exitMaterial = new THREE.ShaderMaterial({
        vertexShader: coverVertexShader,
        fragmentShader: exitDissolveShader,
        uniforms: {
          uProgress: { value: 0 },
          uResolution: {
            value: new THREE.Vector2(window.innerWidth, window.innerHeight),
          },
          uColor: { value: new THREE.Vector3(...nextSectionColor) },
        },
        transparent: true,
      });

      const exitMesh = new THREE.Mesh(geometry, exitMaterial);
      exitScene.add(exitMesh);
    }

    let mouseX = 0;
    let mouseY = 0;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let lastMoveTime = 0;

    function onMouseMove(e: MouseEvent) {
      const rect = gradientContainer!.getBoundingClientRect();
      prevMouseX = mouseX;
      prevMouseY = mouseY;
      mouseX = e.clientX - rect.left;
      mouseY = rect.height - (e.clientY - rect.top);
      lastMoveTime = performance.now();
      fluidMaterial.uniforms.iMouse.value.set(
        mouseX,
        mouseY,
        prevMouseX,
        prevMouseY,
      );
    }

    function onMouseLeave() {
      fluidMaterial.uniforms.iMouse.value.set(0, 0, 0, 0);
    }

    // --- Scroll logic ---
    function getScrollProgress() {
      if (!wrapper) return 0;
      const rect = wrapper.getBoundingClientRect();
      const scrollableDistance = rect.height - window.innerHeight;
      if (scrollableDistance <= 0) return 0;
      const scrolled = -rect.top;
      return Math.max(0, Math.min(1, scrolled / scrollableDistance));
    }

    // --- ScrollTrigger for text groups ---
    const scrollTriggers: ScrollTrigger[] = [];

    groupsRef.current.forEach((groupEl, i) => {
      const triggerEl = triggersRef.current[i];
      if (!groupEl || !triggerEl) return;

      gsap.set(groupEl, { opacity: 0, filter: "blur(20px)" });

      const tween = gsap.to(groupEl, {
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.4,
        ease: "cubic-bezier(0.76, 0, 0.24, 1)",
        paused: true,
      });

      const st = ScrollTrigger.create({
        trigger: triggerEl,
        start: "top bottom",
        end: "top top",
        onEnter: () => tween.play(),
        onLeave: () => tween.reverse(),
        onEnterBack: () => tween.play(),
        onLeaveBack: () => tween.reverse(),
      });

      scrollTriggers.push(st);
    });

    // --- Tunnel line draw animation ---
    const tunnelPaths = fusePathsRef.current.filter(
      Boolean,
    ) as SVGPathElement[];

    if (tunnelPaths.length > 0) {
      tunnelPaths.forEach((path) => {
        const len = path.getTotalLength();
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
      });

      // Get the fuse SVG container for the fade-out
      const fuseSvg = tunnelPaths[0]?.closest("svg");

      const fuseTl = gsap.timeline({
        scrollTrigger: {
          trigger: wrapper,
          start: "top bottom",
          end: "14% top",
          scrub: true,
        },
      });

      // Draw lines: 0%-80% of timeline
      tunnelPaths.forEach((path, i) => {
        fuseTl.to(
          path,
          { strokeDashoffset: 0, ease: "none", duration: 0.8 },
          i * 0.02,
        );
      });

      // Tunnel words: appear one by one, then fade out together
      const wordsContainer = tunnelWordsRef.current;
      const wordSpans = wordsContainer?.querySelectorAll(
        ".dissolve__tunnel-word",
      );
      if (wordsContainer && wordSpans && wordSpans.length > 0) {
        gsap.set(wordSpans, { opacity: 0 });

        wordSpans.forEach((span, i) => {
          fuseTl.to(
            span,
            { opacity: 1, ease: "power2.out", duration: 0.3 },
            0.45 + i * 0.16,
          );
        });

        fuseTl.to(
          wordSpans,
          { opacity: 0, ease: "power2.in", duration: 0.2 },
          0.92,
        );
      }

      // Fade out SVG: last 20% of timeline
      if (fuseSvg) {
        fuseTl.to(
          fuseSvg,
          { opacity: 0, ease: "power2.in", duration: 0.2 },
          0.8,
        );
      }

      scrollTriggers.push(fuseTl.scrollTrigger!);
    }

    function onScroll() {
      const progress = getScrollProgress();

      // Dissolve starts at 12% (when fuse lines finish) and completes by 30%
      const dissolveStart = 0.12;
      const dissolveEnd = 0.3;
      const dissolveProgress = Math.min(
        1,
        Math.max(0, (progress - dissolveStart) / (dissolveEnd - dissolveStart)),
      );

      if (dissolveMaterial) {
        dissolveMaterial.uniforms.uDissolve.value = dissolveProgress;
        dissolveMaterial.uniforms.uGrayscale.value = Math.min(
          1.0,
          dissolveProgress / 0.7,
        );
        dissolveMaterial.uniforms.uEdgeIntensity.value = dissolveProgress * 0.5;
        dissolveMaterial.uniforms.uEdgeBrightness.value =
          1.5 * (1.0 - dissolveProgress);
      }

      // Exit dissolve: starts at 65%, fully covered by 80%
      const exitStart = 0.65;
      const exitEnd = 0.8;
      const exitProgress = Math.min(
        1.5,
        Math.max(0, (progress - exitStart) / (exitEnd - exitStart)),
      );

      if (exitMaterial) {
        exitMaterial.uniforms.uProgress.value = exitProgress;
      }

      // Exit text: fade in at 78%, lightning at 82%, fade out at 93%
      const exitTextEl = exitTextRef.current;
      const exitCharEls = exitCharsRef.current.filter(Boolean) as HTMLSpanElement[];
      if (exitTextEl && exitCharEls.length > 0) {
        const fadeInStart = 0.78;
        const fadeInEnd = 0.81;
        const lightningStart = 0.82;
        const textFadeStart = 0.93;
        const textFadeEnd = 0.98;

        // Fade in whole container
        if (progress < fadeInStart) {
          exitTextEl.style.opacity = "0";
        } else if (progress < fadeInEnd) {
          const fadeIn = (progress - fadeInStart) / (fadeInEnd - fadeInStart);
          exitTextEl.style.opacity = String(fadeIn);
        } else if (progress > textFadeStart) {
          const fadeOut = 1 - (progress - textFadeStart) / (textFadeEnd - textFadeStart);
          exitTextEl.style.opacity = String(Math.max(0, fadeOut));
        } else {
          exitTextEl.style.opacity = "1";
        }

        // Trigger lightning animation once when crossing the threshold
        if (progress >= lightningStart && !exitTextEl.dataset.triggered) {
          exitTextEl.dataset.triggered = "1";
          exitCharEls.forEach((char) => {
            const delay = Math.random() * 0.3;
            const duration = 0.2 + Math.random() * 0.15;
            char.style.animationDelay = `${delay}s`;
            char.style.animationDuration = `${duration}s`;
            char.classList.add("lightning-char");
          });
          exitTextEl.classList.add("lightning-blink");
        }

        // Reset if scrolling back
        if (progress < lightningStart && exitTextEl.dataset.triggered) {
          delete exitTextEl.dataset.triggered;
          exitCharEls.forEach((char) => {
            char.classList.remove("lightning-char");
            char.style.animationDelay = "";
            char.style.animationDuration = "";
          });
          exitTextEl.classList.remove("lightning-blink");
        }
      }
    }

    function onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      renderer1.setSize(w, h);
      gradientRenderer.setSize(w, h);
      exitRenderer?.setSize(w, h);

      if (dissolveMaterial) {
        dissolveMaterial.uniforms.uResolution.value.set(w, h);
      }
      if (exitMaterial) {
        exitMaterial.uniforms.uResolution.value.set(w, h);
      }

      fluidMaterial.uniforms.iResolution.value.set(w, h);
      gradientDisplayMaterial.uniforms.iResolution.value.set(w, h);
      fluidTarget1.setSize(w, h);
      fluidTarget2.setSize(w, h);
      frameCount = 0;
    }

    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);

      const time = performance.now() * 0.001;

      // Dissolve layer
      if (dissolveMaterial) {
        dissolveMaterial.uniforms.uTime.value = time;
      }
      renderer1.render(scene1, camera1);

      // Gradient fluid sim
      if (performance.now() - lastMoveTime > 100) {
        fluidMaterial.uniforms.iMouse.value.set(0, 0, 0, 0);
      }

      fluidMaterial.uniforms.iTime.value = time;
      gradientDisplayMaterial.uniforms.iTime.value = time;
      fluidMaterial.uniforms.iFrame.value = frameCount;

      fluidMaterial.uniforms.iPreviousFrame.value = previousFluidTarget.texture;
      gradientRenderer.setRenderTarget(currentFluidTarget);
      gradientRenderer.render(fluidPlane, gradientCamera);

      gradientDisplayMaterial.uniforms.iFluid.value =
        currentFluidTarget.texture;
      gradientRenderer.setRenderTarget(null);
      gradientRenderer.render(gradientDisplayPlane, gradientCamera);

      const temp = currentFluidTarget;
      currentFluidTarget = previousFluidTarget;
      previousFluidTarget = temp;

      frameCount++;

      // Exit dissolve overlay
      if (exitRenderer) {
        exitRenderer.render(exitScene, exitCamera);
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      scrollTriggers.forEach((st) => st.kill());

      geometry.dispose();
      dissolveMaterial?.dispose();
      exitMaterial?.dispose();
      fluidMaterial.dispose();
      gradientDisplayMaterial.dispose();
      fluidTarget1.dispose();
      fluidTarget2.dispose();
      renderer1.dispose();
      gradientRenderer.dispose();
      exitRenderer?.dispose();

      if (container1.contains(renderer1.domElement)) {
        container1.removeChild(renderer1.domElement);
      }
      if (gradientContainer.contains(gradientRenderer.domElement)) {
        gradientContainer.removeChild(gradientRenderer.domElement);
      }
    };
  }, []);

  return (
    <section className="dissolve" ref={wrapperRef}>
      <div className="dissolve__sticky">
        <div className="dissolve__gradient" ref={gradientRef} />
        <div className="dissolve__canvas1" ref={canvas1Ref} />
        <svg
          className="dissolve__fuse"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {Array.from({ length: 16 }).map((_, i) => (
              <radialGradient
                key={`tg${i}`}
                id={`tunnelGrad${i}`}
                cx="50%"
                cy="50%"
                r="50%"
              >
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="40%" stopColor="rgba(255,255,255,0.5)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
              </radialGradient>
            ))}
          </defs>
          {(() => {
            const cx = 500;
            const cy = 500;
            const lines: React.ReactNode[] = [];
            const count = 16;
            for (let i = 0; i < count; i++) {
              const angle = (i / count) * Math.PI * 2;
              // Start from far outside the viewBox
              const outerR = 720;
              const sx = cx + Math.cos(angle) * outerR;
              const sy = cy + Math.sin(angle) * outerR;
              // End near center — varied so they don't form a perfect circle
              const innerR = 8 - (i % 4) * 2;
              const ex = cx + Math.cos(angle) * innerR;
              const ey = cy + Math.sin(angle) * innerR;
              // Control points create a slight curve inward
              const midR = outerR * 0.45;
              const angleOffset = 0.12;
              const c1x = cx + Math.cos(angle + angleOffset) * midR;
              const c1y = cy + Math.sin(angle + angleOffset) * midR;
              const c2x = cx + Math.cos(angle - angleOffset) * (midR * 0.4);
              const c2y = cy + Math.sin(angle - angleOffset) * (midR * 0.4);

              lines.push(
                <path
                  key={i}
                  ref={(el) => {
                    fusePathsRef.current[i] = el;
                  }}
                  d={`M${sx.toFixed(1)},${sy.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`}
                  fill="none"
                  strokeWidth={1.2 - i * 0.02}
                  stroke={`url(#tunnelGrad${i})`}
                  strokeLinecap="round"
                  opacity={0.6 + (i % 3) * 0.15}
                />,
              );
            }
            return lines;
          })()}
        </svg>
        <div className="dissolve__tunnel-words" ref={tunnelWordsRef}>
          <span className="dissolve__tunnel-word dissolve__tunnel-word--1">
            stress
          </span>
          <span className="dissolve__tunnel-word dissolve__tunnel-word--2">
            alkohol
          </span>
          <span className="dissolve__tunnel-word dissolve__tunnel-word--3">
            søvn
          </span>
        </div>
        {/* Group 1 — left center */}
        <div
          className="dissolve__group dissolve__group--left"
          ref={(el) => {
            groupsRef.current[0] = el;
          }}
        >
          <h2>Fokale anfall</h2>
          <p>
            Fokale anfall oppstår når den elektriske forstyrrelsen i hjernen
            starter i et avgrenset område — én bestemt del av hjernebarken.
            Hvordan anfallet oppleves avhenger helt av hvor i hjernen det
            begynner.
          </p>
        </div>

        {/* Group 2 — right center */}
        <div
          className="dissolve__group dissolve__group--right"
          ref={(el) => {
            groupsRef.current[1] = el;
          }}
        >
          <p>
            Noen merker en plutselig, merkelig følelse i magen, som sommerfugler
            som stiger oppover. Andre opplever déjà vu, en uforklarlig lukt,
            prikking i en arm eller plutselige følelsesendringer — som intens
            frykt uten noen åpenbar grunn.
          </p>
          {/*           <p>
             Noen beskriver det som å se
            verden gjennom knust glass.
          </p> */}
        </div>

        {/* Group 3 — center */}
        <div
          className="dissolve__group dissolve__group--center"
          ref={(el) => {
            groupsRef.current[2] = el;
          }}
        >
          <p>
            Andre opplever en intens følelse av ensomhet midt i et rom fullt av
            mennesker — en kobling som plutselig brytes, uten at noen rundt dem
            forstår hva som skjer. Noen beskriver det som å se verden gjennom
            knust glass.
          </p>
          {/*       <p>
            For mange varer det bare sekunder, men ettervirkningene kan prege
            resten av dagen. Utmattelse, forvirring og en følelse av å ha mistet
            tid er vanlige opplevelser etter et anfall.
          </p> */}
        </div>
        <canvas className="dissolve__exit-canvas" ref={exitCanvasRef} />
        <div className="dissolve__exit-text" ref={exitTextRef}>
          <h2>
            {exitChars.map((char, i) => (
              <span
                key={i}
                ref={(el) => {
                  exitCharsRef.current[i] = el;
                }}
              >
                {char === " " ? "\u00A0" : char}
              </span>
            ))}
          </h2>
        </div>
      </div>

      {/* Scroll trigger sections — invisible, drive animations */}
      <div className="dissolve__spacer" />
      {<div className="dissolve__spacer--short" />}
      <div
        className="dissolve__trigger"
        ref={(el) => {
          triggersRef.current[0] = el;
        }}
      />
      <div
        className="dissolve__trigger"
        ref={(el) => {
          triggersRef.current[1] = el;
        }}
      />
      <div
        className="dissolve__trigger"
        ref={(el) => {
          triggersRef.current[2] = el;
        }}
      />
    </section>
  );
}
