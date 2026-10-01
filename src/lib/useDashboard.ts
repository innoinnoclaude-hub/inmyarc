import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import { todayISO } from "./date";
import type { DayLog, DayMark, Entry, Member, RowGroup } from "./types";
import { CATEGORY_BY_KEY, type AttendanceKey, type CategoryKey, type StatusKey } from "../config";
import {
  NO_ATTACHMENT,
  uploadAttachment,
  type AttachmentPatch,
} from "./attachments";

export interface DraftEntry {
  title: string;
  details: string;
  status: StatusKey;
  hours: string;
  mins: string;
  /** One optional file, uploaded before the task row is written. */
  file: File | null;
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

/** The per-day tally the database maintains by trigger: how much work was
 *  logged, with no judgement in it. */
export interface DayScore {
  member_id: string;
  tasks: number;
  minutes: number;
}

interface State {
  members: Member[];
  dayLogs: DayLog[];
  entries: Entry[];
  scores: DayScore[];
  marks: DayMark[];
  /** First day the board may write, from `editable_from()` in the database.
   *  Null until it loads, which leaves only today open. */
  openFrom: string | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: State = {
  members: [],
  dayLogs: [],
  entries: [],
  scores: [],
  marks: [],
  openFrom: null,
  loading: true,
  error: null,
};

/**
 * True for a day the board can write directly: from `openFrom` through today.
 * Mirrors the RLS policies, which read the same `editable_from()`, so the UI
 * never offers an edit the database would refuse.
 */
export function isOpenDay(day: string, openFrom: string | null): boolean {
  const today = todayISO();
  return day <= today && day >= (openFrom ?? today);
}

function message(e: unknown): string {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  const err = e as { message?: string; hint?: string; details?: string };
  return err.message || err.details || err.hint || "Something went wrong.";
}

/**
 * Build the day's rows.
 *
 * Rows = everyone currently on the team, plus anyone retired who still has
 * something on this day, so archived days never lose their history.
 *
 * Order is the standing, and the standing is the verdict: extraordinary first,
 * then over performed, up to the mark, rework and not up to the mark. Everyone
 * inside a category shares one place — the place is the category — and brownies
 * break the order within it without changing the number. Anyone an admin has
 * not judged yet sits below the judged, alphabetically, with no place at all.
 *
 * Pure and exported so the ordering can be tested without mounting the hook.
 */
export function buildGroups(
  members: Member[],
  dayLogs: DayLog[],
  entries: Entry[],
  marks: DayMark[] = [],
): RowGroup[] {
  const markByMember = new Map(marks.map((m) => [m.member_id, m]));
  const logByMember = new Map(dayLogs.map((d) => [d.member_id, d]));
  const entriesByMember = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = entriesByMember.get(entry.member_id);
    if (list) list.push(entry);
    else entriesByMember.set(entry.member_id, [entry]);
  }

  const rows = members
    .filter((m) => m.active || logByMember.has(m.id) || entriesByMember.has(m.id))
    .map((member) => ({
      member,
      dayLog: logByMember.get(member.id) ?? null,
      entries: entriesByMember.get(member.id) ?? [],
      mark: markByMember.get(member.id) ?? null,
    }));

  const brownies = (r: (typeof rows)[number]) =>
    (r.mark?.overtime ? 1 : 0) + (r.mark?.holiday ? 1 : 0);
  const rankOf = (r: (typeof rows)[number]) =>
    r.mark ? CATEGORY_BY_KEY[r.mark.category].rank : Infinity;

  const sorted = [...rows].sort(
    (a, b) =>
      rankOf(a) - rankOf(b) ||
      brownies(b) - brownies(a) ||
      a.member.name.localeCompare(b.member.name),
  );

