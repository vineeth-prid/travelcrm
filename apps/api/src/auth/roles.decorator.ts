import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Enforced by RolesGuard on the server —
 * hiding the button in the navigation is a courtesy, not a control.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Shorthand for the common case. */
export const AdminOnly = () => Roles('ADMIN');
