"use client";

import { useEffect, useState } from "react";

/**
 * The hero media.
 *
 * Photographs do more for an appetite than any gradient, but the photos have to
 * be the restaurant's own. This component takes a list of candidate URLs, keeps
 * the ones that actually load, and crossfades between them with a slow push-in -
 * the "moving" part costs nothing and needs no video encoding.
 *
 * Sources, first match wins:
 *   1. NEXT_PUBLIC_WELCOME_IMAGES - comma-separated URLs (CMS, WordPress media)
 *   2. /media/gallery-1.jpg, /media/gallery-2.jpg, /media/gallery-3.jpg
 * If none load, the animated gradient underneath stays, so the hero is never a
 * broken box.
 */
const DEFAULT_SOURCES = ["/media/gallery-1.jpg", "/media/gallery-2.jpg", "/media/gallery-3.jpg"];

export function StartMedia({ caption }: { caption: string }) {
  const [sources, setSources] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const configured = (process.env.NEXT_PUBLIC_WELCOME_IMAGES ?? "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
    const candidates = configured.length > 0 ? configured : DEFAULT_SOURCES;

    let cancelled = false;
    const loaded: string[] = [];
    let settled = 0;

    candidates.forEach((url) => {
      const image = new Image();
      image.onload = () => {
        loaded.push(url);
        settled += 1;
        if (settled === candidates.length && !cancelled) setSources(loaded);
      };
      image.onerror = () => {
        settled += 1;
        if (settled === candidates.length && !cancelled) setSources(loaded);
      };
      image.src = url;
    });

    return () => { cancelled = true; };
  }, []);

  // Crossfade on a slow clock; nothing happens with a single photograph.
  useEffect(() => {
    if (sources.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % sources.length), 6000);
    return () => window.clearInterval(timer);
  }, [sources.length]);

  return (
    <div className="start-hero-media">
      <div className="start-media-fallback" aria-hidden="true" />
      {sources.map((url, position) => (
        // eslint-disable-next-line @next/next/no-img-element -- decorative, sized by CSS, never the LCP text
        <img
          key={url}
          src={url}
          alt=""
          aria-hidden={position !== index}
          className={`start-photo${position === index ? " is-current" : ""}`}
        />
      ))}
      {sources.length > 0 && <p className="start-caption">{caption}</p>}
    </div>
  );
}
