import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type StatTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneText: Record<StatTone, string> = {
  neutral: 'text-slate-900',
  info: 'text-sky-700',
  success: 'text-emerald-700',
  warning: 'text-amber-600',
  danger: 'text-red-700'
}

interface StatCardProps {
  label: string
  value: ReactNode
  sub?: string
  tone?: StatTone
  icon?: ReactNode
}

export function StatCard({ label, value, sub, tone = 'neutral', icon }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        {icon && <div className="text-slate-300">{icon}</div>}
      </div>
      <div className={cn('mt-1 text-xl font-semibold tracking-tight', toneText[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}
