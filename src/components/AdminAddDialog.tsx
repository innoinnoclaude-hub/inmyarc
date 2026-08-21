import { useState } from "react";
import { STATUS, formatDuration, type StatusKey } from "../config";
import { dateLong } from "../lib/date";
import type { Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { useToast } from "./Toaster";
import {
  Button,
  Duration,
  Label,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from "./ui";

function join(hours: string, mins: string): number | null {
  const h = Number.parseInt(hours, 10);
  const m = Number.parseInt(mins, 10);
  if (!Number.isFinite(h) && !Number.isFinite(m)) return null;
  const total = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  return Math.min(Math.max(total, 0), 1440);
}

/** Admin-only: put a task on anyone's row, on whichever day is open. */
export function AdminAddDialog({
  open,
  onClose,
  members,
  date,
  initialMember,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  date: string;
  initialMember: string | null;
  onAdd: (input: {
    memberId: string;
    title: string;
    details: string;
    status: StatusKey;
    minutes: number | null;
    assigned: boolean;
  }) => Promise<unknown>;
}) {
  const toast = useToast();
  const [memberId, setMemberId] = useState(initialMember ?? "");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<StatusKey>("done");
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [kind, setKind] = useState<"own" | "assigned">("own");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = join(hours, mins);

  async function save() {
    setError(null);
    if (!memberId) return setError("Choose whose row this belongs to.");
    if (!title.trim()) return setError("Describe the task.");
    setSaving(true);
    try {
      await onAdd({
        memberId,
        title,
        details,
        status,
        minutes,
        assigned: kind === "assigned",
      });
      const name = members.find((m) => m.id === memberId)?.name ?? "the team";
      toast(`Task added for ${name}.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a task"
      subtitle={dateLong(date)}
      width={560}
      footer={
        <>
          {error && <p className="mr-auto text-[12px] font-medium text-bad">{error}</p>}
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Adding…" : "Add task"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2" data-stagger>
          <div>
            <Label htmlFor="add-who">Whose row</Label>
            <Select
              id="add-who"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Kind</Label>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { key: "own", label: "Their own work" },
                { key: "assigned", label: "Assigned" },
              ]}
            />
          </div>
        </div>

        <div data-stagger>
          <Label htmlFor="add-title">Task</Label>
          <TextInput
            id="add-title"
            value={title}
            maxLength={180}
            placeholder="What was done"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div data-stagger>
          <Label htmlFor="add-details" hint="optional">
            Detail
          </Label>
          <TextArea
            id="add-details"
            rows={2}
            value={details}
            maxLength={400}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2" data-stagger>
          <div>
            <Label hint={formatDuration(minutes)}>Time taken</Label>
            <Duration
              hours={hours}
              mins={mins}
              onChange={(next) => {
                if (next.hours !== undefined) setHours(next.hours);
                if (next.mins !== undefined) setMins(next.mins);
              }}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Segmented
              value={status}
              onChange={setStatus}
              options={STATUS.map((s) => ({ key: s.key, label: s.label }))}
            />
          </div>
        </div>

        <p className="text-[11.5px] leading-[1.5] text-ink-3" data-stagger>
          Rate it from the table once it is added.
        </p>
      </div>
    </Dialog>
  );
}
