/**
 * Twitter/X cards fall back to the Open Graph image when twitter:image is
 * absent, but a summary_large_image card is more reliable when the card is
 * declared explicitly. This re-exports the shared brand card.
 */
export { default, alt, size, contentType } from "./opengraph-image";
