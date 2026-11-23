import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { createClient } from "@/server/auth/server";
import { isGoogleConfigured, isSupabaseConfigured } from "@/server/auth/config";
import { isLocalModeEnabled } from "@/server/auth/local-session";

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Onboarding");
  const localMode = isLocalModeEnabled();

  // Onboarding is for a restaurant that has no organisation yet. A vendor who
  // already runs one goes to the dashboard instead of being offered the wizard
  // again - pressing it twice used to create a second restaurant.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: session } = await supabase.auth.getUser();
    if (session.user) {
      const { data: memberships } = await supabase
        .from("memberships")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .limit(1);
      if (memberships && memberships.length > 0) redirect(`/${locale}/operations`);
    }
  }
  return (
    <>
      <section className="page-hero page-hero--compact"><div className="shell"><p className="eyebrow"><span />{t("eyebrow")}</p><h1>{t("title")}</h1><p className="page-lede">{t("description")}</p></div></section>
      <OnboardingWizard persistenceConfigured googleConfigured={isGoogleConfigured()} localMode={localMode} />
    </>
  );
}
