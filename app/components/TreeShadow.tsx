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

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uResolution;
  uniform sampler2D uWallTexture;
  uniform vec2 uWallTextureSize;

  varying vec2 vUv;

  vec2 getCoverUV(vec2 uv, vec2 textureSize, vec2 resolution) {
    vec2 s = resolution / textureSize;
    float scale = max(s.x, s.y);
    vec2 scaledSize = textureSize * scale;
    vec2 offset = (resolution - scaledSize) * 0.5;
    return (uv * resolution - offset) / scaledSize;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec2 hash2(vec2 p) {
    return vec2(hash(p), hash(p + 71.3));
  }

  // Distance from point p to a line segment from a to b
  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 centeredUv = (uv - 0.5) * vec2(aspect, 1.0);

    // Mouse-following center — limited to 25% range, stays near center
    vec2 mouseDelta = (uMouse - 0.5) * 0.25;
    vec2 spotCenter = mouseDelta * vec2(aspect, 1.0);
    spotCenter.y += sin(uTime * 0.8) * 0.06;

    float dist = length(centeredUv - spotCenter);

    // Circular containment — wide and gradual fade
    float clusterMask = smoothstep(0.7, 0.1, dist);

    // Accumulate light from capsule-shaped shards
    float light = 0.0;

    // Base shard angle — slight per-shard variation for organic feel
    float baseAngle = -0.62; // ~-35 degrees

    // Denser grid for more shards
    float gridScale = 10.0;
    vec2 gridUv = uv * vec2(aspect, 1.0) * gridScale;
    vec2 cellId = floor(gridUv);

    // Check 5x5 neighborhood so soft blurs bleed well across cells
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 neighbor = cellId + vec2(float(x), float(y));
        vec2 rng = hash2(neighbor);

        // Density based on distance to screen center (fixed, not mouse)
        // More shards in center, fewer at edges — no popping when mouse moves
        vec2 cellCenter = (neighbor + 0.5) / gridScale;
        float distToCenter = length(cellCenter - vec2(aspect * 0.5, 0.5));
        float density = smoothstep(0.6, 0.0, distToCenter) * 0.35;
        if (rng.x < 0.15 - density) continue;

        // Per-shard angle variation: base +-20 degrees
        float angle = baseAngle + (hash(neighbor + 99.0) - 0.5) * 0.7;
        vec2 shardDir = vec2(cos(angle), sin(angle));

        // Shard center within cell (random offset)
        vec2 shardCenter = (neighbor + hash2(neighbor + 10.0)) / gridScale;
        shardCenter /= vec2(aspect, 1.0);

        // Capsule endpoints — longer minimum length
        float shardLen = 0.03 + rng.y * 0.045;
        vec2 aspectDir = shardDir / vec2(aspect, 1.0);
        vec2 a = shardCenter - aspectDir * shardLen;
        vec2 b = shardCenter + aspectDir * shardLen;

        // Animate: shard slides along its direction
        float phase = hash(neighbor + 33.0);
        float speed = 0.06 + hash(neighbor + 77.0) * 0.05;
        float cycle = fract(uTime * speed + phase);

        // Slide endpoints with overlap so shard is always visible during mid-cycle
        float frontT = smoothstep(0.0, 0.45, cycle);
        float backT = smoothstep(0.25, 0.85, cycle);

        // Smooth opacity: ramp up at start, fully gone by end — no pop at wrap
        float opacity = smoothstep(0.0, 0.15, cycle) * smoothstep(1.0, 0.85, cycle);

        // Animated endpoints
        vec2 animA = mix(a, b, backT);
        vec2 animB = mix(a, b, frontT);

        // Skip if segment collapsed
        if (frontT <= backT + 0.005) continue;

        // Scale opacity by how much of the shard is visible (avoids tiny dot flash)
        opacity *= smoothstep(0.0, 0.08, frontT - backT);

        // Distance to capsule
        float d = sdSegment(uv, animA, animB);

        // Soft bokeh blob — wide radius for overlap
        float blob = smoothstep(0.05, 0.0, d);

        // Brightness varies per shard
        float brightness = 0.5 + 0.5 * hash(neighbor + 55.0);

        light += blob * opacity * brightness;
      }
    }

    // Clamp and mask to cluster area
    light = clamp(light, 0.0, 1.0) * clusterMask;

    // Sample wall texture with cover fit
    vec2 wallUv = getCoverUV(uv, uWallTextureSize, uResolution);
    vec3 wallColor = texture2D(uWallTexture, wallUv).rgb;

    // Brighten the wall where light hits — warm sunlight tint
    vec3 sunlight = wallColor * vec3(1.4, 1.35, 1.25);
    vec3 shadow = wallColor * 0.7;

    vec3 color = mix(shadow, sunlight, light);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default function TreeShadow() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      precision: "highp",
    });

    renderer.setSize(section.clientWidth, section.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mouse = new THREE.Vector2(0.5, 0.5);
    const smoothedMouse = new THREE.Vector2(0.5, 0.5);

    // Placeholder texture until image loads
    const placeholderCanvas = document.createElement("canvas");
    placeholderCanvas.width = 4;
    placeholderCanvas.height = 4;
    const ctx = placeholderCanvas.getContext("2d")!;
    ctx.fillStyle = "#8c8c8a";
    ctx.fillRect(0, 0, 4, 4);
    const placeholderTexture = new THREE.CanvasTexture(placeholderCanvas);
    placeholderTexture.minFilter = THREE.LinearFilter;

    const wallTextureSize = new THREE.Vector2(1, 1);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: smoothedMouse },
        uResolution: {
          value: new THREE.Vector2(section.clientWidth, section.clientHeight),
        },
        uWallTexture: { value: placeholderTexture },
        uWallTextureSize: { value: wallTextureSize },
      },
      vertexShader,
      fragmentShader,
    });

    // Load wall texture
    const wallImg = new Image();
    wallImg.crossOrigin = "Anonymous";
    wallImg.onload = function () {
      wallTextureSize.set(wallImg.width, wallImg.height);
      const loadCanvas = document.createElement("canvas");
      const maxSize = 4096;
      let w = wallImg.width;
      let h = wallImg.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) {
          h = Math.floor(h * (maxSize / w));
          w = maxSize;
        } else {
          w = Math.floor(w * (maxSize / h));
          h = maxSize;
        }
      }
      loadCanvas.width = w;
      loadCanvas.height = h;
      const loadCtx = loadCanvas.getContext("2d")!;
      loadCtx.drawImage(wallImg, 0, 0, w, h);
      const texture = new THREE.CanvasTexture(loadCanvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      material.uniforms.uWallTexture.value = texture;
    };
    wallImg.src = "/images/wall3.jpg";

    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(planeGeometry, material);
    scene.add(mesh);

    // --- Event handlers ---
    function onMouseMove(event: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        mouse.x = (event.clientX - rect.left) / rect.width;
        mouse.y = 1 - (event.clientY - rect.top) / rect.height;
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (event.touches.length > 0) {
        event.preventDefault();
        const rect = canvas!.getBoundingClientRect();
        const touchX = event.touches[0].clientX;
        const touchY = event.touches[0].clientY;
        if (
          touchX >= rect.left &&
          touchX <= rect.right &&
          touchY >= rect.top &&
          touchY <= rect.bottom
        ) {
          mouse.x = (touchX - rect.left) / rect.width;
          mouse.y = 1 - (touchY - rect.top) / rect.height;
        }
      }
    }

    function onResize() {
      const w = section!.clientWidth;
      const h = section!.clientHeight;
      renderer.setSize(w, h);
      material.uniforms.uResolution.value.set(w, h);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("resize", onResize);

    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);

      const time = performance.now() * 0.001;
      material.uniforms.uTime.value = time;

      // Smooth mouse lerp
      smoothedMouse.lerp(mouse, 0.05);

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      planeGeometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <section className="tree-shadow" ref={sectionRef}>
      <canvas className="tree-shadow__canvas" ref={canvasRef} />
    </section>
  );
}
