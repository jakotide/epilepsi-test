"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Symm from "../svg/symm";

gsap.registerPlugin(ScrollTrigger);

interface MaskConfig {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MASKS: MaskConfig[] = [
  { x: 0.08, y: 0.15, w: 220, h: 160 },
  { x: 0.55, y: 0.08, w: 180, h: 240 },
  { x: 0.3, y: 0.55, w: 260, h: 180 },
  { x: 0.75, y: 0.45, w: 200, h: 200 },
  { x: 0.15, y: 0.7, w: 170, h: 220 },
  { x: 0.6, y: 0.72, w: 240, h: 150 },
];

// maskRect x/y are LOCAL to the section (not absolute viewport coords)
function drawClipped(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  maskRect: { x: number; y: number; w: number; h: number },
  containerWidth: number,
  containerHeight: number
) {
  const videoAspect = video.videoWidth / video.videoHeight;
  const containerAspect = containerWidth / containerHeight;

  let dw: number, dh: number, dx: number, dy: number;

  if (videoAspect > containerAspect) {
    dh = containerHeight;
    dw = dh * videoAspect;
    dx = (containerWidth - dw) / 2;
    dy = 0;
  } else {
    dw = containerWidth;
    dh = dw / videoAspect;
    dx = 0;
    dy = (containerHeight - dh) / 2;
  }

  const scaleX = video.videoWidth / dw;
  const scaleY = video.videoHeight / dh;

  const sx = (maskRect.x - dx) * scaleX;
  const sy = (maskRect.y - dy) * scaleY;
  const sw = maskRect.w * scaleX;
  const sh = maskRect.h * scaleY;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, maskRect.w, maskRect.h);
}

export default function DraggableMaskSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<SVGSVGElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const masksRef = useRef<HTMLDivElement[]>([]);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const stateRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const draggingRef = useRef<{
    index: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    // Position masks based on percentages (stored as local coords)
    const sectionW = section.offsetWidth;
    const sectionH = section.offsetHeight;
    MASKS.forEach((mask, i) => {
      const localX = sectionW * mask.x;
      const localY = sectionH * mask.y;
      stateRef.current.set(i, { x: localX, y: localY });

      const el = masksRef.current[i];
      if (el) {
        el.style.left = `${localX}px`;
        el.style.top = `${localY}px`;
        el.style.width = `${mask.w}px`;
        el.style.height = `${mask.h}px`;
      }

      const canvas = canvasesRef.current[i];
      if (canvas) {
        canvas.width = mask.w;
        canvas.height = mask.h;
      }
    });

    // Draw loop
    function draw() {
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const cw = section!.offsetWidth;
      const ch = section!.offsetHeight;

      MASKS.forEach((mask, i) => {
        const canvas = canvasesRef.current[i];
        const pos = stateRef.current.get(i);
        if (!canvas || !pos) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawClipped(ctx, video, { x: pos.x, y: pos.y, w: mask.w, h: mask.h }, cw, ch);
      });

      rafRef.current = requestAnimationFrame(draw);
    }

    // Wait for video to be ready
    function startDraw() {
      rafRef.current = requestAnimationFrame(draw);
    }

    if (video.readyState >= 2) {
      startDraw();
    } else {
      video.addEventListener("loadeddata", startDraw, { once: true });
    }

    // --- Drag handling ---
    function onPointerDown(e: PointerEvent) {
      const target = (e.target as HTMLElement).closest(
        ".draggable-mask__box"
      ) as HTMLElement | null;
      if (!target) return;

      const index = Number(target.dataset.index);
      if (isNaN(index)) return;

      const pos = stateRef.current.get(index);
      if (!pos) return;

      const rect = section!.getBoundingClientRect();
      draggingRef.current = {
        index,
        offsetX: (e.clientX - rect.left) - pos.x,
        offsetY: (e.clientY - rect.top) - pos.y,
      };

      target.setPointerCapture(e.pointerId);
      target.style.cursor = "grabbing";
      target.style.zIndex = "10";
    }

    function onPointerMove(e: PointerEvent) {
      const drag = draggingRef.current;
      if (!drag) return;

      const rect = section!.getBoundingClientRect();
      const localX = (e.clientX - rect.left) - drag.offsetX;
      const localY = (e.clientY - rect.top) - drag.offsetY;

      stateRef.current.set(drag.index, { x: localX, y: localY });

      const el = masksRef.current[drag.index];
      if (el) {
        el.style.left = `${localX}px`;
        el.style.top = `${localY}px`;
      }
    }

    function onPointerUp(e: PointerEvent) {
      const drag = draggingRef.current;
      if (!drag) return;

      const el = masksRef.current[drag.index];
      if (el) {
        el.style.cursor = "grab";
        el.style.zIndex = "";
        el.releasePointerCapture(e.pointerId);
      }

      draggingRef.current = null;
    }

    section.addEventListener("pointerdown", onPointerDown);
    section.addEventListener("pointermove", onPointerMove);
    section.addEventListener("pointerup", onPointerUp);
    section.addEventListener("pointercancel", onPointerUp);

    // --- Scroll-triggered fade in ---
    const boxes = masksRef.current.filter(Boolean);
    gsap.set(boxes, { opacity: 0, scale: 0.85 });

    const fadeInTl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 80%",
        end: "top 20%",
        scrub: 0.6,
      },
    });

    fadeInTl.to(boxes, {
      opacity: 1,
      scale: 1,
      duration: 1,
      stagger: 0.12,
      ease: "power2.out",
    });

    // --- SVG slow rotation on scroll ---
    const rotateTween = gsap.to(bgRef.current, {
      rotation: 45,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top bottom",
        end: "bottom top",
        scrub: 1,
      },
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      fadeInTl.scrollTrigger?.kill();
      fadeInTl.kill();
      rotateTween.scrollTrigger?.kill();
      rotateTween.kill();
      section.removeEventListener("pointerdown", onPointerDown);
      section.removeEventListener("pointermove", onPointerMove);
      section.removeEventListener("pointerup", onPointerUp);
      section.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return (
    <section className="draggable-mask" ref={sectionRef}>
      <video
        ref={videoRef}
        className="draggable-mask__video"
        src="/videos/women.mp4"
        autoPlay
        loop
        muted
        playsInline
      />

      <Symm ref={bgRef} className="draggable-mask__bg" />
      <p className="draggable-mask__label">Drag boxes</p>

      {MASKS.map((mask, i) => (
        <div
          key={i}
          className="draggable-mask__box"
          data-index={i}
          ref={(el) => {
            if (el) masksRef.current[i] = el;
          }}
        >
          <canvas
            ref={(el) => {
              if (el) canvasesRef.current[i] = el;
            }}
          />
        </div>
      ))}
    </section>
  );
}
