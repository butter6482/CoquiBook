"use client";

import { useState, useEffect, useRef } from "react";
import dayjs from "@calcom/dayjs";
import { trpc } from "@calcom/trpc/react";

import type { SalonDayBooking, StaffConfig } from "./SalonGridView";

interface SalonDailySummaryProps {
  bookings: SalonDayBooking[];
  staff: StaffConfig[];
  date: dayjs.Dayjs;
}

function getWeekDays(date: dayjs.Dayjs) {
  const dow = date.day();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = date.add(diff, "day").startOf("day");
  return Array.from({ length: 6 }, (_, i) => monday.add(i, "day"));
}

const DAY_NAMES_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const SALON_TZ = "America/Puerto_Rico";

const STAFF_COLORS = {
  pink: { border: "border-l-[#FF69B4]", text: "text-[#B85070]", bg: "bg-[#FFF0F6]", dot: "bg-[#FF69B4]" },
  green: { border: "border-l-[#3CB371]", text: "text-[#2D7A55]", bg: "bg-[#F0FBF4]", dot: "bg-[#3CB371]" },
};

// agent:tips-bug-fix — safe key lookup: JSON serialization turns numeric keys → strings
// In JS obj[123] === obj["123"], but be explicit to avoid TS edge cases
function lookupTip(tipMap: Record<string, number> | undefined, staffId: number): number {
  if (!tipMap) return 0;
  const val = tipMap[staffId] ?? tipMap[String(staffId)];
  return typeof val === "number" ? val : 0;
}

