import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  BROWNIES,
  CATEGORIES,
  brownieCount,
  categoryFor,
  STATUS_BY_KEY,
  formatDuration,
} from "../config";
import { addMonths, clock, dateLong, dateShort, monthShort, startOfMonth, todayISO } from "../lib/date";
import { categoryTint, tallyOf, useHistory, type DayRow } from "../lib/history";
import { formatBytes, openAttachment } from "../lib/attachments";
import type { DayMark, Entry, Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { useToast } from "./Toaster";
import { Chip, ChevronLeft, ChevronRight, Clip, Cookie, cx } from "./ui";

const FIRST_DAY = "2026-10-01"; // the day the new system began

function Stat({
  label,
  value,
  foot,
  tint,
}: {
  label: string;
  value: string;
  foot?: string;
  tint?: string;
}) {
  return (
    <div
      className="rounded-sm border border-line px-3 py-2.5"
      style={tint ? { backgroundColor: tint } : undefined}
    >
      <p className="text-[9.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
        {label}
      </p>
      <p className="tnum mt-1 text-[19px] leading-none font-semibold tracking-[-0.02em] text-ink">
        {value}
      </p>
      {foot && <p className="mt-1 text-[10.5px] text-ink-4">{foot}</p>}
    </div>
  );
}

/**
 * A person's month: what they logged, and what the admin made of each day.
 * Points, efficiency, impact and average position are all gone — a day is
 * judged whole, so the history is a run of verdicts.
 */
export function MemberProfile({
  member,
  onClose,
  markToday,
}: {
  member: Member;
  onClose: () => void;
  markToday?: DayMark | null;
}) {
  const toast = useToast();
  const [month, setMonth] = useState(() => startOfMonth(todayISO()));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const { rows, entries, loading } = useHistory(true, FIRST_DAY);

  const mine = useMemo(
    () => rows.filter((r) => r.member_id === member.id),
    [rows, member.id],
  );
  const myEntries = useMemo(
    () => entries.filter((e) => e.member_id === member.id),
    [entries, member.id],
  );
  const tally = useMemo(() => tallyOf(mine), [mine]);
  const byDate = useMemo(
    () => new Map(mine.map((r) => [r.log_date, r])),
    [mine],
  );

  /** Every day of the shown month, judged or not. */
  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: { date: string; row: DayRow | undefined }[] = [];
    for (let d = 1; d <= last; d++) {
      const date = `${month.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      if (date < FIRST_DAY || date > todayISO()) continue;
      out.push({ date, row: byDate.get(date) });
    }
    return out;
  }, [month, byDate]);

  const dayTasks = useMemo(
    () => (openDay ? myEntries.filter((e) => e.log_date === openDay) : []),
    [openDay, myEntries],
  );

  const recent = useMemo(
    () =>
      [...myEntries]
        .sort((a, b) => b.log_date.localeCompare(a.log_date))
        .slice(0, 8),
    [myEntries],
  );

  const best = useMemo(() => {
    for (const c of CATEGORIES) if (tally.byCategory[c.key]) return c;
    return null;
  }, [tally]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-cell]",
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.25, stagger: 0.01, ease: "back.out(2)" },
      );
    }, grid);
    return () => ctx.revert();
  }, [month, mine.length]);

  const todayCat = categoryFor(markToday?.category);

  return (
    <Dialog
      open
      onClose={onClose}
      title={member.name}
      subtitle={
        todayCat
          ? `Today — ${todayCat.label.toLowerCase()}`
          : "Since the new system began on 1 October 2026"
      }
      width={900}
    >
      {loading ? (
        <div className="flex h-[320px] items-center justify-center text-[12.5px] text-ink-4">
          Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-stagger>
            <Stat
              label="Days judged"
              value={String(tally.judged)}
              foot={`of ${tally.days} logged`}
            />
            <Stat
              label="Best verdict"
              value={best ? best.short : "—"}
              foot={best ? `${tally.byCategory[best.key]} day(s)` : "none yet"}
              tint={best?.bg}
            />
            <Stat
              label="Brownies"
              value={String(tally.brownies)}
              foot={BROWNIES.map(
                (b) => `${tally.byBrownie[b.key]} ${b.label.toLowerCase()}`,
              ).join(" · ")}
            />
            <Stat label="Tasks" value={String(tally.tasks)} foot={`${myEntries.filter((e) => e.status === "done").length} done`} />
            <Stat label="Time logged" value={formatDuration(tally.minutes)} />
          </div>

          {/* the verdict mix */}
          <section data-stagger>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
              How the days have been judged
            </p>
            <div className="flex flex-col gap-1.5">
              {CATEGORIES.map((c) => {
                const n = tally.byCategory[c.key];
                const pct = tally.judged ? (100 * n) / tally.judged : 0;
                return (
                  <div
                    key={c.key}
                    className="grid grid-cols-[132px_1fr_30px] items-center gap-3"
                  >
                    <span className="text-[11.5px] font-medium" style={{ color: c.ink }}>
                      {c.label}
                    </span>
                    <span className="h-[10px] overflow-hidden rounded-xs bg-mute-bg">
                      <span
                        className="block h-full rounded-xs"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: c.bg,
                          borderRight: n ? `1px solid ${c.line}` : undefined,
                        }}
                      />
                    </span>
                    <span className="tnum text-right text-[11.5px] font-semibold text-ink-2">
                      {n}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* the month, day by day */}
          <section data-stagger>
            <header className="mb-2 flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous month"
                disabled={month <= startOfMonth(FIRST_DAY)}
                onClick={() => {
                  setOpenDay(null);
                  setMonth(addMonths(month, -1));
                }}
                className={cx(
                  "focus-ring flex size-6 items-center justify-center rounded-xs",
                  month <= startOfMonth(FIRST_DAY)
                    ? "cursor-not-allowed text-line-strong"
                    : "text-ink-3 hover:bg-mute-bg hover:text-ink",
                )}
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="tnum min-w-[74px] text-center text-[12px] font-semibold text-ink">
                {monthShort(month)} {month.slice(0, 4)}
              </span>
              <button
                type="button"
                aria-label="Next month"
                disabled={month >= startOfMonth(todayISO())}
                onClick={() => {
                  setOpenDay(null);
                  setMonth(addMonths(month, 1));
                }}
                className={cx(
                  "focus-ring flex size-6 items-center justify-center rounded-xs",
                  month >= startOfMonth(todayISO())
                    ? "cursor-not-allowed text-line-strong"
                    : "text-ink-3 hover:bg-mute-bg hover:text-ink",
                )}
              >
                <ChevronRight className="size-3.5" />
              </button>
              <span className="ml-auto text-[10.5px] text-ink-4">
                each square is a day, coloured by its verdict
              </span>
            </header>

            <div ref={grid} className="flex flex-wrap gap-1.5">
              {days.map(({ date, row }) => {
                const cat = categoryFor(row?.mark?.category);
                const brownies = brownieCount(row?.mark);
                return (
                  <button
                    key={date}
                    data-cell
                    type="button"
                    disabled={!row}
                    onClick={() => setOpenDay(openDay === date ? null : date)}
                    title={`${dateLong(date)}${
                      row
                        ? ` — ${row.tasks} task(s), ${formatDuration(row.minutes)}${
                            cat ? `, ${cat.label.toLowerCase()}` : ", not judged"
                          }`
                        : " — nothing logged"
                    }`}
                    className={cx(
                      "flex size-[34px] flex-col items-center justify-center rounded-sm border text-[10px] font-semibold transition",
                      row ? "cursor-pointer hover:scale-105" : "opacity-55",
                      openDay === date && "ring-1 ring-ink",
                    )}
                    style={{
                      backgroundColor: categoryTint(row?.mark?.category ?? null),
                      borderColor: cat ? cat.line : "#e5e5e1",
                      color: cat ? cat.ink : "#78787f",
                    }}
                  >
                    {date.slice(-2)}
                    {brownies > 0 && (
                      <span className="flex items-center gap-[1px] text-[8px]">
                        <Cookie className="size-[8px]" />
                        {brownies}
                      </span>
                    )}
                  </button>
                );
              })}
              {days.length === 0 && (
                <p className="text-[12px] text-ink-4">Nothing in this month.</p>
              )}
            </div>
          </section>

          {/* a day, or the recent run */}
          <section data-stagger>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
              {openDay ? dateLong(openDay) : "Recent tasks"}
            </p>
            <ul className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto pr-1">
              {(openDay ? dayTasks : recent).map((e: Entry) => (
                <li
                  key={e.id}
                  className="rounded-sm border border-line bg-paper px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[12.5px] leading-[1.45] font-medium break-words text-ink">
                      {e.title}
                    </p>
                    <span className="tnum shrink-0 text-[11.5px] text-ink-3">
                      {openDay ? formatDuration(e.minutes) : dateShort(e.log_date)}
                    </span>
                  </div>
                  {e.details && (
                    <p className="mt-1 text-[11.5px] leading-[1.5] break-words text-ink-2">
                      {e.details}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Chip tone={STATUS_BY_KEY[e.status].tone} dot>
                      {STATUS_BY_KEY[e.status].label}
                    </Chip>
                    {!openDay && (
                      <span className="tnum text-[11px] text-ink-3">
                        {formatDuration(e.minutes)}
                      </span>
                    )}
                    <span className="tnum text-[11px] text-ink-4">
                      logged {clock(e.created_at)}
                    </span>
                    {e.attachment_path && (
                      <button
                        type="button"
                        title={`Open ${e.attachment_name} (${formatBytes(e.attachment_size)})`}
                        onClick={() =>
                          void openAttachment(e.attachment_path!).catch((err) =>
                            toast(
                              err instanceof Error
                                ? err.message
                                : "Could not open the attachment.",
                              "error",
                            ),
                          )
                        }
                        className="focus-ring inline-flex max-w-[200px] items-center gap-1 rounded-xs text-[11px] font-medium text-ink-3 hover:text-ink"
                      >
                        <Clip className="size-3 shrink-0" />
                        <span className="truncate underline decoration-line-strong underline-offset-2">
                          {e.attachment_name}
                        </span>
                      </button>
                    )}
                  </div>
                  {e.remarks && (
                    <p className="mt-1.5 border-l-2 border-line-strong pl-2 text-[11.5px] leading-[1.5] break-words text-ink-3">
                      {e.remarks}
                    </p>
                  )}
                </li>
              ))}
              {(openDay ? dayTasks : recent).length === 0 && (
                <p className="text-[12px] text-ink-4">Nothing logged.</p>
              )}
            </ul>
          </section>

        </div>
      )}
    </Dialog>
  );
}
