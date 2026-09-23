"use client";

import { useEffect, useRef } from "react";
import { paintForegroundWatercolor } from "./watercolor";
import styles from "./migrene.module.css";

// A separate experimental layer, independent of the portrait and hover paint.
export default function ForegroundPaint() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !scene || !context) return;

    const paperColor = getComputedStyle(scene).backgroundColor;
    const coats = Array.from({ length: 4 }, (_, index) => {
      const layer = document.createElement("canvas");
      paintForegroundWatercolor(layer, index, paperColor);
      return layer;
    });
    const original = document.createElement("canvas");
    original.width = coats[0].width;
    original.height = coats[0].height;
    const paint = original.getContext("2d");
    if (!paint) return;
    canvas.width = original.width;
    canvas.height = original.height;

    const stages = [[0.03, 0.32], [0.27, 0.65], [0.58, 1]];
    const compose = (progress: number) => {
      paint.globalCompositeOperation = "source-over";
      paint.clearRect(0, 0, original.width, original.height);
      paint.globalAlpha = 1;
      paint.drawImage(coats[0], 0, 0);
      // Separate translucent deposits retain their own ragged watercolor edges.
      // Slightly overlapping stages create a soft, stepped buildup as we scroll.
      stages.forEach(([start, end], index) => {
        const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
        if (t === 0) return;
        paint.globalAlpha = t * t * (3 - 2 * t);
        paint.drawImage(coats[index + 1], 0, 0);
      });
      paint.globalAlpha = 1;
    };
    compose(Number(scene.dataset.washProgress ?? 0));
    context.drawImage(original, 0, 0);

    let frame = 0;
    let previous = 0;
    const target = { x: 0, y: 0, strength: 0 };
    const current = { ...target };

    const draw = () => {
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(original, 0, 0);
      if (current.strength < 0.001) return;

      // Use the actual transformed bounds so the tint follows the taller wash.
      const bounds = canvas.getBoundingClientRect();
      context.save();
      context.scale(canvas.width / bounds.width, canvas.height / bounds.height);
      const x = current.x - bounds.left;
      const y = current.y - bounds.top;
      const radius = Math.min(190, bounds.width * 0.32);
      const tint = context.createRadialGradient(x, y, 0, x, y, radius);
      tint.addColorStop(0, `rgba(137, 158, 177, ${current.strength * 0.23})`);
      tint.addColorStop(0.4, `rgba(137, 158, 177, ${current.strength * 0.1})`);
      tint.addColorStop(1, "rgba(137, 158, 177, 0)");
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = tint;
      context.fillRect(0, 0, bounds.width, bounds.height);
      context.restore();
    };

    const tick = (now: number) => {
      frame = 0;
      const delta = previous ? Math.min(now - previous, 40) : 16;
      previous = now;
      const ease = 1 - Math.exp(-delta / 180);
      current.x += (target.x - current.x) * ease;
      current.y += (target.y - current.y) * ease;
      current.strength += (target.strength - current.strength) * ease;
      const settled = Math.abs(current.x - target.x) < 0.1
        && Math.abs(current.y - target.y) < 0.1
        && Math.abs(current.strength - target.strength) < 0.001;
      if (settled) Object.assign(current, target);
      draw();
      if (!settled) frame = requestAnimationFrame(tick);
      else previous = 0;
    };
    const animate = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      target.x = event.clientX;
      target.y = event.clientY;
      if (current.strength === 0) {
        current.x = target.x;
        current.y = target.y;
      }
      target.strength = 1;
      animate();
    };
    const pointerLeave = () => {
      target.strength = 0;
      animate();
    };
    const washProgress = (event: Event) => {
      compose((event as CustomEvent<number>).detail);
      draw();
    };
    const visibilityChange = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      pointerLeave();
    };
    const observer = new ResizeObserver(pointerLeave);
    observer.observe(canvas);
    scene.addEventListener("pointermove", pointerMove);
    scene.addEventListener("pointerleave", pointerLeave);
    scene.addEventListener("migrene:wash-progress", washProgress);
    document.addEventListener("visibilitychange", visibilityChange);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.removeEventListener("pointermove", pointerMove);
      scene.removeEventListener("pointerleave", pointerLeave);
      scene.removeEventListener("migrene:wash-progress", washProgress);
      document.removeEventListener("visibilitychange", visibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.foregroundPaint} data-foreground-paint aria-hidden="true" />;
}
