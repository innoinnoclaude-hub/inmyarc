import type { AttendanceKey, CategoryKey, StatusKey } from "../config";

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
  remarks: string | null;
  /** One optional file in the `task-files` bucket. Path is null when there is
   *  none; the four move together. */
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  status_by: string | null;
  status_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * An admin's verdict on one person's day. Absent until they decide — the board
 * shows no colour and no place before that.
 */
export interface DayMark {
  member_id: string;
  log_date: string;
  category: CategoryKey;
  /** The two brownies: a long day, and a day that should have been off. */
  overtime: boolean;
  holiday: boolean;
  marked_at: string;
}

/** One member's slice of a given day, ready for rendering. */
export interface RowGroup {
  member: Member;
  dayLog: DayLog | null;
  entries: Entry[];
  /** The admin's verdict, or null while the day is still unjudged. */
  mark: DayMark | null;
  /**
   * Place on the day's board. Everyone in a category shares it — the standing
   * is the category, not a number per person — and it is null until judged.
   */
  rank: number | null;
}
