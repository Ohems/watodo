/**
 * Public entry point of the validation schema layer. Each domain module
 * defines its Zod schemas and inferred types; this barrel re-exports
 * everything so existing imports from `schemas/index.js` keep working.
 */
export * from './absences.js';
export * from './auth.js';
export * from './calendars.js';
export * from './certifications.js';
export * from './common.js';
export * from './events.js';
export * from './notifications.js';
export * from './organizations.js';
export * from './roles.js';
export * from './rooms.js';
export * from './sites.js';
export * from './teams.js';
export * from './user-qualifications.js';
export * from './users.js';
export * from './work-roles.js';
