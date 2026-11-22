import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * True when the build is destined for Cloudflare Workers. Set automatically
 * by the `deploy`/`preview` scripts and by Cloudflare's Git integration.
 */
const onCloudflare = Boolean(process.env.CLOUDFLARE_WORKERS);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The local database is an embedded PostgreSQL that loads its own runtime
  // assets and writes to disk. It must be resolved by Node at runtime rather
  // than bundled, otherwise the server component bundle gets a second copy
  // that cannot find its assets.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Workers have no image server of their own: Cloudflare resizing is a paid
  // product, so the deployed build serves the original files and lets the
  // browser scale them. Everywhere else keeps Next's optimizer.
  images: onCloudflare ? { unoptimized: true } : undefined,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // The deployed Worker answers on *.workers.dev, which is an app
          // address rather than a site to be found. This header keeps its
          // pages (and the sitemap) out of search results. Set
          // NOINDEX_WORKER=false to index it, for when the app gets a domain
          // of its own that should be crawled.
          ...(process.env.CLOUDFLARE_WORKERS === "true" && process.env.NOINDEX_WORKER !== "false"
            ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
            : []),
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
