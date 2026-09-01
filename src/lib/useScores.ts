import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import type { Member } from "./types";
import {
  addMonths,
  dateShort,
  monthShort,
  shiftISO,
  startOfMonth,
  startOfWeek,
  todayISO,
  yearOf,
} from "./date";

export type Grain = "week" | "month";

/** How many buckets each view shows. */
export const SPAN: Record<Grain, number> = { week: 12, month: 12 };

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

export interface Bucket {
  key: string;
  label: string;
  /** Year, shown only when it changes along the axis. */
  sub: string;
  tasks: number;
  done: number;
  minutes: number;
  score: number;
  avgImpact: number | null;
  avgEfficiency: number | null;
  days: number;
}

export interface MemberTotal {
  member: Member;
  tasks: number;
  minutes: number;
  score: number;
  avgImpact: number | null;
  avgEfficiency: number | null;
}

const EMPTY_AGG = {
  tasks: 0,
  done: 0,
  minutes: 0,
  score: 0,
  rated: 0,
  impactSum: 0,
  efficiencySum: 0,
};

/** The first day covered by a view ending today. */
export function rangeStart(grain: Grain): string {
  const today = todayISO();
  return grain === "week"
    ? shiftISO(startOfWeek(today), -7 * (SPAN.week - 1))
    : addMonths(startOfMonth(today), -(SPAN.month - 1));
}

/** Which bucket a given day belongs to. */
function bucketOf(date: string, grain: Grain): string {
  return grain === "week" ? startOfWeek(date) : startOfMonth(date);
}

/** Every bucket in the view, oldest first — including the empty ones. */
export function bucketKeys(grain: Grain): string[] {
  const start = rangeStart(grain);
  return Array.from({ length: SPAN[grain] }, (_, i) =>
    grain === "week" ? shiftISO(start, i * 7) : addMonths(start, i),
  );
}

/**
 * Roll daily rows up into the view's buckets. Pure and exported so the
 * bucketing can be checked against the database without mounting the hook.
 * Pass memberId = null for the whole team.
 */
export function aggregateSeries(
  rows: ScoreRow[],
  grain: Grain,
  memberId: string | null,
): Bucket[] {
  const agg = new Map<string, typeof EMPTY_AGG & { days: Set<string> }>();
  for (const key of bucketKeys(grain)) {
    agg.set(key, { ...EMPTY_AGG, days: new Set() });
  }
  for (const r of rows) {
    if (memberId && r.member_id !== memberId) continue;
    const slot = agg.get(bucketOf(r.log_date, grain));
    if (!slot) continue;
    slot.tasks += r.tasks;
    slot.done += r.done;
    slot.minutes += r.minutes;
    slot.score += r.score;
    slot.rated += r.rated;
    slot.impactSum += r.impact_sum;
    slot.efficiencySum += r.efficiency_sum;
    slot.days.add(r.log_date);
  }
  let lastYear = "";
  return [...agg.entries()].map(([key, v]) => {
    const year = yearOf(key);
    const sub = year === lastYear ? "" : year;
    lastYear = year;
    return {
      key,
      label: grain === "week" ? dateShort(key) : monthShort(key),
      sub,
      tasks: v.tasks,
      done: v.done,
      minutes: v.minutes,
      score: v.score,
      avgImpact: v.rated ? v.impactSum / v.rated : null,
      avgEfficiency: v.rated ? v.efficiencySum / v.rated : null,
      days: v.days.size,
    };
  });
}

/** The rows belonging to one bucket of the current view. */
export function rowsInBucket(
  rows: ScoreRow[],
  grain: Grain,
  key: string,
): ScoreRow[] {
  return rows.filter((r) => bucketOf(r.log_date, grain) === key);
}

