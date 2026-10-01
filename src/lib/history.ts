import { useCallback, useEffect, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import { startOfMonth, startOfWeek, todayISO } from "./date";
import {
  CATEGORIES,
  CATEGORY_BY_KEY,
  type CategoryKey,
} from "../config";
import type { DayMark, Entry, Member } from "./types";

/**
 * Everything the review screens read, under the system that started on
 * 1 October 2026: what was logged, and what an admin made of each day. There
 * are no points to add up any more, so history is a tally of verdicts.
 */
export type Grain = "week" | "month";

export interface Tally {
  days: number;
  tasks: number;
  minutes: number;
  judged: number;
  brownies: number;
  overtime: number;
  holiday: number;
  /** How many days ended in each category. */
  byCategory: Record<CategoryKey, number>;
}

export function emptyTally(): Tally {
  return {
    days: 0,
    tasks: 0,
    minutes: 0,
    judged: 0,
    brownies: 0,
    overtime: 0,
    holiday: 0,
    byCategory: Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<
      CategoryKey,
      number
    >,
  };
}

export interface DayRow {
  member_id: string;
  log_date: string;
  tasks: number;
  minutes: number;
  mark: DayMark | null;
}

/** Monday of the week, or the first of the month — the bucket a day falls in. */
export function bucketOf(date: string, grain: Grain): string {
  return grain === "week" ? startOfWeek(date) : startOfMonth(date);
}

export function addTo(t: Tally, row: DayRow): Tally {
  t.days += 1;
  t.tasks += row.tasks;
  t.minutes += row.minutes;
  if (row.mark) {
    t.judged += 1;
    t.byCategory[row.mark.category] += 1;
    if (row.mark.overtime) t.overtime += 1;
    if (row.mark.holiday) t.holiday += 1;
    t.brownies += (row.mark.overtime ? 1 : 0) + (row.mark.holiday ? 1 : 0);
  }
  return t;
}

export function tallyOf(rows: DayRow[]): Tally {
  return rows.reduce((t, r) => addTo(t, r), emptyTally());
}

/**
 * The standing over a stretch of days.
 *
 * There is no score to sort by, so people are compared on the verdicts they
 * collected: most extraordinary days first, then over performed, and so on
 * down; a day not up to the mark counts against. Brownies settle what is left,
 * then the name. Anyone with no verdict at all sits at the bottom.
 */
export function compareTallies(a: Tally, b: Tally): number {
  for (const c of CATEGORIES) {
    const diff = b.byCategory[c.key] - a.byCategory[c.key];
    // the bottom two categories are a mark against, so fewer wins
    if (diff !== 0) return c.rank >= 4 ? -diff : diff;
  }
  return b.brownies - a.brownies;
}

export function leaderboard(
  members: Member[],
  rowsByMember: Map<string, DayRow[]>,
): { member: Member; tally: Tally; place: number | null }[] {
  const list = members.map((member) => ({
    member,
    tally: tallyOf(rowsByMember.get(member.id) ?? []),
  }));
  const sorted = list.sort(
    (x, y) =>
      // anyone with no verdict at all belongs at the bottom, whatever the rest did
      Number(x.tally.judged === 0) - Number(y.tally.judged === 0) ||
      compareTallies(x.tally, y.tally) ||
      x.member.name.localeCompare(y.member.name),
  );
  // people with the same spread of verdicts share a place
  const key = (t: Tally) =>
    CATEGORIES.map((c) => t.byCategory[c.key]).join("-") + `:${t.brownies}`;
  let place = 0;
  let previous: string | null = null;
  let seen = 0;
  return sorted.map((row) => {
    if (!row.tally.judged) return { ...row, place: null };
    seen += 1;
    const k = key(row.tally);
    if (k !== previous) {
      place = seen;
      previous = k;
    }
    return { ...row, place };
  });
}

/** The verdict a day ended on, for colouring a calendar or a strip. */
export function categoryOf(row: DayRow | undefined): CategoryKey | null {
  return row?.mark?.category ?? null;
}

export function categoryTint(key: CategoryKey | null): string {
  return key ? CATEGORY_BY_KEY[key].bg : "#eceae5";
}

/* ------------------------------- loading -------------------------------- */

interface State {
  members: Member[];
  rows: DayRow[];
  entries: Entry[];
  loading: boolean;
  error: string | null;
}

const EMPTY: State = {
  members: [],
  rows: [],
  entries: [],
  loading: true,
  error: null,
};

/**
 * Pulls the whole period in three reads and joins them here: the roster, every
 * task, and every verdict. The portal has one team and a few hundred rows a
 * month, so this is cheaper than asking the database to shape it.
 */
export function useHistory(open: boolean, from: string) {
  const [state, setState] = useState<State>(EMPTY);

  const load = useCallback(async () => {
    if (!isConfigured) return setState({ ...EMPTY, loading: false });
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const today = todayISO();
      const [m, e, k] = await Promise.all([
        supabase
          .from("members")
          .select("id,name,title,active")
          .order("name", { ascending: true }),
        supabase
          .from("entries")
          .select(
            "id,log_date,member_id,created_by,title,details,status,minutes,remarks,attachment_path,attachment_name,attachment_type,attachment_size,status_by,status_at,created_at,updated_at",
          )
          .gte("log_date", from)
          .lte("log_date", today),
        supabase
          .from("day_marks")
          .select("member_id,log_date,category,overtime,holiday,marked_at")
          .gte("log_date", from)
          .lte("log_date", today),
      ]);
      if (m.error) throw m.error;
      if (e.error) throw e.error;
      if (k.error) throw k.error;

      const entries = (e.data ?? []) as Entry[];
      const marks = (k.data ?? []) as DayMark[];
      const markAt = new Map(
        marks.map((x) => [`${x.member_id}:${x.log_date}`, x]),
      );
      const rowAt = new Map<string, DayRow>();
      for (const entry of entries) {
        const id = `${entry.member_id}:${entry.log_date}`;
        const row = rowAt.get(id) ?? {
          member_id: entry.member_id,
          log_date: entry.log_date,
          tasks: 0,
          minutes: 0,
          mark: markAt.get(id) ?? null,
        };
        row.tasks += 1;
        row.minutes += entry.minutes ?? 0;
        rowAt.set(id, row);
      }
      // a day can be judged without a task on it — keep it
      for (const mark of marks) {
        const id = `${mark.member_id}:${mark.log_date}`;
        if (!rowAt.has(id)) {
          rowAt.set(id, {
            member_id: mark.member_id,
            log_date: mark.log_date,
            tasks: 0,
            minutes: 0,
            mark,
          });
        }
      }
      setState({
        members: (m.data ?? []) as Member[],
        rows: [...rowAt.values()].sort((a, b) =>
          a.log_date.localeCompare(b.log_date),
        ),
        entries,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Could not load history.",
      }));
    }
  }, [from]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return { ...state, reload: load };
}
