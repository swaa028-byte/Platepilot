import type { MetadataRoute } from "next";

/**
 * The PWA manifest.
 *
 * The kitchen display is the surface that benefits from being installable: a
 * dedicated screen, no browser chrome, and the display stays up through a
 * busy service. The icons are the brand mark; the theme matches the shell.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlatePilot",
    short_name: "PlatePilot",
    description: "Restaurant ordering and operations: storefront, POS, kitchen and reporting in one system.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBFAF5",
    theme_color: "#173F35",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
