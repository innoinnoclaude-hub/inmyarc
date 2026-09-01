import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { dateLong, dateShort, monthShort, shiftISO } from "../lib/date";
import {
  neighbours,
  pointsForDays,
  pointsForWeeks,
  weeksInMonth,
  type ScoreRow,
  type SeriesPoint,
} from "../lib/profile";
import type { Member } from "../lib/types";
import { Select, cx } from "./ui";

type Metric = "score" | "efficiency" | "impact" | "position";
type Grain = "week" | "day";

const METRICS: { key: Metric; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "efficiency", label: "Efficiency" },
  { key: "impact", label: "Impact" },
  { key: "position", label: "Position" },
];

const W = 720;
const H = 210;
const PAD = { top: 14, right: 12, bottom: 26, left: 34 };

/** Two comparison colours, far enough apart to read as separate lines. */
const PEER = ["#1b4d8e", "#8a5a08"];

export function ProfileTrend({
  rows,
  member,
  members,
  month,
}: {
  rows: ScoreRow[];
  member: Member;
  members: Member[];
  /** The month currently shown in the calendar; the chart follows it. */
  month: string;
}) {
  const [metric, setMetric] = useState<Metric>("score");
  const [grain, setGrain] = useState<Grain>("week");
  const holder = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => weeksInMonth(month), [month]);
  const [week, setWeek] = useState(() => weeks[weeks.length - 1]);

  // the calendar moved to another month, so re-point at a week inside it
  useEffect(() => {
    if (!weeks.includes(week)) setWeek(weeks[weeks.length - 1]);
  }, [weeks, week]);

  const mine = useMemo(
    () =>
      grain === "week"
        ? pointsForWeeks(rows, member.id, weeks)
        : pointsForDays(rows, member.id, week ?? weeks[0]),
    [grain, rows, member.id, weeks, week],
  );

  const peers = useMemo(
    () => neighbours(rows, member.id, members),
    [rows, member.id, members],
  );

  const peerSeries = useMemo(
    () =>
      peers.map((p) => ({
        ...p,
        points:
          grain === "week"
            ? pointsForWeeks(rows, p.id, weeks)
            : pointsForDays(rows, p.id, week ?? weeks[0]),
      })),
    [peers, rows, grain, weeks, week],
  );

  const teamSize = members.length || 1;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-line]",
        { strokeDashoffset: 900, opacity: 0 },
        { strokeDashoffset: 0, opacity: 1, duration: 0.65, ease: "power2.out" },
      );
      gsap.fromTo(
        "[data-bar]",
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 0.45,
          stagger: 0.03,
          ease: "power3.out",
          transformOrigin: "bottom",
        },
      );
      gsap.fromTo(
        "[data-dot]",
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 0.3, delay: 0.3, stagger: 0.025 },
      );
    }, holder);
    return () => ctx.revert();
  }, [metric, grain, week, month, mine]);

  const tickLabel = (p: SeriesPoint) =>
    grain === "week" ? dateShort(p.key).split(" ")[0] : p.label.slice(0, 1);

  const pointName = (p: SeriesPoint) =>
    grain === "week"
      ? `${dateShort(p.key)} – ${dateShort(shiftISO(p.key, 6))}`
      : `${p.label} ${dateShort(p.key)}`;

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {grain === "day" && (
        <Select
          value={week ?? ""}
          onChange={(e) => setWeek(e.target.value)}
          aria-label="Week"
          className="h-7 w-auto text-[11.5px]"
        >
          {/* a week at the edge of a month starts in the one before, so the
              span is spelled out rather than named by its Monday alone */}
          {weeks.map((w, i) => (
            <option key={w} value={w}>
              Week {i + 1} · {dateShort(w)} – {dateShort(shiftISO(w, 6))}
            </option>
          ))}
        </Select>
      )}
      <div className="flex items-center rounded-sm border border-line-strong bg-surface">
        {(["week", "day"] as Grain[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrain(g)}
            aria-pressed={grain === g}
            className={cx(
              "focus-ring h-7 px-2.5 text-[11.5px] font-medium capitalize transition-colors first:rounded-l-sm last:rounded-r-sm",
              grain === g
                ? "bg-ink text-white"
                : "text-ink-3 hover:bg-mute-bg hover:text-ink",
            )}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );

  const scope =
    grain === "week"
      ? `${monthShort(month)} ${month.slice(0, 4)} — ${weeks.length} weeks`
      : week
        ? `${dateLong(week)} – ${dateLong(shiftISO(week, 6))}`
        : "";

  /* ------------------------------ position ------------------------------ */
  if (metric === "position") {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) =>
      PAD.left + (mine.length > 1 ? (i / (mine.length - 1)) * innerW : innerW / 2);
    const y = (rank: number) =>
      PAD.top + ((rank - 1) / Math.max(teamSize - 1, 1)) * innerH;

    const path = (pts: (number | null)[]) => {
      const segs: string[] = [];
      let drawing = false;
      pts.forEach((v, i) => {
        if (v == null) {
          drawing = false;
          return;
        }
        segs.push(`${drawing ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
        drawing = true;
      });
      return segs.join(" ");
    };

    const ticks = [
      ...new Set([
        1,
        Math.ceil(teamSize / 3),
        Math.ceil((teamSize * 2) / 3),
        teamSize,
      ]),
    ];

    return (
      <Shell metric={metric} setMetric={setMetric} controls={controls} scope={scope}>
        <div ref={holder}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label="Position over time, best at the top"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-line)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 7}
                  y={y(t) + 3.5}
                  textAnchor="end"
                  className="fill-ink-4"
                  style={{ fontSize: 9 }}
                >
                  {t}
                </text>
              </g>
            ))}

            {peerSeries.map((p, pi) => (
              <g key={p.id}>
                <path
                  data-line
                  d={path(p.points.map((w) => w.position))}
                  fill="none"
                  stroke={PEER[pi]}
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                  opacity="0.75"
                />
                {p.points.map((w, i) =>
                  w.position == null ? null : (
                    <circle
                      key={i}
                      data-dot
                      cx={x(i)}
                      cy={y(w.position)}
                      r="2"
                      fill={PEER[pi]}
                      opacity="0.75"
                    />
                  ),
                )}
              </g>
            ))}

            <path
              data-line
              d={path(mine.map((w) => w.position))}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {mine.map((w, i) =>
              w.position == null ? null : (
                <g key={i}>
                  <circle
                    data-dot
                    cx={x(i)}
                    cy={y(w.position)}
                    r="3.5"
                    fill="var(--color-surface)"
                    stroke="var(--color-ink)"
                    strokeWidth="2"
                  />
                  <title>{`${pointName(w)} — position ${w.position.toFixed(1)} of ${teamSize}`}</title>
                </g>
              ),
            )}

            {mine.map((w, i) => (
              <text
                key={w.key}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-ink-4"
                style={{ fontSize: 8.5 }}
              >
                {tickLabel(w)}
              </text>
            ))}
          </svg>
          <Legend member={member} peers={peers} />
        </div>
      </Shell>
    );
  }

  /* -------------------------- score / eff / impact ---------------------- */
  const values = mine.map((p) =>
    metric === "score" ? p.score : metric === "efficiency" ? p.efficiency : p.impact,
  );
  const max = metric === "score" ? Math.max(...values.map((v) => v ?? 0), 1) : 5;

  return (
    <Shell metric={metric} setMetric={setMetric} controls={controls} scope={scope}>
      <div ref={holder} className="px-1">
        <div className="flex h-[150px] items-end gap-[6px]">
          {mine.map((p, i) => {
            const v = values[i];
            const pct = v == null ? 0 : Math.max((v / max) * 100, v ? 2 : 0);
            return (
              <div key={p.key} className="group/b relative h-full flex-1">
                <div
                  data-bar
                  style={{ height: `${pct}%` }}
                  className="absolute inset-x-0 bottom-0 bg-ink-2 transition-colors group-hover/b:bg-ink"
                />
                {!v && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] bg-line" />
                )}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-sm border border-line-strong bg-surface px-2 py-1 text-[10.5px] whitespace-nowrap text-ink-2 shadow-[0_6px_18px_-8px_rgba(23,23,26,0.35)] group-hover/b:block">
                  {pointName(p)} —{" "}
                  {metric === "score"
                    ? `${p.score.toLocaleString("en-IN")} pts, ${p.tasks} ${p.tasks === 1 ? "task" : "tasks"}`
                    : v == null
                      ? "not rated"
                      : `${v.toFixed(2)} / 5 over ${p.tasks} ${p.tasks === 1 ? "task" : "tasks"}`}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-[6px]">
          {mine.map((p) => (
            <span
              key={p.key}
              className="tnum flex-1 text-center text-[9.5px] text-ink-4"
            >
              {grain === "week" ? dateShort(p.key).split(" ")[0] : p.label}
            </span>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  metric,
  setMetric,
  controls,
  scope,
  children,
}: {
  metric: Metric;
  setMetric: (m: Metric) => void;
  controls: React.ReactNode;
  scope: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cx(
                "focus-ring rounded-sm px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                metric === m.key
                  ? "bg-mute-bg text-ink"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {controls}
      </div>
      <div className="px-3 pt-2 text-[10.5px] text-ink-4">{scope}</div>
      <div className="p-3 pt-1">{children}</div>
    </div>
  );
}

function Legend({
  member,
  peers,
}: {
  member: Member;
  peers: { id: string; name: string; place: number }[];
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[10.5px] text-ink-3">
      <span className="flex items-center gap-1.5">
        <span className="h-[2px] w-4 bg-ink" />
        {member.name}
      </span>
      {peers.map((p, i) => (
        <span key={p.id} className="flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden>
            <line
              x1="0"
              y1="2"
              x2="18"
              y2="2"
              stroke={PEER[i]}
              strokeWidth="2"
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
          </svg>
          {p.name}
          <span className="text-ink-4">#{p.place} overall</span>
        </span>
      ))}
      <span className="ml-auto text-ink-4">1 is best, top of the chart</span>
    </div>
  );
}
