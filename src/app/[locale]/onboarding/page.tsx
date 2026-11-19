import { getTranslations, setRequestLocale } from "next-intl/server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { isGoogleConfigured } from "@/server/auth/config";
import { isLocalModeEnabled } from "@/server/auth/local-session";

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Onboarding");
  const localMode = isLocalModeEnabled();
  return (
    <>
      <section className="page-hero page-hero--compact"><div className="shell"><p className="eyebrow"><span />{t("eyebrow")}</p><h1>{t("title")}</h1><p className="page-lede">{t("description")}</p></div></section>
      <OnboardingWizard persistenceConfigured googleConfigured={isGoogleConfigured()} localMode={localMode} />
    </>
  );
}
