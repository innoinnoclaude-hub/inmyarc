import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  ATTENDANCE,
  ATTENDANCE_BY_KEY,
  BROWNIES,
  CATEGORIES,
  CATEGORY_BY_KEY,
  STATUS,
  STATUS_BY_KEY,
  formatDuration,
  type AttendanceKey,
  type CategoryKey,
  type StatusKey,
} from "../config";
import { clock } from "../lib/date";
import { formatBytes, openAttachment } from "../lib/attachments";
import { RemarkEditor } from "./RemarkEditor";
import { useToast } from "./Toaster";
import type { Entry, Member, RowGroup } from "../lib/types";
import {
  Chip,
  Clip,
  Cookie,
  CrossCircle,
  Pencil,
  Plus,
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
  /** Only the admin page may judge a day. */
  canJudge: boolean;
  canRemark: boolean;
  /** Show the add link on a member with no entries. */
  canAdd: boolean;
  /** Overrides the empty-row link text (the admin page says "Add task"). */
  addLabel?: string;
  onStatus: (entryId: string, status: StatusKey) => void;
  /** Set, change or clear the day's verdict and its brownies. */
  onMark: (
    memberId: string,
    category: CategoryKey | null,
    brownies: { overtime: boolean; holiday: boolean },
  ) => void;
  onEdit: (entry: Entry) => void;
  onRemarks: (entryId: string, remarks: string) => void;
  onDelete: (entryId: string) => void;
  onAttendance: (memberId: string, attendance: AttendanceKey) => void;
  onAddFor: (memberId: string) => void;
  onMember: (member: Member) => void;
}

const COLS = [
  { key: "sno", label: "#", width: "w-[4.5%]" },
  { key: "member", label: "Member", width: "w-[11%]" },
  { key: "verdict", label: "Verdict", width: "w-[13.5%]" },
  { key: "task", label: "Task", width: "w-[26%]" },
  { key: "time", label: "Time", width: "w-[6%]" },
  { key: "status", label: "Status", width: "w-[12%]" },
  { key: "remarks", label: "Remarks", width: "w-[19%]" },
  { key: "actions", label: "", width: "w-[8%]" },
];

