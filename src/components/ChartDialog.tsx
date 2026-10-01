import { useMemo, useState } from "react";
import { CATEGORIES, formatDuration } from "../config";
import {
  bucketOf,
  leaderboard,
  tallyOf,
  useHistory,
  type DayRow,
  type Grain,
} from "../lib/history";
import { dateShort, shiftISO, startOfMonth, startOfWeek, todayISO } from "../lib/date";
import type { Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { Button, Chip, Cookie, Segmented, Select, cx } from "./ui";

/** Twelve weeks back, or six months — enough to see a pattern, not a chore to read. */
function startOf(grain: Grain): string {
  return grain === "week"
    ? startOfWeek(shiftISO(todayISO(), -7 * 11))
    : startOfMonth(shiftISO(todayISO(), -31 * 5));
}

function label(bucket: string, grain: Grain): string {
  return grain === "week"
    ? dateShort(bucket)
    : new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
        new Date(bucket + "T12:00:00Z"),
      );
}

/** A row of verdicts as one bar, each category in its own colour. */
function MixBar({
  counts,
  total,
  height = 12,
}: {
  counts: Record<string, number>;
  total: number;
  height?: number;
}) {
  if (!total) {
    return (
      <div
        className="w-full rounded-xs bg-mute-bg"
        style={{ height }}
        title="No verdicts yet"
      />
    );
  }
  return (
    <div
      className="flex w-full overflow-hidden rounded-xs"
      style={{ height }}
      role="img"
      aria-label={CATEGORIES.filter((c) => counts[c.key])
        .map((c) => `${counts[c.key]} ${c.label}`)
        .join(", ")}
    >
      {CATEGORIES.map((c) =>
        counts[c.key] ? (
          <span
            key={c.key}
            title={`${counts[c.key]} × ${c.label}`}
            style={{
              width: `${(100 * counts[c.key]) / total}%`,
              backgroundColor: c.bg,
              borderRight: `1px solid ${c.line}`,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

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
  const [who, setWho] = useState<string>("");
  const [bucket, setBucket] = useState<string>("all");
  const from = startOf(grain);
  const { members: roster, rows, loading, error } = useHistory(open, from);

  const people = roster.length ? roster : members;
  const buckets = useMemo(() => {
    const seen = new Set(rows.map((r) => bucketOf(r.log_date, grain)));
    return [...seen].sort().reverse();
  }, [rows, grain]);

  const scoped = useMemo(
    () =>
      bucket === "all"
        ? rows
        : rows.filter((r) => bucketOf(r.log_date, grain) === bucket),
    [rows, bucket, grain],
  );

  const byMember = useMemo(() => {
    const map = new Map<string, DayRow[]>();
    for (const r of scoped) {
      const list = map.get(r.member_id);
      if (list) list.push(r);
      else map.set(r.member_id, [r]);
    }
    return map;
  }, [scoped]);

  const board = useMemo(
    () => leaderboard(people, byMember),
    [people, byMember],
  );
  const team = useMemo(() => tallyOf(scoped), [scoped]);

  /** The chosen person's run of verdicts, newest bucket first. */
  const series = useMemo(() => {
    const keys = [...new Set(rows.map((r) => bucketOf(r.log_date, grain)))].sort();
    return keys.map((k) => {
      const inBucket = rows.filter(
        (r) => bucketOf(r.log_date, grain) === k && (!who || r.member_id === who),
      );
      return { key: k, tally: tallyOf(inBucket) };
    });
  }, [rows, grain, who]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Review"
      subtitle="Verdicts, brownies and hours since the new system began"
      width={980}
      footer={
        <>
          <p className="mr-auto text-[11.5px] text-ink-4">
            Days are judged whole. Nobody is ranked by a number any more — the
            standing is the verdict.
          </p>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2" data-stagger>
        <Segmented
          value={grain}
          onChange={(v: Grain) => {
            setGrain(v);
            setBucket("all");
          }}
          options={[
            { key: "week", label: "By week" },
            { key: "month", label: "By month" },
          ]}
        />
        <Select
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          className="w-auto"
        >
          <option value="all">Whole period</option>
          {buckets.map((b) => (
            <option key={b} value={b}>
              {grain === "week" ? `Week of ${label(b, grain)}` : label(b, grain)}
            </option>
          ))}
        </Select>
        <Select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="w-auto"
        >
          <option value="">Whole team</option>
          {people.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        {team.judged > 0 && (
          <Chip tone="mute">
            {team.judged} verdict{team.judged === 1 ? "" : "s"}
          </Chip>
        )}
        {team.brownies > 0 && (
          <Chip tone="mute">{team.brownies} brownies</Chip>
        )}
      </div>

      {error && (
        <p className="mb-3 text-[12.5px] font-medium text-bad">{error}</p>
      )}

      {loading ? (
        <div className="flex h-[260px] items-center justify-center text-[12.5px] text-ink-4">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-[13px] font-medium text-ink-2">
            Nothing to review yet.
          </p>
          <p className="text-[12px] text-ink-4">
            The new system started on 1 October 2026 — verdicts appear here as
            admins give them.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-stagger>
          {/* the standing */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
              Standing{" "}
              {bucket === "all"
                ? "over the whole period"
                : `for ${grain === "week" ? "week of " : ""}${label(bucket, grain)}`}
            </h3>
            <div className="flex flex-col gap-1">
              {board.map(({ member, tally, place }) => (
                <div
                  key={member.id}
                  className={cx(
                    "grid grid-cols-[26px_104px_1fr_132px] items-center gap-3 rounded-sm px-2 py-1.5",
                    member.id === identity && "bg-paper",
                    member.id === who && "ring-1 ring-line-strong",
                  )}
                >
                  <span className="tnum text-[12px] font-semibold text-ink-3">
                    {place ? String(place).padStart(2, "0") : "–"}
                  </span>
                  <span className="truncate text-[12.5px] font-medium text-ink">
                    {member.name}
                  </span>
                  <MixBar counts={tally.byCategory} total={tally.judged} />
                  <span className="tnum flex items-center justify-end gap-2 text-[11px] text-ink-4">
                    {tally.brownies > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[#7a5312]"
                        title={`${tally.overtime} overtime, ${tally.holiday} holiday`}
                      >
                        <Cookie className="size-3" />
                        {tally.brownies}
                      </span>
                    )}
                    <span>{tally.tasks} tasks</span>
                    <span className="text-ink-3">
                      {formatDuration(tally.minutes)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* how the verdicts moved */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
              {who
                ? `${people.find((p) => p.id === who)?.name ?? ""} — verdict by ${grain}`
                : `Team verdicts by ${grain}`}
            </h3>
            <div className="flex items-end gap-1.5">
              {series.map((s) => {
                const top = Math.max(...series.map((x) => x.tally.judged), 1);
                return (
                  <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="flex w-full flex-col-reverse overflow-hidden rounded-xs border border-line"
                      style={{ height: 96 }}
                      title={`${s.tally.judged} judged · ${s.tally.tasks} tasks · ${formatDuration(s.tally.minutes)}`}
                    >
                      {CATEGORIES.map((c) =>
                        s.tally.byCategory[c.key] ? (
                          <span
                            key={c.key}
                            style={{
                              height: `${(96 * s.tally.byCategory[c.key]) / top}px`,
                              backgroundColor: c.bg,
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                    <span className="text-[9.5px] text-ink-4">
                      {label(s.key, grain)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3">
            {CATEGORIES.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span
                  className="size-[10px] rounded-[2px] border"
                  style={{ backgroundColor: c.bg, borderColor: c.line }}
                />
                <span className="text-[11px] text-ink-3">{c.label}</span>
                <span className="tnum text-[11.5px] font-semibold text-ink-2">
                  {team.byCategory[c.key]}
                </span>
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-4">
              <Cookie className="size-3.5" />
              {team.overtime} overtime · {team.holiday} holiday
            </span>
          </section>
        </div>
      )}
    </Dialog>
  );
}
