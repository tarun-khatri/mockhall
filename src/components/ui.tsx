/** Small shared controls: buttons, segmented control, chips, toast, list rows. */
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-pen text-on-status font-semibold disabled:opacity-50',
    secondary: 'bg-surface text-ink border border-line font-semibold disabled:opacity-50',
    ghost: 'bg-transparent text-pen font-semibold disabled:opacity-50',
    danger: 'bg-not-answered text-on-status font-semibold disabled:opacity-50',
  };
  return (
    <button type="button" className={`min-h-12 rounded-[12px] px-4 text-[16px] ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[12px] bg-paper p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 rounded-[9px] px-1 text-[15px] ${value === o.value ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ selected, onClick, children }: { selected?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-full border px-3.5 text-[15px] ${selected ? 'border-pen bg-pen/10 font-semibold text-pen' : 'border-line bg-surface text-ink'}`}
    >
      {children}
    </button>
  );
}

export function Toast({ text, tone, id, onDone }: { text: string; tone: 'info' | 'warn' | 'danger'; id: number; onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      onDone();
    }, 2600);
    return () => clearTimeout(t);
  }, [id, onDone]);
  if (!visible) return null;
  const bg = tone === 'danger' ? 'bg-not-answered text-on-status' : tone === 'warn' ? 'bg-warn text-on-warn' : 'bg-ink text-paper';
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-[480px] justify-center px-4">
      <div className={`rounded-[12px] px-4 py-2.5 text-[15px] font-semibold shadow-lg ${bg}`}>{text}</div>
    </div>
  );
}

export function ListRow({
  to,
  onClick,
  title,
  detail,
  trailing,
  disabled,
}: {
  to?: string;
  onClick?: () => void;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-ink">{title}</span>
        {detail ? <span className="mt-0.5 block text-[14px] text-ink-2">{detail}</span> : null}
      </span>
      {trailing}
      {!disabled ? <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-2" /> : null}
    </>
  );
  const cls = `flex min-h-14 w-full items-center gap-3 py-3 text-left ${disabled ? 'opacity-60' : ''}`;
  if (to && !disabled)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={disabled ? undefined : onClick} className={cls} aria-disabled={disabled || undefined}>
      {body}
    </button>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-1 flex items-baseline justify-between">
      <h2 className="text-[15px] font-semibold text-ink-2">{children}</h2>
      {action}
    </div>
  );
}

export function Divided({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-6 text-ink-2">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-pen" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
