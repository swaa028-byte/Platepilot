"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CalendarClock, Loader2, Plus, RefreshCw, Trash2, Users } from "lucide-react";

/**
 * The venue as a bookable room, and the people it serves.
 *
 * Tables are what a reservation is accepted against; the customer list is read
 * from the orders the location actually took, so it cannot drift from the till.
 */
type Table = { tableId: string; name: string; capacity: number; state: string; operationalUse: boolean };
type Customer = { name: string; orders: number; spendMinor: string; lastOrderAt: string };

function money(minor: string, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(minor) / 100);
  } catch {
    return `${currency} ${(Number(minor) / 100).toFixed(2)}`;
  }
}

export function VenueBook({ locationId, currency }: { locationId: string; currency: string }) {
  const t = useTranslations("Settings");
  const [tables, setTables] = useState<Table[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [busy, setBusy] = useState<"idle" | "tables" | "customers" | "writing">("tables");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tableResponse, customerResponse] = await Promise.all([
        fetch(`/api/staff/tables?locationId=${locationId}`),
        fetch(`/api/staff/customers?locationId=${locationId}`),
      ]);
      if (!tableResponse.ok) throw new Error((await tableResponse.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      setTables((await tableResponse.json()) as Table[]);
      setCustomers(customerResponse.ok ? ((await customerResponse.json()) as Customer[]) : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally {
      setBusy("idle");
    }
  }, [locationId]);
  useEffect(() => {
    // The first paint is the loading state; the read resolves into it.
    void (async () => { await load(); })();
  }, [load]);

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

  async function addTable() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await write(() => fetch("/api/staff/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, name: trimmed, capacity: Math.max(1, Number(capacity) || 1) }),
    }), t("venue.tableAdded", { name: trimmed }));
    setName("");
  }

  return (
    <section className="op-grid">
      <div className="op-card">
        <header className="op-card__head">
          <div>
            <p className="op-label">{t("venue.tables")}</p>
            <h2>{t("venue.tablesTitle")}</h2>
            <p className="op-note">{t("venue.tablesDescription")}</p>
          </div>
          <button
            type="button"
            className="op-add op-add--inline"
            onClick={() => write(() => fetch("/api/staff/tables/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locationId }),
            }), t("venue.synced"))}
            disabled={busy === "writing"}
          >
            <RefreshCw size={14} aria-hidden="true" />{t("venue.syncFromFloor")}
          </button>
        </header>

        <form
          className="op-inline-form"
          onSubmit={(event) => { event.preventDefault(); void addTable(); }}
        >
          <label className="op-figure">
            <span className="op-label">{t("venue.name")}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("venue.namePlaceholder")} maxLength={60} />
          </label>
          <label className="op-figure op-figure--narrow">
            <span className="op-label">{t("venue.seats")}</span>
            <input inputMode="numeric" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
          </label>
          <button type="submit" className="op-save" disabled={busy === "writing" || !name.trim()}>
            <Plus size={16} aria-hidden="true" />{t("venue.addTable")}
          </button>
        </form>

        {tables === null ? (
          <p className="op-empty"><Loader2 size={16} className="op-spin" aria-hidden="true" />{t("loading")}</p>
        ) : tables.length === 0 ? (
          <p className="op-empty"><CalendarClock size={16} aria-hidden="true" />{t("venue.noTables")}</p>
        ) : (
          <ul className="op-rows">
            {tables.map((table) => (
              <li key={table.tableId} className="op-row">
                <span className="op-row__name">{table.name}</span>
                <span className="op-row__meta">{t("venue.seatsCount", { count: table.capacity })}</span>
                <span className={`op-pill op-pill--${table.state}`}>{t(`venue.state.${table.state}`)}</span>
                <button
                  type="button"
                  className="op-icon"
                  aria-label={t("venue.removeTable", { name: table.name })}
                  onClick={() => write(
                    () => fetch(`/api/staff/tables?locationId=${locationId}&tableId=${table.tableId}`, { method: "DELETE" }),
                    t("venue.tableRemoved", { name: table.name }),
                  )}
                  disabled={busy === "writing"}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
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

      <div className="op-card">
        <header className="op-card__head">
          <div>
            <p className="op-label">{t("venue.customers")}</p>
            <h2>{t("venue.customersTitle")}</h2>
            <p className="op-note">{t("venue.customersDescription")}</p>
          </div>
        </header>

        {customers === null ? (
          <p className="op-empty"><Loader2 size={16} className="op-spin" aria-hidden="true" />{t("loading")}</p>
        ) : customers.length === 0 ? (
          <p className="op-empty"><Users size={16} aria-hidden="true" />{t("venue.noCustomers")}</p>
        ) : (
          <table className="op-table">
            <thead>
              <tr>
                <th scope="col">{t("venue.customerName")}</th>
                <th scope="col">{t("venue.visits")}</th>
                <th scope="col">{t("venue.spend")}</th>
                <th scope="col">{t("venue.lastVisit")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.name}>
                  <td>{customer.name}</td>
                  <td className="op-num">{customer.orders}</td>
                  <td className="op-num">{money(customer.spendMinor, currency)}</td>
                  <td className="op-num">{new Date(customer.lastOrderAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
