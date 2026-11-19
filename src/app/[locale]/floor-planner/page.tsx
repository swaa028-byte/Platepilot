import { getTranslations, setRequestLocale } from "next-intl/server";
import { FloorPlanner } from "@/components/floor/FloorPlanner";

export default async function FloorPlannerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Floor");
  return (
    <div className="planner-page">
      <section className="page-hero"><div className="shell"><p className="eyebrow"><span />{t("eyebrow")}</p><h1>{t("title")}</h1><p className="page-lede">{t("description")}</p></div></section>
      <FloorPlanner />
    </div>
  );
}
