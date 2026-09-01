import { useEffect, useMemo, useState } from "react";
import gsap from "gsap";
import {
  ATTENDANCE_BY_KEY,
  STATUS_BY_KEY,
  formatDuration,
  type StatusKey,
} from "../config";
import { clock, dateShort } from "../lib/date";
import {
  attendanceSpread,
  averagePosition,
  bestDay,
  busiestWeekday,
  dailyRanks,
  memberPerDay,
  ratingSpread,
  sharpestWeekday,
  statusSpread,
  teamPerDay,
  totals,
  weekdayProfile,
  type PerDay,
  type ScoreRow,
} from "../lib/profile";
import { isConfigured, supabase } from "../lib/supabase";
import type { DayLog, Entry, Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { ProfileCalendar } from "./ProfileCalendar";
import { ProfileTrend } from "./ProfileTrend";
import { Chip, Rating, Slider, cx } from "./ui";

interface Loaded {
  entries: Entry[];
  dayLogs: DayLog[];
  rows: ScoreRow[];
  members: Member[];
}

const EMPTY: Loaded = { entries: [], dayLogs: [], rows: [], members: [] };

/**
 * Position only means something against the rest of the team, and the average
 * position is meant to span the whole history, so this pulls every rollup row
 * for everyone rather than a window for one person. That table is one row per
 * person per day — small enough to fetch whole.
 */
function useProfile(member: Member | null) {
  const [data, setData] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member || !isConfigured) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [e, d, sc, m] = await Promise.all([
          supabase
            .from("entries")
            .select(
              "id,log_date,member_id,created_by,title,details,status,minutes,efficiency,impact,remarks,status_by,status_at,created_at,updated_at",
            )
            .eq("member_id", member.id)
            .order("log_date", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("day_logs")
            .select("id,member_id,log_date,attendance,note,updated_at")
            .eq("member_id", member.id),
          supabase
            .from("daily_scores")
            .select(
              "member_id,log_date,tasks,done,minutes,rated,impact_sum,efficiency_sum,score",
            ),
          supabase.from("members").select("id,name,title,active").eq("active", true),
        ]);
        for (const r of [e, d, sc, m]) if (r.error) throw r.error;
        if (cancelled) return;
        setData({
          entries: (e.data ?? []) as Entry[],
          dayLogs: (d.data ?? []) as DayLog[],
          rows: (sc.data ?? []) as ScoreRow[],
          members: (m.data ?? []) as Member[],
        });
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
  muted,
}: {
  label: string;
  value: string;
  foot?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-r border-b border-line px-3 py-2.5 last:border-r-0">
      <span className="truncate text-[9.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
        {label}
      </span>
      <span
        className={cx(
          "tnum text-[18px] leading-none font-semibold tracking-[-0.02em]",
          muted ? "text-ink-2" : "text-ink",
        )}
      >
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
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
          {title}
        </h3>
        {hint && <span className="text-right text-[11px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

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
          style={{
            width: `${max ? Math.max((value / max) * 100, value ? 2 : 0) : 0}%`,
          }}
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

/** One row of the same six measures, so the person and the team line up. */
function AverageRow({
  data,
  label,
  hint,
  muted,
  lastTile,
}: {
  data: PerDay;
  label: string;
  hint: string;
  muted?: boolean;
  lastTile: { label: string; value: string; foot: React.ReactNode };
}) {
  return (
    <div data-stagger>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </h3>
        <span className="text-right text-[11px] text-ink-4">{hint}</span>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-sm border border-line sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Score / day"
          value={data.score.toLocaleString("en-IN")}
          foot={`${data.scorePerHour}/hr`}
          muted={muted}
        />
        <Tile
          label="Tasks / day"
          value={String(data.tasks)}
          foot={`${data.donePct}% done`}
          muted={muted}
        />
        <Tile
          label="Time / day"
          value={formatDuration(data.minutes)}
          foot={`${data.days} ${data.days === 1 ? "day" : "days"}`}
          muted={muted}
        />
        <Tile
          label="Efficiency"
          value={data.efficiency ? data.efficiency.toFixed(2) : "—"}
          foot={
            data.efficiency ? (
              <Slider
                value={Math.round(data.efficiency)}
                readOnly
                onChange={() => {}}
              />
            ) : null
          }
          muted={muted}
        />
        <Tile
          label="Impact"
          value={data.impact ? data.impact.toFixed(2) : "—"}
          foot={
            data.impact ? (
              <Rating value={Math.round(data.impact)} readOnly onChange={() => {}} />
            ) : null
          }
          muted={muted}
        />
        <Tile
          label={lastTile.label}
          value={lastTile.value}
          foot={lastTile.foot}
          muted={muted}
        />
      </div>
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
  const { entries, dayLogs, rows, members } = data;

  const t = useMemo(() => totals(entries), [entries]);
  const mineAvg = useMemo(() => memberPerDay(rows, member.id), [rows, member.id]);
  const teamAvg = useMemo(() => teamPerDay(rows), [rows]);
  const ranks = useMemo(() => dailyRanks(rows), [rows]);
  const position = useMemo(
    () => averagePosition(ranks, member.id),
    [ranks, member.id],
  );
  const week = useMemo(() => weekdayProfile(entries), [entries]);
  const sharp = useMemo(() => sharpestWeekday(week), [week]);
  const busy = useMemo(() => busiestWeekday(week), [week]);
  const best = useMemo(() => bestDay(entries), [entries]);
  const effSpread = useMemo(() => ratingSpread(entries, "efficiency"), [entries]);
  const impSpread = useMemo(() => ratingSpread(entries, "impact"), [entries]);
  const statuses = useMemo(() => statusSpread(entries), [entries]);
  const attendance = useMemo(() => attendanceSpread(dayLogs), [dayLogs]);

  useEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-stagger]",
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: "power2.out" },
      );
    });
    return () => ctx.revert();
  }, [loading]);

  const weekMax = Math.max(...week.map((w) => w.avgScore), 1);
  const recent = entries.slice(0, 12);
  const teamSize = members.length || 1;

  return (
    <Dialog
      open
      onClose={onClose}
      title={member.name}
      subtitle={
        [
          rankToday ? `rank ${rankToday} today` : null,
          scoreToday ? `${scoreToday.toLocaleString("en-IN")} pts today` : null,
          position.avg !== null
            ? `avg position ${position.avg.toFixed(1)} of ${teamSize}, all time`
            : null,
        ]
          .filter(Boolean)
          .join(" — ") || undefined
      }
      width={1000}
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
          Nothing logged yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <AverageRow
            data={mineAvg}
            label={member.name}
            hint="per day worked"
            lastTile={{
              label: "Avg position",
              value:
                position.avg !== null
                  ? `${position.avg.toFixed(1)} / ${teamSize}`
                  : "—",
              foot: position.best ? `best ${position.best}` : null,
            }}
          />

          <AverageRow
            data={teamAvg}
            label="Team average"
            hint="counts a person only on a day they logged"
            muted
            lastTile={{
              label: "Person-days",
              value: String(teamAvg.days),
              foot: `${teamSize} on the portal`,
            }}
          />

          <div className="grid gap-2 sm:grid-cols-3" data-stagger>
            {[
              sharp?.avgEfficiency
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

          <Section title="Activity" hint="shaded by position that day — click a day for its tasks">
            <ProfileCalendar
              rows={rows}
              entries={entries}
              memberId={member.id}
              teamSize={teamSize}
            />
          </Section>

          <Section title="By week" hint="last 12 weeks">
            <ProfileTrend rows={rows} member={member} members={members} />
          </Section>

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

          <Section
            title="Recent tasks"
            hint={`${Math.min(recent.length, 12)} of ${t.tasks}`}
          >
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
                      <span className="ml-1.5 text-[10.5px] text-ink-4">
                        assigned
                      </span>
                    )}
                  </span>
                  <span className="tnum w-14 shrink-0 text-[11.5px] text-ink-3">
                    {formatDuration(e.minutes)}
                  </span>
                  <Chip tone={STATUS_BY_KEY[e.status].tone}>
                    {STATUS_BY_KEY[e.status].short}
                  </Chip>
                  <span className="tnum w-16 shrink-0 text-right text-[11.5px] text-ink-3">
                    {e.efficiency && e.impact ? `${e.efficiency}/${e.impact}` : "—"}
                  </span>
                  <span className="tnum w-14 shrink-0 text-right text-[12px] font-medium text-ink-2">
                    {e.efficiency && e.impact
                      ? Math.round(((e.minutes ?? 0) * e.efficiency * e.impact) / 5)
                      : 0}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <p className="text-[11px] leading-[1.5] text-ink-4" data-stagger>
            Averages are per day worked, so nobody is diluted by days they did
            not log. The team average counts a person only on a day they logged
            at least one task. Position is a dense rank against everyone on the
            portal that day. Loaded {clock(new Date().toISOString())}.
          </p>
        </div>
      )}
    </Dialog>
  );
}
