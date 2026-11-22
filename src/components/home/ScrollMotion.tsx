"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Scroll-driven motion for the marketing pages: content blocks ease up and
 * in as they enter the viewport. GSAP + ScrollTrigger, registered once.
 * Visitors who ask for reduced motion get the pages exactly as styled,
 * with no animation at all — the attribute selectors mean the DOM is
 * unchanged either way.
 */
export function ScrollMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const targets = gsap.utils.toArray<HTMLElement>(
      ".cw-mode-card, .cw-step, .cw-center-head, .info-card, .step-row, .int-group, .flow-row",
    );
    const triggers = targets.map((element) =>
      gsap.from(element, {
        y: 26,
        opacity: 0,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: { trigger: element, start: "top 88%", once: true },
      }),
    );
    return () => {
      triggers.forEach((trigger) => {
        trigger.scrollTrigger?.kill();
        trigger.kill();
      });
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);
  return null;
}
