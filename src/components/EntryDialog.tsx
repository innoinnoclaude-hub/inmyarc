import { useEffect, useMemo, useRef, useState } from "react";
import { ATTENDANCE, STATUS, type AttendanceKey, type StatusKey } from "../config";
import { dateLong, todayISO } from "../lib/date";
import type { DraftEntry } from "../lib/useDashboard";
import type { DayLog, Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { useToast } from "./Toaster";
import {
  Button,
  Close,
  Duration,
  Label,
  Plus,
  Segmented,
  Select,
  TextArea,
  TextInput,
  cx,
} from "./ui";

export type DialogTab = "day" | "assign";

const blank = (): DraftEntry => ({
  title: "",
  details: "",
  status: "done",
  hours: "",
  mins: "",
});

export function EntryDialog({
  open,
  onClose,
  members,
  dayLogs,
  date,
  identity,
  onIdentity,
  initialTab,
  initialMember,
  minDate,
  onSubmitDay,
  onAssign,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  dayLogs: DayLog[];
  date: string;
  identity: string | null;
  onIdentity: (id: string) => void;
  initialTab: DialogTab;
  initialMember: string | null;
  /** Earliest day the assign tab may target. The board pins this to today;
   *  the admin page leaves it open so a past day can be corrected. */
  minDate?: string;
  onSubmitDay: (input: {
    memberId: string;
    attendance: AttendanceKey;
    note: string;
    entries: DraftEntry[];
  }) => Promise<number>;
  onAssign: (input: {
    memberId: string;
    logDate: string;
    title: string;
    details: string;
  }) => Promise<void>;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<DialogTab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [memberId, setMemberId] = useState("");
  const [attendance, setAttendance] = useState<AttendanceKey>("full_day");
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<DraftEntry[]>([blank()]);

  const [assignTo, setAssignTo] = useState("");
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDetails, setAssignDetails] = useState("");
  const [assignDate, setAssignDate] = useState(date);

  const existing = useMemo(
    () => dayLogs.find((d) => d.member_id === memberId) ?? null,
    [dayLogs, memberId],
  );

  // (re)seed the form each time the dialog opens
  useEffect(() => {
    if (!open) return;
    const me = identity ?? "";
    setTab(initialTab);
    setError(null);
    setDrafts([blank()]);
    setAssignTitle("");
    setAssignDetails("");
    setAssignDate(date);
    if (initialTab === "assign") {
      setAssignTo(initialMember ?? "");
      setMemberId(me);
    } else {
      setMemberId(initialMember ?? me);
      setAssignTo("");
    }
  }, [open, initialTab, initialMember, identity, date]);

  /**
   * Seed attendance from whatever is already saved for that person — but only
   * when the person (or the presence of a saved day) actually changes, so a
   * live refresh from a teammate never wipes what someone is mid-way through
   * typing.
   */
  const seedKey = `${memberId}:${existing ? "saved" : "new"}`;
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    if (seeded.current === seedKey) return;
    seeded.current = seedKey;
    setAttendance(existing?.attendance ?? "full_day");
    setNote(existing?.note ?? "");
  }, [open, seedKey, existing]);

  const filled = drafts.filter((d) => d.title.trim().length > 0);
  const noWork = attendance === "week_off" || attendance === "leave";

  const patch = (i: number, next: Partial<DraftEntry>) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...next } : x)));

  async function saveDay() {
    setError(null);
    if (!memberId) return setError("Choose your name first.");
    if (!filled.length && !noWork)
      return setError("Add at least one entry, or mark the day as off.");
    setSaving(true);
    try {
      onIdentity(memberId);
      const n = await onSubmitDay({ memberId, attendance, note, entries: drafts });
      toast(
        n > 0
          ? `${n} ${n === 1 ? "entry" : "entries"} added for ${dateLong(date)}.`
          : "Day updated.",
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssign() {
    setError(null);
    if (!assignTo) return setError("Choose who the task is for.");
    if (!assignTitle.trim()) return setError("Describe the task.");
    setSaving(true);
    try {
      await onAssign({
        memberId: assignTo,
        logDate: assignDate,
        title: assignTitle,
        details: assignDetails,
      });
      const name = members.find((m) => m.id === assignTo)?.name ?? "the team";
      toast(`Task assigned to ${name}.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tab === "day" ? "Log your day" : "Assign a task"}
      subtitle={dateLong(tab === "assign" ? assignDate : date)}
      width={tab === "day" ? 680 : 560}
      footer={
        <>
          {error && (
            <p className="mr-auto text-[12px] font-medium text-off">{error}</p>
          )}
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={tab === "day" ? saveDay : saveAssign}
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : tab === "day"
                ? filled.length
                  ? `Save ${filled.length} ${filled.length === 1 ? "entry" : "entries"}`
                  : "Save day"
                : "Assign task"}
          </Button>
        </>
      }
    >
      <div className="mb-5 flex gap-1 border-b border-line" data-stagger>
        {(
          [
            ["day", "My day"],
            ["assign", "Assign to someone"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setError(null);
            }}
            className={cx(
              "focus-ring -mb-px border-b-2 px-3 pb-2.5 text-[12.5px] font-medium transition-colors",
              tab === key
                ? "border-ink text-ink"
                : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "day" ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2" data-stagger>
            <div>
              <Label htmlFor="who">Your name</Label>
              <Select
                id="who"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                <option value="">Select your name…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="note" hint="optional">
                Day note
              </Label>
              <TextInput
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Context for the day"
                maxLength={140}
              />
            </div>
          </div>

          <div data-stagger>
            <Label>Attendance</Label>
            <Segmented
              value={attendance}
              onChange={setAttendance}
              options={ATTENDANCE.map((a) => ({ key: a.key, label: a.label }))}
            />
          </div>

          <div data-stagger>
            <Label hint={noWork ? "optional on an off day" : "one per task"}>
              What you worked on
            </Label>
            <div className="flex flex-col gap-2">
              {drafts.map((d, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-line bg-paper p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="tnum w-5 shrink-0 text-[11px] font-semibold text-ink-4">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <TextInput
                      value={d.title}
                      onChange={(e) => patch(i, { title: e.target.value })}
                      placeholder="Task or work done"
                      maxLength={180}
                    />
                    <button
                      type="button"
                      aria-label="Remove entry"
                      disabled={drafts.length === 1}
                      onClick={() =>
                        setDrafts((x) => x.filter((_, j) => j !== i))
                      }
                      className="focus-ring shrink-0 rounded-xs p-1.5 text-ink-4 transition hover:bg-off-bg hover:text-off disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Close className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 pl-7">
                    <TextArea
                      rows={1}
                      value={d.details}
                      onChange={(e) => patch(i, { details: e.target.value })}
                      placeholder="Detail — optional"
                      maxLength={400}
                    />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-ink-3">
                          Time taken
                        </span>
                        <Duration
                          hours={d.hours}
                          mins={d.mins}
                          onChange={(next) => patch(i, next)}
                        />
                      </div>
                      <Segmented
                        value={d.status}
                        onChange={(v: StatusKey) => patch(i, { status: v })}
                        options={STATUS.map((st) => ({
                          key: st.key,
                          label: st.label,
                        }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => setDrafts((d) => [...d, blank()])}
            >
              <Plus className="size-3" />
              Add another entry
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div data-stagger>
            <Label htmlFor="to">Assign to</Label>
            <Select
              id="to"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
            >
              <option value="">Select a teammate…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>

          <div data-stagger>
            <Label htmlFor="on" hint={minDate ? "today only" : undefined}>
              For the day
            </Label>
            <TextInput
              id="on"
              type="date"
              value={assignDate}
              min={minDate}
              max={todayISO()}
              onChange={(e) => setAssignDate(e.target.value || date)}
              className="tnum"
            />
          </div>

          <div data-stagger>
            <Label htmlFor="task">Task</Label>
            <TextInput
              id="task"
              value={assignTitle}
              onChange={(e) => setAssignTitle(e.target.value)}
              placeholder="What needs to be done"
              maxLength={180}
            />
          </div>

          <div data-stagger>
            <Label htmlFor="brief" hint="optional">
              Brief
            </Label>
            <TextArea
              id="brief"
              rows={3}
              value={assignDetails}
              onChange={(e) => setAssignDetails(e.target.value)}
              placeholder="Any context, links or acceptance criteria"
              maxLength={600}
            />
          </div>

          <p className="text-[11.5px] leading-[1.5] text-ink-3" data-stagger>
            The task lands in their row for that day as{" "}
            <span className="font-medium text-ink-2">Not done</span>. Anyone can
            move it to Done or Rework required, rate it and leave a remark
            straight from the table.
          </p>
        </div>
      )}
    </Dialog>
  );
}
