import { describe, expect, it } from 'vitest';
import {
  calendarListQuerySchema,
  eventCommentPushSchema,
  eventCommentUpdateSchema,
  eventJobPushSchema,
  eventJobUpdateSchema,
  eventSeriesListQuerySchema,
  eventSeriesPushSchema,
  eventSeriesQuerySchema,
  eventSeriesUpdateSchema,
  incrementalSchema,
  occurrenceRangeQuerySchema,
  opAssignmentSchema,
  operationSchema,
  providerSchema,
  recurrenceSchema,
  rescheduleOccurrenceSchema,
  roleAssignmentSchema,
  rolePushSchema,
  roleUpdateSchema,
  userPushSchema,
  userQuerySchema,
} from '../src/schemas/index.js';

describe('Schemas', () => {
  describe('userPushSchema', () => {
    it('should accept valid user data', () => {
      const result = userPushSchema.safeParse({
        name: 'Test User',
        email: 'test@example.com',
        description: 'A test user',
        state: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('should accept partial user data', () => {
      expect(userPushSchema.safeParse({ name: 'New Name' }).success).toBe(true);
    });

    it('should reject invalid state', () => {
      expect(userPushSchema.safeParse({ state: 'banned' }).success).toBe(false);
    });
  });

  describe('providerSchema', () => {
    it('should accept supported providers', () => {
      expect(providerSchema.safeParse('discord').success).toBe(true);
      expect(providerSchema.safeParse('google').success).toBe(true);
      expect(providerSchema.safeParse('microsoft').success).toBe(true);
    });

    it('should reject unsupported providers', () => {
      expect(providerSchema.safeParse('twitter').success).toBe(false);
    });
  });

  describe('rolePushSchema', () => {
    it('should accept a role with permissions', () => {
      const result = rolePushSchema.safeParse({
        name: 'Moderator',
        description: 'Can manage operations',
        permissions: ['operations:read', 'operations:write'],
      });
      expect(result.success).toBe(true);
    });

    it('should require a name', () => {
      expect(rolePushSchema.safeParse({ permissions: [] }).success).toBe(false);
    });
  });

  describe('roleUpdateSchema', () => {
    it('should accept partial role data', () => {
      expect(roleUpdateSchema.safeParse({ name: 'New name' }).success).toBe(true);
      expect(roleUpdateSchema.safeParse({ permissions: [] }).success).toBe(true);
    });
  });

  describe('roleAssignmentSchema', () => {
    it('should accept an assignment with scopes', () => {
      const result = roleAssignmentSchema.safeParse({
        userId: '123e4567-e89b-42d3-a456-426614174000',
        teamId: '123e4567-e89b-42d3-a456-426614174001',
        eventTypeId: 3,
      });
      expect(result.success).toBe(true);
    });

    it('should accept an assignment without scopes', () => {
      const result = roleAssignmentSchema.safeParse({
        userId: '123e4567-e89b-42d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should require a user id', () => {
      expect(roleAssignmentSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('userQuerySchema', () => {
    it('should accept empty query', () => {
      expect(userQuerySchema.safeParse({}).success).toBe(true);
    });

    it('should coerce string numbers', () => {
      const result = userQuerySchema.safeParse({ page: '2', limit: '25' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(25);
      }
    });

    it('should reject limit over 100', () => {
      expect(userQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    });
  });

  describe('operationSchema', () => {
    it('should accept valid operation with assignments', () => {
      const result = operationSchema.safeParse({
        name: 'Test Operation',
        description: 'A test',
        requirements: 'None',
        location: 'Helsinki',
        assignments: [{ name: 'Assignment 1', description: 'First' }],
      });
      expect(result.success).toBe(true);
    });

    it('should require name', () => {
      expect(operationSchema.safeParse({ description: 'No name' }).success).toBe(false);
    });
  });

  describe('opAssignmentSchema', () => {
    it('should accept valid assignment', () => {
      expect(
        opAssignmentSchema.safeParse({ name: 'Task 1', description: 'Do something' }).success,
      ).toBe(true);
    });

    it('should require name', () => {
      expect(opAssignmentSchema.safeParse({ description: 'No name' }).success).toBe(false);
    });
  });

  describe('incrementalSchema', () => {
    it('should accept non-negative integers', () => {
      expect(incrementalSchema.safeParse(0).success).toBe(true);
      expect(incrementalSchema.safeParse(42).success).toBe(true);
    });

    it('should reject negative numbers', () => {
      expect(incrementalSchema.safeParse(-1).success).toBe(false);
    });
  });

  describe('recurrenceSchema', () => {
    it('should accept all frequencies', () => {
      for (const freq of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) {
        expect(recurrenceSchema.safeParse({ freq }).success).toBe(true);
      }
    });

    it('should accept null (non-repeating)', () => {
      expect(recurrenceSchema.safeParse(null).success).toBe(true);
    });

    it('should reject unknown frequencies', () => {
      expect(recurrenceSchema.safeParse({ freq: 'HOURLY' }).success).toBe(false);
    });

    it('should accept weekdays as ISO numbers 1-7', () => {
      expect(recurrenceSchema.safeParse({ freq: 'WEEKLY', byWeekdays: [1, 7] }).success).toBe(true);
    });

    it('should reject weekdays outside 1-7', () => {
      expect(recurrenceSchema.safeParse({ freq: 'WEEKLY', byWeekdays: [0] }).success).toBe(false);
      expect(recurrenceSchema.safeParse({ freq: 'WEEKLY', byWeekdays: [8] }).success).toBe(false);
    });

    it('should reject fields that do not apply to the frequency', () => {
      expect(recurrenceSchema.safeParse({ freq: 'MONTHLY', byWeekdays: [1] }).success).toBe(false);
      expect(recurrenceSchema.safeParse({ freq: 'YEARLY', byMonthDays: [1] }).success).toBe(false);
    });

    it('should accept interval, until and count', () => {
      const result = recurrenceSchema.safeParse({
        freq: 'DAILY',
        interval: 2,
        until: '2026-12-31T23:00:00.000Z',
        count: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid until and count', () => {
      expect(recurrenceSchema.safeParse({ freq: 'DAILY', until: 'not-a-date' }).success).toBe(
        false,
      );
      expect(recurrenceSchema.safeParse({ freq: 'DAILY', count: 0 }).success).toBe(false);
    });
  });

  describe('eventSeriesPushSchema', () => {
    it('should accept a full series payload', () => {
      const result = eventSeriesPushSchema.safeParse({
        title: 'Weekly sync',
        description: 'Every Monday',
        calendarId: '123e4567-e89b-42d3-a456-426614174000',
        start: '2026-10-21T16:00:00.000Z',
        durationMinutes: 60,
        isAllDay: false,
        timezone: 'Europe/Berlin',
        isVisible: true,
        recurrence: { freq: 'WEEKLY', byWeekdays: [1] },
      });
      expect(result.success).toBe(true);
    });

    it('should accept a minimal payload and a null recurrence', () => {
      const result = eventSeriesPushSchema.safeParse({
        title: 'One-off',
        calendarId: '123e4567-e89b-42d3-a456-426614174000',
        start: '2026-10-21T16:00:00.000Z',
        recurrence: null,
      });
      expect(result.success).toBe(true);
    });

    it('should require title, calendar and start', () => {
      expect(eventSeriesPushSchema.safeParse({}).success).toBe(false);
      expect(
        eventSeriesPushSchema.safeParse({
          calendarId: '123e4567-e89b-42d3-a456-426614174000',
          start: '2026-10-21T16:00:00.000Z',
        }).success,
      ).toBe(false);
      expect(
        eventSeriesPushSchema.safeParse({
          title: 'X',
          calendarId: '123e4567-e89b-42d3-a456-426614174000',
          start: 'not-a-date',
        }).success,
      ).toBe(false);
    });
  });

  describe('eventSeriesUpdateSchema', () => {
    it('should accept partial updates', () => {
      expect(eventSeriesUpdateSchema.safeParse({}).success).toBe(true);
      expect(eventSeriesUpdateSchema.safeParse({ title: 'New title' }).success).toBe(true);
      expect(eventSeriesUpdateSchema.safeParse({ recurrence: null }).success).toBe(true);
    });
  });

  describe('occurrenceRangeQuerySchema', () => {
    it('should require an ISO start and end', () => {
      expect(
        occurrenceRangeQuerySchema.safeParse({
          start: '2026-10-21T00:00:00.000Z',
          end: '2026-11-21T00:00:00.000Z',
        }).success,
      ).toBe(true);
      expect(
        occurrenceRangeQuerySchema.safeParse({ start: '2026-10-21T00:00:00.000Z' }).success,
      ).toBe(false);
    });

    it('should allow omitting organizationId (the Home page lists all organizations)', () => {
      expect(
        occurrenceRangeQuerySchema.safeParse({
          start: '2026-10-21T00:00:00.000Z',
          end: '2026-11-21T00:00:00.000Z',
        }).success,
      ).toBe(true);
    });
  });

  describe('calendarListQuerySchema', () => {
    it('should require an organizationId', () => {
      const organizationId = '123e4567-e89b-42d3-a456-426614174000';
      expect(calendarListQuerySchema.safeParse({ organizationId }).success).toBe(true);
      expect(calendarListQuerySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('eventSeriesQuerySchema', () => {
    it('should require an organizationId and allow an optional calendarId', () => {
      const organizationId = '123e4567-e89b-42d3-a456-426614174000';
      const calendarId = '123e4567-e89b-42d3-a456-426614174001';
      expect(eventSeriesQuerySchema.safeParse({ organizationId }).success).toBe(true);
      expect(eventSeriesQuerySchema.safeParse({ organizationId, calendarId }).success).toBe(true);
      expect(eventSeriesQuerySchema.safeParse({ calendarId }).success).toBe(false);
      expect(eventSeriesQuerySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('eventSeriesListQuerySchema', () => {
    it('should require an organizationId', () => {
      const organizationId = '123e4567-e89b-42d3-a456-426614174000';
      expect(eventSeriesListQuerySchema.safeParse({ organizationId }).success).toBe(true);
      expect(eventSeriesListQuerySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('rescheduleOccurrenceSchema', () => {
    it('should require a start and allow an optional end', () => {
      expect(
        rescheduleOccurrenceSchema.safeParse({ start: '2026-11-03T10:00:00.000Z' }).success,
      ).toBe(true);
      expect(
        rescheduleOccurrenceSchema.safeParse({
          start: '2026-11-03T10:00:00.000Z',
          end: '2026-11-03T11:00:00.000Z',
        }).success,
      ).toBe(true);
      expect(rescheduleOccurrenceSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('eventJobPushSchema and eventJobUpdateSchema', () => {
    it('should accept a slot with and without an occurrence', () => {
      expect(eventJobPushSchema.safeParse({ title: 'Setup' }).success).toBe(true);
      expect(
        eventJobPushSchema.safeParse({
          title: 'Setup',
          description: 'Early',
          occurrenceStart: '2026-10-21T16:00:00.000Z',
        }).success,
      ).toBe(true);
      expect(eventJobPushSchema.safeParse({ title: 'Setup', occurrenceStart: null }).success).toBe(
        true,
      );
      expect(eventJobPushSchema.safeParse({ description: 'No title' }).success).toBe(false);
    });

    it('should accept partial updates', () => {
      expect(eventJobUpdateSchema.safeParse({}).success).toBe(true);
      expect(eventJobUpdateSchema.safeParse({ title: 'New' }).success).toBe(true);
      expect(eventJobUpdateSchema.safeParse({ occurrenceStart: null }).success).toBe(true);
    });
  });

  describe('eventCommentPushSchema and eventCommentUpdateSchema', () => {
    it('should require a non-empty body', () => {
      expect(eventCommentPushSchema.safeParse({ body: 'Hello' }).success).toBe(true);
      expect(
        eventCommentPushSchema.safeParse({ body: 'Hello', occurrenceStart: null }).success,
      ).toBe(true);
      expect(eventCommentPushSchema.safeParse({ body: '' }).success).toBe(false);
      expect(eventCommentPushSchema.safeParse({}).success).toBe(false);
    });

    it('should require a non-empty body on update', () => {
      expect(eventCommentUpdateSchema.safeParse({ body: 'Edited' }).success).toBe(true);
      expect(eventCommentUpdateSchema.safeParse({ body: '' }).success).toBe(false);
    });
  });
});
