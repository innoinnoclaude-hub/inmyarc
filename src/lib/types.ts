import type { AttendanceKey, StatusKey } from "../config";

export interface Member {
  id: string;
  name: string;
  title: string | null;
  active: boolean;
}

export interface DayLog {
  id: string;
  member_id: string;
  log_date: string;
  attendance: AttendanceKey;
  note: string | null;
  updated_at: string;
}

export interface Entry {
  id: string;
  log_date: string;
  member_id: string;
  /** null = assigned by someone; otherwise the person logged it themselves */
  created_by: string | null;
  title: string;
  details: string | null;
  status: StatusKey;
  minutes: number | null;
  rating: number | null;
  remarks: string | null;
  status_by: string | null;
  status_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One member's slice of a given day, ready for rendering. */
export interface RowGroup {
  member: Member;
  dayLog: DayLog | null;
  entries: Entry[];
  /** Sum of (minutes taken x stars) across the day. Unrated or untimed
   *  tasks contribute nothing. Drives the ranking once the day has begun. */
  score: number;
  /** DENSE_RANK over score: equal scores share a place and the next place
   *  follows immediately (1, 2, 2, 3 — never 1, 2, 2, 4). */
  rank: number;
}
