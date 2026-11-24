"use client";

import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Box, Check, Grid2x2, Info, LayoutGrid, Minus, Plus, RotateCcw, Save, Trash2, Utensils } from "lucide-react";
import { emptyFloorDraft, floorDraftSchema, type FloorDraft, type FloorTable, type TableState } from "@/domain/floor";
import { FloorErrorBoundary } from "./FloorErrorBoundary";

const LazyFloorScene = lazy(() => import("./FloorScene"));
const STORAGE_KEY = "platepilot.floor-draft.v1";
const states: TableState[] = ["available", "reserved", "seated", "resetting"];

type DragState = { id: string; pointerId: number; clientX: number; clientY: number; x: number; z: number };

const emptyDraft: FloorDraft = { ...emptyFloorDraft, tables: [] };

// The persisted draft is browser-only state. `useSyncExternalStore` reads it without a
// setState-in-effect cascade, and its server snapshot keeps the first client render
// identical to the server render (no hydration mismatch).
const draftListeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedDraft: FloorDraft = emptyDraft;
function subscribeToDraft(onChange: () => void) {
  window.addEventListener("storage", onChange);
  draftListeners.add(onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    draftListeners.delete(onChange);
  };
}
function getDraftSnapshot(): FloorDraft {
  let raw: string | null = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return emptyDraft; }
  // `useSyncExternalStore` requires a stable snapshot: returning a new object on every
  // call makes React re-render forever. The parsed draft is cached per stored string.
  if (raw === cachedRaw) return cachedDraft;
  let next = emptyDraft;
  if (raw) {
    try { next = floorDraftSchema.parse(JSON.parse(raw)); } catch { next = emptyDraft; }
  }
  cachedRaw = raw;
  cachedDraft = next;
  return next;
}
function getDraftServerSnapshot(): FloorDraft {
  return emptyDraft;
}
function writeDraft(next: FloorDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* storage unavailable; the in-memory draft still works */ }
  for (const listener of draftListeners) listener();
}

