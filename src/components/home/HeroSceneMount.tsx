"use client";

import { useEffect, useRef } from "react";
import { Scene } from "./HeroSceneInner";

/** Client mount point for the hero's three.js scene (see HeroScene). */
export default function HeroSceneMount() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !mount.current) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;

    Scene(mount.current).then((teardown) => {
      if (disposed) teardown?.();
      else cleanup = teardown;
    }).catch(() => { /* No WebGL: the gradient hero stays. */ });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div ref={mount} className="hero-room-canvas-holder" />;
}
