import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  ATTENDANCE,
  ATTENDANCE_BY_KEY,
  STATUS,
  STATUS_BY_KEY,
  formatDuration,
  type AttendanceKey,
  type StatusKey,
} from "../config";
import { clock } from "../lib/date";
import { RemarkEditor } from "./RemarkEditor";
import type { Entry, Member, RowGroup } from "../lib/types";
import {
  Chip,
  CrossCircle,
  Pencil,
  Plus,
  Rating,
  TickCircle,
  Trash,
  cx,
} from "./ui";

interface Props {
  groups: RowGroup[];
  memberById: Map<string, Member>;
  identity: string | null;
  /** Which columns this surface may change. The board and the admin page use
   *  the same table with different permissions. */
  canEditTasks: boolean;
  canRate: boolean;
  canRemark: boolean;
  /** Show the add link on a member with no entries. */
  canAdd: boolean;
  /** Overrides the empty-row link text (the admin page says "Add task"). */
  addLabel?: string;
  onStatus: (entryId: string, status: StatusKey) => void;
  onRating: (entryId: string, rating: number | null) => void;
  onEdit: (entry: Entry) => void;
  onRemarks: (entryId: string, remarks: string) => void;
  onDelete: (entryId: string) => void;
  onAttendance: (memberId: string, attendance: AttendanceKey) => void;
  onAddFor: (memberId: string) => void;
}

const COLS = [
  { key: "sno", label: "#", width: "w-[5.5%]" },
  { key: "member", label: "Member", width: "w-[12%]" },
  { key: "task", label: "Task", width: "w-[27%]" },
  { key: "time", label: "Time", width: "w-[7%]" },
  { key: "status", label: "Status", width: "w-[14.5%]" },
  { key: "rating", label: "Rating", width: "w-[11%]" },
  { key: "remarks", label: "Remarks", width: "w-[14%]" },
  { key: "actions", label: "", width: "w-[9%]" },
];

