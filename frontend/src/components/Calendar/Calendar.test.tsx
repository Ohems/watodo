import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Calendar from './Calendar.js';

/** Texts of the month view's weekday header cells, in display order. */
function weekdayHeaders(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.rbc-month-header .rbc-header')).map(
    cell => cell.textContent ?? '',
  );
}

describe('Calendar', () => {
  it('starts the week on Sunday by default', () => {
    const { container } = render(<Calendar />);
    const headers = weekdayHeaders(container);
    expect(headers[0]).toBe('Sun');
    expect(headers[6]).toBe('Sat');
  });

  it('starts the week on Monday when configured', () => {
    const { container } = render(<Calendar weekStart="monday" />);
    const headers = weekdayHeaders(container);
    expect(headers[0]).toBe('Mon');
    expect(headers[6]).toBe('Sun');
  });
});
