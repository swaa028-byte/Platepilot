"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Loader2, PackageCheck, Plus, Trash2, Truck, X } from "lucide-react";

/**
 * What the location buys in.
 *
 * A purchase order is written down first and received later, and the stock only
 * moves on receipt. That is the difference between "we asked for 20 kg of flour"
 * and "20 kg of flour is on the shelf".
 */
type Ingredient = { ingredientId: string; name: string; baseUnit: string; unitCostMinor: string };
type Order = {
  purchaseOrderId: string; supplier: string; reference: string | null; status: string;
  currency: string; createdAt: string; totalMinor: string;
  quantityMilliUnits: string; receivedMilliUnits: string;
};
type Line = { ingredientId: string; quantityMilliUnits: string; unitCostMinor: string };

function money(minor: string, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(minor) / 100);
  } catch {
    return `${currency} ${(Number(minor) / 100).toFixed(2)}`;
  }
}

export function Suppliers({ locationId }: { locationId: string }) {
  const t = useTranslations("Settings");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<"idle" | "writing">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [config, book] = await Promise.all([
        fetch(`/api/staff/inventory/config?locationId=${locationId}`),
        fetch(`/api/staff/purchase-orders?locationId=${locationId}`),
      ]);
      if (!book.ok) throw new Error((await book.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      setOrders((await book.json()) as Order[]);
      if (config.ok) {
        const data = (await config.json()) as { ingredients: Ingredient[] };
        setIngredients(data.ingredients);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
      setOrders([]);
    }
  }, [locationId]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  function addLine() {
    const first = ingredients[0];
    if (!first) return;
    setLines((current) => [...current, {
      ingredientId: first.ingredientId,
      quantityMilliUnits: "1000000",
      unitCostMinor: first.unitCostMinor,
    }]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  }

  async function write(request: () => Promise<Response>, message: string) {
    setBusy("writing");
    setError(null);
    try {
      const response = await request();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "REQUEST_REJECTED");
        return;
      }
      setNotice(message);
      await load();
    } catch {
      setError("REQUEST_REJECTED");
    } finally {
      setBusy("idle");
    }
  }

  async function place() {
    if (!supplier.trim() || lines.length === 0) return;
    await write(() => fetch("/api/staff/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, supplier: supplier.trim(), reference: reference.trim() || null, lines }),
    }), t("supply.placed", { supplier: supplier.trim() }));
    setSupplier("");
    setReference("");
    setLines([]);
  }

  return (
    <div className="op-card">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("supply.eyebrow")}</p>
          <h2>{t("supply.title")}</h2>
          <p className="op-note">{t("supply.description")}</p>
        </div>
      </header>

      {ingredients.length === 0 ? (
        <p className="op-empty"><AlertCircle size={16} aria-hidden="true" />{t("supply.noIngredients")}</p>
      ) : (
        <div className="op-inline-form">
          <label className="op-figure">
            <span className="op-label">{t("supply.supplier")}</span>
            <input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder={t("supply.supplierPlaceholder")} maxLength={120} />
          </label>
          <label className="op-figure op-figure--narrow">
            <span className="op-label">{t("supply.reference")}</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={t("supply.referencePlaceholder")} maxLength={60} />
          </label>
          <button type="button" className="op-add op-add--inline" onClick={addLine}>
            <Plus size={14} aria-hidden="true" />{t("supply.addLine")}
          </button>
        </div>
      )}

      {lines.length > 0 && (
        <div className="op-rows">
          {lines.map((line, index) => (
            <div className="op-line-row" key={index}>
              <label className="op-figure">
                <span className="op-label">{t("supply.ingredient")}</span>
                <select
                  value={line.ingredientId}
                  onChange={(event) => {
                    const picked = ingredients.find((item) => item.ingredientId === event.target.value);
                    updateLine(index, { ingredientId: event.target.value, unitCostMinor: picked?.unitCostMinor ?? "0" });
                  }}
                >
                  {ingredients.map((item) => (
                    <option key={item.ingredientId} value={item.ingredientId}>{item.name} ({item.baseUnit})</option>
                  ))}
                </select>
              </label>
              <label className="op-figure op-figure--narrow">
                <span className="op-label">{t("supply.quantity")}</span>
                <input inputMode="decimal" value={(Number(line.quantityMilliUnits) / 1000).toString()}
                  onChange={(event) => updateLine(index, {
                    quantityMilliUnits: String(Math.max(0, Math.round(Number(event.target.value.replace(",", ".") || "0") * 1000))),
                  })} />
              </label>
              <label className="op-figure op-figure--narrow">
                <span className="op-label">{t("supply.unitCost")}</span>
                <input inputMode="decimal" value={(Number(line.unitCostMinor) / 100).toFixed(2)}
                  onChange={(event) => updateLine(index, {
                    unitCostMinor: String(Math.max(0, Math.round(Number(event.target.value.replace(",", ".") || "0") * 100))),
                  })} />
              </label>
              <button type="button" className="op-icon" aria-label={t("supply.removeLine")} onClick={() => setLines((current) => current.filter((_, at) => at !== index))}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="op-line-row">
            <button type="button" className="op-save" onClick={place} disabled={busy === "writing" || !supplier.trim()}>
              {busy === "writing" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : <Truck size={16} aria-hidden="true" />}
              {t("supply.place")}
            </button>
          </div>
        </div>
      )}

      {orders === null ? (
        <p className="op-empty"><Loader2 size={16} className="op-spin" aria-hidden="true" />{t("loading")}</p>
      ) : orders.length === 0 ? (
        <p className="op-empty"><Truck size={16} aria-hidden="true" />{t("supply.none")}</p>
      ) : (
        <ul className="op-rows">
          {orders.map((order) => (
            <li key={order.purchaseOrderId} className="op-row op-row--order">
              <span className="op-row__name">{order.supplier}</span>
              <span className="op-row__meta">{money(order.totalMinor, order.currency)}</span>
              <span className={`op-pill op-pill--${order.status}`}>{t(`supply.state.${order.status}`)}</span>
              {order.status === "ordered" || order.status === "draft" ? (
                <button
                  type="button"
                  className="op-add"
                  disabled={busy === "writing"}
                  onClick={() => write(
                    () => fetch(`/api/staff/purchase-orders/${order.purchaseOrderId}`, { method: "POST" }),
                    t("supply.received", { supplier: order.supplier }),
                  )}
                >
                  <PackageCheck size={14} aria-hidden="true" />{t("supply.receive")}
                </button>
              ) : (
                <span className="op-row__meta"><Check size={14} aria-hidden="true" /></span>
              )}
              {order.status !== "received" && (
                <button
                  type="button"
                  className="op-icon"
                  aria-label={t("supply.cancel", { supplier: order.supplier })}
                  disabled={busy === "writing"}
                  onClick={() => write(
                    () => fetch(`/api/staff/purchase-orders/${order.purchaseOrderId}`, { method: "DELETE" }),
                    t("supply.cancelled", { supplier: order.supplier }),
                  )}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(error || notice) && (
        <p className={error ? "op-error" : "op-success"} role={error ? "alert" : "status"}>
          {error ? <AlertCircle size={15} aria-hidden="true" /> : null}
          {error ? t(`errors.${error}`, { fallback: t("errors.REQUEST_REJECTED") }) : notice}
        </p>
      )}
    </div>
  );
}