export function SalonDailySummary({ bookings, staff, date }: SalonDailySummaryProps) {
  const dateStr = date.format("YYYY-MM-DD");
  const isSaturday = date.day() === 6;
  const weekDays = getWeekDays(date);
  const weekStart = weekDays[0].format("YYYY-MM-DD");
  const weekEnd = weekDays[5].format("YYYY-MM-DD");

  const [tipInputs, setTipInputs] = useState<Record<number, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  // Prevents post-save refetch from clearing inputs (race condition guard)
  const justSavedRef = useRef(false);
  // agent:weekly-accordion — starts closed
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: todayTipsData } = trpc.viewer.bookings.getWeeklyTips.useQuery(
    { startDate: dateStr, endDate: dateStr },
    { staleTime: 0 }
  );

  const { data: weeklyTipsData } = trpc.viewer.bookings.getWeeklyTips.useQuery(
    { startDate: weekStart, endDate: weekEnd },
    { enabled: isSaturday, staleTime: 0 }
  );

  const utils = trpc.useUtils();
  const saveTipMutation = trpc.viewer.bookings.saveDailyTip.useMutation();

  // Reset state when switching to a different day
  useEffect(() => {
    setIsDirty(false);
    setSaveStatus("idle");
    justSavedRef.current = false; // fresh mount = allow DB sync
  }, [dateStr]);

  // Sync inputs from DB — skip when user has unsaved edits OR just saved (post-save refetch guard)
  useEffect(() => {
    if (!todayTipsData || isDirty || justSavedRef.current) return;
    const updated: Record<number, string> = {};
    for (const s of staff) {
      const amount = lookupTip(todayTipsData[dateStr], s.id);
      updated[s.id] = amount > 0 ? String(amount) : "";
    }
    setTipInputs(updated);
  // isDirty intentionally excluded: checked via ref guard above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayTipsData, dateStr, staff]);

  async function handleSave() {
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      for (const s of staff) {
        const amount = parseFloat(tipInputs[s.id] ?? "") || 0;
        await saveTipMutation.mutateAsync({ date: dateStr, staffUserId: s.id, amount });
      }
      // Mark as just-saved BEFORE invalidating so the refetch doesn't clear inputs
      justSavedRef.current = true;
      await utils.viewer.bookings.getWeeklyTips.invalidate();
      setIsDirty(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }

  function sumServicesForDay(staffId: number, day: dayjs.Dayjs): number {
    return bookings
      .filter((b) => {
        if (b.user?.id !== staffId) return false;
        if (b.status === "CANCELLED" || b.status === "REJECTED") return false;
        return dayjs(b.startTime).tz(SALON_TZ).isSame(day, "day");
      })
      .reduce((sum, b) => sum + (b.salonPrice ?? 0), 0);
  }

  // agent:tips-bug-fix — explicit lookup per day+staff using safe helper
  function getTipForDay(staffId: number, day: dayjs.Dayjs): number {
    return lookupTip(weeklyTipsData?.[day.format("YYYY-MM-DD")], staffId);
  }

  // ── Daily ──
  const dayStart = date.startOf("day");
  const dailyData = staff.map((s) => {
    const services = sumServicesForDay(s.id, dayStart);
    const tips = parseFloat(tipInputs[s.id] ?? "") || 0;
    return { staff: s, services, tips, total: services + tips };
  });
  const grandDailyServices = dailyData.reduce((sum, d) => sum + d.services, 0);
  const grandDailyTips = dailyData.reduce((sum, d) => sum + d.tips, 0);
  const grandDailyTotal = grandDailyServices + grandDailyTips;

  // ── Weekly (agent:data-consistency — all totals = services + tips) ──
  const weeklyData = staff.map((s) => {
    const byDay = weekDays.map((day) => {
      const services = sumServicesForDay(s.id, day);
      const tips = getTipForDay(s.id, day);        // explicit per-day per-staff tip
      return { services, tips, total: services + tips };
    });
    const weekServices = byDay.reduce((sum, d) => sum + d.services, 0);
    const weekTips = byDay.reduce((sum, d) => sum + d.tips, 0);
    const weekTotal = weekServices + weekTips;     // guaranteed = svc + tips
    return { staff: s, byDay, weekServices, weekTips, weekTotal };
  });

  const grandWeeklyServices = weeklyData.reduce((sum, r) => sum + r.weekServices, 0);
  const grandWeeklyTips = weeklyData.reduce((sum, r) => sum + r.weekTips, 0);
  const grandWeeklyTotal = grandWeeklyServices + grandWeeklyTips; // svc + tips

  // ── PDF export ──
  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>Cuadre Semanal — HB Style</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;padding:28px;color:#0A0A0A}
  h1{font-size:18px;font-weight:900;color:#B8860B;margin-bottom:2px}
  .sub{font-size:10px;color:#B8860B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:20px}
  .day{margin-bottom:20px;page-break-inside:avoid}
  .day-hd{font-size:13px;font-weight:800;border-bottom:2px solid #D4A017;padding-bottom:5px;margin-bottom:8px;display:flex;justify-content:space-between}
  .row{display:flex;align-items:center;gap:16px;padding:6px 0;border-bottom:1px solid #f0e8d0}
  .name{font-size:11px;font-weight:700;min-width:110px}
  .stat{text-align:center;min-width:72px}
  .sl{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#888}
  .sv{font-size:13px;font-weight:800}
  .pink{color:#B85070}.green{color:#2D7A55}.gold{color:#D4A017}.muted{color:#ccc}
  .day-total{display:flex;justify-content:space-between;padding:5px 0;font-size:10px;color:#B8860B}
  .totals{margin-top:24px;border-top:3px solid #D4A017;padding-top:14px;display:flex;gap:12px}
  .tb{flex:1;text-align:center;border:1px solid #D4A01744;border-radius:10px;padding:10px}
  .tl{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#B8860B;margin-bottom:3px}
  .tv{font-size:20px;font-weight:900}
</style>
</head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 250);
  }

  return (
    <div className="mt-4 space-y-3">

      {/* ────────────── CUADRE DIARIO ────────────── */}
      <div
        className="rounded-2xl border border-[#D4A01766] p-4"
        style={{ background: "linear-gradient(135deg, #F5EDD8, #EDE0C4)" }}>
        <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-[#B8860B]">
          💰 Cuadre del día — {date.locale("es").format("D MMM YYYY")}
        </p>

        <div className="mb-3 space-y-2">
          {dailyData.map(({ staff: s, services, total }) => {
            const c = STAFF_COLORS[s.color];
            const inputVal = tipInputs[s.id] ?? "";
            return (
              <div key={s.id} className={`rounded-xl border-l-4 bg-white p-3 shadow-sm ${c.border}`}>
                <p className={`mb-2 text-[10px] font-bold ${c.text}`}>
                  {s.color === "pink" ? "🌸" : "🌿"} {s.name}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[8px] uppercase tracking-wide text-gray-400">Servicios</p>
                    <p className="text-xl font-black text-[#0A0A0A]">${services.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-wide text-gray-400">Tips 💅</p>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-xs font-bold text-[#B8860B]">$</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0"
                        value={inputVal}
                        onChange={(e) => {
                          setTipInputs((prev) => ({ ...prev, [s.id]: e.target.value }));
                          setIsDirty(true);
                          setSaveStatus("idle");
                        }}
                        className="w-14 rounded-lg border border-[#D4A01766] bg-[#FFFDF7] px-1 py-0.5 text-center text-sm font-bold text-[#0A0A0A] outline-none focus:border-[#D4A017]"
                      />
                    </div>
                  </div>
                  <div>
                    <p className={`text-[8px] uppercase tracking-wide ${c.text}`}>Total</p>
                    <p className={`text-xl font-black ${c.text}`}>${total.toFixed(0)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Guardar button — only when dirty */}
        {isDirty && (
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className={`mb-3 w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-sm transition-all ${
              isSaving
                ? "cursor-not-allowed bg-[#D4A01799]"
                : "bg-[#D4A017] hover:bg-[#B8860B] active:scale-[0.98]"
            }`}>
            {isSaving ? "Guardando…" : "Guardar tips"}
          </button>
        )}
        {saveStatus === "saved" && !isDirty && (
          <p className="mb-3 text-center text-[10px] font-semibold text-[#2D7A55]">✓ Tips guardados</p>
        )}
        {saveStatus === "error" && (
          <p className="mb-3 text-center text-[10px] font-semibold text-red-500">✕ Error al guardar — intenta de nuevo</p>
        )}

        {/* Grand daily total row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Servicios", value: `$${grandDailyServices.toFixed(0)}`, accent: false },
            { label: "Tips 💅", value: grandDailyTips > 0 ? `$${grandDailyTips.toFixed(0)}` : "—", accent: false },
            { label: "Total del día", value: `$${grandDailyTotal.toFixed(0)}`, accent: true },
          ].map(({ label, value, accent }) => (
            <div
              key={label}
              className={`flex flex-col items-center justify-center rounded-xl px-3 py-3 shadow-sm ${
                accent ? "border-2 border-[#D4A017] bg-white" : "border border-[#D4A01744] bg-white"
              }`}>
              <p className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-[#B8860B]">{label}</p>
              <p className={`font-black leading-none ${accent ? "text-2xl text-[#D4A017]" : "text-xl text-[#0A0A0A]"}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ────────────── CUADRE SEMANAL (solo sábado) — ACCORDION ────────────── */}
      {/* agent:weekly-accordion + agent:data-consistency */}
      {isSaturday && (
        <div
          className="overflow-hidden rounded-2xl border border-[#C4A86644]"
          style={{ background: "linear-gradient(135deg, #E8D5B0, #D4BC8C)" }}>

          {/* Header — always visible, click to toggle */}
          <button
            type="button"
            onClick={() => setWeeklyOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:brightness-95 active:brightness-90">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest text-[#8A6A20]">
                📅 Cuadre semanal — {weekDays[0].format("D MMM")} al {weekDays[5].format("D MMM YYYY")}
              </p>
              <p className="mt-0.5 text-2xl font-black leading-none text-[#1A1A1A]">
                ${grandWeeklyTotal.toFixed(0)}
              </p>
              {grandWeeklyTips > 0 && (
                <p className="text-[9px] text-[#8A6A20]">
                  svc ${grandWeeklyServices.toFixed(0)} + tips ${grandWeeklyTips.toFixed(0)}
                </p>
              )}
            </div>
            <span className={`text-[#8A6A20] transition-transform duration-200 ${weeklyOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {/* Expanded content */}
          {weeklyOpen && (
            <div className="border-t border-[#C4A86633] px-4 pb-4 pt-3">

              {/* 3 stat blocks */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[
                  { label: "Servicios", value: `$${grandWeeklyServices.toFixed(0)}`, accent: false },
                  { label: "Tips 💅", value: grandWeeklyTips > 0 ? `$${grandWeeklyTips.toFixed(0)}` : "—", accent: false },
                  { label: "Total", value: `$${grandWeeklyTotal.toFixed(0)}`, accent: true },
                ].map(({ label, value, accent }) => (
                  <div
                    key={label}
                    className={`flex flex-col items-center justify-center rounded-xl px-2 py-2.5 shadow-sm ${
                      accent ? "border-2 border-[#D4A017] bg-white" : "border border-[#C4A86644] bg-white/70"
                    }`}>
                    <p className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-[#8A6A20]">{label}</p>
                    <p className={`font-black leading-none ${accent ? "text-xl text-[#D4A017]" : "text-lg text-[#0A0A0A]"}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Per-staff cards (agent:data-consistency — weekTotal = weekServices + weekTips) */}
              <div className="mb-3 grid grid-cols-2 gap-2">
                {weeklyData.map(({ staff: s, weekServices, weekTips, weekTotal }) => {
                  const c = STAFF_COLORS[s.color];
                  return (
                    <div key={s.id} className={`rounded-xl border-l-4 bg-white/80 p-3 shadow-sm ${c.border}`}>
                      <p className={`mb-2 text-[10px] font-bold ${c.text}`}>
                        {s.color === "pink" ? "🌸" : "🌿"} {s.name}
                      </p>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-[7px] uppercase tracking-wide text-gray-400">Servicios</p>
                          <p className="text-base font-black text-[#0A0A0A]">${weekServices.toFixed(0)}</p>
                        </div>
                        <div>
                          <p className="text-[7px] uppercase tracking-wide text-gray-400">Tips</p>
                          <p className="text-base font-black text-[#B8860B]">
                            {weekTips > 0 ? `$${weekTips.toFixed(0)}` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className={`text-[7px] uppercase tracking-wide ${c.text}`}>Total</p>
                          <p className={`text-base font-black ${c.text}`}>${weekTotal.toFixed(0)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowDetail(true)}
                className="w-full rounded-xl border border-[#C4A86688] bg-white/60 px-3 py-2.5 text-[11px] font-bold text-[#8A6A20] transition-colors hover:bg-white/80">
                Ver detalle día a día →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ────────────── MODAL: DETALLE DÍA A DÍA ────────────── */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="relative my-4 w-full max-w-lg rounded-3xl bg-white shadow-2xl">

            {/* Modal header */}
            <div
              className="flex items-center justify-between rounded-t-3xl px-5 py-4"
              style={{ background: "linear-gradient(135deg, #E8D5B0, #D4BC8C)" }}>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#8A6A20]">
                  HB Style — Detalle semanal
                </p>
                <p className="text-base font-black text-[#1A1A1A]">
                  {weekDays[0].format("D MMM")} — {weekDays[5].format("D MMM YYYY")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-xl bg-[#D4A017] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#B8860B] active:scale-95">
                  Exportar PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetail(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 text-sm text-[#1A1A1A] hover:bg-black/20">
                  ✕
                </button>
              </div>
            </div>

            {/* Printable body */}
            <div ref={printRef} className="px-5 pb-5 pt-4">
              <h1 style={{ display: "none" }}>Cuadre Semanal — HB Style</h1>
              <p className="sub" style={{ display: "none" }}>
                {weekDays[0].format("D MMM")} al {weekDays[5].format("D MMM YYYY")}
              </p>

              <div className="space-y-4">
                {weekDays.map((day, dayIdx) => {
                  const dayData = weeklyData.map((r) => ({ staff: r.staff, ...r.byDay[dayIdx] }));
                  const anyActivity = dayData.some((d) => d.total > 0);
                  const dayServices = dayData.reduce((sum, d) => sum + d.services, 0);
                  const dayTips = dayData.reduce((sum, d) => sum + d.tips, 0);
                  const dayTotal = dayServices + dayTips;

                  return (
                    <div key={day.toString()} className="day">
                      <div className="mb-2 flex items-baseline justify-between border-b-2 border-[#D4A01733] pb-1.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-black text-[#1A1A1A]">{DAY_NAMES_ES[day.day()]}</span>
                          <span className="text-lg font-black text-[#D4A017]">{day.date()}</span>
                          <span className="text-[10px] text-[#B8860B]">{MONTH_NAMES_ES[day.month()]}</span>
                        </div>
                        {anyActivity && (
                          <span className="text-sm font-black text-[#0A0A0A]">${dayTotal.toFixed(0)}</span>
                        )}
                      </div>

                      {!anyActivity ? (
                        <p className="py-1 text-[11px] text-gray-300">Sin actividad</p>
                      ) : (
                        <div className="space-y-1.5">
                          {dayData.map(({ staff: s, services, tips, total }) => {
                            const c = STAFF_COLORS[s.color];
                            return (
                              <div
                                key={s.id}
                                className="row flex items-center gap-1 rounded-xl border border-[#D4A01722] bg-[#FAFAF8] px-3 py-2">
                                <span className={`min-w-[108px] text-[10px] font-bold ${c.text}`}>
                                  {s.color === "pink" ? "🌸" : "🌿"} {s.name}
                                </span>
                                <div className="flex flex-1 justify-around text-center">
                                  {[
                                    { l: "Servicios", v: services, cls: services > 0 ? "text-[#0A0A0A]" : "text-gray-300" },
                                    { l: "Tips", v: tips, cls: tips > 0 ? "text-[#B8860B]" : "text-gray-300" },
                                    { l: "Total", v: total, cls: total > 0 ? c.text : "text-gray-300" },
                                  ].map(({ l, v, cls }) => (
                                    <div key={l} className="stat">
                                      <p className="sl text-[7px] uppercase tracking-wide text-gray-400">{l}</p>
                                      <p className={`sv text-[12px] font-black ${cls}`}>
                                        {v > 0 ? `$${v.toFixed(0)}` : "—"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex justify-between rounded-lg bg-[#FBF8F0] px-3 py-1.5">
                            <span className="text-[8px] font-semibold uppercase tracking-widest text-[#B8860B]">
                              Total del día
                            </span>
                            <div className="flex gap-3 text-[10px]">
                              {dayTips > 0 && (
                                <span className="text-[#B8860B]">
                                  svc ${dayServices.toFixed(0)} + tips ${dayTips.toFixed(0)}
                                </span>
                              )}
                              <span className="font-black text-[#D4A017]">${dayTotal.toFixed(0)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Grand weekly total */}
              <div
                className="totals mt-5 rounded-2xl border-2 border-[#D4A017] p-4"
                style={{ background: "linear-gradient(135deg, #E8D5B0, #D4BC8C)" }}>
                <p className="mb-2.5 text-center text-[8px] font-bold uppercase tracking-widest text-[#8A6A20]">
                  Total de la semana
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { l: "Servicios", v: `$${grandWeeklyServices.toFixed(0)}`, cls: "text-xl text-[#0A0A0A]", border: "border-[#D4A01744]" },
                    { l: "Tips", v: grandWeeklyTips > 0 ? `$${grandWeeklyTips.toFixed(0)}` : "—", cls: "text-xl text-[#B8860B]", border: "border-[#D4A01744]" },
                    { l: "Total", v: `$${grandWeeklyTotal.toFixed(0)}`, cls: "text-2xl text-[#D4A017]", border: "border-2 border-[#D4A017]" },
                  ].map(({ l, v, cls, border }) => (
                    <div key={l} className={`tb rounded-xl border bg-white p-2.5 ${border}`}>
                      <p className="tl text-[7px] uppercase tracking-widest text-[#B8860B]">{l}</p>
                      <p className={`tv font-black ${cls}`}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
