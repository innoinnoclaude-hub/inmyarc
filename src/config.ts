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

/**
 * score = minutes x (efficiency / 5) x (impact / 5)
 *
 * Both at 5 keeps the whole of the time; every point below 5 removes 20% of
 * it. A task missing either rating scores nothing. Mirrors the SQL in
 * refresh_daily_score() — the database is the authority, this is the fallback
 * for a day whose rollup row does not exist yet.
 */
export function scoreFor(
  minutes: number | null,
  efficiency: number | null,
  impact: number | null,
): number {
  if (!minutes || !efficiency || !impact) return 0;
  return Math.round((minutes * efficiency * impact) / 25);
}

/** 5 -> "100%", 4 -> "80%" ... the share of the time a rating keeps. */
export function weightPercent(value: number | null): string {
  return value ? `${value * 20}%` : "—";
}
