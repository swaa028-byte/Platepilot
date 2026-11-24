"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";

type TabId = "qr" | "online" | "kitchen";

const TABS: {
  id: TabId;
  label: "tabsQr" | "tabsOnline" | "tabsKitchen";
  title: "tabQrTitle" | "tabOnlineTitle" | "tabKitchenTitle";
  body: "tabQrBody" | "tabOnlineBody" | "tabKitchenBody";
  points: ["tabQrP1", "tabQrP2", "tabQrP3"] | ["tabOnlineP1", "tabOnlineP2", "tabOnlineP3"] | ["tabKitchenP1", "tabKitchenP2", "tabKitchenP3"];
}[] = [
  { id: "qr", label: "tabsQr", title: "tabQrTitle", body: "tabQrBody", points: ["tabQrP1", "tabQrP2", "tabQrP3"] },
  { id: "online", label: "tabsOnline", title: "tabOnlineTitle", body: "tabOnlineBody", points: ["tabOnlineP1", "tabOnlineP2", "tabOnlineP3"] },
  { id: "kitchen", label: "tabsKitchen", title: "tabKitchenTitle", body: "tabKitchenBody", points: ["tabKitchenP1", "tabKitchenP2", "tabKitchenP3"] },
];

/**
 * The "Where features meet functionality" band: three tabbed capabilities
 * with honest check-lists. Tabs follow the WAI-ARIA tabs pattern (roving
 * focus with the arrow keys), and every point describes behaviour the
 * product actually has.
 */
export default function FeatureTabs() {
  const t = useTranslations("Home");
  const baseId = useId();
  const [active, setActive] = useState<TabId>("qr");
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0];

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.id === active);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive(TABS[(index + 1) % TABS.length].id);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(TABS[(index - 1 + TABS.length) % TABS.length].id);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(TABS[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(TABS[TABS.length - 1].id);
    }
  }

  return (
    <section className="section cw-tabs" id="features">
      <div className="shell">
        <div className="cw-center-head">
          <h2>{t("tabsTitle")}</h2>
        </div>
        <div className="cw-tab-bar" role="tablist" aria-label={t("tabsTitle")} onKeyDown={onKeyDown}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={tab.id === active}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={tab.id === active ? 0 : -1}
              onClick={() => setActive(tab.id)}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${baseId}-panel-${current.id}`}
          aria-labelledby={`${baseId}-tab-${current.id}`}
          className="cw-tab-panel"
        >
          <div className="cw-tab-copy">
            <h3>{t(current.title)}</h3>
            <p>{t(current.body)}</p>
          </div>
          <ul className="cw-tab-points">
            {current.points.map((point) => (
              <li key={point}>
                <span className="cw-point-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                {t(point)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
