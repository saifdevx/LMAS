import { createContext, useContext } from 'react'
import type { RouteId } from './navigation'

export interface NavState {
  route: RouteId
  patientId?: number
}

export interface RouterValue {
  nav: NavState
  navigate: (route: RouteId, params?: { patientId?: number }) => void
}

export const RouterContext = createContext<RouterValue | null>(null)

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used inside RouterContext')
  return ctx
}

export function useNavigate() {
  return useRouter().navigate
}
