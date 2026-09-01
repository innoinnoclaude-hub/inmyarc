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
 * A month at a time, GitHub-shaped. Shade comes from that day's position in the
 * team rather than raw points, so the darkest square always means "led the
 * team" no matter how big the numbers were that week. Clicking a day slides
 * its tasks open underneath.
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
  const panel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const cells = useMemo(
    () => monthGrid(month, rows, memberId, teamSize),
    [month, rows, memberId, teamSize],
  );

  const dayTasks = useMemo(
    () => (open ? entries.filter((e) => e.log_date === open) : []),
    [open, entries],
  );

  const thisMonth = startOfMonth(todayISO());
  const earliest = useMemo(() => {
    const dates = rows.map((r) => r.log_date).sort();
    return dates.length ? startOfMonth(dates[0]) : thisMonth;
  }, [rows, thisMonth]);

  // squares fade in as the month changes
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-cell]",
        { opacity: 0, scale: 0.85 },
        { opacity: 1, scale: 1, duration: 0.28, stagger: 0.004, ease: "power2.out" },
      );
    }, grid);
    return () => ctx.revert();
  }, [month]);

  // the day panel slides rather than snaps
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (!open) {
      gsap.to(el, { height: 0, opacity: 0, duration: 0.25, ease: "power2.inOut" });
      return;
    }
    gsap.fromTo(
      el,
      { height: 0, opacity: 0 },
      {
        height: "auto",
        opacity: 1,
        duration: 0.35,
        ease: "power3.out",
        onComplete: () => {
          el.style.height = "auto";
        },
      },
    );
    gsap.fromTo(
      el.querySelectorAll("[data-task]"),
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.04, delay: 0.08, ease: "power2.out" },
    );
  }, [open, dayTasks.length]);

  return (
    <div className="rounded-sm border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={month <= earliest}
          onClick={() => {
            setOpen(null);
            setMonth(addMonths(month, -1));
          }}
          className={cx(
            "focus-ring flex size-7 items-center justify-center rounded-xs transition-colors",
            month <= earliest
              ? "cursor-not-allowed text-line-strong"
              : "text-ink-3 hover:bg-mute-bg hover:text-ink",
          )}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="tnum text-[12.5px] font-semibold text-ink">
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
            "focus-ring flex size-7 items-center justify-center rounded-xs transition-colors",
            month >= thisMonth
              ? "cursor-not-allowed text-line-strong"
              : "text-ink-3 hover:bg-mute-bg hover:text-ink",
          )}
        >
          <ChevronRight className="size-4" />
        </button>
      </header>

      <div ref={grid} className="px-3 pt-3 pb-2">
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <span
              key={i}
              className="text-center text-[9.5px] font-semibold tracking-[0.06em] text-ink-4 uppercase"
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
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
                    ? `${dateLong(c.date)}\n${c.tasks} ${c.tasks === 1 ? "task" : "tasks"} · ${formatDuration(c.minutes)} · ${c.score.toLocaleString("en-IN")} pts${c.rank ? `\nPosition ${c.rank} of ${teamSize}` : ""}`
                    : undefined
                }
                className={cx(
                  "focus-ring relative aspect-square w-full rounded-[3px] border transition-all duration-150",
                  c.inMonth ? FILL[c.level] : "bg-transparent",
                  c.inMonth ? "border-line" : "border-transparent",
                  active && "cursor-pointer hover:scale-[1.12] hover:border-ink",
                  open === c.date && "ring-1 ring-ink ring-offset-1",
                  !c.inMonth && "opacity-0",
                )}
              >
                <span
                  className={cx(
                    "tnum absolute inset-0 flex items-center justify-center text-[9.5px] font-medium",
                    c.level >= 3 ? "text-white" : "text-ink-3",
                  )}
                >
                  {c.inMonth ? Number(c.date.slice(8)) : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[10px] text-ink-4">
          <span>darkest = led the team that day</span>
          <span className="flex items-center gap-1.5">
            last
            {FILL.map((f) => (
              <span
                key={f}
                className={cx("size-[9px] rounded-[2px] border border-line", f)}
              />
            ))}
            first
          </span>
        </div>
      </div>

      {/* the day's tasks, slid open */}
      <div ref={panel} className="overflow-hidden" style={{ height: 0, opacity: 0 }}>
        {open && (
          <div className="border-t border-line bg-paper px-3 py-2.5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-[11.5px] font-semibold text-ink">
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
              <p className="py-2 text-[12px] text-ink-4">Nothing logged.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {dayTasks.map((e) => (
                  <li
                    key={e.id}
                    data-task
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-line bg-surface px-2.5 py-1.5"
                  >
                    <span className="min-w-[160px] flex-1 text-[12px] leading-[1.4] break-words text-ink">
                      {e.title}
                    </span>
                    <span className="tnum text-[11px] text-ink-3">
                      {formatDuration(e.minutes)}
                    </span>
                    <Chip tone={STATUS_BY_KEY[e.status].tone}>
                      {STATUS_BY_KEY[e.status].short}
                    </Chip>
                    <span className="tnum w-12 text-right text-[11px] text-ink-3">
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
          </div>
        )}
      </div>
    </div>
  );
}
