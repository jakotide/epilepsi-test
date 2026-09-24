"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import gsap from "gsap";
import dynamic from "next/dynamic";
import styles from "./migrene.module.css";
import ZoomSequence from "./ZoomSequence";

gsap.registerPlugin(ScrollTrigger);
const BrainWorld = dynamic(() => import("./BrainWorld"), { ssr: false });
const ExperienceCanvas = dynamic(() => import("./ExperienceCanvas"), { ssr: false });

function smooth(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function portalPath(x: number, y: number, radius: number, progress: number) {
  // Three restrained silhouettes, blended before the opening fills the screen:
  // a small tilted shape, an elongated inlet, then a broader rounded opening.
  const firstMorph = smooth(0.05, 0.28, progress);
  const secondMorph = smooth(0.28, 0.56, progress);
  const blend = (a: number, b: number, c: number) => {
    const first = a + (b - a) * firstMorph;
    return first + (c - first) * secondMorph;
  };
  const points = Array.from({ length: 120 }, (_, index) => {
    const angle = index / 120 * Math.PI * 2;
    const first = 1 + 0.14 * Math.sin(angle * 3 + 0.6)
      + 0.07 * Math.cos(angle * 5 - 0.5) + 0.08 * Math.sin(angle * 2);
    const second = 1 + 0.12 * Math.cos(angle * 3 + 0.5)
      + 0.105 * Math.sin(angle * 2 - 0.9) + 0.045 * Math.sin(angle * 5);
    const third = 1 + 0.105 * Math.sin(angle * 3 - 0.8)
      + 0.08 * Math.cos(angle * 2 + 0.4) + 0.045 * Math.cos(angle * 4 + 1.1);
    const silhouette = blend(first, second, third);
    const grain = (Math.sin(angle * 31 + 0.7) * 1.8 + Math.cos(angle * 53) * 0.8) * Math.min(1, radius / 45);
    const r = radius * silhouette + grain;
    return {
      x: x + Math.cos(angle) * r * blend(1.2, 1.14, 1.04),
      y: y + Math.sin(angle) * r * blend(0.78, 0.87, 1.03),
    };
  });
  const first = points[0];
  const last = points[points.length - 1];
  let path = `M ${(first.x + last.x) / 2} ${(first.y + last.y) / 2}`;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    path += ` Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${((point.x + next.x) / 2).toFixed(2)} ${((point.y + next.y) / 2).toFixed(2)}`;
  }
  return `${path} Z`;
}

