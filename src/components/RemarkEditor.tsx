import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

/**
 * Click to write, Enter to save, Escape to cancel, Shift+Enter for a newline.
 * Shared by the board's table cell and the admin rating list.
 */
export function RemarkEditor({
  value,
  readOnly,
  onSave,
  placeholder = "Add remark",
  revealOnHover = false,
  rows = 3,
}: {
  value: string | null;
  readOnly?: boolean;
  onSave: (text: string) => void;
  placeholder?: string;
  /** Keep the empty-state prompt hidden until the row is hovered. */
  revealOnHover?: boolean;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) box.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== (value ?? "").trim()) onSave(draft);
  };

  if (readOnly) {
    return value ? (
      <p className="text-[12px] leading-[1.5] break-words text-ink-2">{value}</p>
    ) : (
      <span className="text-[12px] text-ink-4">&mdash;</span>
    );
  }

  if (editing) {
    return (
      <textarea
        ref={box}
        rows={rows}
        value={draft}
        maxLength={500}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        placeholder="Remark, then Enter"
        className="focus-ring w-full resize-none rounded-sm border border-ink bg-surface px-2 py-1.5 text-[12px] leading-[1.5] text-ink"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="focus-ring w-full rounded-xs px-1 py-0.5 text-left transition-colors hover:bg-mute-bg"
    >
      {value ? (
        <span className="text-[12px] leading-[1.5] break-words text-ink-2">
          {value}
        </span>
      ) : (
        <span
          className={cx(
            "text-[12px] text-ink-4",
            revealOnHover &&
              "opacity-0 transition-opacity group-hover/row:opacity-100",
          )}
        >
          {placeholder}
        </span>
      )}
    </button>
  );
}
