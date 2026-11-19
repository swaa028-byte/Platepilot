"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { createClient } from "@/server/auth/client";

export function LoginForm({ configured }: { configured: boolean }) {
  const t = useTranslations("Login");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setState("sending");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/${locale}/operations` },
      });
      setState(error ? "error" : "sent");
    } catch { setState("error"); }
  }

  if (!configured) {
    return <div className="notice notice--warning"><AlertCircle size={19} /><div><strong>{t("notConfiguredTitle")}</strong><br />{t("notConfiguredBody")}</div></div>;
  }
  if (state === "sent") {
    return <div className="notice notice--success"><CheckCircle2 size={20} /><div><strong>{t("sentTitle")}</strong><br />{t("sentBody")}</div></div>;
  }
  return (
    <form onSubmit={submit}>
      <label className="field"><span>{t("email")}</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailPlaceholder")} /></label>
      {state === "error" && <div className="notice notice--error"><AlertCircle size={18} />{t("notConfiguredBody")}</div>}
      <button className="button" disabled={state === "sending"}><Mail size={17} />{state === "sending" ? t("sending") : t("submit")}</button>
    </form>
  );
}
