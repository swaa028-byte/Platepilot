import { Link } from "@/i18n/navigation";

export function PlatePilotMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
    >
      <rect width="40" height="40" rx="13" fill="currentColor" />
      <circle cx="20" cy="20" r="10.25" stroke="white" strokeWidth="1.7" />
      <circle cx="20" cy="20" r="5.75" stroke="white" strokeOpacity=".48" />
      <path d="M23.7 11.1 30.5 8l-3.1 6.8-7.2 7.2-2.1-2.1 5.6-8.8Z" fill="#F3B562" />
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