export function LogTable({
  groups,
  memberById,
  identity,
  canEditTasks,
  canJudge,
  canRemark,
  canAdd,
  addLabel,
  onStatus,
  onMark,
  onEdit,
  onRemarks,
  onDelete,
  onAttendance,
  onAddFor,
  onMember,
}: Props) {
  const frozen = !canEditTasks;
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const signature = groups
    .map((g) => `${g.member.id}:${g.entries.length}:${g.mark?.category ?? ""}`)
    .join("|");
  /** Places appear only once an admin has judged somebody. */
  const ranked = groups.some((g) => g.mark);

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
      <table className="w-full min-w-[1280px] table-fixed border-collapse text-left">
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
                      ? "Ordered by verdict — everyone in a category shares the place"
                      : "Alphabetical until an admin judges the day"
                    : c.key === "verdict"
                      ? "The admin's verdict on the whole day, plus brownies for overtime and for working a holiday"
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
          /** The verdict colours the row and every task under it. */
          const cat = group.mark ? CATEGORY_BY_KEY[group.mark.category] : null;
          const tint = cat ? { backgroundColor: cat.bg } : undefined;
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
                    style={tint}
                    className={cx(
                      "group/row align-top transition-colors duration-150",
                      cat ? "hover:brightness-[0.985]" : "hover:bg-paper/60",
                    )}
                  >
                    {index === 0 && (
                      <>
                        {/* S.No + whether this person has marked their day */}
                        <td
                          rowSpan={span}
                          className="border-r border-line px-2 py-3 align-top"
                        >
                          <div className="flex flex-col items-center gap-1.5">
                            <span
                              title={
                                group.rank
                                  ? `${cat?.label} — place ${group.rank} today`
                                  : "Not judged yet"
                              }
                              className={cx(
                                "tnum text-[12px] font-semibold",
                                group.rank === 1 ? "text-ink" : "text-ink-3",
                              )}
                            >
                              {group.rank
                                ? String(group.rank).padStart(2, "0")
                                : "–"}
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
                            <button
                              type="button"
                              onClick={() => onMember(group.member)}
                              title={`Open ${group.member.name}'s stats`}
                              className="focus-ring rounded-xs text-left text-[13.5px] font-semibold tracking-[-0.01em] text-ink underline decoration-transparent underline-offset-2 transition hover:decoration-ink-4"
                            >
                              {group.member.name}
                            </button>
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
                          {group.dayLog?.note && (
                            <p className="mt-1.5 text-[11.5px] leading-[1.45] break-words text-ink-3">
                              {group.dayLog.note}
                            </p>
                          )}
                        </td>
                        <td
                          rowSpan={span}
                          className="border-r border-line px-3 py-3 align-top"
                        >
                          <Verdict
                            group={group}
                            canJudge={canJudge}
                            onMark={onMark}
                          />
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
                            {entry.attachment_path && (
                              <>
                                <span className="text-line-strong">/</span>
                                <button
                                  type="button"
                                  title={`Open ${entry.attachment_name} (${formatBytes(entry.attachment_size)})`}
                                  onClick={() =>
                                    void openAttachment(
                                      entry.attachment_path!,
                                    ).catch((e) =>
                                      toast(
                                        e instanceof Error
                                          ? e.message
                                          : "Could not open the attachment.",
                                        "error",
                                      ),
                                    )
                                  }
                                  className="focus-ring inline-flex max-w-[220px] items-center gap-1 rounded-xs font-medium text-ink-3 transition hover:text-ink"
                                >
                                  <Clip className="size-3 shrink-0" />
                                  <span className="truncate underline decoration-line-strong underline-offset-2">
                                    {entry.attachment_name}
                                  </span>
                                </button>
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
                      <td colSpan={5} className="px-3 py-3">
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

/** The category label, wearing its own colour. */
function CatChip({
  category,
  faint,
}: {
  category: CategoryKey;
  faint?: boolean;
}) {
  const c = CATEGORY_BY_KEY[category];
  return (
    <span
      className="inline-flex items-center rounded-xs border px-1.5 py-[3px] text-[11px] font-semibold whitespace-nowrap"
      style={{
        color: c.ink,
        borderColor: c.line,
        backgroundColor: faint ? "rgba(255,255,255,0.72)" : "#ffffff",
      }}
    >
      {c.label}
    </span>
  );
}

/** One earned brownie, shown as a cookie. */
function Brownie({ label, earned }: { label: string; earned: boolean }) {
  if (!earned) return null;
  return (
    <span
      title={`Brownie — ${label.toLowerCase()}`}
      className="inline-flex items-center gap-1 rounded-xs border border-[#e3cba4] bg-[#fdf4e5] px-1.5 py-[2px] text-[10.5px] font-semibold text-[#7a5312]"
    >
      <Cookie className="size-3" />
      {label}
    </span>
  );
}

/**
 * The day's verdict. Nobody sees anything until an admin has decided; on the
 * admin page this is where they decide it, and where the two brownies are
 * handed out.
 */
function Verdict({
  group,
  canJudge,
  onMark,
}: {
  group: RowGroup;
  canJudge: boolean;
  onMark: Props["onMark"];
}) {
  const mark = group.mark;
  const brownies = {
    overtime: !!mark?.overtime,
    holiday: !!mark?.holiday,
  };

  if (!canJudge) {
    return mark ? (
      <div className="flex flex-col items-start gap-1.5">
        <CatChip category={mark.category} faint />
        {(brownies.overtime || brownies.holiday) && (
          <div className="flex flex-wrap gap-1">
            {BROWNIES.map((b) => (
              <Brownie key={b.key} label={b.label} earned={brownies[b.key]} />
            ))}
          </div>
        )}
      </div>
    ) : (
      <span className="text-[11.5px] text-ink-4">Awaiting review</span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <InlineSelect
        value={mark?.category ?? ""}
        options={[
          { key: "", label: "Not judged yet" },
          ...CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
        ]}
        onChange={(v) =>
          onMark(group.member.id, (v || null) as CategoryKey | null, brownies)
        }
      >
        {mark ? (
          <CatChip category={mark.category} />
        ) : (
          <Chip tone="mute">Judge the day</Chip>
        )}
      </InlineSelect>

      <div className="flex flex-wrap gap-1">
        {BROWNIES.map((b) => {
          const on = brownies[b.key];
          return (
            <button
              key={b.key}
              type="button"
              disabled={!mark}
              title={
                mark
                  ? `${on ? "Take back" : "Give"} the ${b.label.toLowerCase()} brownie — ${b.hint.toLowerCase()}`
                  : "Judge the day first, then the brownies"
              }
              onClick={() =>
                mark &&
                onMark(group.member.id, mark.category, {
                  ...brownies,
                  [b.key]: !on,
                })
              }
              className={cx(
                "focus-ring inline-flex items-center gap-1 rounded-xs border px-1.5 py-[2px] text-[10.5px] font-semibold transition",
                on
                  ? "border-[#e3cba4] bg-[#fdf4e5] text-[#7a5312]"
                  : "border-line bg-surface text-ink-4 hover:border-line-strong hover:text-ink-3",
                !mark && "cursor-not-allowed opacity-45",
              )}
            >
              <Cookie className={cx("size-3", !on && "opacity-55")} />
              {b.label}
            </button>
          );
        })}
      </div>
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
