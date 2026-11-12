import type { Access, FieldAccess, PayloadRequest } from 'payload'

export const loggedIn = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user)

export const nobody: Access = () => false

export function adminAccess(isAdmin: (req: PayloadRequest) => boolean): Access {
  return ({ req }) => Boolean(req.user) && isAdmin(req)
}

export function adminFieldAccess(isAdmin: (req: PayloadRequest) => boolean): FieldAccess {
  return ({ req }) => Boolean(req.user) && isAdmin(req)
}
/**
 * A field nobody may change through any API (REST, GraphQL, Local API without `overrideAccess`):
 * Payload drops the incoming value and keeps the stored one. The plugin's own writes use
 * `overrideAccess: true` or a collection `beforeChange` hook, which run after field access.
 */
export const nobodyField: FieldAccess = () => false
