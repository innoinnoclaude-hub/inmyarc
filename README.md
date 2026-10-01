# InnovativeView — Daily Log

A single-page internal portal. Everyone picks their name, marks how the day
went, and adds one entry per task. Anyone can assign a task to a teammate, and
anyone can mark a task validated. The board is scoped to one day and rolls over
at midnight (Asia/Kolkata), when the previous day locks. Every task carries a Done / Not done / Rework required verdict, the
time it took, remarks and one optional attachment — all editable straight from
the table. An admin then judges **the whole day, per person**, in one of five
categories, with up to two brownies.

Frontend only — React + Tailwind v4 + GSAP, talking straight to Supabase.
No server to run, deploys to Vercel as a static site.

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Database** — already applied to this project. `schema.sql` is only the
   base: on its own it has no day locking, passcode, admin functions, verdicts or
   the per-day rollup. For a fresh project, run these in the Supabase SQL editor, in order:

   1. `supabase/schema.sql`
   2. `supabase/seed.sql`
   3. `supabase/migrations/` **0006 through 0018** — skip 0002–0005, which are
      already folded into `schema.sql`
   4. set the admin passcode (see *Locking and the passcode*); 0007 seeds a
      random one nobody knows

   New migrations must run both on the live project and on a fresh build, so
   guard renames and drops with an existence check.

3. **Environment** — copy `.env.example` to `.env.local` and fill in:

   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```

   Dashboard → Project Settings → API Keys.

4. **Run**

   ```bash
   npm run dev
   ```

## Deploy to Vercel

Import the repo, framework preset **Vite**, then add the same two environment
variables under Settings → Environment Variables. `vercel.json` already handles
the SPA rewrite.

## Holding the order on `/rating`

The board's order is live: as verdicts land, people move. On the admin page
that fights the work — judging one person changes where they sit, the table
re-sorts, and the row being worked on jumps somewhere else mid-click.

So `/rating` **takes the row order and the places once per day it looks at** and
keeps them: on load, on a day change, and when **Refresh** is pressed. Nothing
else re-ranks it, not a rating and not a realtime update from someone else. Every
value in the table — verdicts, brownies, status, remarks — stays live; it
is only the order and the place numbers that are held, and the header shows
*Order held* while they are. The board (`/`) is unchanged.

Someone judged after the snapshot keeps their live place until the next
re-rank.
The logic is `src/lib/rowOrder.ts`.

## Attachments

Each task can carry **one file, up to 10 MB** — a PDF, an image, anything.
Whoever logs the task attaches it in the same dialog; it can be replaced or
removed later from *Edit entry*. Everyone on the board sees the file name under
the task and can open it, including on a day that is otherwise view-only, and
an admin can attach to any day from `/rating`.

The file goes to the private Supabase Storage bucket `task-files`; the task row
keeps the path, the original name, the MIME type and the size. There is no
server of our own, so Storage is the only place a file can live where the whole
team can read it. Reading goes through a **signed link valid for two minutes**,
so a URL that leaks stops working — `select` and `insert` are the only things
the browser may do to the bucket.

Two consequences worth knowing: a file that has been uploaded cannot be
overwritten or deleted from the browser, so removing an attachment (or deleting
the task) drops the link and leaves the file in the bucket; and the PDF day
report does not list attachments.

## Locking and the passcode

The board writes **today only**. At midnight IST the previous day becomes
read-only on the board, for everyone, and future days are never writable. There
is no job to run and no unlock button — the RLS policies compare `log_date` to
`editable_from()` and `today_ist()`, and `editable_from()` returns today.
Corrections to an earlier day are made by an admin at `/rating`.

The window lives in that one function, and the board reads it too, so the UI
moves with it. It was opened from 1 September 2026 for a backfill (0014) and
closed again on 22 September (0015). To reopen from a date:

```sql
create or replace function public.editable_from() returns date
language sql stable set search_path = public, pg_temp
as $$ select date '2026-09-01' $$;
```

and to close it again, make it `select public.today_ist()`.

The browser holds a **public** anon key, so nothing enforced in React would
count; all of this is enforced by Postgres:

| what                              | how it is stopped                                   |
| --------------------------------- | --------------------------------------------------- |
| editing / deleting a day before the window | RLS restricts direct writes to `editable_from()` .. `today_ist()` |
| back-dating a new entry past the window | the same check on the inserted row       |
| logging a future day               | the same check — nothing after `today_ist()`        |
| moving a task to another day       | `log_date` is not in anon's `GRANT UPDATE` list     |
| writing a verdict or a brownie     | `day_marks` has no insert/update/delete policy — only `admin_set_mark` writes it |
| reading the passcode               | `app_secrets` has no grants and no policies         |
| calling the internal functions     | `EXECUTE` revoked from `PUBLIC`, not just from anon |
| brute forcing the passcode         | bcrypt cost 12, plus a 10-failures-in-15-minutes cut-off |

Days outside the window and every rating change go through `SECURITY DEFINER`
functions that verify a bcrypt passcode inside the database:
`admin_update_entry`, `admin_delete_entry`, `admin_insert_entry`,
`admin_set_day` and `admin_set_mark`.
The passcode is stored hashed in `app_secrets`; change it with

```sql
update public.app_secrets
   set value = extensions.crypt('new passcode', extensions.gen_salt('bf', 12))
 where key = 'passcode';
