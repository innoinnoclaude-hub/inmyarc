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

/* ========================================================================
 * Team-relative analytics
 *
 * Everything below needs the whole team's history, not just one person's,
 * because position only means something against everybody else.
 * ====================================================================== */

export interface ScoreRow {
  member_id: string;
  log_date: string;
  tasks: number;
  done: number;
  minutes: number;
  rated: number;
  impact_sum: number;
  efficiency_sum: number;
  score: number;
}

/**
 * DENSE_RANK by score within each day, across every member on the portal —
 * the same rule the board uses, so a position here matches what was on screen
 * that day. Members with nothing logged that day are not ranked at all.
 */
export function dailyRanks(rows: ScoreRow[]): Map<string, Map<string, number>> {
  const byDate = new Map<string, ScoreRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.log_date);
    if (list) list.push(r);
    else byDate.set(r.log_date, [r]);
  }
  const out = new Map<string, Map<string, number>>();
  for (const [date, list] of byDate) {
    const scores = [...new Set(list.map((r) => r.score))].sort((a, b) => b - a);
    const rank = new Map<string, number>();
    for (const r of list) rank.set(r.member_id, scores.indexOf(r.score) + 1);
    out.set(date, rank);
  }
  return out;
}

/** Average position over the days this person actually logged something. */
export function averagePosition(
  ranks: Map<string, Map<string, number>>,
  memberId: string,
): { avg: number | null; days: number; best: number | null } {
  let sum = 0;
  let days = 0;
  let best: number | null = null;
  for (const perDay of ranks.values()) {
    const r = perDay.get(memberId);
    if (r == null) continue;
    sum += r;
    days++;
    if (best === null || r < best) best = r;
  }
  return { avg: days ? sum / days : null, days, best };
}

export interface PerDay {
  days: number;
  score: number;
  tasks: number;
  minutes: number;
  done: number;
  rated: number;
  efficiency: number | null;
  impact: number | null;
  scorePerHour: number;
  donePct: number;
}

function shape(
  days: number,
  score: number,
  tasks: number,
  minutes: number,
  done: number,
  rated: number,
  effSum: number,
  impSum: number,
): PerDay {
  return {
    days,
    score: days ? Math.round(score / days) : 0,
    tasks: days ? +(tasks / days).toFixed(1) : 0,
    minutes: days ? Math.round(minutes / days) : 0,
    done: days ? +(done / days).toFixed(1) : 0,
    rated,
    efficiency: rated ? effSum / rated : null,
    impact: rated ? impSum / rated : null,
    scorePerHour: minutes ? Math.round((score / minutes) * 60) : 0,
    donePct: tasks ? Math.round((done / tasks) * 100) : 0,
  };
}

/** One person's averages, over the days they logged something. */
export function memberPerDay(rows: ScoreRow[], memberId: string): PerDay {
  const mine = rows.filter((r) => r.member_id === memberId && r.tasks > 0);
  return shape(
    mine.length,
    mine.reduce((s, r) => s + r.score, 0),
    mine.reduce((s, r) => s + r.tasks, 0),
    mine.reduce((s, r) => s + r.minutes, 0),
    mine.reduce((s, r) => s + r.done, 0),
    mine.reduce((s, r) => s + r.rated, 0),
    mine.reduce((s, r) => s + r.efficiency_sum, 0),
    mine.reduce((s, r) => s + r.impact_sum, 0),
  );
}

/**
 * The team's averages on the same footing: the unit is one person-day, and a
 * person only counts on a day they logged at least one task. Someone who never
 * logs never drags the average down.
 */
export function teamPerDay(rows: ScoreRow[]): PerDay {
  const active = rows.filter((r) => r.tasks > 0);
  return shape(
    active.length,
    active.reduce((s, r) => s + r.score, 0),
    active.reduce((s, r) => s + r.tasks, 0),
    active.reduce((s, r) => s + r.minutes, 0),
    active.reduce((s, r) => s + r.done, 0),
    active.reduce((s, r) => s + r.rated, 0),
    active.reduce((s, r) => s + r.efficiency_sum, 0),
    active.reduce((s, r) => s + r.impact_sum, 0),
  );
}

/* ----------------------------- month grid ------------------------------- */

