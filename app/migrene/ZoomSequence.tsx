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

// Overlapping translucent paint edges hide the source crops without editing them.
function paintMask(index: number) {
  const mask = document.createElement("canvas");
  mask.width = mask.height = 256;
  const brush = mask.getContext("2d")!;
  const pixels = brush.createImageData(256, 256);
  const portrait = index >= 3;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const nx = x / 255, ny = y / 255;
      const dx = (nx - (index === 1 || index === 2 ? .56 : .5)) / (portrait ? .66 : .51);
      const dy = (ny - .50) / (portrait ? .70 : .55);
      const angle = Math.atan2(dy, dx);
      const edge = Math.hypot(dx, dy)
        + Math.sin(angle * 5 + index) * .045
        + Math.sin(angle * 9 - index) * .025
        + Math.sin(nx * 83 + Math.sin(ny * 41) * 3) * .012
        + Math.sin(ny * 119 + nx * 53) * .008;
      const coverage = .35 * (1 - smooth(.60, .91, edge))
        + .40 * (1 - smooth(.76, 1.05, edge))
        + .25 * (1 - smooth(.91, 1.16, edge));
      const offset = (y * 256 + x) * 4;
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 255;
      pixels.data[offset + 3] = Math.round(coverage * 255);
    }
  }
  brush.putImageData(pixels, 0, 0);
  return mask;
}

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
      // A diluted paper wash passes over each blend, softening mismatched details.
      const veil = Math.sin(blend * Math.PI) * .16;
      if (veil > 0) {
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = `rgba(248, 245, 239, ${veil})`;
        context.fillRect(0, 0, width, height);
        context.globalCompositeOperation = "source-over";
      }
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
        const mask = paintMask(index);
        brush.drawImage(mask, 0, 0, sprite.width, sprite.height);
        mask.width = mask.height = 0;
        // Broad white margins swallow the straight crop underneath the paint.
        const feather = index < 3 ? .19 : .10;
        for (const vertical of [false, true]) {
          const gradient = brush.createLinearGradient(0, 0, vertical ? 0 : sprite.width, vertical ? sprite.height : 0);
          gradient.addColorStop(0, "transparent");
          gradient.addColorStop(feather, "black");
          gradient.addColorStop(1 - feather, "black");
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
      <div className={styles.intro} data-zoom-intro aria-hidden="true">
        <div className={styles.textBox}>
          <h2>Når verden kjennes annerledes</h2>
          <p>Et lite skifte i blikket kan forandre hele opplevelsen. I neste del utforsker vi fire visuelle uttrykk.</p>
        </div>
      </div>
    </section>
  );
}
