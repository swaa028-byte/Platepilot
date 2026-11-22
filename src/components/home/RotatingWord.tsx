"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const WORD_KEYS = ["heroRotate1", "heroRotate2", "heroRotate3"] as const;

/**
 * The typed rotating word under the hero headline — the same effect the
 * reference site gets from Typed.js, built natively: one word at a time,
 * typed and erased, then the next. Screen readers get one static sentence
 * (the animated span is aria-hidden so it never chatters), and users who
 * ask for reduced motion get a quiet cycling with no animation.
 */
export function RotatingWord() {
  const t = useTranslations("Home");
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "pausing" | "erasing">("typing");

  const word = t(WORD_KEYS[index]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const timer = setInterval(() => {
        setIndex((value) => (value + 1) % WORD_KEYS.length);
      }, 3200);
      return () => clearInterval(timer);
    }
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed.length < word.length) {
        timer = setTimeout(() => setTyped(word.slice(0, typed.length + 1)), 75);
      } else {
        timer = setTimeout(() => setPhase("pausing"), 1900);
      }
    } else if (phase === "pausing") {
      timer = setTimeout(() => setPhase("erasing"), 400);
    } else {
      if (typed.length > 0) {
        timer = setTimeout(() => setTyped(word.slice(0, typed.length - 1)), 38);
      } else {
        timer = setTimeout(() => {
          setIndex((value) => (value + 1) % WORD_KEYS.length);
          setPhase("typing");
        }, 30);
      }
    }
    return () => clearTimeout(timer);
  }, [phase, typed, word]);

  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shown = reduced ? word : typed;

  return (
    <span className="cw-rotate" aria-hidden="true">
      {shown}
      <span className={`cw-rotate-caret ${phase === "pausing" ? "is-idle" : ""}`} />
    </span>
  );
}

/** Static sentence for assistive technology, placed beside the animation. */
export function RotatingWordLabel() {
  const t = useTranslations("Home");
  return <span className="sr-only">{t("heroRotateLabel")}</span>;
}
