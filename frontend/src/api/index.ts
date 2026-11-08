/**
 * Public entry point of the frontend API layer. The base API (token handling,
 * base query, cache tags) lives in `base.ts`; each domain module extends it via
 * `api.injectEndpoints` and exports its generated hooks. This barrel re-exports
 * everything so existing imports from `api/index.js` keep working.
 */

export * from './auth.js';
export {
  api,
  clearToken,
  getApiErrorMessage,
  getLoginUrl,
  getToken,
  setToken,
} from './base.js';
export * from './certifications.js';
export * from './events.js';
export * from './notifications.js';
export * from './organization-users.js';
export * from './organizations.js';
export * from './rooms.js';
export * from './sites.js';
export * from './teams.js';
export * from './user-qualifications.js';
export * from './users.js';
export * from './work-roles.js';
