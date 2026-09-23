import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the visible title (still used for aria-labelledby). */
  hideTitle?: boolean;
}

/** Modal bottom sheet inside the 480 px column: focus moves in, Escape/backdrop close, focus returns on close. */
export function BottomSheet({ open, onClose, title, children, footer, hideTitle }: BottomSheetProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus], button, [href], input, select, [tabindex]:not([tabindex="-1"])');
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[#0b1224]/45" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className="sheet-enter absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] max-w-[480px] flex-col rounded-t-[20px] bg-surface text-ink shadow-[var(--shadow-sheet)] outline-none"
      >
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
        <h2 id={id} className={hideTitle ? 'sr-only' : 'px-4 pb-1 pt-2 text-[20px] font-bold'}>
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line px-4 pt-3 pb-3">{footer}</div> : <div className="safe-bottom" />}
      </div>
    </div>,
    document.body,
  );
}
