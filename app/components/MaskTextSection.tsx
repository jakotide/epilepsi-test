"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function MaskTextSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const text1Ref = useRef<HTMLParagraphElement>(null);
  const text2Ref = useRef<HTMLParagraphElement>(null);
  const currentSize = useRef(20);

  useEffect(() => {
    const section = sectionRef.current;
    const mask = maskRef.current;
    const text1 = text1Ref.current;
    const text2 = text2Ref.current;
    if (!section || !mask || !text1 || !text2) return;

    const maskSizeSmall = 20;
    const maskSizeLarge = 250;

    function onMouseMove(e: MouseEvent) {
      const rect = section!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      gsap.to(mask, {
        "--mask-x": `${x - currentSize.current / 2}px`,
        "--mask-y": `${y - currentSize.current / 2}px`,
        "--mask-size": `${currentSize.current}px`,
        duration: 0.6,
        ease: "back.out(1.7)",
      });
    }

    function onTextEnter() {
      currentSize.current = maskSizeLarge;
    }

    function onTextLeave() {
      currentSize.current = maskSizeSmall;
    }

    section.addEventListener("mousemove", onMouseMove);
    text1.addEventListener("mouseenter", onTextEnter);
    text1.addEventListener("mouseleave", onTextLeave);
    text2.addEventListener("mouseenter", onTextEnter);
    text2.addEventListener("mouseleave", onTextLeave);

    return () => {
      section.removeEventListener("mousemove", onMouseMove);
      text1.removeEventListener("mouseenter", onTextEnter);
      text1.removeEventListener("mouseleave", onTextLeave);
      text2.removeEventListener("mouseenter", onTextEnter);
      text2.removeEventListener("mouseleave", onTextLeave);
    };
  }, []);

  return (
    <section className="mask-text" ref={sectionRef}>
      <div className="mask-text__og">
        <div className="mask-text__content">
          <p ref={text1Ref}>
            Noen anfall kommer <span>uten forvarsel</span> — en plutselig
            endring i bevissthet, en ufrivillig bevegelse, et øyeblikk som
            forsvinner fra hukommelsen. For mange er det usynlig for alle andre,
            men dypt merkbart for den som opplever det.
          </p>
          <p ref={text2Ref} className="mask-text__sensory">
            Plutselig blir{" "}
            <span className="blur-heavy">verden rundt deg</span> fjern.{" "}
            <span className="blur-light">Lydene forsvinner</span> inn i en
            tåke, ansikter blir{" "}
            <span className="blur-heavy">ugjenkjennelige</span>, og ordene{" "}
            <span className="blur-medium">mister sin mening</span>. Du er der,
            men <span className="blur-heavy">samtidig ikke</span>. Kroppen{" "}
            <span className="blur-light">reagerer</span> på signaler{" "}
            <span className="blur-medium">du ikke kontrollerer</span> — et
            øyeblikk der{" "}
            <span className="blur-heavy">sansene svikter deg</span>.
          </p>
        </div>
      </div>
      <div className="mask-text__mask" ref={maskRef}>
        <div className="mask-text__content">
          <p>
            Epilepsi handler ikke bare om <span>store anfall</span> — det er et
            spekter av opplevelser som påvirker hverdagen. Fra korte fravær til
            intense sensoriske forstyrrelser. Forståelse begynner med å lytte
            til de som lever med det.
          </p>
          <p>
            Plutselig blir verden rundt deg fjern. Lydene forsvinner inn i en
            tåke, ansikter blir ugjenkjennelige, og ordene mister sin mening. Du
            er der, men samtidig ikke. Kroppen reagerer på signaler du ikke
            kontrollerer — et øyeblikk der sansene svikter deg.
          </p>
        </div>
      </div>
    </section>
  );
}