export default function PortalTransition({ children }: { children: ReactNode }) {
  const chapterRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const maskSvgRef = useRef<SVGSVGElement>(null);
  const contourRef = useRef<SVGGElement>(null);
  const id = useId().replace(/:/g, "");
  const maskId = `portal-mask-${id}`;
  const textureId = `portal-texture-${id}`;

  useEffect(() => {
    const chapter = chapterRef.current;
    const stage = stageRef.current;
    const portal = portalRef.current;
    const contour = contourRef.current;
    const maskSvg = maskSvgRef.current;
    if (!chapter || !stage || !portal || !contour || !maskSvg) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = preference.matches;
    let width = stage.clientWidth;
    let height = stage.clientHeight;
    let origin = { x: width * 0.49, y: height * 0.34 };
    let lastProgress = 0;
    let resizeFrame = 0;
    const paths = Array.from(contour.querySelectorAll("path"));
    const filter = maskSvg.querySelector("filter");
    const hero = stage.querySelector<HTMLElement>("[data-migrene-hero]");

    const render = (progress: number) => {
      const wash = smooth(0, 0.3, progress);
      const interaction = 1 - smooth(0, 0.16, progress);
      stage.style.setProperty("--portrait-opacity", String(1 - smooth(0.04, 0.36, progress)));
      stage.style.setProperty("--paint-opacity", String(1 - smooth(0.12, 0.48, progress)));
      stage.style.setProperty("--dust-opacity", String(1 - smooth(0.02, 0.25, progress)));
      stage.style.setProperty("--interaction", String(interaction));
      stage.style.setProperty("--wash-opacity", String((0.95 + wash * 0.05) * (1 - smooth(0.42, 0.75, progress))));
      stage.dataset.transitionProgress = progress.toFixed(4);
      if (hero) {
        const washProgress = wash.toFixed(4);
        if (hero.dataset.washProgress !== washProgress) {
          hero.dataset.washProgress = washProgress;
          hero.dispatchEvent(new CustomEvent("migrene:wash-progress", { detail: wash }));
        }
        hero.style.pointerEvents = progress > 0.12 ? "none" : "";
        if (lastProgress <= 0.005 && progress > 0.005) {
          hero.dispatchEvent(new PointerEvent("pointerleave"));
        }
      }
      lastProgress = progress;

      // Let the portrait dissolve before the painted opening takes over.
      const opening = Math.max(0, Math.min(1, (progress - 0.30) / 0.70));
      stage.dataset.portalOpening = opening.toFixed(4);
      portal.style.visibility = opening > 0 ? "visible" : "hidden";
      portal.style.pointerEvents = progress > .75 ? "auto" : "none";
      portal.inert = progress < .75;
      if (opening === 0) return;

      const fullViewport = `M -20 -20 H ${width + 20} V ${height + 20} H -20 Z`;
      if (reducedMotion || progress >= 0.995) {
        contour.removeAttribute("filter");
        paths.forEach((path) => path.setAttribute("d", fullViewport));
        portal.style.opacity = String(reducedMotion ? smooth(0.30, 0.80, progress) : 1);
        return;
      }

      portal.style.opacity = String(smooth(0.30, 0.35, progress));
      contour.setAttribute("filter", `url(#${textureId})`);
      const travel = smooth(0.05, 0.75, opening);
      const centerX = origin.x + (width / 2 - origin.x) * travel;
      const centerY = origin.y + (height / 2 - origin.y) * travel;
      const radius = Math.hypot(width, height) * 1.18 * Math.pow(opening, 1.6);
      const shape = portalPath(centerX, centerY, radius, opening);
      paths.forEach((path) => path.setAttribute("d", shape));
    };

    const measure = () => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      maskSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      filter?.setAttribute("width", String(width + 48));
      filter?.setAttribute("height", String(height + 48));
      const portrait = stage.querySelector("img")?.getBoundingClientRect();
      const bounds = stage.getBoundingClientRect();
      origin = portrait
        ? { x: portrait.left - bounds.left + portrait.width * 0.48, y: portrait.top - bounds.top + portrait.height * 0.3 }
        : { x: width * 0.49, y: height * 0.34 };
    };

    measure();
    const trigger = ScrollTrigger.create({
      trigger: chapter,
      start: "top top",
      end: () => `+=${stage.clientHeight * 1.5}`,
      onUpdate: (self) => render(self.progress),
      onRefresh: (self) => { measure(); render(self.progress); },
    });
    render(trigger.progress);
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => trigger.refresh());
    };
    const syncPreference = () => {
      reducedMotion = preference.matches;
      render(trigger.progress);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    preference.addEventListener("change", syncPreference);

    return () => {
      cancelAnimationFrame(resizeFrame);
      trigger.kill();
      observer.disconnect();
      preference.removeEventListener("change", syncPreference);
    };
  }, [textureId]);

  return (
    <main className={styles.journey} lang="nb" aria-label="Migrene">
      <section ref={chapterRef} className={styles.scrollChapter} aria-label="Fra portrettet til en indre verden">
        <div ref={stageRef} className={styles.transitionStage} data-transition-stage>
          {children}
          <svg ref={maskSvgRef} className={styles.portalMask} aria-hidden="true" preserveAspectRatio="none">
            <defs>
              <filter id={textureId} x="-24" y="-24" width="1488" height="948" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="17" result="paper" />
                <feDisplacementMap in="SourceGraphic" in2="paper" scale="9" xChannelSelector="R" yChannelSelector="G" />
                <feGaussianBlur stdDeviation="0.7" />
              </filter>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" style={{ maskType: "alpha" }}>
                <g ref={contourRef} fill="white" stroke="white" strokeLinejoin="round">
                  <path opacity="0.1" strokeWidth="20" style={{ filter: "blur(3px)" }} />
                  <path opacity="0.2" strokeWidth="10" style={{ filter: "blur(1.8px)" }} />
                  <path strokeWidth="0" />
                </g>
              </mask>
            </defs>
          </svg>
          <div ref={portalRef} className={styles.portal} style={{ maskImage: `url(#${maskId})`, WebkitMaskImage: `url(#${maskId})` }}>
            <BrainWorld journeyRef={chapterRef} />
          </div>
          <ZoomSequence stageRef={stageRef} />
        </div>
      </section>
      <ExperienceCanvas />
    </main>
  );
}
