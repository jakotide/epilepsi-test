"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPaintedMaterial, createPaperMaterial } from "./paintedMaterial";
import styles from "./brain.module.css";

export default function BrainStudy() {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState("Loading the painted brain…");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let frame = 0;
    let needsRender = true;
    let model: THREE.Group | undefined;
    let paper: THREE.Texture | undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setStatus("The 3D preview needs WebGL. The painted study is shown below."));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", "Painted brain. Drag to rotate, or use the arrow keys. Scroll to zoom.");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 40);
    // Blender Z-up camera (5, -7, 4.7), converted to glTF Y-up.
    const initialCamera = new THREE.Vector3(5, 4.7, 7).multiplyScalar(.84);
    camera.position.copy(initialCamera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, .12, 0);
    controls.enablePan = false;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    controls.enableDamping = !motionPreference.matches;
    controls.dampingFactor = .08;
    controls.rotateSpeed = .55;
    controls.minDistance = 5;
    controls.maxDistance = 13;
    controls.update();
    controls.saveState();
    const invalidate = () => { needsRender = true; };
    controls.addEventListener("change", invalidate);
    resetRef.current = () => { controls.reset(); invalidate(); };

    const neutralPaper = new THREE.DataTexture(new Uint8Array([210, 210, 210, 255]), 1, 1);
    neutralPaper.needsUpdate = true;
    const material = createPaintedMaterial(neutralPaper);
    const paperMaterial = createPaperMaterial(material);
    const paperGeometry = new THREE.PlaneGeometry(2, 2);
    const paperGround = new THREE.Mesh(paperGeometry, paperMaterial);
    paperGround.frustumCulled = false;
    paperGround.renderOrder = -100;
    paperGround.visible = false;
    scene.add(paperGround);
    const updateMotion = () => {
      controls.enableDamping = !motionPreference.matches;
      material.uniforms.uScreenFlow.value = motionPreference.matches ? 0 : 1;
      invalidate();
    };
    motionPreference.addEventListener("change", updateMotion);
    updateMotion();
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      camera.aspect = width / Math.max(height, 1);
      camera.fov = width < 600 ? 53 : 34;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.getDrawingBufferSize(material.uniforms.uResolution.value);
      invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const disposeModel = (root: THREE.Object3D) => {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of materials) if (m !== material) m.dispose();
      });
    };
    new GLTFLoader().load("/models/brain/painted-brain.glb", (gltf) => {
      if (!alive) { disposeModel(gltf.scene); return; }
      model = gltf.scene;
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const previous = Array.isArray(object.material) ? object.material : [object.material];
        previous.forEach((m) => m.dispose());
        object.material = material;
      });
      scene.add(model);
      paperGround.visible = true;
      host.dataset.loaded = "true";
      setStatus("");
      invalidate();
    }, undefined, () => {
      if (alive) setStatus("The 3D model could not load. The painted study is shown below.");
    });
    new THREE.TextureLoader().load("/models/brain/rose-paper.jpg", (texture) => {
      if (!alive) { texture.dispose(); return; }
      paper = texture;
      paper.colorSpace = THREE.SRGBColorSpace;
      paper.wrapS = paper.wrapT = THREE.MirroredRepeatWrapping;
      material.uniforms.uPaper.value = paper;
      invalidate();
    }, undefined, () => { /* The neutral paper keeps the model usable offline. */ });

    const keydown = (event: KeyboardEvent) => {
      const direction = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[event.key];
      if (!direction) return;
      event.preventDefault();
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") spherical.theta += direction * .12;
      else spherical.phi = THREE.MathUtils.clamp(spherical.phi + direction * .12, .1, Math.PI - .1);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      invalidate();
    };
    renderer.domElement.addEventListener("keydown", keydown);
    const draw = () => {
      frame = requestAnimationFrame(draw);
      controls.update();
      if (needsRender && !document.hidden) {
        renderer.render(scene, camera);
        needsRender = false;
      }
    };
    draw();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      motionPreference.removeEventListener("change", updateMotion);
      resetRef.current = null;
      renderer.domElement.removeEventListener("keydown", keydown);
      if (model) disposeModel(model);
      material.dispose();
      paperMaterial.dispose();
      paperGeometry.dispose();
      paper?.dispose();
      neutralPaper.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <main className={styles.study}>
      <div className={styles.viewport} ref={hostRef} data-lenis-prevent>
        {/* Also provides a useful fallback if the browser cannot create WebGL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.fallback} src="/models/brain/brain-preview.png" alt="A brain painted in soft rose, cream, and blue-gray watercolor." />
      </div>
      {status && <p className={styles.status} role="status">{status}</p>}
      <div className={styles.controls}>
        <span>Drag to rotate</span>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => resetRef.current?.()}>Reset view</button>
      </div>
    </main>
  );
}
