import type { RowGroup } from "./types";

/**
 * A snapshot of the table's order, so the admin page can hold it still.
 *
 * On the board a live DENSE_RANK is what you want: the day unfolds and people
 * move. On `/rating` it fights the work — setting one impact star changes that
 * person's score, the table re-sorts, and the row being rated jumps somewhere
 * else mid-click. So the admin page takes the order once per day it looks at
 * (on load, on a day change, or when Refresh is pressed) and keeps it until one
 * of those happens again, while every value in the table stays live.
 */
export interface RowOrder {
  /** The day this order belongs to; a different day means take a new one. */
  date: string;
  /** Member ids, top row first. */
  ids: string[];
  /** The place each member held when the snapshot was taken. */
  ranks: Record<string, number>;
}

export function snapshotOrder(groups: RowGroup[], date: string): RowOrder {
  return {
    date,
    ids: groups.map((g) => g.member.id),
    ranks: Object.fromEntries(groups.map((g) => [g.member.id, g.rank])),
  };
}

/**
 * Put `groups` back into the snapshot's order and places. Values (score,
 * entries, attendance) are untouched, so ratings and points stay live.
 *
 * Anyone the snapshot has never seen — a member added since, or someone whose
 * first task landed after it was taken — keeps their live place and sorts to the
 * bottom in the order the ranking gave them.
 */
export function applyOrder(
  groups: RowGroup[],
  order: RowOrder | null,
  date: string,
): RowGroup[] {
  if (!order || order.date !== date) return groups;
  const place = new Map(order.ids.map((id, i) => [id, i]));
  return [...groups]
    .sort(
      (a, b) =>
        (place.get(a.member.id) ?? Number.MAX_SAFE_INTEGER) -
        (place.get(b.member.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((g) =>
      order.ranks[g.member.id] === undefined
        ? g
        : { ...g, rank: order.ranks[g.member.id] },
    );
}
