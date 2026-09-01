import { ATTENDANCE, scoreFor, type AttendanceKey, type StatusKey } from "../config";
import { shiftISO, todayISO } from "./date";
import type { DayLog, Entry } from "./types";

/** Everything the profile needs, fetched once. */
export interface ProfileData {
  entries: Entry[];
  dayLogs: DayLog[];
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  sub?: string;
}

export interface WeekdayStat {
  key: number; // 1 = Monday
  label: string;
  days: number;
  tasks: number;
  minutes: number;
  score: number;
  avgScore: number;
  avgEfficiency: number | null;
  avgImpact: number | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday = 1 … Sunday = 7, read in UTC so it never shifts with the viewer. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export function scoreOfEntry(e: Entry): number {
  return scoreFor(e.minutes, e.efficiency, e.impact);
}

/* ------------------------------- headline ------------------------------- */

export function totals(entries: Entry[]) {
  let tasks = 0;
  let done = 0;
  let rework = 0;
  let notDone = 0;
  let minutes = 0;
  let score = 0;
  let rated = 0;
  let effSum = 0;
  let impSum = 0;
  let assigned = 0;
  for (const e of entries) {
    tasks++;
    if (e.status === "done") done++;
    else if (e.status === "rework") rework++;
    else notDone++;
    if (e.minutes) minutes += e.minutes;
    score += scoreOfEntry(e);
    if (e.efficiency && e.impact) {
      rated++;
      effSum += e.efficiency;
      impSum += e.impact;
    }
    if (e.created_by === null) assigned++;
  }
  return {
    tasks,
    done,
    rework,
    notDone,
    minutes,
    score,
    rated,
    assigned,
    selfLogged: tasks - assigned,
    donePct: tasks ? Math.round((done / tasks) * 100) : 0,
    reworkPct: tasks ? Math.round((rework / tasks) * 100) : 0,
    avgEfficiency: rated ? effSum / rated : null,
    avgImpact: rated ? impSum / rated : null,
    avgTaskMinutes: tasks ? Math.round(minutes / tasks) : 0,
    /** Score earned per hour actually logged — quality of the time, not amount. */
    scorePerHour: minutes ? Math.round((score / minutes) * 60) : 0,
  };
}

/* ------------------------------- by day --------------------------------- */

export function byDay(entries: Entry[]) {
  const map = new Map<
    string,
    { tasks: number; minutes: number; score: number; rated: number; eff: number; imp: number }
  >();
  for (const e of entries) {
    const d =
      map.get(e.log_date) ??
      { tasks: 0, minutes: 0, score: 0, rated: 0, eff: 0, imp: 0 };
    d.tasks++;
    d.minutes += e.minutes ?? 0;
    d.score += scoreOfEntry(e);
    if (e.efficiency && e.impact) {
      d.rated++;
      d.eff += e.efficiency;
      d.imp += e.impact;
    }
    map.set(e.log_date, d);
  }
  return map;
}

/** The single best day by score. */
export function bestDay(entries: Entry[]) {
  let best: { date: string; score: number; tasks: number } | null = null;
  for (const [date, d] of byDay(entries)) {
    if (!best || d.score > best.score)
      best = { date, score: d.score, tasks: d.tasks };
  }
  return best && best.score > 0 ? best : null;
}

/** Consecutive days up to today on which anything was logged. */
export function streak(entries: Entry[], dayLogs: DayLog[]): number {
  const active = new Set<string>([
    ...entries.map((e) => e.log_date),
    ...dayLogs.map((d) => d.log_date),
  ]);
  let n = 0;
  let cursor = todayISO();
  // today may not be filled in yet, so allow the run to start yesterday
  if (!active.has(cursor)) cursor = shiftISO(cursor, -1);
  while (active.has(cursor)) {
    n++;
    cursor = shiftISO(cursor, -1);
  }
  return n;
}

/* ----------------------------- weekday shape ---------------------------- */

export function weekdayProfile(entries: Entry[]): WeekdayStat[] {
  const days = byDay(entries);
  const acc = WEEKDAYS.map((label, i) => ({
    key: i + 1,
    label,
    days: 0,
    tasks: 0,
    minutes: 0,
    score: 0,
    rated: 0,
    eff: 0,
    imp: 0,
  }));
  for (const [date, d] of days) {
    const slot = acc[weekdayOf(date) - 1];
    slot.days++;
    slot.tasks += d.tasks;
    slot.minutes += d.minutes;
    slot.score += d.score;
    slot.rated += d.rated;
    slot.eff += d.eff;
    slot.imp += d.imp;
  }
  return acc.map((a) => ({
    key: a.key,
    label: a.label,
    days: a.days,
    tasks: a.tasks,
    minutes: a.minutes,
    score: a.score,
    avgScore: a.days ? Math.round(a.score / a.days) : 0,
    avgEfficiency: a.rated ? a.eff / a.rated : null,
    avgImpact: a.rated ? a.imp / a.rated : null,
  }));
}

/** The weekday with the highest average efficiency, needing real data behind it. */
export function sharpestWeekday(stats: WeekdayStat[]): WeekdayStat | null {
  const withData = stats.filter((s) => s.avgEfficiency !== null && s.days >= 1);
  if (!withData.length) return null;
  return withData.reduce((a, b) =>
    (b.avgEfficiency ?? 0) > (a.avgEfficiency ?? 0) ? b : a,
  );
}

export function busiestWeekday(stats: WeekdayStat[]): WeekdayStat | null {
  const withData = stats.filter((s) => s.days >= 1);
  if (!withData.length) return null;
  return withData.reduce((a, b) => (b.avgScore > a.avgScore ? b : a));
}

/* ---------------------------- distributions ----------------------------- */

export function ratingSpread(entries: Entry[], field: "efficiency" | "impact"): Bar[] {
  const counts = [0, 0, 0, 0, 0];
  for (const e of entries) {
    const v = e[field];
    if (v && v >= 1 && v <= 5) counts[v - 1]++;
  }
  return counts.map((value, i) => ({
    key: String(i + 1),
    label: String(i + 1),
    value,
  }));
}

export function statusSpread(entries: Entry[]): { key: StatusKey; value: number }[] {
  const map: Record<StatusKey, number> = { done: 0, not_done: 0, rework: 0 };
  for (const e of entries) map[e.status]++;
  return (["done", "rework", "not_done"] as StatusKey[]).map((key) => ({
    key,
    value: map[key],
  }));
}

export function attendanceSpread(
  dayLogs: DayLog[],
): { key: AttendanceKey; label: string; value: number }[] {
  const map = new Map<AttendanceKey, number>();
  for (const d of dayLogs) map.set(d.attendance, (map.get(d.attendance) ?? 0) + 1);
  return ATTENDANCE.map((a) => ({
    key: a.key,
    label: a.label,
    value: map.get(a.key) ?? 0,
  }));
}

/* ------------------------------ activity -------------------------------- */

export interface ActivityCell {
  date: string;
  score: number;
  tasks: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** One cell per day for the last `days`, oldest first, in five flat steps. */
export function activityStrip(entries: Entry[], days = 84): ActivityCell[] {
  const byDate = byDay(entries);
  const cells: ActivityCell[] = [];
  const start = shiftISO(todayISO(), -(days - 1));
  const scores: number[] = [];
  for (let i = 0; i < days; i++) {
    const date = shiftISO(start, i);
    scores.push(byDate.get(date)?.score ?? 0);
  }
  const max = Math.max(...scores, 1);
  for (let i = 0; i < days; i++) {
    const date = shiftISO(start, i);
    const d = byDate.get(date);
    const score = d?.score ?? 0;
    const ratio = score / max;
    const level: ActivityCell["level"] =
      score === 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    cells.push({ date, score, tasks: d?.tasks ?? 0, level });
  }
  return cells;
}

/* ------------------------------ trend ----------------------------------- */

/** Score per calendar week, oldest first. */
export function weeklyTrend(entries: Entry[], weeks = 12): Bar[] {
  const byDate = byDay(entries);
  const out: Bar[] = [];
  const today = todayISO();
  const thisMonday = shiftISO(today, -(weekdayOf(today) - 1));
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = shiftISO(thisMonday, -7 * i);
    let score = 0;
    let tasks = 0;
    for (let d = 0; d < 7; d++) {
      const cell = byDate.get(shiftISO(monday, d));
      if (cell) {
        score += cell.score;
        tasks += cell.tasks;
      }
    }
    out.push({ key: monday, label: monday.slice(8), value: score, sub: `${tasks}` });
  }
  return out;
}
