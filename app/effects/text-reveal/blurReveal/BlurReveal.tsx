"use client";

import { useRef, useEffect, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type TextElement = "div" | "span" | "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "blockquote";

interface BlurRevealProps {
  children: ReactNode;
  as?: TextElement;
  trigger?: "scroll" | "mount";
  start?: string;
  className?: string;
}

export default function BlurReveal({
  children,
  as: Tag = "div",
  trigger = "scroll",
  start = "top 90%",
  className,
}: BlurRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    gsap.set(el, { opacity: 0, filter: "blur(20px)" });

    const tweenConfig: gsap.TweenVars = {
      opacity: 1,
      filter: "blur(0px)",
      duration: 0.4,
      ease: "cubic-bezier(0.76, 0, 0.24, 1)",
    };

    if (trigger === "scroll") {
      tweenConfig.scrollTrigger = {
        trigger: el,
        start,
        toggleActions: "play none none none",
      };
    }

    const tween = gsap.to(el, tweenConfig);

    return () => {
      tween.kill();
    };
  }, [trigger, start]);

  return (
    <Tag ref={ref as any} className={className}>
      {children}
    </Tag>
  );
}
