"use client";

import { useEffect, useRef } from "react";
import styles from "./migrene.module.css";

const COLORS = ["119, 134, 153", "153, 135, 117", "145, 132, 159", "142, 153, 159"];

export default function ParticleField({ layer }: { layer: "back" | "front" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !scene || !context) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = preference.matches;
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    let width = 0;
    let height = 0;
    let spreadX = 0;
    let spreadY = 0;
    let parallax = 0;
    let pointerX = -1000;
    let pointerY = -1000;
    let pointerActive = false;

    // Adapted from globe-gallery: projected size, soft round falloff, upward
    // recycling, seeded sway, and slow changes in brightness. Separate DOM
    // planes let the portrait actually occlude the distant dust.
    const foreground = layer === "front";
    const particles = Array.from({ length: foreground ? 48 : 140 }, (_, index) => {
      const seed = index + (foreground ? 137 : 1);
      const depth = foreground ? 0.65 + ((seed * 0.754877666) % 1) * 0.35 : ((seed * 0.754877666) % 1) * 0.55;
      const projection = 1 / (1.4 - depth * 0.65);
      const soft = foreground && index % 5 === 0;
      const color = foreground && index % 4 === 0 ? "255, 254, 249" : COLORS[index % COLORS.length];
      const sprite = document.createElement("canvas");
      sprite.width = 48;
      sprite.height = 48;
      const brush = sprite.getContext("2d");
      if (brush) {
        const gradient = brush.createRadialGradient(24, 24, 0, 24, 24, 24);
        gradient.addColorStop(0, `rgba(${color}, 1)`);
        gradient.addColorStop(soft ? 0.12 : 0.25, `rgba(${color}, 0.85)`);
        gradient.addColorStop(0.6, `rgba(${color}, ${soft ? 0.22 : 0.38})`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);
        brush.fillStyle = gradient;
        brush.fillRect(0, 0, 48, 48);
      }
      return {
        x: ((seed * 0.618033989) % 1) * 2 - 1,
        y: (seed * 0.414213562) % 1,
        radius: (foreground ? (soft ? 4.2 : 2.0) : 1.15) + ((seed * 0.569840291) % 1) * (foreground ? 1.5 : 1.2),
        opacity: foreground ? (soft ? 0.36 : 0.66) : 0.62,
        depth,
        projection,
        phase: seed * 1.7,
        sprite,
      };
    });

    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        const driftX = Math.sin(elapsed * 0.0003 + particle.phase) * 12 * particle.projection;
        const phaseY = ((particle.y - elapsed * (0.000008 + particle.depth * 0.000008)) % 1 + 1) % 1;
        const x = width / 2 + particle.x * spreadX * particle.projection + driftX + parallax * (foreground ? 15 : -5) * particle.projection;
        const y = height / 2 + (phaseY * 2 - 1) * spreadY;
        const proximity = pointerActive ? Math.max(0, 1 - Math.hypot(x - pointerX, y - pointerY) / 220) : 0;
        const edgeFade = Math.min(1, Math.max(0, Math.min(x, width - x, y, height - y) / 35));
        const recycleFade = Math.min(1, phaseY * 12, (1 - phaseY) * 12);
        const shimmer = 0.84 + 0.16 * Math.sin(elapsed * 0.0006 + particle.phase);
        const radius = particle.radius * particle.projection;
        context.globalAlpha = Math.min(1, particle.opacity + proximity * 0.1) * edgeFade * recycleFade * shimmer;
        context.drawImage(particle.sprite, x - radius, y - radius, radius * 2, radius * 2);
      }
      context.globalAlpha = 1;
    };

    const tick = (now: number) => {
      if (!previous || now - previous >= 1000 / 30) {
        const delta = previous ? Math.min(now - previous, 60) : 33;
        previous = now;
        elapsed += delta;
        const target = pointerActive ? (pointerX / width - 0.5) * 2 : 0;
        parallax += (target - parallax) * (1 - Math.exp(-delta / 200));
        draw();
      }
      frame = requestAnimationFrame(tick);
    };

    const reconcile = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (reducedMotion) parallax = 0;
      draw();
      if (!reducedMotion && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      width = scene.clientWidth;
      height = scene.clientHeight;
      const portrait = scene.querySelector("img")?.getBoundingClientRect();
      spreadX = Math.min((portrait?.width ?? width * 0.4) * 1.35, width * 0.58);
      spreadY = Math.min((portrait?.height ?? height * 0.6) * 0.78, height * 0.53);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const bounds = scene.getBoundingClientRect();
      pointerX = event.clientX - bounds.left;
      pointerY = event.clientY - bounds.top;
      pointerActive = true;
      if (reducedMotion) draw();
    };
    const pointerLeave = () => {
      pointerActive = false;
      if (reducedMotion) draw();
    };
    const syncPreference = () => {
      reducedMotion = preference.matches;
      reconcile();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(scene);
    scene.addEventListener("pointermove", pointerMove);
    scene.addEventListener("pointerleave", pointerLeave);
    preference.addEventListener("change", syncPreference);
    document.addEventListener("visibilitychange", reconcile);
    resize();
    reconcile();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.removeEventListener("pointermove", pointerMove);
      scene.removeEventListener("pointerleave", pointerLeave);
      preference.removeEventListener("change", syncPreference);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [layer]);

  return <canvas ref={canvasRef} className={`${styles.particles} ${layer === "back" ? styles.distantDust : styles.nearDust}`} data-dust-layer={layer} aria-hidden="true" />;
}
