import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { CATEGORIES, brownieCount, formatDuration } from "../config";
import type { RowGroup } from "../lib/types";
import { cx } from "./ui";

type Tone = "ink" | "ok" | "bad" | "wait";

const TONE: Record<Tone, string> = {
  ink: "text-ink",
  ok: "text-ok",
  bad: "text-bad",
  wait: "text-wait",
};

/** Counts up on change; strings are shown as-is. */
function Value({
  value,
  text,
  tone = "ink",
}: {
  value?: number;
  text?: string;
  tone?: Tone;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);

  useEffect(() => {
    if (value === undefined || !ref.current) return;
    const el = ref.current;
    const obj = { n: prev.current };
    prev.current = value;
    const tween = gsap.to(obj, {
      n: value,
      duration: 0.5,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = String(Math.round(obj.n));
      },
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return (
    <span
      ref={ref}
      className={cx(
        "tnum text-[22px] leading-none font-semibold tracking-[-0.025em]",
        TONE[tone],
      )}
    >
      {text ?? 0}
    </span>
  );
}

function Cell({
  label,
  children,
  foot,
}: {
  label: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2.5 border-r border-b border-line px-4 py-3.5 last:border-r-0">
      <span className="truncate text-[10px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">{children}</div>
      <div className="h-[13px] text-[10.5px] leading-[13px] text-ink-4">
        {foot}
      </div>
    </div>
  );
}

export function Summary({ groups }: { groups: RowGroup[] }) {
  const s = useMemo(() => {
    let reported = 0;
    let working = 0;
    let off = 0;
    let tasks = 0;
    let done = 0;
    let notDone = 0;
    let rework = 0;
    let minutes = 0;
    let judged = 0;
    let brownies = 0;
    const byCategory = Object.fromEntries(
      CATEGORIES.map((c) => [c.key, 0]),
    ) as Record<string, number>;
    const att = { full_day: 0, wfh: 0, half_day: 0, week_off: 0, leave: 0 };

    for (const g of groups) {
      if (g.dayLog !== null || g.entries.length > 0 || g.mark) reported++;
      if (g.dayLog) {
        att[g.dayLog.attendance]++;
        if (g.dayLog.attendance === "week_off" || g.dayLog.attendance === "leave")
          off++;
        else working++;
      }
      for (const e of g.entries) {
        tasks++;
        if (e.status === "done") done++;
        else if (e.status === "not_done") notDone++;
        else rework++;
        if (e.minutes) minutes += e.minutes;
      }
      if (g.mark) {
        judged++;
        byCategory[g.mark.category]++;
        brownies += brownieCount(g.mark);
      }
    }
    return {
      reported,
      working,
      off,
      tasks,
      done,
      notDone,
      rework,
      minutes,
      judged,
      brownies,
      byCategory,
      att,
      total: groups.length,
      pct: groups.length ? Math.round((reported / groups.length) * 100) : 0,
      donePct: tasks ? Math.round((done / tasks) * 100) : 0,
    };
  }, [groups]);

  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!bar.current) return;
    gsap.to(bar.current, {
      width: `${s.pct}%`,
      duration: 0.6,
      ease: "power3.out",
    });
  }, [s.pct]);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-surface">
      {s.judged > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-paper px-4 py-2">
          <span className="text-[10px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
            Verdicts
          </span>
          {CATEGORIES.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5">
              <span
                className="size-[9px] rounded-[2px] border"
                style={{ backgroundColor: c.bg, borderColor: c.line }}
              />
              <span className="text-[11.5px] text-ink-3">{c.label}</span>
              <span
                className="tnum text-[12px] font-semibold"
                style={{ color: s.byCategory[c.key] ? c.ink : undefined }}
              >
                {s.byCategory[c.key]}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
      <div className="col-span-2 flex min-w-0 flex-col justify-between gap-2.5 border-r border-b border-line px-4 py-3.5 sm:col-span-1">
        <span className="truncate text-[10px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
          Reported
        </span>
        <div className="flex items-baseline gap-1.5">
          <Value value={s.reported} />
          <span className="tnum text-[13px] font-medium text-ink-4">
            / {s.total}
          </span>
        </div>
        <span className="block h-[13px] pt-[5px]">
          <span className="block h-[3px] w-full overflow-hidden bg-line">
            <span ref={bar} className="block h-full w-0 bg-ink" />
          </span>
        </span>
      </div>

      <Cell
        label="Working"
        foot={
          s.working
            ? `${s.att.full_day} full / ${s.att.wfh} wfh / ${s.att.half_day} half`
            : null
        }
      >
        <Value value={s.working} />
      </Cell>

      <Cell
        label="Off"
        foot={s.off ? `${s.att.week_off} week off / ${s.att.leave} leave` : null}
      >
        <Value value={s.off} />
      </Cell>

      <Cell label="Tasks" foot={s.tasks ? `${s.donePct}% done` : null}>
        <Value value={s.tasks} />
      </Cell>

      <Cell label="Done" foot={null}>
        <Value value={s.done} tone="ok" />
      </Cell>

      <Cell
        label="Open"
        foot={s.rework ? `${s.rework} need rework` : null}
      >
        <Value value={s.notDone} tone="bad" />
        {s.rework > 0 && (
          <span className="tnum text-[13px] font-medium text-wait">
            + {s.rework}
          </span>
        )}
      </Cell>

      <Cell
        label="Time logged"
        foot={s.tasks ? `${s.tasks} tasks` : null}
      >
        <Value text={s.minutes ? formatDuration(s.minutes) : "0m"} />
      </Cell>

      <Cell
        label="Judged"
        foot={
          s.brownies
            ? `${s.brownies} brownie${s.brownies === 1 ? "" : "s"} given`
            : s.judged
              ? "verdicts in"
              : "awaiting the admin"
        }
      >
        <Value value={s.judged} />
        <span className="tnum text-[13px] font-medium text-ink-4">
          / {s.reported}
        </span>
      </Cell>
      </div>
    </section>
  );
}
