import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { formatDuration } from "../config";
import { dateLong, dateShort, shiftISO } from "../lib/date";
import {
  SPAN,
  ordinal,
  rangeStart,
  useScores,
  type Bucket,
  type Grain,
} from "../lib/useScores";
import type { Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { Label, Segmented, Select, Star, cx } from "./ui";

const TEAM = "__team__";

export function ChartDialog({
  open,
  onClose,
  members,
  identity,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  identity: string | null;
}) {
  const [grain, setGrain] = useState<Grain>("week");
  const [who, setWho] = useState<string>(TEAM);
  const { loading, error, seriesFor, leaderboard, ranksFor, hasAny } =
    useScores(open, grain);

  useEffect(() => {
    if (open) setWho(identity ?? TEAM);
  }, [open, identity]);

  const isTeam = who === TEAM;
  const series = useMemo(
    () => seriesFor(isTeam ? null : who),
    [seriesFor, isTeam, who],
  );
  const board = useMemo(() => leaderboard(members), [leaderboard, members]);
  const ranks = useMemo(
    () => (isTeam ? null : ranksFor(who, members)),
    [ranksFor, isTeam, who, members],
  );

  const totals = useMemo(() => {
    const t = series.reduce(
      (a, b) => ({
        tasks: a.tasks + b.tasks,
        done: a.done + b.done,
        minutes: a.minutes + b.minutes,
        score: a.score + b.score,
      }),
      { tasks: 0, done: 0, minutes: 0, score: 0 },
    );
    const rated = series.filter((b) => b.avgImpact !== null);
    const weight = rated.reduce((s, b) => s + b.tasks, 0) || 1;
    const avgImpact = rated.length
      ? rated.reduce((s, b) => s + (b.avgImpact ?? 0) * b.tasks, 0) / weight
      : null;
    const avgEfficiency = rated.length
      ? rated.reduce((s, b) => s + (b.avgEfficiency ?? 0) * b.tasks, 0) / weight
      : null;
    return { ...t, avgImpact, avgEfficiency };
  }, [series]);

  const from = rangeStart(grain);
  const name = isTeam
    ? "the whole team"
    : (members.find((m) => m.id === who)?.name ?? "");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Performance"
      subtitle={`${dateLong(from)} to today — ${
        grain === "week" ? `${SPAN.week} weeks` : `${SPAN.month} months`
      } for ${name}`}
      width={860}
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2" data-stagger>
          <div>
            <Label htmlFor="who-chart">Show</Label>
            <Select
              id="who-chart"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            >
              <option value={TEAM}>Whole team</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Grouped by</Label>
            <Segmented
              value={grain}
              onChange={setGrain}
              options={[
                { key: "week", label: "Week wise" },
                { key: "month", label: "Month wise" },
              ]}
            />
          </div>
        </div>

        <div
          className="grid grid-cols-2 overflow-hidden rounded-sm border border-line sm:grid-cols-3 lg:grid-cols-5"
          data-stagger
        >
          <Tile label="Score" value={totals.score.toLocaleString("en-IN")} />
          <Tile label="Tasks" value={`${totals.done} / ${totals.tasks}`} foot="done" />
          <Tile label="Time logged" value={formatDuration(totals.minutes)} />
          <Tile
            label="Avg efficiency"
            value={
              totals.avgEfficiency !== null
                ? totals.avgEfficiency.toFixed(2)
                : "—"
            }
            foot={
              totals.avgEfficiency !== null
                ? `keeps ${Math.round(totals.avgEfficiency * 20)}% of time`
                : undefined
            }
          />
          <Tile
            label="Avg impact"
            value={totals.avgImpact !== null ? totals.avgImpact.toFixed(2) : "—"}
            stars={totals.avgImpact}
          />
          <Tile
            label="Avg rank"
            value={
              ranks?.avg != null
                ? `${ranks.avg.toFixed(1)} / ${ranks.total}`
                : "—"
            }
            foot={
              isTeam
                ? "pick a person"
                : ranks?.overall != null
                  ? `${ordinal(ranks.overall)} over the range`
                  : "no activity yet"
            }
          />
        </div>

        <div data-stagger>
          <Label hint={grain === "week" ? "score per week" : "score per month"}>
            Trend
          </Label>
          {error ? (
            <Note>{error}</Note>
          ) : loading ? (
            <Note>Loading history…</Note>
          ) : !hasAny ? (
            <Note>
              Nothing recorded yet. Scores appear here as soon as tasks are
              logged with a time and a rating.
            </Note>
          ) : (
            <BarChart
              series={series}
              grain={grain}
              ranks={ranks?.perBucket}
              rankTotal={ranks?.total}
            />
          )}
        </div>

        {isTeam && hasAny && !loading && !error && (
          <div data-stagger>
            <Label hint="score / efficiency-impact / time">Ranking</Label>
            <div className="overflow-hidden rounded-sm border border-line">
              {board.map((row, i) => {
                const top = board[0]?.score || 1;
                return (
                  <div
                    key={row.member.id}
                    className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
                  >
                    <span className="tnum w-5 shrink-0 text-[11px] font-semibold text-ink-4">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="w-24 shrink-0 truncate text-[12.5px] font-medium text-ink">
                      {row.member.name}
                    </span>
                    <span className="relative h-[6px] flex-1 bg-mute-bg">
                      <span
                        className={cx(
                          "absolute inset-y-0 left-0",
                          i === 0 ? "bg-ink" : "bg-ink-4",
                        )}
                        style={{
                          width: `${Math.max((row.score / top) * 100, row.score ? 1.5 : 0)}%`,
                        }}
                      />
                    </span>
                    <span className="tnum w-16 shrink-0 text-right text-[12px] font-medium text-ink-2">
                      {row.score.toLocaleString("en-IN")}
                    </span>
                    <span className="tnum hidden w-14 shrink-0 text-right text-[11.5px] text-ink-4 sm:block">
                      {row.avgEfficiency !== null && row.avgImpact !== null
                        ? `${row.avgEfficiency.toFixed(1)}/${row.avgImpact.toFixed(1)}`
                        : "—"}
                    </span>
                    <span className="tnum hidden w-16 shrink-0 text-right text-[11.5px] text-ink-4 sm:block">
                      {formatDuration(row.minutes)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-line bg-paper px-4 py-8 text-center text-[12.5px] leading-[1.6] text-ink-3">
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  foot,
  stars,
}: {
  label: string;
  value: string;
  foot?: string;
  stars?: number | null;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-r border-b border-line px-3 py-3 last:border-r-0">
      <span className="text-[10px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
        {label}
      </span>
      <span className="tnum text-[18px] leading-none font-semibold tracking-[-0.02em] text-ink">
        {value}
      </span>
      <span className="flex h-[13px] items-center gap-0.5 text-[10.5px] text-ink-4">
        {stars != null
          ? [1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                filled={n <= Math.round(stars)}
                className={cx(
                  "size-[11px]",
                  n <= Math.round(stars) ? "text-ink-2" : "text-line-strong",
                )}
              />
            ))
          : foot}
      </span>
    </div>
  );
}

/** Plain divs rather than SVG — stays crisp at any width, no viewBox scaling. */
export function BarChart({
  series,
  grain,
  ranks,
  rankTotal,
}: {
  series: Bucket[];
  grain: Grain;
  /** Per-bucket standing, when a single person is selected. */
  ranks?: (number | null)[];
  rankTotal?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const max = Math.max(...series.map((b) => b.score), 1);
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-bar]",
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 0.5,
          stagger: 0.025,
          ease: "power3.out",
          transformOrigin: "bottom",
        },
      );
    }, root);
    return () => ctx.revert();
  }, [series]);

  return (
    <div ref={root} className="rounded-sm border border-line bg-surface p-3">
      <div className="flex gap-2">
        <div className="flex w-10 shrink-0 flex-col justify-between py-[1px] text-right">
          {ticks.map((t) => (
            <span key={t} className="tnum text-[9.5px] leading-none text-ink-4">
              {Math.round(max * t).toLocaleString("en-IN")}
            </span>
          ))}
        </div>

        <div className="relative h-[180px] flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              style={{ bottom: `${t * 100}%` }}
              className="absolute inset-x-0 h-px bg-line"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px]">
            {series.map((b, i) => (
              <div key={b.key} className="group/bar relative h-full flex-1">
                <div
                  data-bar
                  style={{
                    height: `${b.score ? Math.max((b.score / max) * 100, 1.2) : 0}%`,
                  }}
                  className={cx(
                    "absolute inset-x-0 bottom-0 transition-colors",
                    b.score ? "bg-ink-2 group-hover/bar:bg-ink" : "bg-transparent",
                  )}
                />
                {!b.score && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] bg-line" />
                )}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-max -translate-x-1/2 rounded-sm border border-line-strong bg-surface px-2.5 py-2 text-left shadow-[0_8px_24px_-10px_rgba(23,23,26,0.35)] group-hover/bar:block">
                  <p className="text-[11px] font-semibold text-ink">
                    {grain === "week"
                      ? `${dateShort(b.key)} – ${dateShort(shiftISO(b.key, 6))}`
                      : dateLong(b.key).replace(/^\d+ /, "")}
                  </p>
                  <dl className="tnum mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11px] text-ink-3">
                    <dt>Score</dt>
                    <dd className="text-right font-medium text-ink-2">
                      {b.score.toLocaleString("en-IN")}
                    </dd>
                    <dt>Tasks</dt>
                    <dd className="text-right font-medium text-ink-2">
                      {b.done} / {b.tasks}
                    </dd>
                    <dt>Time</dt>
                    <dd className="text-right font-medium text-ink-2">
                      {formatDuration(b.minutes)}
                    </dd>
                    <dt>Efficiency</dt>
                    <dd className="text-right font-medium text-ink-2">
                      {b.avgEfficiency !== null
                        ? `${b.avgEfficiency.toFixed(2)} / 5`
                        : "—"}
                    </dd>
                    <dt>Impact</dt>
                    <dd className="text-right font-medium text-ink-2">
                      {b.avgImpact !== null ? `${b.avgImpact.toFixed(2)} / 5` : "—"}
                    </dd>
                    {ranks && (
                      <>
                        <dt>Rank</dt>
                        <dd className="text-right font-medium text-ink-2">
                          {ranks[i] != null
                            ? `${ordinal(ranks[i]!)} of ${rankTotal}`
                            : "—"}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <span className="w-10 shrink-0" />
        <div className="flex flex-1 gap-[3px]">
          {series.map((b) => (
            <span
              key={b.key}
              className="tnum min-w-0 flex-1 text-center text-[9.5px] leading-[1.3] text-ink-4"
            >
              <span className="block truncate">{b.label}</span>
              {b.sub && (
                <span className="block truncate text-ink-4/70">{b.sub}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
