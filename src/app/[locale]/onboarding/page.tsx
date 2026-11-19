import { getTranslations, setRequestLocale } from "next-intl/server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { isGoogleConfigured, isSupabaseConfigured } from "@/server/auth/config";

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Onboarding");
  return (
    <>
      <section className="page-hero page-hero--compact"><div className="shell"><p className="eyebrow"><span />{t("eyebrow")}</p><h1>{t("title")}</h1><p className="page-lede">{t("description")}</p></div></section>
      <OnboardingWizard supabaseConfigured={isSupabaseConfigured()} googleConfigured={isGoogleConfigured()} />
    </>
  );
}
