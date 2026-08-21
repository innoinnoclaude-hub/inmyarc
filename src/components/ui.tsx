import { useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export type Tone = "ok" | "live" | "wait" | "off" | "bad" | "mute";

const TONE: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  live: "bg-live-bg text-live",
  wait: "bg-wait-bg text-wait",
  off: "bg-off-bg text-off",
  bad: "bg-bad-bg text-bad",
  mute: "bg-mute-bg text-ink-3",
};

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- chip --------------------------------- */

export function Chip({
  tone = "mute",
  children,
  dot = false,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.5 text-[11px] leading-[16px] font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {dot && (
        <span className="size-[5px] rounded-full bg-current opacity-70" />
      )}
      {children}
    </span>
  );
}

/* -------------------------------- button -------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonProps) {
  const base =
    "focus-ring inline-flex items-center justify-center gap-1.5 rounded-sm border font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45";
  const sizes = {
    sm: "h-7 px-2.5 text-[12px]",
    md: "h-9 px-3.5 text-[13px]",
  }[size];
  const variants = {
    primary:
      "border-ink bg-ink text-white hover:bg-ink-2 hover:border-ink-2 active:bg-ink",
    secondary:
      "border-line-strong bg-surface text-ink hover:bg-mute-bg active:bg-line",
    ghost:
      "border-transparent bg-transparent text-ink-3 hover:text-ink hover:bg-mute-bg",
    danger:
      "border-transparent bg-transparent text-ink-3 hover:text-off hover:bg-off-bg",
  }[variant];
  return <button className={cx(base, sizes, variants, className)} {...rest} />;
}

/* --------------------------------- form --------------------------------- */

export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-baseline justify-between text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase"
    >
      <span>{children}</span>
      {hint && (
        <span className="font-normal tracking-normal normal-case text-ink-4">
          {hint}
        </span>
      )}
    </label>
  );
}

const fieldBase =
  "focus-ring w-full rounded-sm border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-4 transition-colors duration-150 hover:border-ink-4 focus-visible:border-ink";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cx(fieldBase, "h-9", className)} {...rest} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={cx(fieldBase, "resize-none py-2 leading-[1.5]", className)}
      {...rest}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <div className="relative">
      <select
        className={cx(
          fieldBase,
          "h-9 cursor-pointer appearance-none pr-8",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-4" />
    </div>
  );
}

/* ----------------------------- segmented set ---------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={cx(
              "focus-ring rounded-sm border px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-150",
              active
                ? "border-ink bg-ink text-white"
                : "border-line-strong bg-surface text-ink-2 hover:border-ink-4 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- icons -------------------------------- */

type IconProps = { className?: string };

export function ChevronDown({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function ChevronLeft({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M10 3L5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function ChevronRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Plus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Check({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M3 8.5l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Close({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Trash({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Refresh({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

/* ------------------------------ star rating ----------------------------- */

export function Star({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        d="M8 1.6l1.9 3.94 4.3.6-3.1 3.05.73 4.3L8 11.46 4.17 13.5l.73-4.3L1.8 6.14l4.3-.6L8 1.6z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Click a star to set the score; click the current score again to clear it. */
export function Rating({
  value,
  onChange,
  readOnly,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
      role="group"
      aria-label={value ? `Rated ${value} out of 5` : "Not rated"}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          aria-label={`${n} out of 5`}
          onMouseEnter={() => !readOnly && setHover(n)}
          onFocus={() => !readOnly && setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          className={cx(
            "focus-ring rounded-xs transition-colors duration-100",
            readOnly ? "cursor-default" : "cursor-pointer",
            n <= shown ? "text-ink" : "text-line-strong",
            !readOnly && "hover:text-ink",
          )}
        >
          <Star filled={n <= shown} className="size-[15px]" />
        </button>
      ))}
    </div>
  );
}

/* ------------------------- marked / not marked -------------------------- */

export function TickCircle({ className }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={className} aria-hidden>
      <circle cx="9" cy="9" r="7.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.75 9.25l2.2 2.2 4.3-4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CrossCircle({ className }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={className} aria-hidden>
      <circle cx="9" cy="9" r="7.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.6 6.6l4.8 4.8M11.4 6.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Pencil({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M11.2 2.6l2.2 2.2L5.6 12.6l-3 .8.8-3 7.8-7.8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M2.5 13.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
      <path d="M4.5 11.5v-4M8 11.5v-7M11.5 11.5v-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

/** Two tiny number fields that together mean "time taken". */
export function Duration({
  hours,
  mins,
  onChange,
}: {
  hours: string;
  mins: string;
  onChange: (next: { hours?: string; mins?: string }) => void;
}) {
  const field =
    "focus-ring tnum h-8 w-12 rounded-sm border border-line-strong bg-surface px-1.5 text-center text-[12.5px] text-ink placeholder:text-ink-4 hover:border-ink-4 focus-visible:border-ink";
  const digits = (v: string, max: number) => {
    const n = v.replace(/[^0-9]/g, "").slice(0, 3);
    if (n === "") return "";
    return String(Math.min(Number(n), max));
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        className={field}
        inputMode="numeric"
        value={hours}
        aria-label="Hours taken"
        placeholder="0"
        onChange={(e) => onChange({ hours: digits(e.target.value, 24) })}
      />
      <span className="text-[11px] text-ink-4">h</span>
      <input
        className={field}
        inputMode="numeric"
        value={mins}
        aria-label="Minutes taken"
        placeholder="00"
        onChange={(e) => onChange({ mins: digits(e.target.value, 59) })}
      />
      <span className="text-[11px] text-ink-4">m</span>
    </span>
  );
}
