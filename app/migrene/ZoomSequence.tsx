"use client";

import { useEffect, useRef, type RefObject } from "react";
import styles from "./ZoomSequence.module.css";

// Register the painted pupil between views. 2.png and 3.png are identical.
const views = [
  { file: 1, eye: [635, 535], radius: 550 },
  { file: 2, eye: [775, 572], radius: 210 },
  { file: 4, eye: [835, 597], radius: 102 },
  { file: 5, eye: [418, 453], radius: 25 },
  { file: 6, eye: [450, 432], radius: 22 },
];
const cuts = [.18, .40, .66, .86];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default function ZoomSequence({ stageRef }: { stageRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !stage) return;
    let alive = true;
    let frame = 0;
    let width = 1, height = 1;
    let progress = Number(stage.dataset.zoomProgress ?? 0);
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const images: (HTMLCanvasElement | undefined)[] = [];
    const pending = new Set<HTMLImageElement>();

    const draw = () => {
      frame = 0;
      context.clearRect(0, 0, width, height);
      const endScale = Math.min(width * .90 / 1186, height * .88 / 1326);
      const endRadius = 22 * endScale;
      const radius = Math.exp(Math.log(Math.min(width, height) * .46) * (1 - progress) + Math.log(endRadius) * progress);
      const recenter = smooth(.45, 1, progress);
      const eyeX = width / 2 + (450 - 1186 / 2) * endScale * recenter;
      const eyeY = height / 2 + (432 - 1326 / 2) * endScale * recenter;
      let index = 0;
      while (index < cuts.length && progress > cuts[index] + .045) index++;
      const blend = index < cuts.length ? smooth(cuts[index] - .045, cuts[index] + .045, progress) : 0;
      const paint = (i: number, alpha: number) => {
        const image = images[i];
        if (!image || alpha <= 0) return;
        const view = views[i];
        // Reduced motion uses a steady composition with only crossfades.
        const scale = preference.matches
          ? Math.min(width * .90 / image.width, height * .88 / image.height)
          : radius / view.radius;
        const x = preference.matches ? (width - image.width * scale) / 2 : eyeX - view.eye[0] * scale;
        const y = preference.matches ? (height - image.height * scale) / 2 : eyeY - view.eye[1] * scale;
        context.globalAlpha = alpha;
        context.drawImage(image, x, y, image.width * scale, image.height * scale);
      };
      // Hold the nearest decoded view on a slow connection, never an empty frame.
      let current = index;
      if (!images[current]) current = images.findIndex(Boolean);
      if (current >= 0) {
        const nextReady = index + 1 < views.length && images[index + 1];
        paint(current, nextReady ? 1 - blend : 1);
        if (nextReady) {
          context.globalCompositeOperation = "lighter";
          paint(index + 1, blend);
          context.globalCompositeOperation = "source-over";
        }
      }
      context.globalAlpha = 1;
      canvas.dataset.view = String(views[index].file);
      canvas.dataset.progress = progress.toFixed(4);
    };
    const schedule = () => { if (!frame && alive) frame = requestAnimationFrame(draw); };
    const resize = () => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      const dpr = Math.min(devicePixelRatio, 1.75);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      schedule();
    };
    const load = async (index: number) => {
      const image = new Image();
      image.decoding = "async";
      pending.add(image);
      const file = views[index].file;
      try {
        image.src = `/images/migrene-zoom/webp/${file}.webp`;
        try { await image.decode(); }
        catch { image.src = `/images/migrene-zoom/${file}.png`; await image.decode(); }
        if (!alive) return;
        const sprite = document.createElement("canvas");
        sprite.width = image.naturalWidth;
        sprite.height = image.naturalHeight;
        const brush = sprite.getContext("2d");
        if (!brush) return;
        brush.drawImage(image, 0, 0);
        brush.globalCompositeOperation = "destination-in";
        // Feather the edges into the surrounding paper at every zoom level.
        for (const vertical of [false, true]) {
          const gradient = brush.createLinearGradient(0, 0, vertical ? 0 : sprite.width, vertical ? sprite.height : 0);
          gradient.addColorStop(0, "transparent");
          gradient.addColorStop(.07, "black");
          gradient.addColorStop(.93, "black");
          gradient.addColorStop(1, "transparent");
          brush.fillStyle = gradient;
          brush.fillRect(0, 0, sprite.width, sprite.height);
        }
        images[index] = sprite;
        canvas.dataset.loaded = String(images.filter(Boolean).length);
        schedule();
      } catch { /* A neighboring decoded painting remains visible. */ }
      finally { pending.delete(image); }
    };
    let loading = false;
    const preload = () => {
      if (loading) return;
      loading = true;
      void (async () => {
        await load(0);
        if (!alive) return;
        await load(4);
        for (const i of [1, 2, 3]) { if (!alive) return; await load(i); }
      })();
    };
    const update = (event: Event) => {
      progress = Math.max(0, Math.min(1, (event as CustomEvent<number>).detail));
      preload();
      schedule();
    };
    // Begin loading during the brain story, well before the iris appears.
    const observeStory = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) preload();
    }, { rootMargin: "100%" });
    observeStory.observe(canvas);
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    stage.addEventListener("migrene:zoom-progress", update);
    preference.addEventListener("change", schedule);
    resize();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      observeStory.disconnect();
      stage.removeEventListener("migrene:zoom-progress", update);
      preference.removeEventListener("change", schedule);
      pending.forEach((image) => { image.src = ""; });
      images.forEach((image) => { if (image) { image.width = 0; image.height = 0; } });
    };
  }, [stageRef]);

  return (
    <section className={styles.sequence} aria-label="Fra iris til portrett">
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label="Et malt øye som gradvis zoomer ut til et portrett av en kvinne." data-zoom-canvas />
      <p className={styles.description}>Fra det innerste blikket til hele mennesket.</p>
    </section>
  );
}
