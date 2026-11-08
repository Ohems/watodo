import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';
import { createdAtSchema, updatedAtSchema } from './common.js';

export const userStateSchema = z.enum(['active', 'inactive']);

/** UI languages the app ships translations for (BCP 47 tags). */
export const supportedLanguages = SUPPORTED_LANGUAGES;

export const languageSchema = z.enum(supportedLanguages);

/** First day of the week shown in calendars. */
export const weekStartSchema = z.enum(['sunday', 'monday']);

export const localeParamsSchema = z.object({
  lng: languageSchema,
});

/**
 * E.164 phone number: a plus sign followed by the country code and the
 * national number (7-15 digits in total).
 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must include the country code (e.g. +358401234567)');

export const userPushSchema = z.object({
  name: z.string().optional(),
  email: z.email().optional(),
  description: z.string().nullable().optional(),
  state: userStateSchema.optional(),
});

export const userSchema = userPushSchema.extend({
  id: z.string(),
  createdAt: createdAtSchema,
  updatedAt: updatedAtSchema,
});

/**
 * Fields a user may change on their own account. Unlike userPushSchema this
 * deliberately has no `state` field: account state stays an administrative
 * concern.
 */
export const userSelfUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  description: z.string().nullable().optional(),
  phoneNumber: phoneNumberSchema.nullable().optional(),
  language: languageSchema.optional(),
  weekStart: weekStartSchema.optional(),
});

export const userQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  archived: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
});

/** Optional occurrence range for the simple user list; marks users absent in the range. */
export const userListQuerySchema = z.object({
  start: z.iso.datetime().optional(),
  end: z.iso.datetime().optional(),
});

export type UserPush = z.infer<typeof userPushSchema>;
export type UserSelfUpdate = z.infer<typeof userSelfUpdateSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
