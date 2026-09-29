import { supabase } from "./supabase";

/**
 * One optional file per task, kept in a private Supabase Storage bucket. The
 * row holds the path and the original name; the file itself is never in the
 * database.
 *
 * Reading goes through a short-lived signed URL rather than a public link, so a
 * URL that leaks out of the team stops working. Uploads are allowed by policy,
 * overwrites and deletes are not — see migration 0016.
 */
export const ATTACHMENT_BUCKET = "task-files";

/** Matches the bucket's own limit and the CHECK on the row. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface Attachment {
  attachment_path: string;
  attachment_name: string;
  attachment_type: string | null;
  attachment_size: number;
}

/** What clearing an attachment writes. */
export const NO_ATTACHMENT = {
  attachment_path: null,
  attachment_name: null,
  attachment_type: null,
  attachment_size: null,
} as const;

export type AttachmentPatch = Attachment | typeof NO_ATTACHMENT;

/** "812 KB", "1.4 MB" */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 100 ? 1 : 0)} MB`;
}

/** Why this file cannot be attached, or null if it can. */
export function attachmentProblem(file: File): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_ATTACHMENT_BYTES)
    return `"${file.name}" is too big (${formatBytes(file.size)}). The limit is 10 MB per file.`;
  return null;
}

function randomName(original: string): string {
  const dot = original.lastIndexOf(".");
  const ext =
    dot > 0 ? original.slice(dot, dot + 12).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  // grouped by month so the bucket stays browsable; the name itself is random,
  // so two people attaching "report.pdf" never collide and nothing is guessable
  return `${new Date().toISOString().slice(0, 7)}/${id}${ext}`;
}

/**
 * Put the file in the bucket and return what the row needs. Called before the
 * task is written, so a failed upload means no half-attached task.
 */
export async function uploadAttachment(file: File): Promise<Attachment> {
  const problem = attachmentProblem(file);
  if (problem) throw new Error(problem);
  const path = randomName(file.name);
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    throw new Error(`Could not upload "${file.name}". ${error.message}`);
  }
  return {
    attachment_path: path,
    attachment_name: file.name.slice(0, 180),
    attachment_type: file.type || null,
    attachment_size: file.size,
  };
}

/** Open a task's attachment in a new tab through a link valid for two minutes. */
export async function openAttachment(path: string): Promise<void> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Could not open the attachment. ${error?.message ?? "No link came back."}`,
    );
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
