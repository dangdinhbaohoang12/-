/**
 * ============================================================================
 * APPROVAL LIFECYCLE STEPPER – Dòng thời gian ký duyệt trực quan
 * ----------------------------------------------------------------------------
 * - DONE          : Emerald ✅  (kèm người ký, thời điểm, comment)
 * - CURRENT       : Amber ⏳    (nhấp nháy ptw-pending-dot)
 * - PENDING       : Zinc trung tính (chưa tới lượt)
 * - REJECTED      : Crimson ❌
 * - NOT_REQUIRED  : N/A (bị bỏ qua theo Approval Rule Engine)
 * ==========================================================================*/

import { ApprovalStep } from '../../types/domain';
import { APPROVAL_LEVEL_LABELS } from '../../types/domain';
import { formatTimestamp } from '../../lib/utils';
import { cn } from '../../lib/utils';

function StepIcon({ step }: { step: ApprovalStep }) {
  switch (step.status) {
    case 'DONE':
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/15 text-emerald-400 shadow-[0_0_16px_-4px_#10b981]">
          ✅
        </span>
      );
    case 'CURRENT':
      return (
        <span className="ptw-pending-dot flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/15 text-amber-300">
          ⏳
        </span>
      );
    case 'REJECTED':
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-rose-600 bg-rose-600/15 text-rose-400">
          ❌
        </span>
      );
    case 'NOT_REQUIRED':
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-[10px] font-bold text-muted-foreground">
          N/A
        </span>
      );
    default:
      return (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground">
          {step.level === 'LINE_SUPERVISOR' ? '1' : step.level === 'FPS' ? '2' : step.level === 'DEPUTY_OIM' ? '3' : '4'}
        </span>
      );
  }
}

export function ApprovalStepper({ chain }: { chain: ApprovalStep[] }) {
  // Đánh dấu bước đang chờ quyết để hiệu ứng amber chỉ xuất hiện ở đúng 1 node.
  const firstPendingIdx = chain.findIndex((s) => s.required && s.status === 'PENDING');
  const nodes = chain.map((s, i) => ({ ...s, status: s.required && s.status === 'PENDING' && i !== firstPendingIdx ? 'PENDING' : s.status === 'PENDING' && i === firstPendingIdx ? ('CURRENT' as const) : s.status }));

  return (
    <div className="grid grid-cols-2 gap-y-6 md:grid-cols-4">
      {nodes.map((step, i) => (
        <div key={step.level} className="relative flex flex-col items-center text-center">
          {i < nodes.length - 1 && (
            <div
              className={cn(
                'absolute left-[calc(50%+26px)] top-[17px] hidden h-0.5 w-[calc(100%-52px)] md:block',
                step.status === 'DONE' ? 'bg-emerald-500/60' : 'bg-border'
              )}
            />
          )}
          <StepIcon step={step} />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/90">
            {APPROVAL_LEVEL_LABELS[step.level]}
          </p>
          {step.decidedByName ? (
            <div className="mt-1 space-y-0.5">
              <p className="font-mono text-[10px] text-muted-foreground">{step.decidedByName}</p>
              <p className="font-mono text-[10px] text-muted-foreground/70">
                {formatTimestamp(step.decidedAt)}
              </p>
              {step.signatureHash && (
                <p className="font-mono text-[9px] text-emerald-500/80" title={step.signatureHash}>
                  SIG:{step.signatureHash.slice(0, 10)}…
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-[10px] text-muted-foreground/60">
              {step.status === 'NOT_REQUIRED'
                ? 'Bỏ qua theo Rule Engine'
                : step.status === 'CURRENT'
                  ? 'Đang chờ quyết định'
                  : 'Chưa tới lượt'}
            </p>
          )}
          {step.comment && (
            <p className="mt-1 max-w-[180px] truncate text-[10px] italic text-muted-foreground" title={step.comment}>
              “{step.comment}”
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
