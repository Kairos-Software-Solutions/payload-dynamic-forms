import type { Access, FieldAccess, PayloadRequest } from 'payload'

export const loggedIn = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user)

export const nobody: Access = () => false

export function adminAccess(isAdmin: (req: PayloadRequest) => boolean): Access {
  return ({ req }) => Boolean(req.user) && isAdmin(req)
}

export function adminFieldAccess(isAdmin: (req: PayloadRequest) => boolean): FieldAccess {
  return ({ req }) => Boolean(req.user) && isAdmin(req)
}
