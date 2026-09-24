/**
 * ============================================================================
 * STATUS META – Bảng ánh xạ trạng thái permit -> màu sắc công nghiệp & icon
 * Dùng chung cho Dashboard, Stepper, Badge để đảm bảo tính nhất quán trực quan.
 * ==========================================================================*/

import { PermitStatus } from '../types/domain';
import { BadgeTone } from '../components/ui/primitives';

export interface StatusMeta {
  tone: BadgeTone;
  /** Dot color class trên stepper/bảng. */
  dot: string;
  text: string;
  glyph: string;
}

export const STATUS_META: Record<PermitStatus, StatusMeta> = {
  DRAFT:                   { tone: 'neutral',  dot: 'bg-zinc-400',   text: 'text-zinc-400',   glyph: '📝' },
  SUBMITTED:               { tone: 'info',     dot: 'bg-sky-400',    text: 'text-sky-400',    glyph: '📤' },
  LINE_SUPERVISOR_REVIEW:  { tone: 'warning',  dot: 'bg-amber-400',  text: 'text-amber-400',  glyph: '⏳' },
  FPS_REVIEW:              { tone: 'warning',  dot: 'bg-amber-400',  text: 'text-amber-400',  glyph: '⏳' },
  DEPUTY_OIM_REVIEW:       { tone: 'warning',  dot: 'bg-amber-400',  text: 'text-amber-400',  glyph: '⏳' },
  OIM_REVIEW:              { tone: 'warning',  dot: 'bg-amber-400',  text: 'text-amber-400',  glyph: '⏳' },
  APPROVED:                { tone: 'success',  dot: 'bg-emerald-400',text: 'text-emerald-400',glyph: '✅' },
  WORK_IN_PROGRESS:        { tone: 'violet',   dot: 'bg-violet-400', text: 'text-violet-400', glyph: '🔧' },
  SUSPENDED:               { tone: 'critical', dot: 'bg-orange-500', text: 'text-orange-400', glyph: '⛔' },
  RESUMED:                 { tone: 'violet',   dot: 'bg-violet-400', text: 'text-violet-400', glyph: '▶️' },
  WORK_COMPLETED:          { tone: 'info',     dot: 'bg-cyan-400',   text: 'text-cyan-400',   glyph: '🏁' },
  CLOSED:                  { tone: 'success',  dot: 'bg-emerald-600',text: 'text-emerald-500',glyph: '🗄️' },
  REJECTED:                { tone: 'danger',   dot: 'bg-rose-600',   text: 'text-rose-400',   glyph: '❌' },
  RETURNED:                { tone: 'warning',  dot: 'bg-yellow-500', text: 'text-yellow-500', glyph: '↩️' },
  CANCELLED:               { tone: 'neutral',  dot: 'bg-zinc-500',   text: 'text-zinc-400',   glyph: '🚫' },
  EXPIRED:                 { tone: 'danger',   dot: 'bg-red-500',    text: 'text-red-400',    glyph: '⌛' },
};

export const RISK_TONE: Record<string, BadgeTone> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'critical',
};
