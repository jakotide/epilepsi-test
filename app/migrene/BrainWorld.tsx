"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createPaintedMaterial } from "./brain/paintedMaterial";
import { createWorldPaint, washLayers } from "./brain/worldPaint";
import styles from "./BrainWorld.module.css";

gsap.registerPlugin(ScrollTrigger);

const chapters = [
  { number: "På innsiden", title: "En verden av signaler", text: "Et lite skifte i perspektiv. Vi utforsker hjernen, ett område og én historie av gangen.", color: "#769da7" },
  { number: "Område 01", title: "Når inntrykk blir sterke", text: "Her kommer en kort forklaring om sanseinntrykk og migrene. Dette feltet fylles med den ferdige historien om området som markeres.", color: "#4b9ea9" },
  { number: "Område 02", title: "Signalene som går videre", text: "Her kommer neste del av historien: hvordan signaler beveger seg mellom områder, og hvilken rolle dette kan spille ved migrene.", color: "#ca9952" },
  { number: "Område 03", title: "En del av et større bilde", text: "Her kommer en forklaring om samspillet mellom ulike deler av hjernen. Teksten og markeringen er foreløpige plassholdere.", color: "#9e81af" },
];

export default function BrainWorld({ journeyRef }: { journeyRef: RefObject<HTMLElement | null> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    const host = canvasRef.current;
    const journey = journeyRef.current;
    if (!root || !host || !journey) return;
    const stage = root.closest<HTMLElement>("[data-transition-stage]");
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-story-card]"));
    let alive = true;
    let renderer: THREE.WebGLRenderer | undefined;
    let model: THREE.Group | undefined;
    let paper: THREE.Texture | undefined;
    let frame = 0;
    let lastFrame = 0;
    let mobile = host.clientWidth <= 700;
    let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dirty = true;
    let hoverTarget = 0;
    const pointer = new THREE.Vector2(.5, .5);
    const neutral = new THREE.DataTexture(new Uint8Array([210, 210, 210, 255]), 1, 1);
    neutral.needsUpdate = true;
    const material = createPaintedMaterial(neutral);
    const paint = createWorldPaint(material);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
    const pivot = new THREE.Group();
    scene.add(pivot);
    const groundGeometry = new THREE.PlaneGeometry(2, 2);
    const ground = new THREE.Mesh(groundGeometry, paint.ground);
    ground.frustumCulled = false;
    ground.renderOrder = -100;
    scene.add(ground);
    const washGeometry = new THREE.PlaneGeometry(1, 1);
    const washes = paint.washes.map((mat, i) => {
      const mesh = new THREE.Mesh(washGeometry, mat);
      mesh.scale.set(washLayers[i].width, washLayers[i].height, 1);
      scene.add(mesh);
      return mesh;
    });

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.appendChild(renderer.domElement);
    } catch {
      queueMicrotask(() => { if (alive) setStatus("En malt forhåndsvisning vises her."); });
    }

    const pose = { yaw: .62, pitch: .44, distance: 8.5, shift: 0, progress: 0, mobileLift: 1.6, brainOpacity: 1, backgroundOpacity: 1, zoomOpacity: 0, zoomProgress: 0, introOpacity: 0 };
    const animatedHighlight = material.uniforms.uHighlightCenter.value.clone() as THREE.Vector3;
    const stillHighlights = [new THREE.Vector3(), new THREE.Vector3(.75, .65, .92), new THREE.Vector3(-.35, .95, 1.1), new THREE.Vector3(.85, .05, .9)];
    const target = new THREE.Vector3(0, .12, 0);
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const placeWashes = (time = 0) => {
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      camera.getWorldDirection(forward);
      const yawTravel = reduced ? 0 : pose.yaw - .62;
      const pitchTravel = reduced ? 0 : pose.pitch - .44;
      const mouseX = reduced ? 0 : (paint.shared.uMouse.value.x - .5) * paint.shared.uHover.value;
      const mouseY = reduced ? 0 : (paint.shared.uMouse.value.y - .5) * paint.shared.uHover.value;
      washes.forEach((mesh, i) => {
        const layer = washLayers[i];
        if (i === 0 || i === 3 || i === 7) {
          // All bottom washes share one screen level through every camera pose.
          const x = layer.x - yawTravel * layer.travel + mouseX * layer.travel * .3;
          mesh.position.copy(camera.position).addScaledVector(forward, layer.depth).addScaledVector(right, x).addScaledVector(up, layer.y);
          mesh.quaternion.copy(camera.quaternion);
          return;
        }
        const drift = reduced ? 0 : Math.sin(time * .16 + i * 2.3) * .17;
        const lift = reduced ? 0 : Math.cos(time * .13 + i * 1.7) * .10;
        const breath = reduced ? 1 : 1 + Math.sin(time * .32 + i * 1.9) * .018;
        const x = layer.x - yawTravel * layer.travel * 1.45 + mouseX * layer.travel * .5 + drift;
        const y = layer.y + pitchTravel * layer.travel * 3 + mouseY * layer.travel * .3 + lift;
        mesh.scale.set(layer.width * breath, layer.height * breath, 1);
        mesh.position.copy(camera.position).addScaledVector(forward, layer.depth).addScaledVector(right, x).addScaledVector(up, y);
        mesh.quaternion.copy(camera.quaternion);
        mesh.rotateX(-.20 + (reduced ? 0 : Math.sin(time * .09 + i) * .025));
        mesh.rotateY(i % 2 === 0 ? .18 : -.18);
        mesh.rotateZ(layer.tilt + yawTravel * .10 * layer.travel + drift * .15);
      });
    };
    const sync = () => {
      const elapsed = pose.progress;
      const active = Math.min(3, Math.floor(Math.max(0, elapsed - .10)));
      root.dataset.storyProgress = elapsed.toFixed(3);
      root.dataset.activeChapter = String(active);
      material.uniforms.uHighlightCenter.value.copy(reduced ? stillHighlights[active] : animatedHighlight);
      const started = elapsed > .035 && elapsed < 4.1;
      cards.forEach((card, i) => card.setAttribute("aria-hidden", String(!started || active !== i)));
      const yaw = reduced ? .62 : pose.yaw;
      const pitch = reduced ? .44 : pose.pitch;
      const distance = mobile ? 10.2 : reduced ? 8.5 : pose.distance;
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
      camera.lookAt(target);
      root.dataset.cameraPose = `${yaw.toFixed(3)},${pitch.toFixed(3)},${distance.toFixed(3)}`;
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      placeWashes(paint.shared.uTime.value);
      pivot.position.copy(right).multiplyScalar(mobile ? 0 : -pose.shift);
      if (mobile) pivot.position.y = pose.mobileLift;
      material.uniforms.uOpacity.value = pose.brainOpacity;
      pivot.visible = pose.brainOpacity > .001;
      host.style.opacity = String(pose.backgroundOpacity);
      const fallback = host.querySelector<HTMLElement>("img");
      if (fallback) fallback.style.opacity = String(pose.brainOpacity);
      root.dataset.brainOpacity = pose.brainOpacity.toFixed(3);
      root.dataset.backgroundOpacity = pose.backgroundOpacity.toFixed(3);
      if (stage) {
        stage.style.setProperty("--zoom-opacity", String(pose.zoomOpacity));
        stage.style.setProperty("--zoom-intro-opacity", String(pose.introOpacity));
        stage.querySelector("[data-zoom-intro]")?.setAttribute("aria-hidden", String(pose.introOpacity < .05));
        const zoomProgress = pose.zoomProgress.toFixed(5);
        if (stage.dataset.zoomProgress !== zoomProgress) {
          stage.dataset.zoomProgress = zoomProgress;
          stage.dispatchEvent(new CustomEvent("migrene:zoom-progress", { detail: pose.zoomProgress }));
        }
      }
      dirty = true;
    };
    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight;
      mobile = width <= 700;
      camera.aspect = width / Math.max(height, 1);
      camera.fov = mobile ? 49 : 34;
      camera.updateProjectionMatrix();
      renderer?.setSize(width, height);
      renderer?.getDrawingBufferSize(material.uniforms.uResolution.value);
      sync();
    };
    resize();

    // One scrubbed timeline owns the camera, composition, pigment, and text.
    const timeline = gsap.timeline({
      defaults: { ease: "sine.inOut" },
      scrollTrigger: {
        trigger: journey,
        start: () => `top -${host.clientHeight * 1.5}`,
        end: "bottom bottom",
        scrub: .7,
        invalidateOnRefresh: true,
      },
      onUpdate: sync,
    });
    timeline.to(pose, { progress: 9.65, duration: 9.65, ease: "none" }, 0);
    timeline.to(pose, { shift: 1.18, duration: .45 }, 0);
    cards.forEach((card, index) => {
      timeline.fromTo(card, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .24 }, index + .06);
      if (index < cards.length - 1) timeline.to(card, { autoAlpha: 0, y: -14, duration: .17 }, index + .85);
    });
    const poses = [
      { yaw: .88, pitch: .32, distance: 8.0, center: [.75, .65, .92], color: "#469daa", radius: .98 },
      { yaw: -.65, pitch: .40, distance: 8.25, center: [-.75, .70, .90], color: "#c79642", radius: .95 },
      { yaw: -1.55, pitch: .27, distance: 8.15, center: [-1.0, .25, -.40], color: "#9972b1", radius: 1.02 },
    ];
    poses.forEach((view, i) => {
      const at = i + .88;
      const tint = new THREE.Color(view.color);
      timeline.to(pose, { yaw: view.yaw, pitch: view.pitch, distance: view.distance, duration: .70 }, at);
      timeline.to(material.uniforms.uHighlightStrength, { value: 0, duration: .12 }, at);
      timeline.to(animatedHighlight, { x: view.center[0], y: view.center[1], z: view.center[2], duration: .25 }, at + .1);
      timeline.to(material.uniforms.uHighlightRadius, { value: view.radius, duration: .25 }, at + .1);
      timeline.to(material.uniforms.uHighlightColor.value, { r: tint.r, g: tint.g, b: tint.b, duration: .3 }, at + .1);
      timeline.to(material.uniforms.uHighlightStrength, { value: 1, duration: .4 }, at + .26);
    });
    // A full beat after the final card: overhead, dissolve, then clear the paper.
    timeline.to(cards[3], { autoAlpha: 0, y: -14, duration: .25 }, 4);
    timeline.to(pose, { yaw: -.08, pitch: 1.28, distance: 8.8, shift: 0, mobileLift: 0, duration: .90 }, 4.12);
    timeline.to(material.uniforms.uHighlightStrength, { value: 0, duration: .5 }, 4.15);
    timeline.to(pose, { brainOpacity: 0, duration: .55 }, 5.08);
    timeline.to(pose, { backgroundOpacity: 0, duration: .45 }, 5.65);
    timeline.to(pose, { zoomOpacity: 1, duration: .38 }, 6.10);
    timeline.to(pose, { zoomProgress: 1, duration: 1.65, ease: "none" }, 6.50);
    // Hold the complete portrait before making room for the next chapter's text.
    timeline.to(pose, { introOpacity: 1, duration: .50 }, 8.45);
    sync();

    const disposeModel = (object: THREE.Object3D) => object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => { if (m !== material) m.dispose(); });
    });
    if (renderer) {
      new GLTFLoader().load("/models/brain/painted-brain.glb", (gltf) => {
        if (!alive) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m.dispose());
          child.material = material;
        });
        pivot.add(model);
        host.dataset.loaded = "true";
        dirty = true;
      }, undefined, () => {
        if (alive) setStatus("En malt forhåndsvisning vises her.");
      });
      new THREE.TextureLoader().load("/models/brain/rose-paper.jpg", (texture) => {
        if (!alive) { texture.dispose(); return; }
        paper = texture;
        paper.colorSpace = THREE.SRGBColorSpace;
        paper.wrapS = paper.wrapT = THREE.MirroredRepeatWrapping;
        material.uniforms.uPaper.value = paper;
        dirty = true;
      }, undefined, () => { /* The neutral paper keeps the scene usable. */ });
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = root.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height);
      hoverTarget = 1;
      dirty = true;
    };
    const leave = () => { hoverTarget = 0; dirty = true; };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      reduced = preference.matches;
      material.uniforms.uScreenFlow.value = reduced ? 0 : 1;
      timeline.scrollTrigger?.getTween()?.duration(reduced ? .01 : .7);
      sync();
    };
    preference.addEventListener("change", updatePreference);
    updatePreference();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!renderer || !model || document.hidden || now - lastFrame < 32) return;
      const opening = Number(stage?.dataset.portalOpening ?? 0);
      if (opening <= 0) return;
      if (pose.backgroundOpacity <= .001) return;
      lastFrame = now;
      const hover = paint.shared.uHover;
      if (Math.abs(hover.value - hoverTarget) > .001) dirty = true;
      hover.value = THREE.MathUtils.lerp(hover.value, hoverTarget, reduced ? 1 : .10);
      paint.shared.uMouse.value.lerp(pointer, reduced ? 1 : .12);
      if (!reduced) {
        paint.shared.uTime.value = now / 1000;
        placeWashes(now / 1000);
      }
      if (dirty || !reduced) {
        renderer.render(scene, camera);
        dirty = false;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      timeline.scrollTrigger?.kill();
      timeline.kill();
      observer.disconnect();
      preference.removeEventListener("change", updatePreference);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      if (model) disposeModel(model);
      material.dispose();
      neutral.dispose();
      paper?.dispose();
      groundGeometry.dispose();
      washGeometry.dispose();
      paint.ground.dispose();
      paint.washes.forEach((mat) => mat.dispose());
      renderer?.dispose();
      renderer?.domElement.remove();
      delete host.dataset.loaded;
    };
  }, [journeyRef]);

  return (
    <div ref={rootRef} className={styles.world} data-brain-world>
      <div ref={canvasRef} className={styles.canvas}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.fallback} src="/models/brain/brain-preview.png" alt="En hjerne malt i akvarell." />
      </div>
      <div className={styles.cards}>
        {chapters.map((chapter) => (
          <section key={chapter.number} className={styles.card} data-story-card aria-hidden="true">
            <h2>{chapter.title}</h2>
            <p>{chapter.text}</p>
          </section>
        ))}
      </div>
      {status && <p className={styles.status} role="status">{status}</p>}
    </div>
  );
}
