/** The authenticated actor performing a service call (from the session). */
export interface Actor {
  id: number
  permissions: string[]
}

export function actorHas(actor: Actor, permission: string): boolean {
  return actor.permissions.includes(permission)
}
