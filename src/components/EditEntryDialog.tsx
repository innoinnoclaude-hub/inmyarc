import { useState } from "react";
import { STATUS, formatDuration, type StatusKey } from "../config";
import { clock } from "../lib/date";
import type { Entry, Member } from "../lib/types";
import { Dialog } from "./Dialog";
import { useToast } from "./Toaster";
import {
  Button,
  Duration,
  Label,
  Rating,
  Segmented,
  TextArea,
  TextInput,
} from "./ui";

/** 150 -> { hours: "2", mins: "30" } */
function split(minutes: number | null) {
  if (minutes == null) return { hours: "", mins: "" };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { hours: h ? String(h) : "", mins: m ? String(m) : h ? "0" : "0" };
}

function join(hours: string, mins: string): number | null {
  const h = Number.parseInt(hours, 10);
  const m = Number.parseInt(mins, 10);
  if (!Number.isFinite(h) && !Number.isFinite(m)) return null;
  const total = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  return Math.min(Math.max(total, 0), 1440);
}

/**
 * Mounted per row (the caller keys it by entry id), so every field seeds itself
 * from props on first render. No effect, so nothing can be left over from the
 * row that was open before.
 */
export function EditEntryDialog({
  entry,
  owner,
  members,
  identity,
  onClose,
  onSave,
  onDelete,
}: {
  entry: Entry;
  owner: Member | null;
  members: Map<string, Member>;
  identity: string | null;
  onClose: () => void;
  onSave: (
    entryId: string,
    patch: {
      title: string;
      details: string;
      status: StatusKey;
      minutes: number | null;
      remarks: string;
      statusChanged: boolean;
      actorId: string | null;
    },
  ) => Promise<unknown>;
  onDelete: (entryId: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const seed = split(entry.minutes);
  const [title, setTitle] = useState(entry.title);
  const [details, setDetails] = useState(entry.details ?? "");
  const [status, setStatus] = useState<StatusKey>(entry.status);
  const [hours, setHours] = useState(seed.hours);
  const [mins, setMins] = useState(seed.mins);
  const [remarks, setRemarks] = useState(entry.remarks ?? "");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = join(hours, mins);
  const statusChanged = status !== entry.status;

  async function save() {
    setError(null);
    if (!title.trim()) return setError("A task needs a title.");
    setSaving(true);
    try {
      await onSave(entry.id, {
        title,
        details,
        status,
        minutes,
        remarks,
        statusChanged,
        actorId: identity,
      });
      toast("Entry updated.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await onDelete(entry.id);
      toast("Entry removed.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit entry"
      subtitle={`${owner?.name ?? "Unknown"} — logged ${clock(entry.created_at)}${
        entry.created_by === null ? " — assigned" : ""
      }`}
      width={600}
      footer={
        <>
          {confirming ? (
            <div className="mr-auto flex items-center gap-2">
              <span className="text-[12px] text-ink-2">Delete this entry?</span>
              <Button
                size="sm"
                onClick={remove}
                disabled={saving}
                className="border-bad/30 text-bad hover:bg-bad-bg"
              >
                Delete
              </Button>
              <Button size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              className="mr-auto"
              onClick={() => setConfirming(true)}
              disabled={saving}
            >
              Delete entry
            </Button>
          )}
          {error && (
            <p className="text-[12px] font-medium text-bad">{error}</p>
          )}
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div data-stagger>
          <Label htmlFor="edit-title">Task</Label>
          <TextInput
            id="edit-title"
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div data-stagger>
          <Label htmlFor="edit-details" hint="optional">
            Detail
          </Label>
          <TextArea
            id="edit-details"
            rows={2}
            value={details}
            maxLength={400}
            placeholder="Any context worth keeping"
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
            <Label hint={entry.rating ? `${entry.rating} / 5` : "not rated"}>
              Rating
            </Label>
            <div className="flex h-8 items-center gap-2">
              <Rating value={entry.rating} readOnly onChange={() => {}} />
              <a
                href="/rating"
                className="focus-ring text-[11.5px] text-ink-4 underline-offset-2 hover:text-ink-2 hover:underline"
              >
                set at /rating
              </a>
            </div>
          </div>
        </div>

        <div data-stagger>
          <Label
            hint={
              entry.status_at
                ? `last set ${
                    entry.status_by
                      ? `by ${members.get(entry.status_by)?.name ?? "—"} `
                      : ""
                  }at ${clock(entry.status_at)}`
                : undefined
            }
          >
            Status
          </Label>
          <Segmented
            value={status}
            onChange={setStatus}
            options={STATUS.map((s) => ({ key: s.key, label: s.label }))}
          />
        </div>

        <div data-stagger>
          <Label htmlFor="edit-remarks" hint="optional">
            Remarks
          </Label>
          <TextArea
            id="edit-remarks"
            rows={2}
            value={remarks}
            maxLength={500}
            placeholder="Feedback for whoever did this"
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
