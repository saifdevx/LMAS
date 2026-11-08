import type { PeriodSpec } from '../../../shared/api-types'
import { cn } from '../lib/cn'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { useState } from 'react'

const OPTIONS: Array<{ type: PeriodSpec['type']; label: string }> = [
  { type: 'today', label: 'Today' },
  { type: 'yesterday', label: 'Yesterday' },
  { type: 'last7', label: 'Last 7 days' },
  { type: 'this_month', label: 'This month' },
  { type: 'custom', label: 'Custom' }
]

interface PeriodFilterProps {
  value: PeriodSpec
  onChange: (value: PeriodSpec) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
        {OPTIONS.map((opt) => (
          <button
            key={opt.type}
            type="button"
            onClick={() => onChange(opt.type === 'custom' ? { type: 'custom' } : { type: opt.type })}
            className={cn(
              'rounded px-3 py-1.5 text-xs font-medium transition-colors',
              value.type === opt.type ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value.type === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input type="date" className="h-8 w-36 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-slate-400">to</span>
          <Input type="date" className="h-8 w-36 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button
            size="sm"
            disabled={!from || !to}
            onClick={() => onChange({ type: 'custom', from, to })}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
