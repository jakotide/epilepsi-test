"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fluidFragmentShader = `
  uniform sampler2D uPrevTrails;
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform vec2 uResolution;
  uniform float uDecay;
  uniform bool uIsMoving;

  varying vec2 vUv;

  void main() {
    vec4 prevState = texture2D(uPrevTrails, vUv);

    float newValue = prevState.r * uDecay;

    if (uIsMoving) {
      vec2 mouseDirection = uMouse - uPrevMouse;
      float lineLength = length(mouseDirection);

      if (lineLength > 0.001) {
        vec2 mouseDir = mouseDirection / lineLength;

        vec2 toPixel = vUv - uPrevMouse;
        float projAlong = dot(toPixel, mouseDir);
        projAlong = clamp(projAlong, 0.0, lineLength);

        vec2 closestPoint = uPrevMouse + projAlong * mouseDir;
        float dist = length(vUv - closestPoint);

        float lineWidth = 0.09;
        float intensity = smoothstep(lineWidth, 0.0, dist) * 0.3;

        newValue += intensity;
      }
    }

    gl_FragColor = vec4(newValue, 0.0, 0.0, 1.0);
  }
`;

const displayFragmentShader = `
  uniform sampler2D uFluid;
  uniform sampler2D uTopTexture;
  uniform sampler2D uBottomTexture;
  uniform vec2 uResolution;
  uniform float uDpr;
  uniform vec2 uTopTextureSize;
  uniform vec2 uBottomTextureSize;

  varying vec2 vUv;

  vec2 getCoverUV(vec2 uv, vec2 textureSize) {
    if (textureSize.x < 1.0 || textureSize.y < 1.0) return uv;

    vec2 s = uResolution / textureSize;
    float scale = max(s.x, s.y);
    vec2 scaledSize = textureSize * scale;
    vec2 offset = (uResolution - scaledSize) * 0.5;

    return (uv * uResolution - offset) / scaledSize;
  }

  void main() {
    float fluid = texture2D(uFluid, vUv).r;

    vec2 topUV = getCoverUV(vUv, uTopTextureSize);
    vec2 bottomUV = getCoverUV(vUv, uBottomTextureSize);

    vec4 topColor = texture2D(uTopTexture, topUV);
    vec4 bottomColor = texture2D(uBottomTexture, bottomUV);

    float threshold = 0.02;
    float edgeWidth = 0.004 / uDpr;

    float t = smoothstep(threshold, threshold + edgeWidth, fluid);

    vec4 finalColor = mix(topColor, bottomColor, t);

    gl_FragColor = finalColor;
  }
