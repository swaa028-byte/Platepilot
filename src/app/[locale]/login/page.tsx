import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/ui/LoginForm";
import { isSupabaseConfigured } from "@/server/auth/config";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Login");
  return (
    <section className="login-section">
      <div className="shell login-grid">
        <div className="login-copy"><p className="eyebrow"><span />{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p></div>
        <div className="form-card login-card"><LoginForm configured={isSupabaseConfigured()} /></div>
      </div>
    </section>
  );
}
