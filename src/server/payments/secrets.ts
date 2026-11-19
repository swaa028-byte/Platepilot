import "server-only";

/** Resolves indirect environment references only; database rows never contain provider secrets. */
export function resolveProviderSecret(reference: string) {
  if (!/^env:[A-Z][A-Z0-9_]{2,80}$/.test(reference)) throw new Error("SECRET_REFERENCE_UNSUPPORTED");
  const value = process.env[reference.slice(4)];
  if (!value) throw new Error("PROVIDER_SECRET_NOT_CONFIGURED");
  return value;
}
