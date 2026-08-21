import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { Button, Close } from "./ui";

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 640,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !overlay.current || !panel.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        overlay.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.18, ease: "power2.out" },
      );
      gsap.fromTo(
        panel.current,
        { opacity: 0, y: 10, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power3.out" },
      );
      gsap.fromTo(
        panel.current!.querySelectorAll("[data-stagger]"),
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: 0.26,
          stagger: 0.035,
          delay: 0.05,
          ease: "power2.out",
        },
      );
    });
    // first focusable field gets the caret
    const first = panel.current.querySelector<HTMLElement>(
      "input, select, textarea",
    );
    first?.focus();
    return () => ctx.revert();
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlay}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 px-4 py-[6vh] backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        className="w-full rounded-md border border-line-strong bg-surface shadow-[0_1px_2px_rgba(23,23,26,0.06),0_16px_40px_-12px_rgba(23,23,26,0.18)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="-mt-0.5 -mr-1.5 size-7 px-0"
          >
            <Close className="size-3.5" />
          </Button>
        </header>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-paper px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
