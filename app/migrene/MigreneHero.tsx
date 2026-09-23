"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { paintWatercolor } from "./watercolor";
import ParticleField from "./ParticleField";
import ForegroundPaint from "./ForegroundPaint";
import PortalTransition from "./PortalTransition";
import styles from "./migrene.module.css";

const SHOW_FOREGROUND_PAINT = true;

export default function MigreneHero() {
  const sceneRef = useRef<HTMLElement>(null);
  const paintRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLCanvasElement>(null);
  const nearRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const painting = paintRef.current;
    const far = farRef.current;
    const near = nearRef.current;
    if (!scene || !painting || !far || !near) return;

    const layers = [far, near].flatMap((canvas, index) => {
      const context = canvas.getContext("2d");
      if (!context) return [];
      const original = document.createElement("canvas");
      paintWatercolor(original, index === 1);
      canvas.width = original.width;
      canvas.height = original.height;
      context.drawImage(original, 0, 0);
      return [{ canvas, context, original, movement: index === 0 ? -4 : -8 }];
    });

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = preference.matches;
    let bounds = painting.getBoundingClientRect();
    let frame = 0;
    let previous = 0;
    const target = { parallax: 0, x: 0.5, y: 0.5, strength: 0 };
    const current = { ...target };

    const draw = () => {
      for (const { canvas, context, original, movement } of layers) {
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(original, 0, 0);
        if (current.strength < 0.001) continue;

        const scale = canvas.width / bounds.width;
        const x = current.x * canvas.width - current.parallax * movement * scale;
        const y = current.y * canvas.height;
        const radius = Math.min(280, bounds.width * 0.4) * scale;
        // Warm gold in the distant wash; coral merging into violet in front.
        const blend = Math.max(0, Math.min(1, (current.x - 0.35) / 0.35));
        const pigment = movement === -4
          ? "242, 180, 51"
          : `${Math.round(239 - blend * 85)}, ${Math.round(106 + blend * 1)}, ${Math.round(79 + blend * 127)}`;
        const tint = context.createRadialGradient(x, y, 0, x, y, radius);
        tint.addColorStop(0, `rgba(${pigment}, ${current.strength * 0.95})`);
        tint.addColorStop(0.35, `rgba(${pigment}, ${current.strength * 0.72})`);
        tint.addColorStop(0.7, `rgba(${pigment}, ${current.strength * 0.25})`);
        tint.addColorStop(1, `rgba(${pigment}, 0)`);
        // Tint only existing pigment; preserve its transparency and feathered edge.
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = tint;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const delta = previous ? Math.min(now - previous, 40) : 16;
      previous = now;
      const ease = 1 - Math.exp(-delta / 150);
      current.parallax = reducedMotion ? 0 : current.parallax + (target.parallax - current.parallax) * ease;
      current.x += (target.x - current.x) * ease;
      current.y += (target.y - current.y) * ease;
      current.strength += (target.strength - current.strength) * ease;
      const settled = Math.abs(current.parallax - (reducedMotion ? 0 : target.parallax)) < 0.001
        && Math.abs(current.x - target.x) < 0.0001
        && Math.abs(current.y - target.y) < 0.0001
        && Math.abs(current.strength - target.strength) < 0.001;
      if (settled) {
        Object.assign(current, target, { parallax: reducedMotion ? 0 : target.parallax });
      }
      scene.style.setProperty("--pointer-x", current.parallax.toFixed(4));
      draw();
      if (!settled) frame = requestAnimationFrame(tick);
      else previous = 0;
    };

    const animate = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const sceneBounds = scene.getBoundingClientRect();
      target.parallax = Math.max(-1, Math.min(1, ((event.clientX - sceneBounds.left) / sceneBounds.width - 0.5) * 2));
      target.x = (event.clientX - bounds.left) / bounds.width;
      target.y = (event.clientY - bounds.top) / bounds.height;
      if (target.strength === 0 && current.strength === 0) {
        current.x = target.x;
        current.y = target.y;
      }
      target.strength = 1;
      animate();
    };
    const pointerLeave = () => {
      target.parallax = 0;
      target.strength = 0;
      animate();
    };
    const resize = () => {
      bounds = painting.getBoundingClientRect();
      pointerLeave();
    };
    const syncPreference = () => {
      reducedMotion = preference.matches;
      animate();
    };
    const visibilityChange = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      pointerLeave();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(painting);
    scene.addEventListener("pointermove", pointerMove);
    scene.addEventListener("pointerleave", pointerLeave);
    preference.addEventListener("change", syncPreference);
    document.addEventListener("visibilitychange", visibilityChange);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      scene.removeEventListener("pointermove", pointerMove);
      scene.removeEventListener("pointerleave", pointerLeave);
      preference.removeEventListener("change", syncPreference);
      document.removeEventListener("visibilitychange", visibilityChange);
    };
  }, []);

  return (
    <PortalTransition>
    <section ref={sceneRef} className={styles.hero} data-migrene-hero aria-label="Akvarellportrett">
      <div ref={paintRef} className={styles.painting} aria-hidden="true">
        <canvas ref={farRef} className={`${styles.paint} ${styles.farPaint}`} />
        <canvas ref={nearRef} className={`${styles.paint} ${styles.nearPaint}`} />
      </div>
      <ParticleField layer="back" />
      <div className={styles.portrait}>
        <Image
          src="/images/migrene-portrait.png"
          alt="Akvarellportrett av en kvinne som ser opp."
          width={447}
          height={558}
          sizes="(max-width: 700px) 78vw, 560px"
          priority
          draggable={false}
          className={styles.portraitImage}
        />
      </div>
      {SHOW_FOREGROUND_PAINT && <ForegroundPaint />}
      <ParticleField layer="front" />
    </section>
    </PortalTransition>
  );
}
