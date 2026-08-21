import { useEffect, useMemo, useState } from "react";
import gsap from "gsap";
import { APP } from "../config";
import { dateLong, dateShort, shiftISO, todayISO, weekdayLong } from "../lib/date";
import { usePasscode } from "../lib/passcode";
import { useDashboard } from "../lib/useDashboard";
import type { Entry } from "../lib/types";
import { useToast } from "./Toaster";
import { EditEntryDialog } from "./EditEntryDialog";
import { EntryDialog, type DialogTab } from "./EntryDialog";
import { LogTable } from "./LogTable";
import { Summary } from "./Summary";
import {
  Button,
  ChevronLeft,
  ChevronRight,
  Chip,
  Label,
  Plus,
  Refresh,
  TextInput,
  cx,
} from "./ui";

/** Full-page gate. Nothing below it renders until the database says yes. */
function Gate() {
  const { unlock } = usePasscode();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gsap.fromTo(
      "[data-gate]",
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" },
    );
  }, []);

  async function submit() {
    setError(null);
    if (!value) return setError("Enter the passcode.");
    setBusy(true);
    try {
      await unlock(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div
        data-gate
        className="w-full max-w-[380px] rounded-md border border-line bg-surface p-6"
      >
        <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
          <span className="text-ink">{APP.org}</span>
          <span className="text-line-strong">/</span>
          <span>Ratings</span>
        </div>
        <h1 className="text-[20px] leading-tight font-bold tracking-[-0.02em] text-ink">
          Admin sign in
        </h1>
        <p className="mt-1.5 mb-5 text-[12.5px] leading-[1.5] text-ink-3">
          Ratings and remarks are given here, for any day.
        </p>
        <Label htmlFor="gate-pass">Passcode</Label>
        <TextInput
          id="gate-pass"
          type="password"
          autoComplete="off"
          value={value}
          placeholder="••••••••"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        {error && (
          <p className="mt-2 text-[12px] font-medium text-bad">{error}</p>
        )}
        <Button
          variant="primary"
          className="mt-4 w-full"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Checking…" : "Continue"}
        </Button>
        <a
          href="/"
          className="focus-ring mt-3 block text-center text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          Back to the board
        </a>
      </div>
    </div>
  );
}

function Board() {
  const toast = useToast();
  const { passcode, lock } = usePasscode();
  const [date, setDate] = useState(todayISO);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [adding, setAdding] = useState<{
    open: boolean;
    tab: DialogTab;
    member: string | null;
  }>({ open: false, tab: "day", member: null });
  const d = useDashboard(date, passcode);
  const today = todayISO();

  const counts = useMemo(() => {
    let total = 0;
    let rated = 0;
    for (const g of d.groups)
      for (const e of g.entries) {
        total++;
        if (e.rating) rated++;
      }
    return { total, rated };
  }, [d.groups]);

  const guard = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed.", "error");
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col gap-6 px-5 pt-8 pb-16 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] leading-none font-semibold tracking-[0.14em] whitespace-nowrap text-ink-3 uppercase">
            <span className="text-ink">{APP.org}</span>
            <span className="mx-2 text-line-strong">/</span>
            Ratings
          </span>
          <span className="hidden h-5 w-px bg-line-strong sm:block" />
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.03em] whitespace-nowrap text-ink sm:text-[30px]">
            {weekdayLong(date)}
          </h1>
          <p className="tnum text-[14px] leading-none font-medium whitespace-nowrap text-ink-2">
            {dateLong(date)}
          </p>
          <Chip tone={counts.total && counts.rated === counts.total ? "ok" : "wait"}>
            {counts.rated} / {counts.total} rated
          </Chip>
          {date !== today && <Chip tone="mute">Archive</Chip>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-sm border border-line-strong bg-surface">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDate(shiftISO(date, -1))}
              className="focus-ring flex h-9 w-9 items-center justify-center text-ink-3 transition-colors hover:bg-mute-bg hover:text-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="tnum h-9 min-w-[84px] border-x border-line px-3 text-center text-[12.5px] leading-9 font-medium text-ink">
              {date === today ? "Today" : dateShort(date)}
            </span>
            <button
              type="button"
              aria-label="Next day"
              disabled={date >= today}
              onClick={() => setDate(shiftISO(date, 1))}
              className={cx(
                "focus-ring flex h-9 w-9 items-center justify-center transition-colors",
                date >= today
                  ? "cursor-not-allowed text-ink-4/50"
                  : "text-ink-3 hover:bg-mute-bg hover:text-ink",
              )}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {date !== today && (
            <Button onClick={() => setDate(today)}>Today</Button>
          )}
          <Button
            onClick={() => void d.reload({ quiet: true })}
            aria-label="Refresh"
            className="w-9 px-0"
          >
            <Refresh className={cx("size-4", (d.busy || d.loading) && "animate-spin")} />
          </Button>
          <Button onClick={lock}>Sign out</Button>
          <Button
            variant="primary"
            onClick={() => setAdding({ open: true, tab: "day", member: null })}
          >
            <Plus className="size-3.5" />
            Add task
          </Button>
          <Button onClick={() => (window.location.href = "/")}>Board</Button>
        </div>
      </header>

      {d.error && (
        <div className="rounded-md border border-bad/25 bg-bad-bg px-4 py-3 text-[12.5px] font-medium text-bad">
          {d.error}
        </div>
      )}

      <Summary groups={d.groups} />

      <LogTable
        groups={d.groups}
        memberById={d.memberById}
        identity={null}
        canEditTasks
        canRate
        canRemark
        canAdd
        addLabel="Add task"
        onStatus={(id, st) =>
          void guard(() => d.setStatus(id, st, null), "Status updated.")
        }
        onRating={(id, r) =>
          void guard(
            () => d.setRating(id, r),
            r === null ? "Rating cleared." : `Rated ${r} / 5.`,
          )
        }
        onEdit={setEditing}
        onRemarks={(id, text) =>
          void guard(
            () => d.setRemarks(id, text),
            text.trim() ? "Remark saved." : "Remark cleared.",
          )
        }
        onDelete={(id) => void guard(() => d.deleteEntry(id), "Entry removed.")}
        onAttendance={(m, a) =>
          void guard(() => d.setAttendance(m, a), "Day updated.")
        }
        onAddFor={(memberId) =>
          setAdding({ open: true, tab: "day", member: memberId })
        }
      />

      <EntryDialog
        open={adding.open}
        onClose={() => setAdding((a) => ({ ...a, open: false }))}
        members={d.roster}
        dayLogs={d.dayLogs}
        date={date}
        identity={adding.member}
        onIdentity={() => {}}
        initialTab={adding.tab}
        initialMember={adding.member}
        onSubmitDay={d.submitDay}
        onAssign={d.assignTask}
      />

      {editing && (
        <EditEntryDialog
          key={editing.id}
          entry={editing}
          owner={d.memberById.get(editing.member_id) ?? null}
          members={d.memberById}
          identity={null}
          onClose={() => setEditing(null)}
          onSave={d.updateEntry}
          onDelete={d.deleteEntry}
        />
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[11.5px] text-ink-4">
        <p>Admin — full edit access for any day</p>
        <p className="tnum">all times {APP.timezone.replace("_", " ")}</p>
      </footer>
    </div>
  );
}

export function RatingPage() {
  const { unlocked } = usePasscode();
  return unlocked ? <Board /> : <Gate />;
}
