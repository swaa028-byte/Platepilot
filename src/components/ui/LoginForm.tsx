"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { createClient } from "@/server/auth/client";

export function LoginForm({ configured, localMode, expired = false }: { configured: boolean; localMode: boolean; expired?: boolean }) {
  const t = useTranslations("Login");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured && !localMode) return;
    setState("sending");
    try {
      if (localMode) {
        const response = await fetch("/api/auth/local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!response.ok) throw new Error("SIGN_IN_FAILED");
        router.push(`/${locale}/operations`);
        router.refresh();
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        // The callback redeems the code and only then sends the visitor on. The
        // destination rides in the path, not a query string, because Supabase
        // checks the redirect against its allow list and a query gave it room
        // to fall back to the Site URL root - which stranded the code on the
        // landing page.
        options: { emailRedirectTo: `${window.location.origin}/auth/callback/${locale}/operations` },
      });
      setState(error ? "error" : "sent");
    } catch { setState("error"); }
  }

  if (!configured && !localMode) {
    return <div className="notice notice--warning"><AlertCircle size={19} /><div><strong>{t("notConfiguredTitle")}</strong><br />{t("notConfiguredBody")}</div></div>;
  }
  if (state === "sent") {
    return <div className="notice notice--success"><CheckCircle2 size={20} /><div><strong>{t("sentTitle")}</strong><br />{t("sentBody")}</div></div>;
  }
  return (
    <form onSubmit={submit}>
      {expired && <div className="notice notice--warning"><AlertCircle size={19} /><div>{t("linkExpired")}</div></div>}
      <label className="field"><span>{t("email")}</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailPlaceholder")} /></label>
      {state === "error" && <div className="notice notice--error"><AlertCircle size={18} />{t("notConfiguredBody")}</div>}
      <button className="button" disabled={state === "sending"}><Mail size={17} />{state === "sending" ? t("sending") : localMode ? t("submitLocal") : t("submit")}</button>
    </form>
  );
}
