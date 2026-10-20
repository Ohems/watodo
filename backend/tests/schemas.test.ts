import { describe, expect, it } from 'vitest';
import {
  incrementalSchema,
  opAssignmentSchema,
  operationSchema,
  providerSchema,
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
});