  // places run 1, 1, 2, 3 … over the categories actually present, so the best
  // verdict of the day always reads as first
  const present = [...new Set(sorted.filter((r) => r.mark).map(rankOf))].sort(
    (a, b) => a - b,
  );
  return sorted.map((r) => ({
    ...r,
    rank: r.mark ? present.indexOf(rankOf(r)) + 1 : null,
  }));
}

export function useDashboard(date: string, passcode: string | null) {
  const [state, setState] = useState<State>(EMPTY);
  const [busy, setBusy] = useState(false);
  const dateRef = useRef(date);
  dateRef.current = date;
  const passRef = useRef(passcode);
  passRef.current = passcode;

  /** Outside the open window the day is locked for direct writes. */
  const locked = !isOpenDay(date, state.openFrom);
  const openFromRef = useRef(state.openFrom);
  openFromRef.current = state.openFrom;
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
        const [m, d, e, sc, mk, win] = await Promise.all([
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
              "id,log_date,member_id,created_by,title,details,status,minutes,remarks,attachment_path,attachment_name,attachment_type,attachment_size,status_by,status_at,created_at,updated_at",
            )
            .eq("log_date", target)
            .order("created_at", { ascending: true }),
          supabase
            .from("daily_scores")
            .select("member_id,tasks,minutes")
            .eq("log_date", target),
          supabase
            .from("day_marks")
            .select("member_id,log_date,category,overtime,holiday,marked_at")
            .eq("log_date", target),
          supabase.rpc("editable_from"),
        ]);
        if (m.error) throw m.error;
        if (d.error) throw d.error;
        if (e.error) throw e.error;
        if (sc.error) throw sc.error;
        if (mk.error) throw mk.error;
        if (dateRef.current !== target) return; // a newer date won the race
        setState((s) => ({
          members: (m.data ?? []) as Member[],
          dayLogs: (d.data ?? []) as DayLog[],
          entries: (e.data ?? []) as Entry[],
          scores: (sc.data ?? []) as DayScore[],
          marks: (mk.data ?? []) as DayMark[],
          // if the window can't be read, keep the last known one rather than
          // failing the whole board — the database still enforces it
          openFrom:
            !win.error && typeof win.data === "string" ? win.data : s.openFrom,
          loading: false,
          error: null,
        }));
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_marks" },
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
      buildGroups(state.members, state.dayLogs, state.entries, state.marks),
    [state.members, state.dayLogs, state.entries, state.marks],
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
        const drafts = input.entries.filter((e) => e.title.trim().length > 0);
        // Files go up before any row is written, so a failed upload leaves
        // nothing behind and nobody gets a task pointing at a missing file.
        const files = await Promise.all(
          drafts.map((e) => (e.file ? uploadAttachment(e.file) : null)),
        );

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
          for (const [i, e] of drafts.entries()) {
            const { data: id, error } = await supabase.rpc("admin_insert_entry", {
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
            // the insert function takes no attachment, so set it straight after
            if (files[i] && id) {
              const { error: attachError } = await supabase.rpc("admin_update_entry", {
                p_pass: pass,
                p_id: id,
                p_patch: files[i],
              });
              if (attachError) throw attachError;
            }
          }
          return drafts.length;
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
        const rows = drafts.map((e, i) => ({
          log_date: target,
          member_id: input.memberId,
          created_by: input.memberId,
          title: e.title.trim(),
          details: e.details.trim() || null,
          status: e.status,
          minutes: draftMinutes(e),
          ...(files[i] ?? NO_ATTACHMENT),
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
        if (!isOpenDay(input.logDate, openFromRef.current)) {
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
      file?: File | null;
    }) =>
      run(async () => {
        const target = dateRef.current;
        const createdBy = input.assigned ? null : input.memberId;
        const attachment = input.file ? await uploadAttachment(input.file) : null;
        if (lockedRef.current) {
          const pass = needPass();
          const { data: id, error } = await supabase.rpc("admin_insert_entry", {
            p_pass: pass,
            p_log_date: target,
            p_member: input.memberId,
            p_created_by: createdBy,
            p_title: input.title.trim(),
            p_details: input.details.trim() || null,
            p_status: input.status,
            p_minutes: input.minutes,
          });
          if (error) throw error;
          if (attachment && id) {
            const { error: attachError } = await supabase.rpc("admin_update_entry", {
              p_pass: pass,
              p_id: id,
              p_patch: attachment,
            });
            if (attachError) throw attachError;
          }
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
              ...(attachment ?? NO_ATTACHMENT),
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
        /** A new file to upload, `clear` to drop the current one, or nothing
         *  to leave the attachment alone. */
        attachment?: File | "clear" | null;
      },
    ) =>
      run(async () => {
        const attachment: AttachmentPatch | null =
          patch.attachment instanceof File
            ? await uploadAttachment(patch.attachment)
            : patch.attachment === "clear"
              ? NO_ATTACHMENT
              : null;
        // `rating` is deliberately absent: it is only settable at /rating
        const fields = {
            title: patch.title.trim(),
            details: patch.details.trim() || null,
            status: patch.status,
            minutes: patch.minutes,
            remarks: patch.remarks.trim().slice(0, 500) || null,
            ...(attachment ?? {}),
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
   * The verdict and its brownies. Only an admin can set one, and only through
   * the passcode-gated function — the browser has no write on `day_marks` at
   * all. A null category clears it and the day goes back to unjudged.
   */
  const setMark = useCallback(
    (
      memberId: string,
      category: CategoryKey | null,
      brownies: { overtime: boolean; holiday: boolean } = {
        overtime: false,
        holiday: false,
      },
    ) =>
      run(async () => {
        const { error } = await supabase.rpc("admin_set_mark", {
          p_pass: needPass(),
          p_member: memberId,
          p_date: dateRef.current,
          p_category: category,
          p_overtime: brownies.overtime,
          p_holiday: brownies.holiday,
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
    setMark,
    setRemarks,
    deleteEntry,
    setAttendance,
  };
}
