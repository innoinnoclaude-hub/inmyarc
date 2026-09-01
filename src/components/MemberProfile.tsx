import { useEffect, useMemo, useState } from "react";
import gsap from "gsap";
import {
  ATTENDANCE_BY_KEY,
  STATUS_BY_KEY,
  formatDuration,
  type StatusKey,
} from "../config";
import { clock, dateLong, dateShort } from "../lib/date";
import {
  activityStrip,
  attendanceSpread,
  bestDay,
  busiestWeekday,
  ratingSpread,
  sharpestWeekday,
  statusSpread,
  streak,
  totals,
  weekdayProfile,
  weeklyTrend,
  type ProfileData,
} from "../lib/profile";
import { isConfigured, supabase } from "../lib/supabase";
import { shiftISO, todayISO } from "../lib/date";
import type { Entry, Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { Chip, Rating, Slider, cx } from "./ui";

const WINDOW_DAYS = 84;

function useProfile(member: Member | null) {
  const [data, setData] = useState<ProfileData>({ entries: [], dayLogs: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member || !isConfigured) return;
    let cancelled = false;
    const from = shiftISO(todayISO(), -(WINDOW_DAYS - 1));
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [e, d] = await Promise.all([
          supabase
            .from("entries")
            .select(
              "id,log_date,member_id,created_by,title,details,status,minutes,efficiency,impact,remarks,status_by,status_at,created_at,updated_at",
            )
            .eq("member_id", member.id)
            .gte("log_date", from)
            .order("log_date", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("day_logs")
            .select("id,member_id,log_date,attendance,note,updated_at")
            .eq("member_id", member.id)
            .gte("log_date", from),
        ]);
        if (e.error) throw e.error;
        if (d.error) throw d.error;
        if (cancelled) return;
        setData({ entries: (e.data ?? []) as Entry[], dayLogs: (d.data ?? []) as never });
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member]);

  return { data, loading, error };
}

/* ------------------------------ primitives ------------------------------ */

function Tile({
  label,
  value,
  foot,
}: {
  label: string;
  value: string;
  foot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-r border-b border-line px-3 py-3 last:border-r-0">
      <span className="truncate text-[10px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
        {label}
      </span>
      <span className="tnum text-[19px] leading-none font-semibold tracking-[-0.02em] text-ink">
        {value}
      </span>
      <span className="flex h-[13px] items-center text-[10.5px] text-ink-4">
        {foot}
      </span>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-stagger>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
          {title}
        </h3>
        {hint && <span className="text-[11px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Horizontal bar row — used for weekday, distributions and mixes. */
function BarRow({
  label,
  value,
  max,
  caption,
  emphasis,
}: {
  label: string;
  value: number;
  max: number;
  caption?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <span className="w-10 shrink-0 text-[11.5px] font-medium text-ink-2">
        {label}
      </span>
      <span className="relative h-[7px] flex-1 bg-mute-bg">
        <span
          style={{ width: `${max ? Math.max((value / max) * 100, value ? 2 : 0) : 0}%` }}
          className={cx(
            "absolute inset-y-0 left-0 transition-[width] duration-500",
            emphasis ? "bg-ink" : "bg-ink-4",
          )}
        />
      </span>
      <span className="tnum w-20 shrink-0 text-right text-[11px] text-ink-4">
        {caption}
      </span>
    </div>
  );
}

/* ------------------------------- the view ------------------------------- */

export function MemberProfile({
  member,
  onClose,
  rankToday,
  scoreToday,
}: {
  member: Member;
  onClose: () => void;
  rankToday?: number;
  scoreToday?: number;
}) {
  const { data, loading, error } = useProfile(member);
  const { entries, dayLogs } = data;

  const t = useMemo(() => totals(entries), [entries]);
  const week = useMemo(() => weekdayProfile(entries), [entries]);
  const sharp = useMemo(() => sharpestWeekday(week), [week]);
  const busy = useMemo(() => busiestWeekday(week), [week]);
  const best = useMemo(() => bestDay(entries), [entries]);
  const run = useMemo(() => streak(entries, dayLogs), [entries, dayLogs]);
  const strip = useMemo(() => activityStrip(entries, WINDOW_DAYS), [entries]);
  const trend = useMemo(() => weeklyTrend(entries, 12), [entries]);
  const effSpread = useMemo(() => ratingSpread(entries, "efficiency"), [entries]);
  const impSpread = useMemo(() => ratingSpread(entries, "impact"), [entries]);
  const statuses = useMemo(() => statusSpread(entries), [entries]);
  const attendance = useMemo(() => attendanceSpread(dayLogs), [dayLogs]);

  useEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-bar-grow]",
        { scaleX: 0 },
        { scaleX: 1, duration: 0.5, stagger: 0.02, ease: "power3.out", transformOrigin: "left" },
      );
    });
    return () => ctx.revert();
  }, [loading]);

  const trendMax = Math.max(...trend.map((b) => b.value), 1);
  const weekMax = Math.max(...week.map((w) => w.avgScore), 1);
  const recent = entries.slice(0, 12);

  return (
    <Dialog
      open
      onClose={onClose}
      title={member.name}
      subtitle={`Last ${WINDOW_DAYS} days${
        rankToday ? ` — rank ${rankToday} today` : ""
      }${scoreToday ? `, ${scoreToday.toLocaleString("en-IN")} pts today` : ""}`}
      width={980}
    >
      {error ? (
        <div className="rounded-sm border border-bad/25 bg-bad-bg px-4 py-3 text-[12.5px] font-medium text-bad">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-sm border border-line bg-paper px-4 py-10 text-center text-[12.5px] text-ink-3">
          Loading history…
        </div>
      ) : t.tasks === 0 ? (
        <div className="rounded-sm border border-line bg-paper px-4 py-10 text-center text-[12.5px] text-ink-3">
          Nothing logged in the last {WINDOW_DAYS} days.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* headline numbers */}
          <div
            className="grid grid-cols-2 overflow-hidden rounded-sm border border-line sm:grid-cols-3 lg:grid-cols-6"
            data-stagger
          >
            <Tile
              label="Score"
              value={t.score.toLocaleString("en-IN")}
              foot={`${t.scorePerHour}/hr`}
            />
            <Tile label="Tasks" value={String(t.tasks)} foot={`${t.donePct}% done`} />
            <Tile
              label="Time"
              value={formatDuration(t.minutes)}
              foot={`~${formatDuration(t.avgTaskMinutes)} each`}
            />
            <Tile
              label="Efficiency"
              value={t.avgEfficiency ? t.avgEfficiency.toFixed(2) : "—"}
              foot={
                t.avgEfficiency ? (
                  <Slider value={Math.round(t.avgEfficiency)} readOnly onChange={() => {}} />
                ) : null
              }
            />
            <Tile
              label="Impact"
              value={t.avgImpact ? t.avgImpact.toFixed(2) : "—"}
              foot={
                t.avgImpact ? (
                  <Rating value={Math.round(t.avgImpact)} readOnly onChange={() => {}} />
                ) : null
              }
            />
            <Tile
              label="Streak"
              value={run ? `${run}d` : "—"}
              foot={run ? "consecutive" : "no run"}
            />
          </div>

          {/* highlights */}
          <div className="grid gap-2 sm:grid-cols-3" data-stagger>
            {[
              sharp && sharp.avgEfficiency
                ? {
                    k: "Sharpest day",
                    v: sharp.label,
                    d: `${sharp.avgEfficiency.toFixed(2)} avg efficiency over ${sharp.days} ${sharp.days === 1 ? "day" : "days"}`,
                  }
                : null,
              busy
                ? {
                    k: "Biggest day",
                    v: busy.label,
                    d: `${busy.avgScore.toLocaleString("en-IN")} pts on an average ${busy.label}`,
                  }
                : null,
              best
                ? {
                    k: "Best single day",
                    v: dateShort(best.date),
                    d: `${best.score.toLocaleString("en-IN")} pts across ${best.tasks} ${best.tasks === 1 ? "task" : "tasks"}`,
                  }
                : null,
            ]
              .filter(Boolean)
              .map((h) => (
                <div
                  key={h!.k}
                  className="rounded-sm border border-line bg-paper px-3 py-2.5"
                >
                  <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
                    {h!.k}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">
                    {h!.v}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-[1.45] text-ink-4">
                    {h!.d}
                  </p>
                </div>
              ))}
          </div>

          {/* activity */}
          <Section title="Activity" hint={`${WINDOW_DAYS} days, darker is a bigger day`}>
            <div className="rounded-sm border border-line bg-surface p-3">
              <div className="flex flex-wrap gap-[3px]">
                {strip.map((c) => (
                  <span
                    key={c.date}
                    title={`${dateLong(c.date)} — ${c.tasks} ${c.tasks === 1 ? "task" : "tasks"}, ${c.score.toLocaleString("en-IN")} pts`}
                    className={cx(
                      "size-[11px] rounded-[1px]",
                      [
                        "bg-mute-bg",
                        "bg-ink/20",
                        "bg-ink/40",
                        "bg-ink/65",
                        "bg-ink",
                      ][c.level],
                    )}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-ink-4">
                <span>{dateShort(strip[0]?.date ?? todayISO())}</span>
                <span className="flex items-center gap-1.5">
                  less
                  {["bg-mute-bg", "bg-ink/20", "bg-ink/40", "bg-ink/65", "bg-ink"].map(
                    (c) => (
                      <span key={c} className={cx("size-[9px] rounded-[1px]", c)} />
                    ),
                  )}
                  more
                </span>
                <span>today</span>
              </div>
            </div>
          </Section>

          {/* weekly trend */}
          <Section title="Score by week" hint="last 12 weeks">
            <div className="rounded-sm border border-line bg-surface p-3">
              <div className="flex h-[110px] items-end gap-[4px]">
                {trend.map((b) => (
                  <div key={b.key} className="group/b relative h-full flex-1">
                    <div
                      data-bar-grow
                      style={{
                        height: `${b.value ? Math.max((b.value / trendMax) * 100, 2) : 0}%`,
                      }}
                      className="absolute inset-x-0 bottom-0 bg-ink-2 transition-colors group-hover/b:bg-ink"
                    />
                    {!b.value && (
                      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-line" />
                    )}
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-sm border border-line-strong bg-surface px-2 py-1 text-[10.5px] whitespace-nowrap text-ink-2 shadow-[0_6px_18px_-8px_rgba(23,23,26,0.35)] group-hover/b:block">
                      {dateShort(b.key)} — {b.value.toLocaleString("en-IN")} pts,{" "}
                      {b.sub} tasks
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-[4px]">
                {trend.map((b) => (
                  <span
                    key={b.key}
                    className="tnum flex-1 text-center text-[9.5px] text-ink-4"
                  >
                    {dateShort(b.key).split(" ")[0]}
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* weekday shape */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Day of the week" hint="average points per day worked">
              <div className="rounded-sm border border-line bg-surface py-1.5">
                {week.map((w) => (
                  <BarRow
                    key={w.key}
                    label={w.label}
                    value={w.avgScore}
                    max={weekMax}
                    emphasis={busy?.key === w.key}
                    caption={
                      w.days
                        ? `${w.avgScore.toLocaleString("en-IN")} · ${w.days}d`
                        : "—"
                    }
                  />
                ))}
              </div>
            </Section>

            <Section title="How the work splits">
              <div className="flex flex-col gap-2">
                <div className="rounded-sm border border-line bg-surface py-1.5">
                  {statuses.map((s) => (
                    <BarRow
                      key={s.key}
                      label={STATUS_BY_KEY[s.key as StatusKey].short}
                      value={s.value}
                      max={t.tasks}
                      caption={`${s.value} · ${t.tasks ? Math.round((s.value / t.tasks) * 100) : 0}%`}
                    />
                  ))}
                  <BarRow
                    label="Given"
                    value={t.assigned}
                    max={t.tasks}
                    caption={`${t.assigned} assigned`}
                  />
                </div>
                <div className="rounded-sm border border-line bg-surface py-1.5">
                  {attendance
                    .filter((a) => a.value > 0)
                    .map((a) => (
                      <BarRow
                        key={a.key}
                        label={ATTENDANCE_BY_KEY[a.key].short}
                        value={a.value}
                        max={dayLogs.length || 1}
                        caption={`${a.value} ${a.value === 1 ? "day" : "days"}`}
                      />
                    ))}
                </div>
              </div>
            </Section>
          </div>

          {/* rating spread */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Efficiency given" hint={`${t.rated} rated`}>
              <div className="rounded-sm border border-line bg-surface py-1.5">
                {effSpread.map((b) => (
                  <BarRow
                    key={b.key}
                    label={`${b.label}/5`}
                    value={b.value}
                    max={Math.max(...effSpread.map((x) => x.value), 1)}
                    caption={String(b.value)}
                  />
                ))}
              </div>
            </Section>
            <Section title="Impact given" hint={`${t.rated} rated`}>
              <div className="rounded-sm border border-line bg-surface py-1.5">
                {impSpread.map((b) => (
                  <BarRow
                    key={b.key}
                    label={`${b.label}/5`}
                    value={b.value}
                    max={Math.max(...impSpread.map((x) => x.value), 1)}
                    caption={String(b.value)}
                  />
                ))}
              </div>
            </Section>
          </div>

          {/* recent work */}
          <Section title="Recent tasks" hint={`${Math.min(recent.length, 12)} of ${t.tasks}`}>
            <div className="overflow-hidden rounded-sm border border-line">
              {recent.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-line px-3 py-2 last:border-b-0"
                >
                  <span className="tnum w-14 shrink-0 text-[11px] text-ink-4">
                    {dateShort(e.log_date)}
                  </span>
                  <span className="min-w-[180px] flex-1 text-[12.5px] leading-[1.45] break-words text-ink">
                    {e.title}
                    {e.created_by === null && (
                      <span className="ml-1.5 text-[10.5px] text-ink-4">assigned</span>
                    )}
                  </span>
                  <span className="tnum w-14 shrink-0 text-[11.5px] text-ink-3">
                    {formatDuration(e.minutes)}
                  </span>
                  <Chip tone={STATUS_BY_KEY[e.status].tone}>
                    {STATUS_BY_KEY[e.status].short}
                  </Chip>
                  <span className="tnum w-16 shrink-0 text-right text-[11.5px] text-ink-3">
                    {e.efficiency && e.impact
                      ? `${e.efficiency}/${e.impact}`
                      : "—"}
                  </span>
                  <span className="tnum w-14 shrink-0 text-right text-[12px] font-medium text-ink-2">
                    {e.efficiency && e.impact
                      ? Math.round((e.minutes ?? 0) * e.efficiency * e.impact / 5)
                      : 0}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <p className="text-[11px] text-ink-4" data-stagger>
            Logged times are as reported. Efficiency and impact are set by an
            admin; a task missing either scores nothing. Last updated{" "}
            {clock(new Date().toISOString())}.
          </p>
        </div>
      )}
    </Dialog>
  );
}
