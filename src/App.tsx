import { useCallback, useEffect, useRef, useState } from "react";
import { APP } from "./config";
import { clock, todayISO } from "./lib/date";
import { isConfigured } from "./lib/supabase";
import type { Entry } from "./lib/types";
import { useDashboard } from "./lib/useDashboard";
import { PasscodeProvider } from "./lib/passcode";
import { ChartDialog } from "./components/ChartDialog";
import { RatingPage } from "./components/RatingPage";
import { EditEntryDialog } from "./components/EditEntryDialog";
import { EntryDialog, type DialogTab } from "./components/EntryDialog";
import { Header } from "./components/Header";
import { LogTable } from "./components/LogTable";
import { SetupNotice } from "./components/SetupNotice";
import { Summary } from "./components/Summary";
import { Toaster, useToast } from "./components/Toaster";
import { Button, cx } from "./components/ui";

const IDENTITY_KEY = "iv.daily-log.identity";

function Portal() {
  const toast = useToast();
  const [date, setDate] = useState(todayISO);
  const [identity, setIdentity] = useState<string | null>(() =>
    localStorage.getItem(IDENTITY_KEY),
  );
  const [dialog, setDialog] = useState<{
    open: boolean;
    tab: DialogTab;
    member: string | null;
  }>({ open: false, tab: "day", member: null });
  const [chartOpen, setChartOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [syncedAt, setSyncedAt] = useState<string>(() =>
    new Date().toISOString(),
  );

  // the board never unlocks: past days are read-only for everyone here
  const d = useDashboard(date, null);
  const viewingToday = date === todayISO();

  useEffect(() => {
    if (!d.loading) setSyncedAt(new Date().toISOString());
  }, [d.loading, d.entries, d.dayLogs]);

  // the board belongs to a day — roll it over on its own at midnight,
  // but only for someone who is actually looking at today
  const lastToday = useRef(todayISO());
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = todayISO();
      if (now === lastToday.current) return;
      const previous = lastToday.current;
      lastToday.current = now;
      setDate((current) => (current === previous ? now : current));
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const saveIdentity = useCallback((id: string) => {
    setIdentity(id);
    localStorage.setItem(IDENTITY_KEY, id);
  }, []);

  const guard = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      try {
        await fn();
        toast(ok);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Action failed.", "error");
      }
    },
    [toast],
  );

  const memberCount = d.roster.length;
  /** Past days are permanently view-only on the board. */
  const locked = d.locked;

  return (
    <div className="flex min-h-screen w-full flex-col gap-6 px-5 pt-8 pb-16 sm:px-8 sm:pt-10">
      <Header
        date={date}
        onDateChange={setDate}
        onAdd={() => setDialog({ open: true, tab: "day", member: identity })}
        onGraph={() => setChartOpen(true)}
        locked={locked}
        onRefresh={() => void d.reload({ quiet: true })}
        busy={d.busy || d.loading}
        identity={identity}
      />

      {d.error && (
        <div className="rounded-md border border-off/25 bg-off-bg px-4 py-3">
          <p className="text-[12.5px] leading-[1.5] font-medium text-off">
            {d.error}
          </p>
        </div>
      )}

      {!isConfigured && <SetupNotice />}

      {isConfigured && !d.loading && !d.error && memberCount === 0 && (
        <div className="rounded-md border border-line-strong bg-surface px-4 py-3">
          <p className="text-[12.5px] leading-[1.5] text-ink-2">
            No team members yet. Add rows to the{" "}
            <code className="rounded-xs bg-mute-bg px-1 py-0.5 font-mono text-[11.5px]">
              members
            </code>{" "}
            table in Supabase (see{" "}
            <code className="rounded-xs bg-mute-bg px-1 py-0.5 font-mono text-[11.5px]">
              supabase/seed.sql
            </code>
            ) and refresh.
          </p>
        </div>
      )}

      {isConfigured && <Summary groups={d.groups} />}

      {!isConfigured ? null : d.loading ? (
        <Skeleton />
      ) : (
        <LogTable
          groups={d.groups}
          memberById={d.memberById}
          identity={identity}
          canEditTasks={isConfigured && !locked}
          canRate={false}
          canRemark={isConfigured && !locked}
          onEdit={setEditing}
          onRating={() => {}}
          onStatus={(id, s) =>
            void guard(() => d.setStatus(id, s, identity), "Status updated.")
          }
          onRemarks={(id, text) =>
            void guard(
              () => d.setRemarks(id, text),
              text.trim() ? "Remark saved." : "Remark cleared.",
            )
          }
          onDelete={(id) =>
            void guard(() => d.deleteEntry(id), "Entry removed.")
          }
          onAttendance={(m, a) =>
            void guard(() => d.setAttendance(m, a), "Day updated.")
          }
          onAddFor={(memberId) =>
            setDialog({
              open: true,
              tab: memberId === identity ? "day" : "assign",
              member: memberId,
            })
          }
        />
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[11.5px] text-ink-4">
        <p>
          {APP.org} internal · all times {APP.timezone.replace("_", " ")}
        </p>
        <p className="tnum flex items-center gap-2">
          {viewingToday ? "Live" : "Archived day"}
          <span className="text-line-strong">/</span>
          synced {clock(syncedAt)}
        </p>
      </footer>

      <div className={cx("fixed right-5 bottom-5 sm:hidden", locked && "hidden")}>
        <Button
          variant="primary"
          onClick={() => setDialog({ open: true, tab: "day", member: identity })}
          className="shadow-[0_8px_24px_-8px_rgba(23,23,26,0.4)]"
        >
          Add entry
        </Button>
      </div>

      {editing && (
        <EditEntryDialog
          key={editing.id}
          entry={editing}
          owner={d.memberById.get(editing.member_id) ?? null}
          members={d.memberById}
          identity={identity}
          onClose={() => setEditing(null)}
          onSave={d.updateEntry}
          onDelete={d.deleteEntry}
        />
      )}


      <ChartDialog
        open={chartOpen}
        onClose={() => setChartOpen(false)}
        members={d.roster}
        identity={identity}
      />

      <EntryDialog
        open={dialog.open}
        onClose={() => setDialog((s) => ({ ...s, open: false }))}
        members={d.roster}
        dayLogs={d.dayLogs}
        date={date}
        identity={identity}
        onIdentity={saveIdentity}
        initialTab={dialog.tab}
        initialMember={dialog.member}
        onSubmitDay={d.submitDay}
        onAssign={d.assignTask}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0"
        >
          <div className="h-3 w-32 animate-pulse rounded-xs bg-mute-bg" />
          <div className="h-3 w-20 animate-pulse rounded-xs bg-mute-bg" />
          <div className="h-3 flex-1 animate-pulse rounded-xs bg-mute-bg" />
          <div className="h-3 w-16 animate-pulse rounded-xs bg-mute-bg" />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  // one page each; no router needed for two routes
  const rating = window.location.pathname.replace(/\/+$/, "") === "/rating";
  return (
    <PasscodeProvider>
      <Toaster>{rating ? <RatingPage /> : <Portal />}</Toaster>
    </PasscodeProvider>
  );
}
