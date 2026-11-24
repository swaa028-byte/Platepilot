"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, CircleAlert, Flame, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * The kitchen display.
 *
 * Tickets are laid out in one column per station, because the kitchen works
 * by station, not by order. Each line on a ticket is bumped on its own so a
 * ticket can be served partly, and the ticket header always carries the order
 * number, the service type, the table and how long the ticket has been open.
 */
type TicketItem = {
  ticketItemId: string;
  orderItemId: string;
  name: string;
  quantity: number;
  station: string;
  status: "new" | "holding" | "preparing" | "ready" | "served";
  selections: unknown;
  allergyNote: string | null;
  lineTotalMinor: string;
};

type Ticket = {
  ticketId: string;
  orderId: string;
  ticketNumber: number | null;
  status: string;
  createdAt: string;
  serviceType: string;
  tableId: string | null;
  tableName: string | null;
  customerName: string | null;
  items: TicketItem[];
};

type Station = { station: string; tickets: Ticket[] };

type Location = {
  locationId: string;
  name: string;
  currency: string;
  role: string;
};

const REFRESH_MS = 8_000;

/** A bump the board could not send yet, kept until the server accepts it. */
type QueuedBump = { ticketItemId: string; toStatus: TicketItem["status"] };

const QUEUE_KEY = "platepilot.kds.queue";