/** Everyone's totals over the visible range, best first. */
export function aggregateLeaderboard(
  rows: ScoreRow[],
  members: Member[],
): MemberTotal[] {
  const agg = new Map<string, typeof EMPTY_AGG>();
  for (const r of rows) {
    const slot = agg.get(r.member_id) ?? { ...EMPTY_AGG };
    slot.tasks += r.tasks;
    slot.minutes += r.minutes;
    slot.score += r.score;
    slot.rated += r.rated;
    slot.impactSum += r.impact_sum;
    slot.efficiencySum += r.efficiency_sum;
    agg.set(r.member_id, slot);
  }
  return members
    .map((member) => {
      const v = agg.get(member.id) ?? EMPTY_AGG;
      return {
        member,
        tasks: v.tasks,
        minutes: v.minutes,
        score: v.score,
        avgImpact: v.rated ? v.impactSum / v.rated : null,
      avgEfficiency: v.rated ? v.efficiencySum / v.rated : null,
      };
    })
    .sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name));
}

export interface RankStats {
  /** Rank in each bucket, or null where that person logged nothing. */
  perBucket: (number | null)[];
  /** Mean of the buckets they were actually active in. */
  avg: number | null;
  /** Their standing over the whole visible range. */
  overall: number | null;
  /** Always the full team size, so "4.2 of 15" reads honestly. */
  total: number;
}

/**
 * Where one person places against the team.
 *
 * DENSE_RANK: equal scores share a place and the next place follows
 * immediately (1, 2, 2, 3). A bucket where the person logged nothing is skipped
 * rather than counted as last — otherwise a week of leave would drag the
 * average down. So this reads as "when they worked, where did they land".
 */
export function rankStats(
  rows: ScoreRow[],
  grain: Grain,
  memberId: string,
  members: Member[],
): RankStats {
  const total = members.length;
  const perBucket = bucketKeys(grain).map((key) => {
    const scores = new Map<string, number>(members.map((m) => [m.id, 0]));
    let active = false;
    for (const r of rows) {
      if (bucketOf(r.log_date, grain) !== key) continue;
      if (!scores.has(r.member_id)) continue;
      scores.set(r.member_id, (scores.get(r.member_id) ?? 0) + r.score);
      if (r.member_id === memberId && r.tasks > 0) active = true;
    }
    if (!active) return null;
    const mine = scores.get(memberId) ?? 0;
    // dense: count DISTINCT better scores, not how many people hold them
    const better = new Set<number>();
    for (const v of scores.values()) if (v > mine) better.add(v);
    return better.size + 1;
  });

  const seen = perBucket.filter((r): r is number => r !== null);
  const board = aggregateLeaderboard(rows, members);
  const mineTotal = board.find((b) => b.member.id === memberId)?.score ?? 0;
  const overall = board.some((b) => b.score > 0)
    ? new Set(board.filter((b) => b.score > mineTotal).map((b) => b.score)).size + 1
    : null;

  return {
    perBucket,
    avg: seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : null,
    overall,
    total,
  };
}

/** 1 -> "1st", 2 -> "2nd", 13 -> "13th" */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export function useScores(open: boolean, grain: Grain) {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("daily_scores")
        .select("member_id,log_date,tasks,done,minutes,rated,impact_sum,efficiency_sum,score")
        .gte("log_date", rangeStart(grain))
        .lte("log_date", todayISO());
      if (error) throw error;
      setRows((data ?? []) as ScoreRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [grain]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // keep the chart in step with anything rated while it is open
  useEffect(() => {
    if (!open || !isConfigured) return;
    const channel = supabase
      .channel("scores-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_scores" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, load]);

  const seriesFor = useCallback(
    (memberId: string | null) => aggregateSeries(rows, grain, memberId),
    [rows, grain],
  );

  /**
   * The standing over the whole visible range, or over one bucket of it when a
   * week or month is picked — so "who led" answers the period on screen rather
   * than always the last twelve.
   */
  const leaderboard = useCallback(
    (members: Member[], bucket?: string | null) =>
      aggregateLeaderboard(
        bucket ? rowsInBucket(rows, grain, bucket) : rows,
        members,
      ),
    [rows, grain],
  );

  const ranksFor = useCallback(
    (memberId: string, members: Member[]) =>
      rankStats(rows, grain, memberId, members),
    [rows, grain],
  );

  const hasAny = useMemo(() => rows.length > 0, [rows]);

  return {
    loading,
    error,
    seriesFor,
    leaderboard,
    ranksFor,
    hasAny,
    reload: load,
  };
}
