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

    float noiseScale = 6.0;
    vec2 pixelatedUv = floor(vUv * uResolution / noiseScale) * noiseScale / uResolution;
    float blockNoise = fbm(pixelatedUv * 100.0) * 0.15;

    float angularNoise = fbm(vec2(angle * 5.0, 0.0)) * 0.15;

    float totalNoise = blockNoise + angularNoise;
    float noisyDist = dist + totalNoise;

    float maxDist = length(vec2(aspect * 0.5, 0.5));
    float normalizedDist = noisyDist / maxDist;

    float dissolveThreshold = uDissolve * 1.5;

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);

    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    float dissolveMask = smoothstep(dissolveThreshold - 0.03, dissolveThreshold, normalizedDist);

    vec3 edgeColor = vec3(1.0, 1.0, 1.0);

    vec3 baseColor = mix(texColor.rgb, vec3(0.0), uGrayscale);
    vec3 finalColor = baseColor;

    float edgeGlowIntensity = uEdgeIntensity * 2.0;
    float edgeGlow = edge * edgeGlowIntensity * (1.0 + uGrayscale * 3.0);
    finalColor += edgeColor * edgeGlow * uEdgeBrightness;

    float edgeZoneWidth = 0.15 * (1.0 - uDissolve) + 0.02;
    float edgeZone = smoothstep(dissolveThreshold - edgeZoneWidth, dissolveThreshold - edgeZoneWidth + 0.04, normalizedDist) *
                     smoothstep(dissolveThreshold + 0.02, dissolveThreshold - 0.02, normalizedDist);
    float sparkle = hash(floor(vUv * uResolution / 4.0)) * edgeZone;

    float edgeBrightness = (1.0 - uDissolve) * uEdgeBrightness * (1.0 + uGrayscale * 2.0);
    finalColor += vec3(sparkle * 3.0 * edgeBrightness);

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

        me.xyw += strengthFactor * falloff * vec3(m, 10.);

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

    float mr = min(iResolution.x, iResolution.y);
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / mr;

    // Reduce fluid distortion for softer movement
    uv += fluidVel * (0.2 * uDistortionAmount);

    // Slower animation
    float d = -iTime * 0.2;
    float a = 0.0;
    for (float i = 0.0; i < 8.0; ++i) {
      a += cos(i - d - a * uv.x);
      d += sin(uv.y * i + a);
    }
    d += iTime * 0.2;

    float mixer1 = cos(uv.x * d) * 0.5 + 0.5;
    float mixer2 = cos(uv.y * a) * 0.5 + 0.5;
    float mixer3 = sin(d + a) * 0.5 + 0.5;

    // Push mixers hard toward center — foggy, sparse transitions
    float fog = 0.75;
    mixer1 = mix(mixer1, 0.5, fog);
    mixer2 = mix(mixer2, 0.5, fog);
    mixer3 = mix(mixer3, 0.5, fog);

    vec3 col = mix(uColor1, uColor2, mixer1);
    col = mix(col, uColor3, mixer2);
    col = mix(col, uColor4, mixer3 * 0.4);

    col *= uColorIntensity;

    // Cloudy FBM noise — slowly drifts over time
    vec2 cloudUv = vUv * 2.5 + iTime * 0.03;
    cloudUv += fluidVel * 0.15;
    float cloud = fbm(cloudUv);
    col = mix(col, col * (0.7 + cloud * 0.6), 0.5);

    // Fine film grain
    float grain = hash(vUv * iResolution + fract(iTime * 137.0)) - 0.5;
    col += grain * 0.07;

    gl_FragColor = vec4(col, 1.0);
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
  color2: "#c4c4c4ff",
  color3: "#e3d6e9ff",
  color4: "#ebebebff",
  colorIntensity: 1.0,
  softness: 1.0,
};

export default function DissolveSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvas1Ref = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<(HTMLDivElement | null)[]>([]);
  const triggersRef = useRef<(HTMLDivElement | null)[]>([]);

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
    const textureLoader = new THREE.TextureLoader();
    let dissolveMaterial: THREE.ShaderMaterial | null = null;

    textureLoader.load("/images/blue.jpg", (texture) => {
      dissolveMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uResolution: {
            value: new THREE.Vector2(window.innerWidth, window.innerHeight),
          },
          uImageResolution: {
            value: new THREE.Vector2(texture.image.width, texture.image.height),
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
    });

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
        start: "top 80%",
        end: "top 20%",
        onEnter: () => tween.play(),
        onLeave: () => tween.reverse(),
        onEnterBack: () => tween.play(),
        onLeaveBack: () => tween.reverse(),
      });

      scrollTriggers.push(st);
    });

    function onScroll() {
      const progress = getScrollProgress();

      // Dissolve completes in the first 30% of scroll
      const dissolveProgress = Math.min(1, progress / 0.3);

      if (dissolveMaterial) {
        dissolveMaterial.uniforms.uDissolve.value = dissolveProgress;
        dissolveMaterial.uniforms.uGrayscale.value = Math.min(
          1.0,
          dissolveProgress / 0.4,
        );
        dissolveMaterial.uniforms.uEdgeIntensity.value = dissolveProgress * 0.5;
        dissolveMaterial.uniforms.uEdgeBrightness.value =
          1.0 - dissolveProgress;
      }
    }

    function onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      renderer1.setSize(w, h);
      gradientRenderer.setSize(w, h);

      if (dissolveMaterial) {
        dissolveMaterial.uniforms.uResolution.value.set(w, h);
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
      fluidMaterial.dispose();
      gradientDisplayMaterial.dispose();
      fluidTarget1.dispose();
      fluidTarget2.dispose();
      renderer1.dispose();
      gradientRenderer.dispose();

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
          <p>
            Under et fokalt anfall kan hjernen sende signaler som forstyrrer
            synet, hørselen og berøringssansen. Noen beskriver det som å se
            verden gjennom knust glass.
          </p>
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
            forstår hva som skjer.
          </p>
          <p>
            For mange varer det bare sekunder, men ettervirkningene kan prege
            resten av dagen. Utmattelse, forvirring og en følelse av å ha mistet
            tid er vanlige opplevelser etter et anfall.
          </p>
        </div>
      </div>

      {/* Scroll trigger sections — invisible, drive the text group animations */}
      <div className="dissolve__spacer" />
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
