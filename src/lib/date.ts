import { APP } from "../config";

const iso = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as YYYY-MM-DD, resolved in the org timezone. */
export function todayISO(): string {
  return iso.format(new Date());
}

/** Shift an ISO date string by whole days without touching timezones. */
export function shiftISO(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const n = new Date(t);
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(
    n.getUTCDate(),
  ).padStart(2, "0")}`;
}

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "Friday" */
export function weekdayLong(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parts(date));
}

/** "22 August 2026" */
export function dateLong(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parts(date));
}

/** "22 Aug" */
export function dateShort(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parts(date));
}

/** "14:32" in the org timezone. */
export function clock(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: APP.timezone,
  }).format(new Date(timestamp));
}

export function isWeekend(date: string): boolean {
  const day = parts(date).getUTCDay();
  return day === 0 || day === 6;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const d = parts(date);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return shiftISO(date, -dow);
}

/** First day of the month containing `date`. */
export function startOfMonth(date: string): string {
  const [y, m] = date.split("-");
  return `${y}-${m}-01`;
}

/** Shift by whole months, clamping to the first of the month. */
export function addMonths(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}-01`;
}

/** "Aug" — en-US so every month is three letters and the axis stays even
 *  (en-GB renders September as "Sept"). */
export function monthShort(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(parts(date));
}

/** "2026" */
export function yearOf(date: string): string {
  return date.slice(0, 4);
}
