"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";

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

const coverFragmentShaderReverse = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uDissolve;
  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uEdgeIntensity;
  uniform float uDarkness;
  uniform float uGrayscale;
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

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);

    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    vec3 edgeColor = vec3(1.0, 1.0, 1.0);

    vec3 darkBase = vec3(0.0);
    vec3 baseColor = mix(texColor.rgb, darkBase, uDarkness);

    float edgeGlow = edge * uEdgeIntensity * 2.0;
    baseColor += edgeColor * edgeGlow;

    vec3 finalColor = clamp(baseColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;

export default function DissolveSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvas1Ref = useRef<HTMLDivElement>(null);
  const canvas2Ref = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const container1 = canvas1Ref.current;
    const container2 = canvas2Ref.current;
    if (!wrapper || !container1 || !container2) return;

    const scene1 = new THREE.Scene();
    const camera1 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera1.position.z = 1;

    const renderer1 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer1.setSize(window.innerWidth, window.innerHeight);
    container1.appendChild(renderer1.domElement);

    const scene2 = new THREE.Scene();
    const camera2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera2.position.z = 1;

    const renderer2 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer2.setSize(window.innerWidth, window.innerHeight);
    container2.appendChild(renderer2.domElement);

    const geometry = new THREE.PlaneGeometry(2, 2);
    const textureLoader = new THREE.TextureLoader();

    let material1: THREE.ShaderMaterial | null = null;
    let material2: THREE.ShaderMaterial | null = null;

    textureLoader.load("/images/blue.jpg", (texture) => {
      material1 = new THREE.ShaderMaterial({
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

      const mesh1 = new THREE.Mesh(geometry, material1);
      scene1.add(mesh1);
    });

    textureLoader.load("/images/white.jpg", (texture) => {
      material2 = new THREE.ShaderMaterial({
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
          uBrightness: { value: 0.0 },
          uEdgeIntensity: { value: 0.6 },
          uDarkness: { value: 1.0 },
          uGrayscale: { value: 1.0 },
        },
        vertexShader: coverVertexShader,
        fragmentShader: coverFragmentShaderReverse,
        transparent: true,
      });

      const mesh2 = new THREE.Mesh(geometry, material2);
      scene2.add(mesh2);
    });

    function getScrollProgress() {
      if (!wrapper) return 0;
      const rect = wrapper.getBoundingClientRect();
      const scrollableDistance = rect.height - window.innerHeight;
      if (scrollableDistance <= 0) return 0;
      const scrolled = -rect.top;
      return Math.max(0, Math.min(1, scrolled / scrollableDistance));
    }

    function onScroll() {
      const progress = getScrollProgress();

      // Dissolve completes in the first 60% of scroll
      const dissolveProgress = Math.min(1, progress / 0.6);

      if (material1) {
        material1.uniforms.uDissolve.value = dissolveProgress;
        material1.uniforms.uGrayscale.value = Math.min(
          1.0,
          dissolveProgress / 0.4,
        );
        material1.uniforms.uEdgeIntensity.value = dissolveProgress * 0.5;
        material1.uniforms.uEdgeBrightness.value = 1.0 - dissolveProgress;
      }

      if (material2) {
        const acceleratedProgress = Math.min(1.0, dissolveProgress * 1.1);
        material2.uniforms.uEdgeIntensity.value =
          0.6 * (1.0 - acceleratedProgress);
        material2.uniforms.uDarkness.value = 1.0 - acceleratedProgress;
        material2.uniforms.uGrayscale.value = 1.0 - acceleratedProgress;
      }

      // Text fade-in after dissolve is done
      if (progress > 0.65 && !hasAnimated.current && textRef.current) {
        hasAnimated.current = true;
        const lines = textRef.current.querySelectorAll(".dissolve__text-line");
        gsap.to(lines, {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: "power3.out",
        });
      }

      if (progress < 0.6 && hasAnimated.current && textRef.current) {
        hasAnimated.current = false;
        const lines = textRef.current.querySelectorAll(".dissolve__text-line");
        gsap.to(lines, {
          opacity: 0,
          y: 30,
          duration: 0.4,
          ease: "power2.in",
        });
      }
    }

    function onResize() {
      renderer1.setSize(window.innerWidth, window.innerHeight);
      renderer2.setSize(window.innerWidth, window.innerHeight);

      if (material1) {
        material1.uniforms.uResolution.value.set(
          window.innerWidth,
          window.innerHeight,
        );
      }
      if (material2) {
        material2.uniforms.uResolution.value.set(
          window.innerWidth,
          window.innerHeight,
        );
      }
    }

    let animationId: number;

    function animate(time: number) {
      animationId = requestAnimationFrame(animate);

      const timeInSeconds = time * 0.001;
      if (material1) {
        material1.uniforms.uTime.value = timeInSeconds;
      }
      if (material2) {
        material2.uniforms.uTime.value = timeInSeconds;
      }

      renderer1.render(scene1, camera1);
      renderer2.render(scene2, camera2);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);

      geometry.dispose();
      material1?.dispose();
      material2?.dispose();
      renderer1.dispose();
      renderer2.dispose();

      if (container1.contains(renderer1.domElement)) {
        container1.removeChild(renderer1.domElement);
      }
      if (container2.contains(renderer2.domElement)) {
        container2.removeChild(renderer2.domElement);
      }
    };
  }, []);

  return (
    <section className="dissolve" ref={wrapperRef}>
      <div className="dissolve__sticky">
        <div className="dissolve__canvas1" ref={canvas1Ref} />
        <div className="dissolve__canvas2" ref={canvas2Ref} />
        <div className="dissolve__text" ref={textRef}>
          <h2 className="dissolve__text-line">Fokale anfall</h2>
          <p className="dissolve__text-line">
            Fokale anfall oppstår når den elektriske forstyrrelsen i hjernen
            starter i et avgrenset område — én bestemt del av hjernebarken.
            Hvordan anfallet oppleves avhenger helt av hvor i hjernen det
            begynner.
          </p>
          <p className="dissolve__text-line">
            Noen merker en plutselig, merkelig følelse i magen, som sommerfugler
            som stiger oppover. Andre opplever déjà vu, en uforklarlig lukt,
            prikking i en arm eller plutselige følelsesendringer — som intens
            frykt uten noen åpenbar grunn. Dette er fokale anfall med bevart
            bevissthet, der personen er til stede hele tiden men opplever noe de
            rundt dem ikke kan se.
          </p>
        </div>
      </div>
    </section>
  );
}
