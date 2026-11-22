"use client";

import dynamic from "next/dynamic";

/**
 * The hero's depth layer: a quiet three.js room — low-poly tables in the
 * product's state colors, drifting and slowly orbiting behind the
 * statement. Loaded lazily in the browser only (the dynamic import lives
 * in this client module because Server Components cannot opt out of SSR),
 * hidden from assistive technology, paused while the tab is hidden, and
 * skipped entirely for visitors who ask for reduced motion or lack WebGL.
 * The scene reuses the three.js dependency the floor planner already ships.
 */
const HeroSceneMount = dynamic(() => import("./HeroSceneMount"), { ssr: false });

export default function HeroScene() {
  return (
    <div className="hero-room-mount" aria-hidden="true">
      <HeroSceneMount />
    </div>
  );
}
