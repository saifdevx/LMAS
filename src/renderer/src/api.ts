import type { LmasApi } from '../../shared/api-types'

/** Typed accessor for the preload bridge. */
export const api: LmasApi = window.lmas

const TOKEN_KEY = 'lmas.token'

export function storedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}