export function LogTable({
  groups,
  memberById,
  identity,
  canEditTasks,
  canRate,
  canRemark,
  canAdd,
  addLabel,
  onStatus,
  onRating,
  onEdit,
  onRemarks,
  onDelete,
  onAttendance,
  onAddFor,
}: Props) {
  const frozen = !canEditTasks;
  const root = useRef<HTMLDivElement>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const signature = groups
    .map((g) => `${g.member.id}:${g.entries.length}:${g.score}`)
    .join("|");
  /** The board ranks by score the moment the day has any entry at all. */
  const ranked = groups.some((g) => g.entries.length > 0);
  const topScore = ranked ? Math.max(...groups.map((g) => g.score)) : 0;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-group]",
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          stagger: 0.03,
          ease: "power2.out",
          overwrite: true,
        },
      );
    }, root);
    return () => ctx.revert();
  }, [signature]);

  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  return (
    <div
      ref={root}
      className="w-full overflow-x-auto rounded-md border border-line bg-surface"
    >
      <table className="w-full min-w-[1120px] table-fixed border-collapse text-left">
        <colgroup>
          {COLS.map((c) => (
            <col key={c.key} className={c.width} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-paper">
            {COLS.map((c) => (
              <th
                key={c.key}
                scope="col"
                title={
                  c.key === "sno"
                    ? ranked
                      ? "Ranked by score — minutes taken x stars, summed across the day"
                      : "Alphabetical until the first entry of the day"
                    : undefined
                }
                className={cx(
                  "px-3 py-2.5 text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase",
                  c.key === "sno" && "text-center",
                )}
              >
                {c.key === "sno" && ranked ? "Rank" : c.label}
              </th>
            ))}
          </tr>
        </thead>

        {groups.map((group) => {
          const span = Math.max(group.entries.length, 1);
          const att = group.dayLog
            ? ATTENDANCE_BY_KEY[group.dayLog.attendance]
            : null;
          const isMe = identity === group.member.id;
          const marked = group.dayLog !== null || group.entries.length > 0;

          return (
            <tbody
              key={group.member.id}
              data-group
              className="border-b border-line last:border-b-0"
            >
              {(group.entries.length ? group.entries : [null]).map(
                (entry, index) => (
                  <tr
                    key={entry ? entry.id : "empty"}
                    className="group/row align-top transition-colors duration-150 hover:bg-paper/60"
                  >
                    {index === 0 && (
                      <>
                        {/* S.No + whether this person has marked their day */}
                        <td
                          rowSpan={span}
                          className="border-r border-line px-2 py-3 align-top"
                        >
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="tnum text-[12px] font-semibold text-ink-3">
                              {String(group.rank).padStart(2, "0")}
                            </span>
                            <span
                              title={
                                marked
                                  ? "Has reported today"
                                  : "Has not reported yet"
                              }
                              className={marked ? "text-ok" : "text-line-strong"}
                            >
                              {marked ? (
                                <TickCircle className="size-[17px]" />
                              ) : (
                                <CrossCircle className="size-[17px]" />
                              )}
                            </span>
                          </div>
                        </td>

                        <td
                          rowSpan={span}
                          className="border-r border-line px-3 py-3 align-top"
                        >
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
                              {group.member.name}
                            </span>
                            {isMe && (
                              <span className="text-[10px] font-semibold tracking-[0.08em] text-ink-4 uppercase">
                                you
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5">
                            {att || !frozen ? (
                              <InlineSelect
                                value={group.dayLog?.attendance ?? ""}
                                disabled={frozen}
                                options={[
                                  ...(att
                                    ? []
                                    : [{ key: "", label: "Not marked" }]),
                                  ...ATTENDANCE.map((a) => ({
                                    key: a.key,
                                    label: a.label,
                                  })),
                                ]}
                                onChange={(v) =>
                                  v &&
                                  onAttendance(
                                    group.member.id,
                                    v as AttendanceKey,
                                  )
                                }
                              >
                                {att ? (
                                  <Chip tone={att.tone} dot>
                                    {att.short}
                                  </Chip>
                                ) : (
                                  <Chip tone="mute">Not marked</Chip>
                                )}
                              </InlineSelect>
                            ) : (
                              <span className="text-[11.5px] text-ink-4">
                                Not marked
                              </span>
                            )}
                          </div>
                          {group.score > 0 && (
                            <p
                              title="Minutes taken x stars, summed across the day"
                              className={cx(
                                "tnum mt-1.5 text-[11px] font-medium",
                                group.score === topScore
                                  ? "text-ink"
                                  : "text-ink-4",
                              )}
                            >
                              {group.score.toLocaleString("en-IN")} pts
                            </p>
                          )}
                          {group.dayLog?.note && (
                            <p className="mt-1.5 text-[11.5px] leading-[1.45] break-words text-ink-3">
                              {group.dayLog.note}
                            </p>
                          )}
                        </td>
                      </>
                    )}

                    {entry ? (
                      <>
                        <td className="px-3 py-3">
                          <p className="text-[13px] leading-[1.45] font-medium break-words text-ink">
                            {entry.title}
                          </p>
                          {entry.details && (
                            <p className="mt-1 text-[12px] leading-[1.5] break-words text-ink-2">
                              {entry.details}
                            </p>
                          )}
                          <p className="tnum mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-4">
                            <span>{clock(entry.created_at)}</span>
                            {entry.created_by === null && (
                              <>
                                <span className="text-line-strong">/</span>
                                <span className="font-medium text-ink-3">
                                  assigned
                                </span>
                              </>
                            )}
                          </p>
                        </td>

                        <td className="tnum px-3 py-3 text-[12.5px] font-medium whitespace-nowrap text-ink-2">
                          {formatDuration(entry.minutes)}
                        </td>

                        <td className="px-3 py-3">
                          <InlineSelect
                            value={entry.status}
                            disabled={frozen}
                            options={STATUS.map((s) => ({
                              key: s.key,
                              label: s.label,
                            }))}
                            onChange={(v) => onStatus(entry.id, v as StatusKey)}
                          >
                            <Chip tone={STATUS_BY_KEY[entry.status].tone} dot>
                              {STATUS_BY_KEY[entry.status].label}
                            </Chip>
                          </InlineSelect>
                          {entry.status_at && (
                            <p className="tnum mt-1 text-[10.5px] break-words text-ink-4">
                              {entry.status_by
                                ? `${memberById.get(entry.status_by)?.name ?? "—"} / `
                                : ""}
                              {clock(entry.status_at)}
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <Rating
                            value={entry.rating}
                            readOnly={!canRate}
                            onChange={(next) => onRating(entry.id, next)}
                          />
                        </td>

                        <td className="px-3 py-3">
                          <RemarkEditor
                            value={entry.remarks}
                            readOnly={!canRemark}
                            revealOnHover
                            onSave={(text) => onRemarks(entry.id, text)}
                          />
                        </td>

                        <td className="px-2 py-3">
                          {(canAdd || !frozen) && (
                            <div className="flex items-center justify-end gap-0.5">
                              {/* one per member, on the first of their rows */}
                              {canAdd && index === 0 && (
                                <button
                                  type="button"
                                  aria-label={`Add a task for ${group.member.name}`}
                                  title={`Add a task for ${group.member.name}`}
                                  onClick={() => onAddFor(group.member.id)}
                                  className="focus-ring rounded-xs p-1.5 text-ink-4 opacity-60 transition hover:bg-mute-bg hover:text-ink hover:opacity-100 group-hover/row:opacity-100"
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              )}
                              {confirmId === entry.id ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmId(null);
                                    onDelete(entry.id);
                                  }}
                                  className="focus-ring rounded-xs bg-bad-bg px-1.5 py-1 text-[11px] font-semibold text-bad"
                                >
                                  Sure?
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    aria-label="Edit entry"
                                    title="Edit entry"
                                    onClick={() => onEdit(entry)}
                                    className="focus-ring rounded-xs p-1.5 text-ink-4 opacity-60 transition hover:bg-mute-bg hover:text-ink hover:opacity-100 group-hover/row:opacity-100"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Delete entry"
                                    title="Delete entry"
                                    onClick={() => setConfirmId(entry.id)}
                                    className="focus-ring rounded-xs p-1.5 text-ink-4 opacity-60 transition hover:bg-bad-bg hover:text-bad hover:opacity-100 group-hover/row:opacity-100"
                                  >
                                    <Trash className="size-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] text-ink-4">
                            No entries logged.
                          </span>
                          {canAdd && (
                            <button
                              type="button"
                              onClick={() => onAddFor(group.member.id)}
                              className="focus-ring inline-flex items-center gap-1 rounded-sm border border-line-strong bg-surface px-2 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
                            >
                              <Plus className="size-3" />
                              {addLabel ?? (isMe ? "Add yours" : "Assign a task")}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/**
 * A chip that is really a native <select> — keeps keyboard + mobile behaviour
 * while showing our own flat styling.
 */
function InlineSelect({
  value,
  options,
  onChange,
  disabled,
  children,
}: {
  value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "relative inline-flex rounded-xs",
        !disabled &&
          "cursor-pointer ring-offset-1 transition hover:ring-1 hover:ring-line-strong",
      )}
    >
      {children}
      {!disabled && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Change"
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
