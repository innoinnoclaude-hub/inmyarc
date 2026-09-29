import { useEffect, useRef } from "react";
import gsap from "gsap";
import { APP } from "../config";
import {
  dateLong,
  dateShort,
  isWeekend,
  shiftISO,
  todayISO,
  weekdayLong,
} from "../lib/date";
import {
  Button,
  ChartIcon,
  ChevronLeft,
  ChevronRight,
  Chip,
  Plus,
  Refresh,
  cx,
} from "./ui";

export function Header({
  date,
  onDateChange,
  onAdd,
  onGraph,
  onRefresh,
  busy,
  identity,
  locked,
}: {
  date: string;
  onDateChange: (next: string) => void;
  onAdd: () => void;
  onGraph: () => void;
  onRefresh: () => void;
  busy: boolean;
  identity: string | null;
  /** True for a day outside the open window (editable_from() through today).
   *  Those are read-only here; corrections are made by an admin at /rating. */
  locked: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const day = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const isToday = date === today;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-head]",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power3.out" },
      );
    }, root);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!day.current) return;
    gsap.fromTo(
      day.current,
      { opacity: 0, y: -5 },
      { opacity: 1, y: 0, duration: 0.32, ease: "power2.out" },
    );
  }, [date]);

  return (
    <header
      ref={root}
      className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-5"
    >
      {/* same rule as /rating: one line from `lg` up, never wrapping — the
          controls hold their size and the quieter parts drop out first */}
      <div
        data-head
        className="flex min-w-0 items-center gap-x-3 overflow-hidden lg:flex-1"
      >
        <span className="hidden shrink-0 text-[11px] leading-none font-semibold tracking-[0.14em] whitespace-nowrap text-ink-3 uppercase xl:inline">
          <span className="text-ink">{APP.org}</span>
          <span className="mx-2 text-line-strong">/</span>
          {APP.title}
        </span>

        <span className="hidden h-5 w-px shrink-0 bg-line-strong xl:block" />

        <div
          ref={day}
          className="flex min-w-0 items-center gap-x-2.5 overflow-hidden"
        >
          <h1 className="shrink-0 text-[22px] leading-none font-bold tracking-[-0.03em] whitespace-nowrap text-ink sm:text-[26px] xl:text-[30px]">
            {weekdayLong(date)}
          </h1>
          <p className="tnum hidden shrink-0 text-[14px] leading-none font-medium whitespace-nowrap text-ink-2 sm:block">
            {dateLong(date)}
          </p>
          {isToday ? (
            <Chip tone="ok" dot>
              Today
            </Chip>
          ) : locked ? (
            <Chip tone="mute">Archive</Chip>
          ) : (
            <Chip tone="live">Open for backfill</Chip>
          )}
          {isWeekend(date) && (
            <span className="hidden shrink-0 xl:inline-flex">
              <Chip tone="mute">Weekend</Chip>
            </span>
          )}
          {locked && (
            <span className="shrink-0">
              <Chip tone="mute">View only</Chip>
            </span>
          )}
        </div>
      </div>

      <div
        data-head
        className="-mx-1 flex shrink-0 items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:gap-2 lg:overflow-x-visible lg:px-0 lg:pb-0"
      >
        <div className="flex shrink-0 items-center rounded-sm border border-line-strong bg-surface">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => onDateChange(shiftISO(date, -1))}
            className="focus-ring flex h-9 w-9 items-center justify-center text-ink-3 transition-colors hover:bg-mute-bg hover:text-ink"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="tnum h-9 min-w-[76px] shrink-0 border-x border-line px-3 text-center text-[12.5px] leading-9 font-medium text-ink">
            {isToday ? "Today" : dateShort(date)}
          </span>
          <button
            type="button"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => onDateChange(shiftISO(date, 1))}
            className={cx(
              "focus-ring flex h-9 w-9 items-center justify-center transition-colors",
              date >= today
                ? "cursor-not-allowed text-ink-4/50"
                : "text-ink-3 hover:bg-mute-bg hover:text-ink",
            )}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {!isToday && (
          <Button size="md" className="shrink-0" onClick={() => onDateChange(today)}>
            Today
          </Button>
        )}

        <Button
          size="md"
          onClick={onRefresh}
          aria-label="Refresh"
          className="w-9 shrink-0 px-0"
        >
          <Refresh className={cx("size-4", busy && "animate-spin")} />
        </Button>

        <Button size="md" className="shrink-0" onClick={onGraph}>
          <ChartIcon className="size-3.5" />
          Graph
        </Button>

        {!locked && (
          <Button variant="primary" size="md" className="shrink-0" onClick={onAdd}>
            <Plus className="size-3.5" />
            {identity ? "Add entry" : "Add your entry"}
          </Button>
        )}
      </div>
    </header>
  );
}
