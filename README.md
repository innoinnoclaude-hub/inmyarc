# InnovativeView — Daily Log

A single-page internal portal. Everyone picks their name, marks how the day
went, and adds one entry per task. Anyone can assign a task to a teammate, and
anyone can mark a task validated. The board is scoped to one day and rolls over
at midnight (Asia/Kolkata). Every task carries a Done / Not done / Rework
required verdict, the time it took, a five-star rating and remarks — all
editable straight from the table.

Frontend only — React + Tailwind v4 + GSAP, talking straight to Supabase.
No server to run, deploys to Vercel as a static site.

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Database** — already applied to this project. For a fresh project, run
   `supabase/schema.sql` (Supabase Dashboard → SQL Editor), then the names in
   `supabase/seed.sql`. `supabase/migrations/` holds the two changes made after
   the first cut, both already folded into `schema.sql`.

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

## Row order

The board is alphabetical until the first entry of the day. From then on it
ranks people by **score** across their tasks,
highest first, and the first column reads *Rank* instead of *#*. Places are
**DENSE_RANK**: equal scores share a place and the next follows immediately
(1, 2, 2, 3 — never 1, 2, 2, 4). The same applies to *Avg rank* in the graph. Tasks with no
rating or no time recorded score nothing, and equal scores fall back to
alphabetical so the order never jitters. Each person's total shows under their
name once it is above zero.

## Performance graph

The **Graph** button opens a dialog with a person dropdown (or the whole team),
a week-wise / month-wise toggle, and a **ranking period**. It shows the last 12
weeks or 12 months as a score trend with totals.

The ranking underneath answers the period you pick rather than always the whole
range: choose a week and it ranks that week, choose a month and it ranks that
month, or leave it on **Overall** for the full range. Clicking a bar in the
chart selects its period, and the row for whoever is being viewed is
highlighted.

Both views read the same numbers. The board does **not** recompute score in the
browser — it reads `daily_scores`, so the table's points, the rank, the stat
strip and the graph all trace back to one definition written once in SQL.
`entries`, `day_logs` and `daily_scores` all broadcast over realtime, so a
rating given in `/rating` appears on `/` without a refresh, and vice versa.

Scores are not computed on the fly. `daily_scores` holds one row per person per
day, maintained by a trigger on `entries`: any insert, edit, re-rating, delete,
or moving a task to another person or day recomputes the affected days. The
browser has SELECT on it and nothing else, so it cannot drift out of step with
the tasks it summarises. `select public.rebuild_daily_scores();` rebuilds the
whole table from `entries` if it is ever needed.

## Locking and the passcode

At midnight IST the previous day becomes read-only on the board, for everyone.
There is no job to run and no unlock button — the RLS policies simply compare
`log_date` to `today_ist()` and stop matching. Corrections to an earlier day are
made by an admin at `/rating`.

The browser holds a **public** anon key, so nothing enforced in React would
count; all of this is enforced by Postgres:

| what                              | how it is stopped                                   |
| --------------------------------- | --------------------------------------------------- |
| editing / deleting a past day      | RLS restricts direct writes to today                |
| back-dating a new entry            | RLS `with check (log_date = today_ist())`           |
| moving a row into a past day       | same check on the new row                           |
| writing `rating` by any route      | the column is not in anon's `GRANT UPDATE` list     |
| reading the passcode               | `app_secrets` has no grants and no policies         |
| calling the internal functions     | `EXECUTE` revoked from `PUBLIC`, not just from anon |
| brute forcing the passcode         | bcrypt cost 12, plus a 10-failures-in-15-minutes cut-off |

Past days and every rating change go through `SECURITY DEFINER` functions that
verify a bcrypt passcode inside the database: `admin_update_entry`,
`admin_delete_entry`, `admin_insert_entry`, `admin_set_day` and `set_rating`.
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
| `/`       | the board. Today is editable by anyone; **earlier days are view-only, permanently** — there is no unlock here |
| `/rating` | admin. The same board view, passcode-gated, with full control for any day: add, edit, delete, status, attendance, rating and remarks |

`vercel.json` already rewrites everything to `index.html`, so `/rating` works
on a deployed build.

## Scoring

Every task carries two ratings, both set by an admin at `/rating`:

- **Efficiency** — a 1-5 slider: how well it was done. Starts at **3**, so an
  admin only moves it to say better or worse than usual
- **Impact** — 1-5 stars: how much it mattered. Starts blank, because putting a
  number on work nobody has looked at would be a lie

```
score = minutes x (efficiency / 5) x impact
```

Efficiency discounts — every point below 5 removes 20% of the time — while
impact scales by its own value, so the top of the range is 5x the minutes. A
240-minute task scores 1200 at 5 and 5, 960 at efficiency 4, 432 at 3 and 3,
and 48 at 1 and 1. A task missing either rating, or with no time recorded,
scores nothing — the score measures rated output, not hours at a desk.

Neither column is in the anon role's grants, so no direct request can write
them; both go through `set_efficiency` / `set_impact`, which verify the
passcode inside the database.

## Person view

Clicking a name in the table opens that person's profile.

Two rows of the same six measures — theirs, then the team's — all **per day
worked**, so nobody is diluted by days they did not log. The team row counts a
person only on a day they logged at least one task, so people who never log do
not drag it down. The last tile is their **average position out of the whole
team, across all history**.

Below that: an **activity calendar** in small GitHub-sized squares, a month at a
time with arrows, coloured by position that day rather than raw points — red at
the back of the pack through orange and yellow to green at the front — so a
month reads as form rather than volume. Beside it sits the month at a glance;
click any square and it becomes that day's tasks.

Then the **trend**, which follows whichever month the calendar is showing. Four
metrics — score, efficiency, impact and position — and a **week / day** toggle.
In week mode the axis is that month's weeks; switch to day and a dropdown picks
one of them, giving Monday to Sunday for that week. Weeks are labelled by their
full span because the first and last week of a month spill into the neighbouring
one.

Position is a line chart with 1 at the top, plotted against the two people
either side in the all-time standing, so a week can be read against close rivals
rather than in isolation.

Then the shape of their week, how the work splits, the spread of ratings they
have been given, and recent tasks.

All of it is derived from the entries themselves in `src/lib/profile.ts`, which
is pure and exported so the maths can be checked against SQL.

## Data model

| table      | what it holds                                                     |
| ---------- | ----------------------------------------------------------------- |
| `members`  | the roster behind every dropdown; `active = false` retires someone |
| `day_logs` | one row per member per day — attendance + an optional note         |
| `entries`  | every task: whose it is, verdict, time, efficiency, impact, remarks |
| `daily_scores` | trigger-maintained per-person, per-day rollup behind the graph |

An entry with `created_by = null` was assigned to that person; a non-null
`created_by` means they logged it themselves. Each task carries one verdict —
`done` / `not_done` / `rework` — plus `minutes` taken, a 1-5 `rating` and free
text `remarks`. Changing the verdict writes `status_by` and `status_at`, so the
acknowledgement trail is kept rather than just the current value.

Row Level Security is on with permissive policies for the `anon` role: this is
an internal board with no login, which is deliberate. `members` is read-only
from the client so the roster can only change from the SQL editor.

## Changing things

- Attendance options, timezone, org name → `src/config.ts`
- The roster → `supabase/seed.sql`
- Sample data to see the board populated → `supabase/demo.sql`
- Months of fake history to see the graph → `supabase/demo_history.sql`

## Status

Schema, RLS, grants and realtime are applied to the live project. The roster is
seeded with the 15 team members. The board starts empty — the first entry
someone adds is the first row.
