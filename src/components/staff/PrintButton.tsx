"use client";

/**
 * Prints the page. The QR sheet is laid out for paper; this is the only
 * control it needs.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="button button--small" onClick={() => window.print()}>
      {label}
    </button>
  );
}