`;

export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      precision: "highp",
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mouse = new THREE.Vector2(0.5, 0.5);
    const prevMouse = new THREE.Vector2(0.5, 0.5);
    let isMoving = false;
    let lastMoveTime = 0;

    const size = 500;
    const pingPongTargets = [
      new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      }),
      new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      }),
    ];
    let currentTarget = 0;

    function createPlaceholderTexture(color: string) {
      const placeholderCanvas = document.createElement("canvas");
      placeholderCanvas.width = 512;
      placeholderCanvas.height = 512;
      const ctx = placeholderCanvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 512, 512);

      const texture = new THREE.CanvasTexture(placeholderCanvas);
      texture.minFilter = THREE.LinearFilter;
      return texture;
    }

    const topTexture = createPlaceholderTexture("#0000ff");
    const bottomTexture = createPlaceholderTexture("#ff0000");

    const topTextureSize = new THREE.Vector2(1, 1);
    const bottomTextureSize = new THREE.Vector2(1, 1);

    const trailsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPrevTrails: { value: null },
        uMouse: { value: mouse },
        uPrevMouse: { value: prevMouse },
        uResolution: { value: new THREE.Vector2(size, size) },
        uDecay: { value: 0.97 },
        uIsMoving: { value: false },
      },
      vertexShader,
      fragmentShader: fluidFragmentShader,
    });

    const displayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uFluid: { value: null },
        uTopTexture: { value: topTexture },
        uBottomTexture: { value: bottomTexture },
        uResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        uDpr: { value: window.devicePixelRatio },
        uTopTextureSize: { value: topTextureSize },
        uBottomTextureSize: { value: bottomTextureSize },
      },
      vertexShader,
      fragmentShader: displayFragmentShader,
    });

    function loadImage(
      url: string,
      textureSizeVector: THREE.Vector2,
      isTop: boolean,
    ) {
      const img = new Image();
      img.crossOrigin = "Anonymous";

      img.onload = function () {
        const originalWidth = img.width;
        const originalHeight = img.height;
        textureSizeVector.set(originalWidth, originalHeight);

        const maxSize = 4096;
        let newWidth = originalWidth;
        let newHeight = originalHeight;

        if (originalWidth > maxSize || originalHeight > maxSize) {
          if (originalWidth > originalHeight) {
            newWidth = maxSize;
            newHeight = Math.floor(originalHeight * (maxSize / originalWidth));
          } else {
            newHeight = maxSize;
            newWidth = Math.floor(originalWidth * (maxSize / originalHeight));
          }
        }

        const loadCanvas = document.createElement("canvas");
        loadCanvas.width = newWidth;
        loadCanvas.height = newHeight;
        const ctx = loadCanvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        const newTexture = new THREE.CanvasTexture(loadCanvas);
        newTexture.minFilter = THREE.LinearFilter;
        newTexture.magFilter = THREE.LinearFilter;

        if (isTop) {
          displayMaterial.uniforms.uTopTexture.value = newTexture;
        } else {
          displayMaterial.uniforms.uBottomTexture.value = newTexture;
        }
      };

      img.src = url;
    }

    loadImage("/images/pexels-pixabay-157661.jpg", topTextureSize, true);
    loadImage(
      "/images/pexels-sergey-pesterev-69811391-8784402.jpg",
      bottomTextureSize,
      false,
    );

    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const displayMesh = new THREE.Mesh(planeGeometry, displayMaterial);
    scene.add(displayMesh);

    const simMesh = new THREE.Mesh(planeGeometry, trailsMaterial);
    const simScene = new THREE.Scene();
    simScene.add(simMesh);

    renderer.setRenderTarget(pingPongTargets[0]);
    renderer.clear();
    renderer.setRenderTarget(pingPongTargets[1]);
    renderer.clear();
    renderer.setRenderTarget(null);

    function onMouseMove(event: MouseEvent) {
      const canvasRect = canvas!.getBoundingClientRect();

      if (
        event.clientX >= canvasRect.left &&
        event.clientX <= canvasRect.right &&
        event.clientY >= canvasRect.top &&
        event.clientY <= canvasRect.bottom
      ) {
        prevMouse.copy(mouse);
        mouse.x = (event.clientX - canvasRect.left) / canvasRect.width;
        mouse.y = 1 - (event.clientY - canvasRect.top) / canvasRect.height;
        isMoving = true;
        lastMoveTime = performance.now();
      } else {
        isMoving = false;
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (event.touches.length > 0) {
        event.preventDefault();
        const canvasRect = canvas!.getBoundingClientRect();
        const touchX = event.touches[0].clientX;
        const touchY = event.touches[0].clientY;

        if (
          touchX >= canvasRect.left &&
          touchX <= canvasRect.right &&
          touchY >= canvasRect.top &&
          touchY <= canvasRect.bottom
        ) {
          prevMouse.copy(mouse);
          mouse.x = (touchX - canvasRect.left) / canvasRect.width;
          mouse.y = 1 - (touchY - canvasRect.top) / canvasRect.height;
          isMoving = true;
          lastMoveTime = performance.now();
        } else {
          isMoving = false;
        }
      }
    }

    function onWindowResize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      displayMaterial.uniforms.uResolution.value.set(
        window.innerWidth,
        window.innerHeight,
      );
      displayMaterial.uniforms.uDpr.value = window.devicePixelRatio;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("resize", onWindowResize);

    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);

      if (isMoving && performance.now() - lastMoveTime > 50) {
        isMoving = false;
      }

      const prevTarget = pingPongTargets[currentTarget];
      currentTarget = (currentTarget + 1) % 2;
      const currentRenderTarget = pingPongTargets[currentTarget];

      trailsMaterial.uniforms.uPrevTrails.value = prevTarget.texture;
      trailsMaterial.uniforms.uMouse.value.copy(mouse);
      trailsMaterial.uniforms.uPrevMouse.value.copy(prevMouse);
      trailsMaterial.uniforms.uIsMoving.value = isMoving;

      renderer.setRenderTarget(currentRenderTarget);
      renderer.render(simScene, camera);

      displayMaterial.uniforms.uFluid.value = currentRenderTarget.texture;

      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onWindowResize);

      pingPongTargets.forEach((t) => t.dispose());
      planeGeometry.dispose();
      trailsMaterial.dispose();
      displayMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <section className="hero">
      <canvas ref={canvasRef} />
    </section>
  );
}
