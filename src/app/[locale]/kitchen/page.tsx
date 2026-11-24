import { getTranslations, setRequestLocale } from "next-intl/server";
import { KitchenBoard } from "@/components/kitchen/KitchenBoard";

export default async function KitchenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Kitchen");
  return (
    <div className="kitchen-page">
      <section className="page-hero page-hero--compact">
        <div className="shell">
          <h1>{t("title")}</h1>
          <p className="page-lede">{t("description")}</p>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          <KitchenBoard />
        </div>
      </section>
    </div>
  );
}
