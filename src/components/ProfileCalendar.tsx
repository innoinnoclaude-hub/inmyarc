import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { STATUS_BY_KEY, formatDuration } from "../config";
import { addMonths, dateLong, monthShort, startOfMonth, todayISO } from "../lib/date";
import { monthGrid, type ScoreRow } from "../lib/profile";
import type { Entry } from "../lib/types";
import { Chip, ChevronLeft, ChevronRight, cx } from "./ui";

const FILL = [
  "bg-cal-0",
  "bg-cal-1",
  "bg-cal-2",
  "bg-cal-3",
  "bg-cal-4",
  "bg-cal-5",
];

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * A month at a time in small GitHub-sized squares. Colour comes from that day's
 * position in the team rather than raw points — red at the back of the pack
 * through to green at the front — so a glance down the month reads as form
 * rather than volume. The grid keeps its natural size rather than stretching,
 * and the day's tasks open beside it.
 */
export function ProfileCalendar({
  rows,
  entries,
  memberId,
  teamSize,
}: {
  rows: ScoreRow[];
  entries: Entry[];
  memberId: string;
  teamSize: number;
}) {
  const [month, setMonth] = useState(() => startOfMonth(todayISO()));
  const [open, setOpen] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const cells = useMemo(
    () => monthGrid(month, rows, memberId, teamSize),
    [month, rows, memberId, teamSize],
  );

  const dayTasks = useMemo(
    () => (open ? entries.filter((e) => e.log_date === open) : []),
    [open, entries],
  );

  const monthStats = useMemo(() => {
    const active = cells.filter((c) => c.inMonth && c.tasks > 0);
    return {
      days: active.length,
      tasks: active.reduce((s, c) => s + c.tasks, 0),
      minutes: active.reduce((s, c) => s + c.minutes, 0),
      score: active.reduce((s, c) => s + c.score, 0),
      firsts: active.filter((c) => c.rank === 1).length,
    };
  }, [cells]);

  const thisMonth = startOfMonth(todayISO());
  const earliest = useMemo(() => {
    const dates = rows.map((r) => r.log_date).sort();
    return dates.length ? startOfMonth(dates[0]) : thisMonth;
  }, [rows, thisMonth]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-cell]",
        { opacity: 0, scale: 0.7 },
        { opacity: 1, scale: 1, duration: 0.26, stagger: 0.006, ease: "back.out(2)" },
      );
    }, grid);
    return () => ctx.revert();
  }, [month]);

  // the day panel fades and slides rather than snapping in
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
    );
    gsap.fromTo(
      el.querySelectorAll("[data-task]"),
      { opacity: 0, x: -6 },
      { opacity: 1, x: 0, duration: 0.28, stagger: 0.035, delay: 0.05, ease: "power2.out" },
    );
  }, [open, dayTasks.length]);

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-line bg-surface p-3 lg:flex-row lg:gap-5">
      {/* the month */}
      <div className="shrink-0">
        <header className="mb-2.5 flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= earliest}
            onClick={() => {
              setOpen(null);
              setMonth(addMonths(month, -1));
            }}
            className={cx(
              "focus-ring flex size-6 items-center justify-center rounded-xs transition-colors",
              month <= earliest
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
            disabled={month >= thisMonth}
            onClick={() => {
              setOpen(null);
              setMonth(addMonths(month, 1));
            }}
            className={cx(
              "focus-ring flex size-6 items-center justify-center rounded-xs transition-colors",
              month >= thisMonth
                ? "cursor-not-allowed text-line-strong"
                : "text-ink-3 hover:bg-mute-bg hover:text-ink",
            )}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </header>

        <div ref={grid} className="w-fit">
          <div className="mb-[3px] grid grid-cols-7 gap-[3px]">
            {WEEKDAYS.map((d, i) => (
              <span
                key={i}
                className="w-[15px] text-center text-[8.5px] font-semibold text-ink-4 uppercase"
              >
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {cells.map((c) => {
              const active = c.inMonth && c.tasks > 0;
              return (
                <button
                  key={c.date}
                  data-cell
                  type="button"
                  disabled={!active}
                  onClick={() => setOpen(open === c.date ? null : c.date)}
                  title={
                    c.inMonth
                      ? `${dateLong(c.date)}\n${c.tasks} ${c.tasks === 1 ? "task" : "tasks"} · ${formatDuration(c.minutes)} · ${c.score.toLocaleString("en-IN")} pts${
                          c.rank ? `\nPosition ${c.rank} of ${teamSize}` : ""
                        }`
                      : undefined
                  }
                  className={cx(
                    "size-[15px] rounded-[2px] border transition-transform duration-150",
                    c.inMonth ? FILL[c.level] : "bg-transparent",
                    c.inMonth ? "border-line" : "border-transparent",
                    active &&
                      "focus-ring cursor-pointer hover:scale-[1.35] hover:border-ink",
                    open === c.date && "scale-[1.35] border-ink",
                    !c.inMonth && "opacity-0",
                  )}
                />
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-[9.5px] text-ink-4">
            <span>last</span>
            {FILL.slice(1).map((f) => (
              <span
                key={f}
                className={cx("size-[9px] rounded-[2px] border border-line/60", f)}
              />
            ))}
            <span>first</span>
            <span className="ml-2 flex items-center gap-1">
              <span className="size-[9px] rounded-[2px] border border-line bg-cal-0" />
              none
            </span>
          </div>
        </div>
      </div>

      {/* the selected day, or the month at a glance */}
      <div ref={panel} className="min-w-0 flex-1 border-t border-line pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
        {open ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-[12px] font-semibold text-ink">
                {dateLong(open)}
              </p>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="focus-ring text-[11px] text-ink-4 hover:text-ink-2"
              >
                Close
              </button>
            </div>
            {dayTasks.length === 0 ? (
              <p className="text-[12px] text-ink-4">Nothing logged.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {dayTasks.map((e) => (
                  <li
                    key={e.id}
                    data-task
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-line bg-paper px-2.5 py-1.5"
                  >
                    <span className="min-w-[140px] flex-1 text-[12px] leading-[1.4] break-words text-ink">
                      {e.title}
                    </span>
                    <span className="tnum text-[11px] text-ink-3">
                      {formatDuration(e.minutes)}
                    </span>
                    <Chip tone={STATUS_BY_KEY[e.status].tone}>
                      {STATUS_BY_KEY[e.status].short}
                    </Chip>
                    <span className="tnum w-10 text-right text-[11px] text-ink-3">
                      {e.efficiency && e.impact
                        ? `${e.efficiency}/${e.impact}`
                        : "—"}
                    </span>
                    <span className="tnum w-12 text-right text-[11.5px] font-medium text-ink-2">
                      {e.efficiency && e.impact
                        ? Math.round(((e.minutes ?? 0) * e.efficiency * e.impact) / 5)
                        : 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              {monthShort(month)} at a glance
            </p>
            {monthStats.days === 0 ? (
              <p className="text-[12px] text-ink-4">Nothing logged this month.</p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-4">
                  {[
                    ["Days worked", String(monthStats.days)],
                    ["Tasks", String(monthStats.tasks)],
                    ["Time", formatDuration(monthStats.minutes)],
                    ["Points", monthStats.score.toLocaleString("en-IN")],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] tracking-[0.08em] text-ink-4 uppercase">
                        {k}
                      </dt>
                      <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[11.5px] leading-[1.5] text-ink-3">
                  {monthStats.firsts > 0
                    ? `Led the team on ${monthStats.firsts} ${monthStats.firsts === 1 ? "day" : "days"} this month. `
                    : ""}
                  Click any square to see that day's tasks.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
