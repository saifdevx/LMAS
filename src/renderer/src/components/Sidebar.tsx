import { FlaskConical } from 'lucide-react'
import { NAV_GROUPS, type RouteId } from '../lib/navigation'
import { cn } from '../lib/cn'

interface SidebarProps {
  route: RouteId
  onNavigate: (route: RouteId) => void
  permissions: string[]
}

export function Sidebar({ route, onNavigate, permissions }: SidebarProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide text-white">LMAS</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Lab Management</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter((item) => permissions.includes(item.permission))
          if (visible.length === 0) return null
          return (
            <div key={group.label} className="mb-4">
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const Icon = item.icon
                  const active = route === item.id
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(item.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors',
                          active
                            ? 'bg-sky-600/20 text-white ring-1 ring-inset ring-sky-500/40'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-sky-400' : 'text-slate-400')} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-3 text-[10px] text-slate-500">
        LMAS v0.1.0 · Checkpoint 1 · Offline
      </div>
    </aside>
  )
}