export function FloorPlanner() {
  const t = useTranslations("Floor");
  const draft = useSyncExternalStore(subscribeToDraft, getDraftSnapshot, getDraftServerSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [render3D, setRender3D] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState(1);
  // The dimension inputs are uncontrolled. A controlled `type="number"` input relies on
  // React's value tracker, which silently drops updates on some engines (WebKit), so a
  // merchant's typed width can be discarded on the next render. Reading the fields at
  // submit time keeps the value the merchant actually entered.
  const widthRef = useRef<HTMLInputElement>(null);
  const depthRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selected = draft.tables.find((table) => table.id === selectedId) ?? null;

  function commitDraft(next: FloorDraft) {
    writeDraft(next);
  }

  useEffect(() => {
    // Reflect the stored room size into the inputs. This writes to the DOM (an external
    // system) rather than to React state, and it never overwrites a value the merchant
    // has already typed.
    const widthInput = widthRef.current;
    const depthInput = depthRef.current;
    if (!widthInput || !depthInput) return;
    if (draft.width > 0 && widthInput.value === "") widthInput.value = String(draft.width);
    if (draft.depth > 0 && depthInput.value === "") depthInput.value = String(draft.depth);
  }, [draft.width, draft.depth]);

  function updateTable(id: string, patch: Partial<FloorTable>) {
    commitDraft({ ...draft, tables: draft.tables.map((table) => table.id === id ? { ...table, ...patch } : table) });
  }

  function applyRoom() {
    const width = Number(widthRef.current?.value); const depth = Number(depthRef.current?.value);
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0 || width > 500 || depth > 500) {
      setError("ROOM_DIMENSIONS_REQUIRED"); return;
    }
    const invalid = draft.tables.some((table) => table.x + table.width / 2 > width || table.z + table.depth / 2 > depth);
    if (invalid) { setError("TABLE_OUTSIDE_ROOM"); return; }
    commitDraft({ ...draft, width, depth }); setError("");
  }

  function addTable() {
    if (draft.width <= 0 || draft.depth <= 0) { setError("ROOM_DIMENSIONS_REQUIRED"); return; }
    const width = Math.min(1, draft.width); const depth = Math.min(1, draft.depth);
    const count = draft.tables.length;
    const table: FloorTable = {
      id: crypto.randomUUID(), name: `Table ${count + 1}`,
      x: Math.min(draft.width - width / 2, width / 2 + (count % 5) * 1.25),
      z: Math.min(draft.depth - depth / 2, depth / 2 + Math.floor(count / 5) * 1.25),
      width, depth, rotationRadians: 0, capacity: 2, state: "available",
    };
    commitDraft({ ...draft, tables: [...draft.tables, table] }); setSelectedId(table.id); setError("");
  }

  function removeTable() {
    if (!selected) return;
    commitDraft({ ...draft, tables: draft.tables.filter((table) => table.id !== selected.id) });
    setSelectedId(null);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, table: FloorTable) {
    const delta = event.shiftKey ? 0.5 : 0.1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    updateTable(table.id, {
      x: Math.min(draft.width - table.width / 2, Math.max(table.width / 2, table.x + move[0])),
      z: Math.min(draft.depth - table.depth / 2, Math.max(table.depth / 2, table.z + move[1])),
    });
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>, table: FloorTable) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(table.id);
    dragRef.current = { id: table.id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: table.x, z: table.z };
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>, table: FloorTable) {
    const drag = dragRef.current;
    if (!drag || drag.id !== table.id || drag.pointerId !== event.pointerId || !roomRef.current) return;
    const rect = roomRef.current.getBoundingClientRect();
    const dx = (event.clientX - drag.clientX) / (rect.width / draft.width);
    const dz = (event.clientY - drag.clientY) / (rect.height / draft.depth);
    updateTable(table.id, {
      x: Math.min(draft.width - table.width / 2, Math.max(table.width / 2, drag.x + dx)),
      z: Math.min(draft.depth - table.depth / 2, Math.max(table.depth / 2, drag.z + dz)),
    });
  }

  function enable3D() {
    setError("");
    try {
      const canvas = document.createElement("canvas");
      if (!canvas.getContext("webgl2") && !canvas.getContext("webgl")) throw new Error("WEBGL_UNAVAILABLE");
      setRender3D(true);
    } catch { setError(t("threeDError")); setRender3D(false); setView("2d"); }
  }

  function fallback3D() { setRender3D(false); setView("2d"); setError(t("threeDError")); }
  const baseScale = draft.width > 0 && draft.depth > 0 ? Math.min(60, 480 / Math.max(draft.width, draft.depth)) : 60;
  const scale = baseScale * zoom;
  const fallback = <div className="three-d-fallback">{t("threeDError")}</div>;

  return (
    <div className="shell planner-shell">
      <div className="planner-toolbar">
        <div className="view-tabs" aria-label={t("title")}><button aria-pressed={view === "2d"} onClick={() => { setView("2d"); setRender3D(false); }}><Grid2x2 size={16} />{t("twoD")}</button><button aria-pressed={view === "3d"} onClick={() => setView("3d")}><Box size={16} />{t("threeD")}</button></div>
        <div className="planner-status"><i />{notice || t("summary", { count: draft.tables.length })}</div>
      </div>
      {error && <div className="notice notice--error" role="alert"><AlertCircle size={18} />{error}</div>}
      <div className="planner-grid">
        <aside className="planner-sidebar">
          <section className="planner-card"><h2>{t("room")}</h2><div className="dimension-fields"><label className="field"><span>{t("width")}</span><input ref={widthRef} inputMode="decimal" type="number" min="0.5" max="500" step="0.1" defaultValue={String(draft.width || "")} /></label><label className="field"><span>{t("depth")}</span><input ref={depthRef} inputMode="decimal" type="number" min="0.5" max="500" step="0.1" defaultValue={String(draft.depth || "")} /></label></div><button className="button button--ghost" onClick={applyRoom}>{t("applyRoom")}</button></section>
          <section className="planner-card"><h2>{t("tables")}</h2><div className="table-list">{draft.tables.map((table) => <button key={table.id} className={selectedId === table.id ? "is-selected" : ""} onClick={() => setSelectedId(table.id)}><span><i />{table.name}</span><small>{t(table.state)}</small></button>)}</div><button className="button" onClick={addTable}><Plus size={16} />{t("addTable")}</button></section>
        </aside>

        <section className="floor-workspace">
          <div className="floor-canvas-card">
            <div className="floor-canvas-meta"><strong>{view === "2d" ? t("twoD") : t("threeD")}</strong><span>{t("summary", { count: draft.tables.length })}{draft.width > 0 && ` · ${draft.width} × ${draft.depth} m`}</span></div>
            {view === "3d" ? (
              render3D && selectedId !== "__none__" ? <FloorErrorBoundary fallback={fallback} onError={fallback3D}><Suspense fallback={<div className="three-d-loading">{t("threeDLoading")}</div>}><LazyFloorScene width={draft.width} depth={draft.depth} tables={draft.tables} fallback={fallback} onSelectTable={setSelectedId} onContextLost={fallback3D} /></Suspense></FloorErrorBoundary> : <div className="three-d-intro"><Box size={35} /><h2>{t("threeD")}</h2><p>{t("threeDBody")}</p><button className="button" disabled={draft.tables.length === 0} onClick={enable3D}>{t("threeDLoad")}</button></div>
            ) : (
              <div className="floor-canvas">
                {draft.tables.length === 0 ? <div className="floor-empty"><span><LayoutGrid size={27} /></span><h2>{t("emptyTitle")}</h2><p>{t("emptyBody")}</p></div> : <div ref={roomRef} className="floor-room" data-width={`${draft.width} m`} data-depth={`${draft.depth} m`} style={{ width: draft.width * scale, height: draft.depth * scale }}>{draft.tables.map((table) => <button
                  key={table.id} className={`floor-table floor-table--${table.state} ${selectedId === table.id ? "is-selected" : ""}`}
                  data-capacity={`${table.capacity} seats`}
                  aria-label={`${table.name}, ${t(table.state)}, ${table.capacity}`}
                  onClick={() => setSelectedId(table.id)} onKeyDown={(event) => moveWithKeyboard(event, table)}
                  onPointerDown={(event) => pointerDown(event, table)} onPointerMove={(event) => pointerMove(event, table)} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}
                  style={{ left: `${(table.x - table.width / 2) / draft.width * 100}%`, top: `${(table.z - table.depth / 2) / draft.depth * 100}%`, width: `${table.width / draft.width * 100}%`, height: `${table.depth / draft.depth * 100}%`, transform: `rotate(${table.rotationRadians}rad)` }}
                >{table.name}</button>)}</div>}
              </div>
            )}
            <div className="floor-canvas-footer"><div className="state-legend">{states.map((state, index) => <span key={state}><i className={`state-dot state-dot--${index}`} />{t(state)}</span>)}</div><div className="canvas-controls"><button className="icon-button" aria-label={t("zoomOut")} onClick={() => setZoom((value) => Math.max(0.6, value - 0.15))}><Minus size={15} /></button><button className="icon-button" aria-label={t("resetView")} onClick={() => setZoom(1)}><RotateCcw size={15} /></button><button className="icon-button" aria-label={t("zoomIn")} onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))}><Plus size={15} /></button></div></div>
          </div>
          <p className="floor-instructions"><Info size={14} />{t("instructions")}</p>
        </section>

        <aside className="planner-sidebar">
          <section className="planner-card"><h2>{selected ? t("selected") : t("servicePanel")}</h2>{selected ? <div className="selected-table-form"><label className="field"><span>{t("tableName")}</span><input value={selected.name} maxLength={60} onChange={(e) => updateTable(selected.id, { name: e.target.value })} /></label><label className="field"><span>{t("capacity")}</span><input type="number" min="1" max="100" value={selected.capacity} onChange={(e) => updateTable(selected.id, { capacity: Math.max(1, Math.min(100, Number(e.target.value))) })} /></label><label className="field"><span>{t("state")}</span><select value={selected.state} onChange={(e) => updateTable(selected.id, { state: e.target.value as TableState })}>{states.map((state) => <option key={state} value={state}>{t(state)}</option>)}</select></label><span className="selected-table-position">{t("position")}: {selected.x.toFixed(1)}, {selected.z.toFixed(1)} m</span><button className="button button--danger" onClick={removeTable}><Trash2 size={15} />{t("remove")}</button></div> : <div className="service-panel-empty"><Utensils size={24} /><p>{t("serviceEmpty")}</p></div>}</section>
          <section className="planner-card"><h2>{t("publish")}</h2><p className="service-panel-empty">{t("publishUnavailable")}</p><button className="button button--ghost" onClick={() => setNotice(t("publishUnavailable"))}><Save size={15} />{t("publish")}</button>{notice === t("publishUnavailable") && <div className="notice"><Check size={15} />{notice}</div>}</section>
        </aside>
      </div>
    </div>
  );
}