import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLocalStorageState } from './use-local-storage-state.js';

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number';

describe('useLocalStorageState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorageState('test_key', 'default', isString));
    expect(result.current[0]).toBe('default');
  });

  it('reads the stored value on mount', () => {
    localStorage.setItem('test_key', JSON.stringify('from-storage'));
    const { result } = renderHook(() => useLocalStorageState('test_key', 'default', isString));
    expect(result.current[0]).toBe('from-storage');
  });

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => useLocalStorageState('test_key', 'default', isString));
    act(() => result.current[1]('stored'));
    expect(result.current[0]).toBe('stored');
    expect(localStorage.getItem('test_key')).toBe(JSON.stringify('stored'));
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => useLocalStorageState('test_key', 1, isNumber));
    act(() => result.current[1](prev => prev + 1));
    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem('test_key')).toBe('2');
  });

  it('falls back to the default value when the stored value fails validation', () => {
    localStorage.setItem('test_key', JSON.stringify(42));
    const { result } = renderHook(() => useLocalStorageState('test_key', 'default', isString));
    expect(result.current[0]).toBe('default');
  });

  it('falls back to the default value when the stored value is not valid JSON', () => {
    localStorage.setItem('test_key', '{not json');
    const { result } = renderHook(() => useLocalStorageState('test_key', 'default', isString));
    expect(result.current[0]).toBe('default');
  });
});
