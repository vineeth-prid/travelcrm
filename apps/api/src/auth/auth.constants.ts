/** Name of the httpOnly cookie carrying the session JWT. */
export const AUTH_COOKIE = 'travel_crm_session';

export interface JwtPayload {
  /** User id. */
  sub: string;
  email: string;
}
