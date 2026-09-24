/**
 * Bộ primitive UI chuẩn shadcn/ui (viết gọn, không phụ thuộc Radix) dùng cho
 * OFFSHORE PTW – Premium Industrial Dashboard.
 */
import React from 'react';
import { cn } from '../../lib/utils';

/* ---------------------------------- Card --------------------------------- */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[0.875rem] border border-border bg-card text-card-foreground shadow-sm backdrop-blur-[2px]',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold uppercase tracking-[0.14em] text-foreground/90', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

/* --------------------------------- Button -------------------------------- */

type ButtonVariant = 'primary' | 'success' | 'danger' | 'warning' | 'outline' | 'ghost' | 'secondary';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:brightness-110 active:brightness-95 shadow-[0_0_18px_-6px_var(--primary)]',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_18px_-6px_#10b981]',
  danger: 'bg-rose-700 text-white hover:bg-rose-600 shadow-[0_0_18px_-6px_#e11d48]',
  warning: 'bg-amber-500 text-black hover:bg-amber-400',
  outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
  secondary: 'bg-muted text-foreground hover:bg-border',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-9 px-4 text-sm rounded-lg',
  lg: 'h-11 px-6 text-sm rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Alias để các trang dùng tone ngữ nghĩa ('critical' → danger nhấn mạnh). */
export type { ButtonVariant };
export type ActionTone = ButtonVariant | 'critical';

/** Map tone hành động → variant Button hợp lệ. */
export function toButtonVariant(tone: ActionTone): ButtonVariant {
  return tone === 'critical' ? 'danger' : tone;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';

/* ---------------------------------- Badge -------------------------------- */

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'critical'
  | 'violet';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  critical: 'border-red-500/40 bg-red-600/15 text-red-400 animate-pulse',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------- Form fields ------------------------------ */

export const inputClass = cn(
  'w-full h-9 rounded-lg border border-input bg-input/40 px-3 text-sm text-foreground',
  'placeholder:text-muted-foreground/50 transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring/60',
  'read-only:cursor-default read-only:opacity-90 disabled:opacity-40'
);

/** Select style Tailwind – onChange trả về value trực tiếp cho gọn code trang. */
export function Select({
  value,
  onChange,
  children,
  className,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClass, 'appearance-none pr-8', className)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground', className)}
      {...props}
    />
  );
}

export function FieldRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* --------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  widthClass = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  widthClass?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full rounded-2xl border border-border bg-card shadow-2xl',
          'ptw-modal-in',
          widthClass
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Separator -------------------------------- */

export function Separator({ className, label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3 py-1', className)}>
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }
  return <div className={cn('h-px w-full bg-border', className)} />;
}
