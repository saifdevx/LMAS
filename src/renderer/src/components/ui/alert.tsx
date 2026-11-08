import type { ReactNode } from 'react'

export function Alert({ kind = 'info', message, children }: { kind?: 'info' | 'error' | 'success' | 'warning'; message?: string; children?: ReactNode }) {
  if (!message && !children) return null
  const styles: Record<string, string> = {
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
    error: 'bg-red-50 text-red-700 ring-red-200',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-800 ring-amber-200'
  }
  return (
    <div className={`mb-3 rounded-md px-3 py-2 text-sm ring-1 ring-inset ${styles[kind]}`} role="alert">
      {message}
      {children}
    </div>
  )
}
