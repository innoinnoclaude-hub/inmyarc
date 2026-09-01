import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { dateShort } from "../lib/date";
import { neighbours, weeklySeries, type ScoreRow } from "../lib/profile";
import type { Member } from "../lib/types";
import { cx } from "./ui";

type Tab = "score" | "efficiency" | "impact" | "position";

const TABS: { key: Tab; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "efficiency", label: "Efficiency" },
  { key: "impact", label: "Impact" },
  { key: "position", label: "Position" },
];

const WEEKS = 12;
const W = 720;
const H = 210;
const PAD = { top: 14, right: 12, bottom: 26, left: 34 };

/** Two comparison colours, flat and distinguishable without relying on hue alone. */
const PEER = ["#1b4d8e", "#8a5a08"];

export function ProfileTrend({
  rows,
  member,
  members,
}: {
  rows: ScoreRow[];
  member: Member;
  members: Member[];
}) {
  const [tab, setTab] = useState<Tab>("score");
  const svg = useRef<SVGSVGElement>(null);

  const mine = useMemo(
    () => weeklySeries(rows, member.id, WEEKS),
    [rows, member.id],
  );
  const peers = useMemo(
    () => neighbours(rows, member.id, members),
    [rows, member.id, members],
  );
  const peerSeries = useMemo(
    () => peers.map((p) => ({ ...p, points: weeklySeries(rows, p.id, WEEKS) })),
    [peers, rows],
  );

  const teamSize = members.length;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-line]",
        { strokeDashoffset: 1200 },
        { strokeDashoffset: 0, duration: 0.7, ease: "power2.out" },
      );
      gsap.fromTo(
        "[data-bar]",
        { scaleY: 0 },
        { scaleY: 1, duration: 0.45, stagger: 0.025, ease: "power3.out", transformOrigin: "bottom" },
      );
      gsap.fromTo(
        "[data-dot]",
        { opacity: 0 },
        { opacity: 1, duration: 0.3, delay: 0.35, stagger: 0.02 },
      );
    }, svg);
    return () => ctx.revert();
  }, [tab, mine]);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (mine.length > 1 ? (i / (mine.length - 1)) * innerW : innerW / 2);

  /* ------------------------------ position ------------------------------ */
  if (tab === "position") {
    // 1 at the top, teamSize at the bottom
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

    const ticks = Array.from(
      new Set([1, Math.ceil(teamSize / 3), Math.ceil((teamSize * 2) / 3), teamSize]),
    );

    return (
      <Shell tab={tab} setTab={setTab}>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label="Average weekly position, best at the top">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                    stroke="var(--color-line)" strokeWidth="1" />
              <text x={PAD.left - 7} y={y(t) + 3.5} textAnchor="end"
                    className="fill-ink-4" style={{ fontSize: 9 }}>
                {t}
              </text>
            </g>
          ))}

          {peerSeries.map((p, pi) => (
            <g key={p.id}>
              <path data-line d={path(p.points.map((w) => w.position))} fill="none"
                    stroke={PEER[pi]} strokeWidth="1.5" strokeDasharray="4 3"
                    strokeLinecap="round" opacity="0.75" />
              {p.points.map((w, i) =>
                w.position == null ? null : (
                  <circle key={i} data-dot cx={x(i)} cy={y(w.position)} r="2"
                          fill={PEER[pi]} opacity="0.75" />
                ),
              )}
            </g>
          ))}

          <path data-line d={path(mine.map((w) => w.position))} fill="none"
                stroke="var(--color-ink)" strokeWidth="2.25" strokeLinecap="round"
                strokeLinejoin="round" />
          {mine.map((w, i) =>
            w.position == null ? null : (
              <g key={i}>
                <circle data-dot cx={x(i)} cy={y(w.position)} r="3.5"
                        fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2" />
                <title>{`${dateShort(w.key)} — position ${w.position.toFixed(1)} of ${teamSize}`}</title>
              </g>
            ),
          )}

          {mine.map((w, i) => (
            <text key={w.key} x={x(i)} y={H - 8} textAnchor="middle"
                  className="fill-ink-4" style={{ fontSize: 8.5 }}>
              {dateShort(w.key).split(" ")[0]}
            </text>
          ))}
        </svg>

        <Legend member={member} peers={peers} />
      </Shell>
    );
  }

  /* -------------------------- score / eff / impact ---------------------- */
  const values = mine.map((w) =>
    tab === "score" ? w.score : tab === "efficiency" ? w.efficiency : w.impact,
  );
  const max =
    tab === "score" ? Math.max(...values.map((v) => v ?? 0), 1) : 5;

  return (
    <Shell tab={tab} setTab={setTab}>
      <div ref={svg as never} className="px-1">
        <div className="flex h-[150px] items-end gap-[5px]">
          {mine.map((w, i) => {
            const v = values[i];
            const pct = v == null ? 0 : Math.max((v / max) * 100, v ? 2 : 0);
            return (
              <div key={w.key} className="group/b relative h-full flex-1">
                <div
                  data-bar
                  style={{ height: `${pct}%` }}
                  className="absolute inset-x-0 bottom-0 bg-ink-2 transition-colors group-hover/b:bg-ink"
                />
                {!v && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-line" />}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-sm border border-line-strong bg-surface px-2 py-1 text-[10.5px] whitespace-nowrap text-ink-2 shadow-[0_6px_18px_-8px_rgba(23,23,26,0.35)] group-hover/b:block">
                  {dateShort(w.key)} —{" "}
                  {tab === "score"
                    ? `${w.score.toLocaleString("en-IN")} pts, ${w.tasks} tasks`
                    : v == null
                      ? "not rated"
                      : `${v.toFixed(2)} / 5 over ${w.tasks} tasks`}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-[5px]">
          {mine.map((w) => (
            <span key={w.key} className="tnum flex-1 text-center text-[9px] text-ink-4">
              {dateShort(w.key).split(" ")[0]}
            </span>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  tab,
  setTab,
  children,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-line bg-surface">
      <div className="flex gap-1 border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cx(
              "focus-ring -mb-px border-b-2 px-2.5 pb-2 pt-2 text-[11.5px] font-medium transition-colors",
              tab === t.key
                ? "border-ink text-ink"
                : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3">{children}</div>
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
          {/* a dashed rule, drawn rather than gradient-faked */}
          <svg width="18" height="4" aria-hidden>
            <line x1="0" y1="2" x2="18" y2="2" stroke={PEER[i]} strokeWidth="2"
                  strokeDasharray="4 3" strokeLinecap="round" />
          </svg>
          {p.name}
          <span className="text-ink-4">#{p.place} overall</span>
        </span>
      ))}
      <span className="ml-auto text-ink-4">1 is best, top of the chart</span>
    </div>
  );
}
