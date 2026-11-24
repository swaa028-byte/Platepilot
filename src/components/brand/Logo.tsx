import { Link } from "@/i18n/navigation";

export function PlatePilotMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
    >
      <rect x="1.25" y="1.25" width="37.5" height="37.5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="9.5" stroke="currentColor" strokeWidth="2" />
      <path d="M20 4.5v5M20 30.5v5M4.5 20h5M30.5 20h5" stroke="currentColor" strokeWidth="2" />
      <rect x="17" y="17" width="6" height="6" fill="var(--color-accent-2)" />
    </svg>
  );
}

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={`brand ${inverse ? "brand--inverse" : ""}`} aria-label="PlatePilot home">
      <PlatePilotMark />
      <span>PlatePilot</span>
    </Link>
  );
}
