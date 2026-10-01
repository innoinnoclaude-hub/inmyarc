/**
 * Single place to tune the portal.
 * Team members themselves live in the `members` table in Supabase
 * (see supabase/seed.sql) so the dropdown stays in sync for everyone.
 */
export const APP = {
  org: "InnovativeView",
  title: "Daily Log",
  /** Every "today" in the app is resolved in this timezone, not the viewer's. */
  timezone: "Asia/Kolkata",
} as const;

export type AttendanceKey =
  | "full_day"
  | "wfh"
  | "half_day"
  | "week_off"
  | "leave";

export const ATTENDANCE: {
  key: AttendanceKey;
  label: string;
  short: string;
  tone: "ok" | "live" | "wait" | "off" | "mute";
}[] = [
  { key: "full_day", label: "Full day", short: "Full day", tone: "ok" },
  { key: "wfh", label: "Work from home", short: "WFH", tone: "live" },
  { key: "half_day", label: "Half day", short: "Half day", tone: "wait" },
  { key: "week_off", label: "Week off", short: "Week off", tone: "mute" },
  { key: "leave", label: "Leave", short: "Leave", tone: "off" },
];

export const ATTENDANCE_BY_KEY = Object.fromEntries(
  ATTENDANCE.map((a) => [a.key, a]),
) as Record<AttendanceKey, (typeof ATTENDANCE)[number]>;

export type StatusKey = "done" | "not_done" | "rework";

/** One verdict per task. Anyone on the team can change it. */
export const STATUS: {
  key: StatusKey;
  label: string;
  short: string;
  tone: "ok" | "bad" | "wait";
}[] = [
  { key: "done", label: "Done", short: "Done", tone: "ok" },
  { key: "not_done", label: "Not done", short: "Not done", tone: "bad" },
  { key: "rework", label: "Rework required", short: "Rework", tone: "wait" },
];

export const STATUS_BY_KEY = Object.fromEntries(
  STATUS.map((s) => [s.key, s]),
) as Record<StatusKey, (typeof STATUS)[number]>;

/** 90 -> "1h 30m", 45 -> "45m", null -> "—" */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0) return "\u2014";
  if (minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/* ------------------------------ the verdict ------------------------------ */

/**
 * From 1 October 2026 work is not scored task by task. An admin judges the
 * whole person's day in one of five categories, and the board shows nothing
 * until that decision is made. The order here is the standing: extraordinary at
 * the top, not up to the mark at the bottom.
 *
 * Colours are flat background tints with ink dark enough to read on them — the
 * row and every task under it carry the tint, so a day's verdict is visible at
 * a glance without a legend.
 */
export type CategoryKey =
  | "extraordinary"
  | "over_performed"
  | "upto_mark"
  | "rework"
  | "not_upto_mark";

export const CATEGORIES: {
  key: CategoryKey;
  label: string;
  short: string;
  /** 1 is the top of the board. */
  rank: number;
  /** row tint */
  bg: string;
  /** border for chips on the tint */
  line: string;
  /** text and chip colour on the tint */
  ink: string;
}[] = [
  { key: "extraordinary",  label: "Extraordinary",      short: "Extraordinary", rank: 1,
    bg: "#f7d9e8", line: "#e3a8c8", ink: "#86215a" },
  { key: "over_performed", label: "Over performed",     short: "Over",          rank: 2,
    bg: "#d4e4f7", line: "#a3c2e6", ink: "#14447e" },
  { key: "upto_mark",      label: "Up to the mark",     short: "Up to mark",    rank: 3,
    bg: "#d6efdb", line: "#a3d4ad", ink: "#176234" },
  { key: "rework",         label: "Rework",             short: "Rework",        rank: 4,
    bg: "#fbeabd", line: "#e5cf8c", ink: "#78560a" },
  { key: "not_upto_mark",  label: "Not up to the mark", short: "Not up to mark", rank: 5,
    bg: "#fad7d2", line: "#eeb0a8", ink: "#8c2317" },
];

export const CATEGORY_BY_KEY = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, (typeof CATEGORIES)[number]>;

/**
 * Two brownies, one each, entirely the admin's call: a day stretched beyond
 * hours, and a day worked that nobody was meant to work.
 */
export type BrownieKey = "overtime" | "holiday";

export const BROWNIES: { key: BrownieKey; label: string; hint: string }[] = [
  { key: "overtime", label: "Overtime", hint: "Stayed well beyond the day" },
  { key: "holiday", label: "Holiday", hint: "Worked on a day off" },
];
