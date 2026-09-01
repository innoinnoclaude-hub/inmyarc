import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import { todayISO } from "./date";
import type { DayLog, Entry, Member, RowGroup } from "./types";
import { scoreFor, type AttendanceKey, type StatusKey } from "../config";

export interface DraftEntry {
  title: string;
  details: string;
  status: StatusKey;
  hours: string;
  mins: string;
}

/** "2" + "30" -> 150. Blank on both sides means "not recorded". */
export function draftMinutes(d: Pick<DraftEntry, "hours" | "mins">): number | null {
  const h = Number.parseInt(d.hours, 10);
  const m = Number.parseInt(d.mins, 10);
  const total =
    (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  if (!Number.isFinite(h) && !Number.isFinite(m)) return null;
  return Math.min(Math.max(total, 0), 1440);
}

/** The per-day rollup the database maintains; the board's single source of
 *  truth for score, so the table and the graph can never disagree. */
export interface DayScore {
  member_id: string;
  score: number;
}

interface State {
  members: Member[];
  dayLogs: DayLog[];
  entries: Entry[];
  scores: DayScore[];
  loading: boolean;
  error: string | null;
}

const EMPTY: State = {
  members: [],
  dayLogs: [],
  entries: [],
  scores: [],
  loading: true,
  error: null,
};

function message(e: unknown): string {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  const err = e as { message?: string; hint?: string; details?: string };
  return err.message || err.details || err.hint || "Something went wrong.";
}

/**
 * Fallback for a day whose rollup row does not exist yet; the authority is
 * `daily_scores`, computed by a database trigger, so the board and the graph
 * cannot drift apart.
 */
export function scoreOf(entries: Entry[]): number {
  return entries.reduce(
    (sum, e) => sum + scoreFor(e.minutes, e.efficiency, e.impact),
    0,
  );
}

/**
 * Build the day's rows.
 *
 * Rows = everyone currently on the team, plus anyone retired who still has
 * something on this day, so archived days never lose their history.
 *
 * Order: alphabetical while the day is still empty, then ranked by score as
 * soon as the first entry lands. Ties fall back to alphabetical so the list
 * never jitters between equal scores, and they share a DENSE_RANK place.
 *
 * Pure and exported so the ordering can be tested without mounting the hook.
 */
export function buildGroups(
  members: Member[],
  dayLogs: DayLog[],
  entries: Entry[],
  scores: DayScore[] = [],
): RowGroup[] {
  const scoreByMember = new Map(scores.map((s) => [s.member_id, s.score]));
  const logByMember = new Map(dayLogs.map((d) => [d.member_id, d]));
  const entriesByMember = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = entriesByMember.get(entry.member_id);
    if (list) list.push(entry);
    else entriesByMember.set(entry.member_id, [entry]);
  }

  const rows = members
    .filter((m) => m.active || logByMember.has(m.id) || entriesByMember.has(m.id))
    .map((member) => {
      const own = entriesByMember.get(member.id) ?? [];
      return {
        member,
        dayLog: logByMember.get(member.id) ?? null,
        entries: own,
        // the database rollup is the authority; the local sum is only a
        // fallback for a day whose rollup row does not exist yet
        score: scoreByMember.get(member.id) ?? scoreOf(own),
      };
    });

  if (entries.length === 0) {
    // the query already returns A-Z; number the rows in that order
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  const sorted = rows.sort(
    (a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name),
  );

  // DENSE_RANK: the place only advances when the score actually changes
  let place = 0;
  let previous: number | null = null;
  return sorted.map((r) => {
    if (previous === null || r.score !== previous) {
      place += 1;
      previous = r.score;
    }
    return { ...r, rank: place };
  });
}

/**
 * `passcode` is null until someone unlocks a past day. Writes to today go
 * straight at the tables; writes to a locked day go through the passcode-gated
 * functions instead, because RLS refuses the direct route.
 */
export function useDashboard(date: string, passcode: string | null) {
  const [state, setState] = useState<State>(EMPTY);
  const [busy, setBusy] = useState(false);
  const dateRef = useRef(date);
  dateRef.current = date;
  const passRef = useRef(passcode);
  passRef.current = passcode;

  /** A past day is locked; only today is directly writable. */
  const locked = date !== todayISO();
  // Read through a ref inside the mutations: they are memoised on `run` alone,
  // so a plain closure over `locked` would keep whatever it was at mount and a
  // past-day write would silently take the direct route and be dropped by RLS.
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  /**
   * PostgREST answers 204 for a write that RLS filtered down to zero rows, so
   * "succeeded" and "silently changed nothing" look identical. Every direct
   * write therefore asks for its rows back and fails loudly when none come.
   */
  const affected = <T,>(res: { data: T[] | null; error: unknown }): T[] => {
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    if (rows.length === 0) {
      throw new Error(
        "Nothing changed. The entry may have been removed by someone else, " +
          "or this day is locked and needs the admin page.",
      );
    }
    return rows;
  };

  const needPass = () => {
    const p = passRef.current;
    if (!p) throw new Error("This day is locked. Unlock it with the passcode.");
    return p;
  };

  const load = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      // App.tsx renders a dedicated setup panel for this case
      if (!isConfigured) {
        setState({ ...EMPTY, loading: false });
        return;
      }
      const target = dateRef.current;
      if (!opts.quiet) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const [m, d, e, sc] = await Promise.all([
          supabase
            .from("members")
            .select("id,name,title,active")
            .order("name", { ascending: true }),
          supabase
            .from("day_logs")
            .select("id,member_id,log_date,attendance,note,updated_at")
            .eq("log_date", target),
          supabase
            .from("entries")
            .select(
              "id,log_date,member_id,created_by,title,details,status,minutes,efficiency,impact,remarks,status_by,status_at,created_at,updated_at",
            )
            .eq("log_date", target)
            .order("created_at", { ascending: true }),
          supabase
            .from("daily_scores")
            .select("member_id,score")
            .eq("log_date", target),
        ]);
        if (m.error) throw m.error;
        if (d.error) throw d.error;
        if (e.error) throw e.error;
        if (sc.error) throw sc.error;
        if (dateRef.current !== target) return; // a newer date won the race
        setState({
          members: (m.data ?? []) as Member[],
          dayLogs: (d.data ?? []) as DayLog[],
          entries: (e.data ?? []) as Entry[],
          scores: (sc.data ?? []) as DayScore[],
          loading: false,
          error: null,
        });
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: message(err) }));
      }
    },
    [],
  );

  // initial + on date change
  useEffect(() => {
    void load();
  }, [date, load]);

  // live updates from anyone else on the team
  useEffect(() => {
    if (!isConfigured) return;
    const channel = supabase
      .channel(`daily-log:${date}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entries" },
        () => void load({ quiet: true }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_logs" },
        () => void load({ quiet: true }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_scores" },
        () => void load({ quiet: true }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [date, load]);

  // safety net: refresh when the tab comes back into focus
  useEffect(() => {
    const onFocus = () => void load({ quiet: true });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  /** Only active people are offered in the dropdowns. */
  const roster = useMemo(
    () => state.members.filter((m) => m.active),
    [state.members],
  );

  const groups = useMemo<RowGroup[]>(
    () =>
      buildGroups(state.members, state.dayLogs, state.entries, state.scores),
    [state.members, state.dayLogs, state.entries, state.scores],
  );

  const memberById = useMemo(
    () => new Map(state.members.map((m) => [m.id, m])),
    [state.members],
  );

  /* ------------------------------ mutations ------------------------------ */

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        const out = await fn();
        await load({ quiet: true });
        return out;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  /** Log my own day: attendance + one or more work entries. */
  const submitDay = useCallback(
    (input: {
      memberId: string;
      attendance: AttendanceKey;
      note: string;
      entries: DraftEntry[];
    }) =>
      run(async () => {
        const target = dateRef.current;
        if (lockedRef.current) {
          const pass = needPass();
          const { error: dayError } = await supabase.rpc("admin_set_day", {
            p_pass: pass,
            p_member: input.memberId,
            p_date: target,
            p_attendance: input.attendance,
            p_note: input.note.trim() || null,
          });
          if (dayError) throw dayError;
          const rows = input.entries.filter((e) => e.title.trim().length > 0);
          for (const e of rows) {
            const { error } = await supabase.rpc("admin_insert_entry", {
              p_pass: pass,
              p_log_date: target,
              p_member: input.memberId,
              p_created_by: input.memberId,
              p_title: e.title.trim(),
              p_details: e.details.trim() || null,
              p_status: e.status,
              p_minutes: draftMinutes(e),
            });
            if (error) throw error;
          }
          return rows.length;
        }

        affected(
          await supabase
            .from("day_logs")
            .upsert(
              {
                member_id: input.memberId,
                log_date: target,
                attendance: input.attendance,
                note: input.note.trim() || null,
              },
              { onConflict: "member_id,log_date" },
            )
            .select("id"),
        );

        // every row must carry an identical set of keys — PostgREST rejects a
        // bulk insert whose objects have uneven keys
        const rows = input.entries
          .filter((e) => e.title.trim().length > 0)
          .map((e) => ({
            log_date: target,
            member_id: input.memberId,
            created_by: input.memberId,
            title: e.title.trim(),
            details: e.details.trim() || null,
            status: e.status,
            minutes: draftMinutes(e),
          }));
        if (rows.length) {
          affected(await supabase.from("entries").insert(rows).select("id"));
        }
        return rows.length;
      }),
    [run],
  );

  /**
   * Assign a task to anyone on the board. The portal deliberately does not ask
   * who is assigning it, so `created_by` stays null — that null is exactly what
   * marks the row as assigned rather than self-logged.
   */
  const assignTask = useCallback(
    (input: {
      memberId: string;
      logDate: string;
      title: string;
      details: string;
    }) =>
      run(async () => {
        if (input.logDate !== todayISO()) {
          const { error } = await supabase.rpc("admin_insert_entry", {
            p_pass: needPass(),
            p_log_date: input.logDate,
            p_member: input.memberId,
            p_created_by: null,
            p_title: input.title.trim(),
            p_details: input.details.trim() || null,
            p_status: "not_done",
            p_minutes: null,
          });
          if (error) throw error;
          return;
        }
        affected(
          await supabase
            .from("entries")
            .insert({
              log_date: input.logDate,
              member_id: input.memberId,
              created_by: null,
              title: input.title.trim(),
              details: input.details.trim() || null,
              status: "not_done",
            })
            .select("id"),
        );
      }),
    [run],
  );

  /** Anyone can set a task's verdict; we keep who did it and when. */
  const setStatus = useCallback(
    (entryId: string, status: StatusKey, actorId: string | null) =>
      run(async () => {
        const patch = {
          status,
          status_by: actorId,
          status_at: new Date().toISOString(),
        };
        if (lockedRef.current) {
          const { error } = await supabase.rpc("admin_update_entry", {
            p_pass: needPass(),
            p_id: entryId,
            p_patch: patch,
          });
          if (error) throw error;
          return;
        }
        affected(
          await supabase
            .from("entries")
            .update(patch)
            .eq("id", entryId)
            .select("id"),
        );
      }),
    [run],
  );

  /**
   * Add a single task for anyone, on the day being viewed. Used by the admin
   * page, so it has to work on a locked day as well as today.
   */
  const addEntry = useCallback(
    (input: {
      memberId: string;
      title: string;
      details: string;
      status: StatusKey;
      minutes: number | null;
      assigned: boolean;
    }) =>
      run(async () => {
        const target = dateRef.current;
        const createdBy = input.assigned ? null : input.memberId;
        if (lockedRef.current) {
          const { error } = await supabase.rpc("admin_insert_entry", {
            p_pass: needPass(),
            p_log_date: target,
            p_member: input.memberId,
            p_created_by: createdBy,
            p_title: input.title.trim(),
            p_details: input.details.trim() || null,
            p_status: input.status,
            p_minutes: input.minutes,
          });
          if (error) throw error;
          return;
        }
        affected(
          await supabase
            .from("entries")
            .insert({
              log_date: target,
              member_id: input.memberId,
              created_by: createdBy,
              title: input.title.trim(),
              details: input.details.trim() || null,
              status: input.status,
              minutes: input.minutes,
            })
            .select("id"),
        );
      }),
    [run],
  );

  /** Edit a task in place. Only the keys passed are touched. */
  const updateEntry = useCallback(
    (
      entryId: string,
      patch: {
        title: string;
        details: string;
        status: StatusKey;
        minutes: number | null;
        remarks: string;
        statusChanged: boolean;
        actorId: string | null;
      },
    ) =>
      run(async () => {
        // `rating` is deliberately absent: it is only settable at /rating
        const fields = {
            title: patch.title.trim(),
            details: patch.details.trim() || null,
            status: patch.status,
            minutes: patch.minutes,
            remarks: patch.remarks.trim().slice(0, 500) || null,
            ...(patch.statusChanged
              ? {
                  status_by: patch.actorId,
                  status_at: new Date().toISOString(),
                }
              : {}),
        };
        if (lockedRef.current) {
          const { error } = await supabase.rpc("admin_update_entry", {
            p_pass: needPass(),
            p_id: entryId,
            p_patch: fields,
          });
          if (error) throw error;
          return;
        }
        affected(
          await supabase
            .from("entries")
            .update(fields)
            .eq("id", entryId)
            .select("id"),
        );
      }),
    [run],
  );

  /**
   * Neither rating is writable directly — the columns are not in anon's grant,
   * so both go through their passcode-gated function.
   */
  const setImpact = useCallback(
    (entryId: string, value: number | null) =>
      run(async () => {
        const { error } = await supabase.rpc("set_impact", {
          p_pass: needPass(),
          p_id: entryId,
          p_value: value,
        });
        if (error) throw error;
      }),
    [run],
  );

  const setEfficiency = useCallback(
    (entryId: string, value: number | null) =>
      run(async () => {
        const { error } = await supabase.rpc("set_efficiency", {
          p_pass: needPass(),
          p_id: entryId,
          p_value: value,
        });
        if (error) throw error;
      }),
    [run],
  );

  const setRemarks = useCallback(
    (entryId: string, remarks: string) =>
      run(async () => {
        const value = remarks.trim().slice(0, 500) || null;
        if (lockedRef.current) {
          const { error } = await supabase.rpc("admin_update_entry", {
            p_pass: needPass(),
            p_id: entryId,
            p_patch: { remarks: value },
          });
          if (error) throw error;
          return;
        }
        affected(
          await supabase
            .from("entries")
            .update({ remarks: value })
            .eq("id", entryId)
            .select("id"),
        );
      }),
    [run],
  );

  const deleteEntry = useCallback(
    (entryId: string) =>
      run(async () => {
        if (lockedRef.current) {
          const { error } = await supabase.rpc("admin_delete_entry", {
            p_pass: needPass(),
            p_id: entryId,
          });
          if (error) throw error;
          return;
        }
        affected(
          await supabase.from("entries").delete().eq("id", entryId).select("id"),
        );
      }),
    [run],
  );

  const setAttendance = useCallback(
    (memberId: string, attendance: AttendanceKey) =>
      run(async () => {
        if (lockedRef.current) {
          const { error } = await supabase.rpc("admin_set_day", {
            p_pass: needPass(),
            p_member: memberId,
            p_date: dateRef.current,
            p_attendance: attendance,
            p_note: null,
          });
          if (error) throw error;
          return;
        }
        affected(
          await supabase
            .from("day_logs")
            .upsert(
              { member_id: memberId, log_date: dateRef.current, attendance },
              { onConflict: "member_id,log_date" },
            )
            .select("id"),
        );
      }),
    [run],
  );

  return {
    ...state,
    busy,
    locked,
    roster,
    groups,
    memberById,
    reload: load,
    submitDay,
    assignTask,
    setStatus,
    addEntry,
    updateEntry,
    setImpact,
    setEfficiency,
    setRemarks,
    deleteEntry,
    setAttendance,
  };
}