export interface DayCell {
  date: string;
  inMonth: boolean;
  tasks: number;
  minutes: number;
  score: number;
  rank: number | null;
  /** 0 = nothing logged, 1 = worst position, 5 = best. */
  level: 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * A Monday-first calendar for one month, padded to whole weeks. Shade comes
 * from position that day rather than raw score, so the darkest square always
 * means "led the team", whatever the numbers happened to be.
 */
export function monthGrid(
  monthStart: string,
  rows: ScoreRow[],
  memberId: string,
  teamSize: number,
): DayCell[] {
  const ranks = dailyRanks(rows);
  const mine = new Map(
    rows.filter((r) => r.member_id === memberId).map((r) => [r.log_date, r]),
  );
  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = weekdayOf(monthStart); // 1 = Monday
  const cells: DayCell[] = [];

  const push = (date: string, inMonth: boolean) => {
    const row = inMonth ? mine.get(date) : undefined;
    const rank = inMonth ? (ranks.get(date)?.get(memberId) ?? null) : null;
    let level: DayCell["level"] = 0;
    if (row && row.tasks > 0 && rank) {
      // best position -> 5, worst -> 1
      const share = (teamSize - rank + 1) / Math.max(teamSize, 1);
      level = Math.min(5, Math.max(1, Math.ceil(share * 5))) as DayCell["level"];
    }
    cells.push({
      date,
      inMonth,
      tasks: row?.tasks ?? 0,
      minutes: row?.minutes ?? 0,
      score: row?.score ?? 0,
      rank,
      level,
    });
  };

  for (let i = firstWeekday - 1; i > 0; i--) push(shiftISO(monthStart, -i), false);
  for (let d = 0; d < daysInMonth; d++) push(shiftISO(monthStart, d), true);
  while (cells.length % 7 !== 0)
    push(shiftISO(cells[cells.length - 1].date, 1), false);
  return cells;
}

/* ---------------------------- weekly series ----------------------------- */

export interface WeekPoint {
  key: string;
  label: string;
  score: number;
  tasks: number;
  efficiency: number | null;
  impact: number | null;
  /** Mean position that week, over the days they logged. Null = no activity. */
  position: number | null;
}

export function weeklySeries(
  rows: ScoreRow[],
  memberId: string,
  weeks = 12,
): WeekPoint[] {
  const ranks = dailyRanks(rows);
  const mine = rows.filter((r) => r.member_id === memberId);
  const today = todayISO();
  const thisMonday = shiftISO(today, -(weekdayOf(today) - 1));
  const out: WeekPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = shiftISO(thisMonday, -7 * i);
    const days = Array.from({ length: 7 }, (_, d) => shiftISO(monday, d));
    const inWeek = mine.filter((r) => days.includes(r.log_date) && r.tasks > 0);
    const rated = inWeek.reduce((s, r) => s + r.rated, 0);
    let rankSum = 0;
    let rankDays = 0;
    for (const d of days) {
      const r = ranks.get(d)?.get(memberId);
      if (r != null && mine.find((x) => x.log_date === d && x.tasks > 0)) {
        rankSum += r;
        rankDays++;
      }
    }
    out.push({
      key: monday,
      label: monday,
      score: inWeek.reduce((s, r) => s + r.score, 0),
      tasks: inWeek.reduce((s, r) => s + r.tasks, 0),
      efficiency: rated
        ? inWeek.reduce((s, r) => s + r.efficiency_sum, 0) / rated
        : null,
      impact: rated ? inWeek.reduce((s, r) => s + r.impact_sum, 0) / rated : null,
      position: rankDays ? rankSum / rankDays : null,
    });
  }
  return out;
}

/**
 * The two people to plot against: whoever sits either side of this person in
 * the all-time standing. At the very top that is 2nd and 3rd; at the very
 * bottom it is the two above; anywhere else it is the one above and the one
 * below, so the comparison is always to near neighbours rather than extremes.
 */
export function neighbours(
  rows: ScoreRow[],
  memberId: string,
  members: { id: string; name: string }[],
): { id: string; name: string; place: number }[] {
  const total = new Map<string, number>();
  for (const r of rows)
    total.set(r.member_id, (total.get(r.member_id) ?? 0) + r.score);
  const standing = members
    .map((m) => ({ ...m, score: total.get(m.id) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const i = standing.findIndex((m) => m.id === memberId);
  if (i < 0 || standing.length < 2) return [];
  const pick =
    i === 0
      ? [1, 2]
      : i === standing.length - 1
        ? [i - 1, i - 2]
        : [i - 1, i + 1];
  return pick
    .filter((j) => j >= 0 && j < standing.length)
    .map((j) => ({ id: standing[j].id, name: standing[j].name, place: j + 1 }));
}

/* --------------------------- selectable series --------------------------- */

/** One point on the trend chart, whatever the grain. */
export interface SeriesPoint {
  key: string;
  label: string;
  score: number;
  tasks: number;
  efficiency: number | null;
  impact: number | null;
  /** Position that day, or the mean over the active days of that week. */
  position: number | null;
}

/** Every Monday that has a day inside this month, oldest first. */
export function weeksInMonth(monthStart: string): string[] {
  const [y, m] = monthStart.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  let cursor = shiftISO(monthStart, -(weekdayOf(monthStart) - 1));
  const last = shiftISO(monthStart, days - 1);
  while (cursor <= last) {
    out.push(cursor);
    cursor = shiftISO(cursor, 7);
  }
  return out;
}

export function daysInWeek(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftISO(monday, i));
}

const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pointFor(
  rows: ScoreRow[],
  ranks: Map<string, Map<string, number>>,
  memberId: string,
  dates: string[],
  key: string,
  label: string,
): SeriesPoint {
  const mine = rows.filter(
    (r) => r.member_id === memberId && dates.includes(r.log_date) && r.tasks > 0,
  );
  const rated = mine.reduce((s, r) => s + r.rated, 0);
  let rankSum = 0;
  let rankDays = 0;
  for (const d of dates) {
    const r = ranks.get(d)?.get(memberId);
    if (r != null && mine.some((x) => x.log_date === d)) {
      rankSum += r;
      rankDays++;
    }
  }
  return {
    key,
    label,
    score: mine.reduce((s, r) => s + r.score, 0),
    tasks: mine.reduce((s, r) => s + r.tasks, 0),
    efficiency: rated
      ? mine.reduce((s, r) => s + r.efficiency_sum, 0) / rated
      : null,
    impact: rated ? mine.reduce((s, r) => s + r.impact_sum, 0) / rated : null,
    position: rankDays ? rankSum / rankDays : null,
  };
}

/** One point per week. */
export function pointsForWeeks(
  rows: ScoreRow[],
  memberId: string,
  mondays: string[],
): SeriesPoint[] {
  const ranks = dailyRanks(rows);
  return mondays.map((monday) =>
    pointFor(rows, ranks, memberId, daysInWeek(monday), monday, monday),
  );
}

/** One point per day of a single week, Monday first. */
export function pointsForDays(
  rows: ScoreRow[],
  memberId: string,
  monday: string,
): SeriesPoint[] {
  const ranks = dailyRanks(rows);
  return daysInWeek(monday).map((date, i) =>
    pointFor(rows, ranks, memberId, [date], date, WEEKDAY_LABEL[i]),
  );
}