function readQueue(): QueuedBump[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedBump[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedBump[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage can be unavailable; the queue then lives only in memory.
  }
}

/** The state a line moves to when it is tapped on the board. */
function nextStatus(status: TicketItem["status"]): TicketItem["status"] | null {
  if (status === "new") return "preparing";
  if (status === "holding") return "preparing";
  if (status === "preparing") return "ready";
  if (status === "ready") return "served";
  return null;
}

function elapsedSeconds(createdAt: string, now: number) {
  const started = new Date(createdAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.round((now - started) / 1000));
}

/**
 * The age band a ticket is in. The oldest band is the one that tells a
 * kitchen something has gone wrong.
 */
function ageBand(seconds: number) {
  if (seconds >= 900) return "late";
  if (seconds >= 480) return "late-soon";
  if (seconds >= 300) return "warm";
  return "fresh";
}

export function KitchenBoard() {
  const t = useTranslations("Kitchen");
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "failed">("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [queued, setQueued] = useState<QueuedBump[]>([]);
  const pending = useRef<Set<string>>(new Set());
  const queueRef = useRef<QueuedBump[]>([]);

  const setQueue = useCallback((queue: QueuedBump[]) => {
    queueRef.current = queue;
    setQueued(queue);
    writeQueue(queue);
  }, []);

  // The queue survives a reload: the kitchen keeps working through a drop,
  // and what it bumped is sent the moment the connection returns.
  useEffect(() => {
    // Restored after paint, not during the effect, so the reveal is not a
    // cascading render.
    const restore = window.setTimeout(() => {
      const restored = readQueue();
      queueRef.current = restored;
      if (restored.length > 0) setQueued(restored);
    }, 0);
    const goOnline = () => { setOnline(true); };
    const goOffline = () => { setOnline(false); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.clearTimeout(restore);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine || queueRef.current.length === 0) return;
    const remaining: QueuedBump[] = [];
    for (const entry of queueRef.current) {
      try {
        const response = await fetch("/api/staff/kitchen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketItemId: entry.ticketItemId, toStatus: entry.toStatus }),
        });
        if (!response.ok) {
          // The server refused the change (the line moved elsewhere while we
          // were offline). Drop it; the board reload shows the truth.
          continue;
        }
      } catch {
        // Still offline: keep this entry and the rest.
        remaining.push(entry);
        break;
      }
    }
    // Anything after a network failure stays queued.
    if (remaining.length > 0) {
      const index = queueRef.current.findIndex((entry) => entry.ticketItemId === remaining[0].ticketItemId);
      setQueue(queueRef.current.slice(index));
    } else {
      setQueue([]);
    }
  }, [setQueue]);

  useEffect(() => {
    if (online) void flushQueue();
  }, [online, flushQueue]);

  const applyBoard = useCallback((data: { stations?: Record<string, Station> }) => {
    const entries = Object.values(data.stations ?? {});
    setStations(entries);
    setState(entries.length > 0 ? "ready" : "empty");
  }, []);

  const loadBoard = useCallback(async (target: string) => {
    try {
      const response = await fetch(`/api/staff/kitchen?locationId=${encodeURIComponent(target)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("BOARD_FAILED");
      applyBoard((await response.json()) as { stations?: Record<string, Station> });
    } catch {
      setState((current) => (current === "empty" ? current : "failed"));
    }
  }, [applyBoard]);

  useEffect(() => {
    let active = true;
    fetch("/api/staff/locations", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as unknown) : null))
      .then((data: unknown) => {
        if (!active) return;
        // A signed-out request answers with an error object, not a list. Treat
        // that as "no linked location" instead of leaving the board loading.
        const list = Array.isArray(data) ? (data as Location[]) : [];
        setLocations(list);
        setLocationId(list[0]?.locationId ?? null);
        if (list.length === 0) setState("empty");
      })
      .catch(() => { if (active) setState("failed"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!locationId) return;
    let active = true;
    fetch(`/api/staff/kitchen?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { stations?: Record<string, Station> }) => {
        if (!active) return;
        const entries = Object.values(data.stations ?? {});
        setStations(entries);
        setState(entries.length > 0 ? "ready" : "empty");
      })
      .catch(() => { if (active) setState((current) => (current === "empty" ? current : "failed")); });
    const timer = setInterval(() => { void loadBoard(locationId); }, REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, [locationId, loadBoard]);

  // The clock only ticks while the board is on screen.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const bump = useCallback(async (item: TicketItem, toStatus: TicketItem["status"]) => {
    if (!locationId || pending.current.has(item.ticketItemId)) return;
    pending.current.add(item.ticketItemId);
    setNotice(null);

    // Offline: the kitchen does not stop. The change is queued, shown on the
    // board immediately, and sent when the connection returns.
    const enqueue = () => {
      const next = [...queueRef.current.filter((entry) => entry.ticketItemId !== item.ticketItemId), { ticketItemId: item.ticketItemId, toStatus }];
      setQueue(next);
    };
    if (!navigator.onLine) {
      enqueue();
      pending.current.delete(item.ticketItemId);
      return;
    }

    try {
      const response = await fetch("/api/staff/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketItemId: item.ticketItemId, toStatus }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "REQUEST_REJECTED" }));
        setNotice(body.error ?? "REQUEST_REJECTED");
        return;
      }
      await loadBoard(locationId);
    } catch {
      // The request itself failed — a drop mid-service. Queue it.
      enqueue();
    } finally {
      pending.current.delete(item.ticketItemId);
    }
  }, [locationId, loadBoard, setQueue]);

  // A queued bump shows its target state on the board, so the kitchen sees
  // the room as it believes it to be, not as the last refresh found it.
  const statusFor = useCallback((item: TicketItem): TicketItem["status"] => {
    const entry = queued.find((queuedItem) => queuedItem.ticketItemId === item.ticketItemId);
    return entry ? entry.toStatus : item.status;
  }, [queued]);

  const sorted = useMemo(
    () => [...stations].sort((a, b) => a.station.localeCompare(b.station)),
    [stations],
  );

  if (state === "loading") {
    return <p className="kitchen-state"><RefreshCw size={16} className="spin" />{t("loading")}</p>;
  }

  if (state === "failed") {
    return (
      <p className="kitchen-state kitchen-state--error">
        <CircleAlert size={16} />{t("failed")}
      </p>
    );
  }

  if (state === "empty" && locations.length === 0) {
    return (
      <div className="kitchen-state kitchen-state--empty">
        <ChefHat size={22} />
        <p>{t("noLocation")}</p>
      </div>
    );
  }

  return (
    <div className="kitchen">
      <div className="kitchen-toolbar">
        {locations.length > 1 && (
          <label className="kitchen-location">
            <span>{t("location")}</span>
            <select value={locationId ?? ""} onChange={(event) => setLocationId(event.target.value)}>
              {locations.map((location) => (
                <option key={location.locationId} value={location.locationId}>
                  {location.name} · {location.currency}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="kitchen-refresh" onClick={() => locationId && void loadBoard(locationId)}>
          <RefreshCw size={15} />{t("refresh")}
        </button>
      </div>

      {notice && <p className="kitchen-notice"><CircleAlert size={15} />{t("rejected")}</p>}

      {(!online || queued.length > 0) && (
        <p className="kitchen-notice kitchen-notice--offline" role="status">
          <CircleAlert size={15} />{!online ? t("offline") : t("queued", { count: queued.length })}
        </p>
      )}

      {state === "empty" ? (
        <p className="kitchen-state kitchen-state--empty"><ChefHat size={22} /><p>{t("noTickets")}</p></p>
      ) : (
        <div className="kitchen-columns">
          {sorted.map((station) => (
            <section className="kitchen-station" key={station.station}>
              <header className="kitchen-station-head">
                <h2>{station.station}</h2>
                <span>{station.tickets.length}</span>
              </header>
              <div className="kitchen-tickets">
                {station.tickets.map((ticket) => {
                  const age = elapsedSeconds(ticket.createdAt, now);
                  const items = ticket.items.filter((item) => item.station === station.station);
                  return (
                    <article className={`kitchen-ticket kitchen-ticket--${ageBand(age)}`} key={ticket.ticketId}>
                      <header className="kitchen-ticket-head">
                        <span className="kitchen-ticket-number">
                          {ticket.ticketNumber ? `#${ticket.ticketNumber}` : t("noNumber")}
                        </span>
                        <span className="kitchen-ticket-meta">
                          {ticket.tableName ? ticket.tableName : serviceLabel(ticket.serviceType)}
                        </span>
                        <span className="kitchen-ticket-age">
                          <Flame size={12} />{formatAge(age)}
                        </span>
                      </header>
                      {ticket.customerName && <p className="kitchen-ticket-guest">{ticket.customerName}</p>}
                      <ul className="kitchen-items">
                        {items.map((rawItem) => {
                          const item = { ...rawItem, status: statusFor(rawItem) };
                          const target = nextStatus(item.status);
                          return (
                            <li className={`kitchen-item kitchen-item--${item.status}`} key={item.ticketItemId}>
                              <div className="kitchen-item-main">
                                <span className="kitchen-item-quantity">{item.quantity}×</span>
                                <span className="kitchen-item-name">{item.name}</span>
                              </div>
                              <Selections value={item.selections} />
                              {item.allergyNote && <p className="kitchen-item-allergy">{item.allergyNote}</p>}
                              <div className="kitchen-item-actions">
                                {item.status === "new" && (
                                  <button type="button" onClick={() => void bump(item, "holding")}>{t("hold")}</button>
                                )}
                                {target && (
                                  <button type="button" className="kitchen-item-next" onClick={() => void bump(item, target)}>
                                    {statusLabel(
                                      { fire: t("fire"), start: t("start"), ready: t("ready"), serve: t("serve") },
                                      item.status,
                                      target,
                                    )}
                                  </button>
                                )}
                                {item.status === "served" && <span className="kitchen-item-done">{t("served")}</span>}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function serviceLabel(serviceType: string) {
  const labels: Record<string, string> = {
    walk_in: "Walk-in",
    phone: "Phone",
    takeaway: "Takeaway",
    dine_in: "Dine in",
    catering: "Catering",
    pickup: "Pickup",
    delivery: "Delivery",
  };
  return labels[serviceType] ?? serviceType;
}

function formatAge(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function statusLabel(labels: { fire: string; start: string; ready: string; serve: string }, from: TicketItem["status"], to: TicketItem["status"]) {
  if (to === "preparing") return from === "holding" ? labels.fire : labels.start;
  if (to === "ready") return labels.ready;
  if (to === "served") return labels.serve;
  return labels.start;
}

/**
 * The modifiers a guest chose. They are read from the same snapshot the order
 * was priced with, so the kitchen sees exactly what the guest asked for.
 */
function Selections({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return (
    <ul className="kitchen-selections">
      {value.map((entry, index) => {
        const record = entry as { name?: string; priceDeltaMinor?: string };
        const name = record?.name ?? String(entry);
        return <li key={`${name}-${index}`}>{name}</li>;
      })}
    </ul>
  );
}