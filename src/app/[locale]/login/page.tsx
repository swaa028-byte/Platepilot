import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthFragmentHandler } from "@/components/ui/AuthFragmentHandler";
import { LoginForm } from "@/components/ui/LoginForm";
import { createClient } from "@/server/auth/server";
import { isSupabaseConfigured } from "@/server/auth/config";
import { isLocalModeEnabled } from "@/server/auth/local-session";

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const { error } = await searchParams;
  setRequestLocale(locale);
  // A merchant who is already signed in must never see the sign-in form —
  // clicking "Staff sign in" used to park them here with no way forward.
  // The check only makes sense when Supabase is configured; in local mode the
  // session lives in a cookie and the form below handles it.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect(`/${locale}/operations`);
  }
  const t = await getTranslations("Login");
  return (
    <section className="login-section">
      <AuthFragmentHandler locale={locale} />
      <div className="shell login-grid">
        <div className="login-copy"><p className="eyebrow"><span />{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p></div>
        <div className="form-card login-card"><LoginForm configured={isSupabaseConfigured()} localMode={isLocalModeEnabled()} expired={error === "link_expired"} /></div>
      </div>
    </section>
  );
}