```

**What this does not do.** The anon key is in the JS bundle by design — that is
how a frontend-only Supabase app reads data — so anyone with the URL can *read*
the board through the API. The passcode gates writes, not reads. And a shared
passcode is only as private as the people who know it.

## Routes

| path      | what it is                                                          |
| --------- | ------------------------------------------------------------------- |
| `/`       | the board. Today is editable by anyone; **earlier days are view-only** — there is no unlock here |
| `/rating` | admin. The same board view, passcode-gated, with full control for any day: add, edit, delete, status, attendance, **the verdict and its brownies**, and remarks, plus a PDF report. The row order is held still while judging — see above |

`vercel.json` already rewrites everything to `index.html`, so `/rating` works
on a deployed build.

## The verdict

Work is not scored task by task. **An admin judges the whole person's day** in
one of five categories, and may add up to two brownies:

| Category | Place | Colour |
| --- | --- | --- |
| Extraordinary | 1 | light pink |
| Over performed | 2 | light blue |
| Up to the mark | 3 | light green |
| Can be better | 4 | yellow |
| Not up to the mark | 5 | red |

| Brownie | For |
| --- | --- |
| Overtime | stayed well beyond the day |
| Holiday | worked on a day off |

The admin picks a level from a ladder with all five on screen, climbing from
*not up to the mark* at the foot to *extraordinary* at the top; clicking the
level already in force clears it. The column sits at the right-hand end of the
table, out of the way of the day's work.

**Nothing is shown until the admin decides.** Until then the person reads
*Awaiting review* and has no place. Once judged, their row and every task under
it carry the category's colour, and the chip spells the verdict out.

The board is ordered by the verdict: extraordinary at the top, not up to the
mark at the bottom. **Everyone inside a category shares one place** — the place
is the category, not a number per person — and brownies only settle the order
within it. Anyone not yet judged sits below everyone who is.

A verdict lives in `day_marks`, one row per person per day. The browser can read
it and nothing else: there is no insert, update or delete policy, so a verdict
can only be set through `admin_set_mark`, which checks the passcode inside the
database.

Over a week or a month the standing works the same way — most extraordinary
days first, then over performed, and so on, with days not up to the mark
counting against and brownies settling the rest. There is no average and no
total, by design.

## Person view

Clicking a name opens that person since 1 October 2026: how many days have been
judged and how they split across the five categories, brownies earned, tasks and
hours logged, a month of day squares each coloured by that day's verdict, and the
tasks behind any day you click.

## Review

The **Graph** button opens Review: the standing for a week, a month or the whole
period, each person's verdicts as one coloured bar with their brownies, tasks and
hours — and how the team's verdicts moved week to week. There is no average and
no total, by design.

## Data model

| table      | what it holds                                                     |
| ---------- | ----------------------------------------------------------------- |
| `members`  | the roster behind every dropdown; `active = false` retires someone |
| `day_logs` | one row per member per day — attendance + an optional note         |
| `entries`  | every task: whose it is, status, time, remarks, attachment |
| `day_marks` | one verdict per person per day: category + the two brownies |
| `daily_scores` | trigger-maintained per-person, per-day rollup behind the graph |

An entry with `created_by = null` was assigned to that person; a non-null
`created_by` means they logged it themselves. Each task carries one verdict —
`done` / `not_done` / `rework` — plus `minutes` taken and free text `remarks`.
How well the day went is not recorded on the task at all; it lives in
`day_marks`. Changing the verdict writes `status_by` and `status_at`, so the
acknowledgement trail is kept rather than just the current value.

Row Level Security is on. This is an internal board with no login, which is
deliberate: anyone can read everything, and anyone can write inside the open
window (see *Locking and the passcode*). `members` is read-only from the client
so the roster can only change from the SQL editor.

## Changing things

- Attendance options, timezone, org name → `src/config.ts`
- The roster → `supabase/seed.sql`
- Sample data to see the board populated → `supabase/demo.sql`
- Months of fake history to see the graph → `supabase/demo_history.sql`

## Status

Schema, RLS, grants and realtime are applied to the live project, through
migration 0018. The roster is seeded with the 19 team members. **The log starts
on 1 October 2026** — everything before that was cleared when per-task scoring
was replaced by the daily verdict (a JSON export was taken first and kept
outside the repo).
