import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api-mock.js';
import { renderWithProviders } from '../../test/test-utils.js';
import DateField from './DateField.js';

/** Serves a current user with the given preferences. */
function mockCurrentUser(prefs: {
  weekStart: 'sunday' | 'monday';
  dateFormat?: 'ymd' | 'mdy' | 'dmy';
  timeFormat?: '24h' | '12h';
}) {
  const mock = mockApi();
  mock.on('GET', '/api/v1/users/@me', {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    description: '',
    phoneNumber: null,
    language: 'en-GB',
    weekStart: prefs.weekStart,
    dateFormat: prefs.dateFormat ?? 'ymd',
    timeFormat: prefs.timeFormat ?? '24h',
    permissions: [],
    state: 'active',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
  return mock;
}

/** Opens the picker dropdown and returns the weekday header cells in display order. */
async function openPickerAndGetWeekdayHeaders(label: string): Promise<HTMLElement[]> {
  fireEvent.click(screen.getByLabelText(label));
  const headers = await screen.findAllByRole('columnheader');
  expect(headers).toHaveLength(7);
  return headers;
}

describe('DateField', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts the calendar week on Sunday when the user configured Sunday', async () => {
    mockCurrentUser({ weekStart: 'sunday' });
    renderWithProviders(<DateField label="Date" value="" onChange={() => {}} />);

    const headers = await openPickerAndGetWeekdayHeaders('Date');
    expect(headers[0]).toHaveTextContent('Su');
    expect(headers[6]).toHaveTextContent('Sa');
  });

  it('shows the expected date format as a hint when empty', () => {
    mockCurrentUser({ weekStart: 'sunday' });
    renderWithProviders(<DateField label="Date" value="" onChange={() => {}} />);

    expect(screen.getByLabelText('Date')).toHaveTextContent('YYYY-MM-DD');
  });

  it("displays the value and the hint in the user's date format", async () => {
    mockCurrentUser({ weekStart: 'sunday', dateFormat: 'mdy' });
    renderWithProviders(<DateField label="Date" value="2026-11-08" onChange={() => {}} />);

    // Wait for the current-user query so the preference is applied.
    await waitFor(() => {
      expect(screen.getByLabelText('Date')).toHaveTextContent('11/08/2026');
    });
  });

  it("shows the user's date format as the hint when empty and no value is set", async () => {
    mockCurrentUser({ weekStart: 'sunday', dateFormat: 'dmy' });
    renderWithProviders(<DateField label="Date" value="" onChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Date')).toHaveTextContent('DD/MM/YYYY');
    });
  });

  it('starts the calendar week on Monday when the user configured Monday', async () => {
    mockCurrentUser({ weekStart: 'monday' });
    renderWithProviders(<DateField label="Date" value="" onChange={() => {}} />);

    const headers = await openPickerAndGetWeekdayHeaders('Date');
    expect(headers[0]).toHaveTextContent('Mo');
    expect(headers[6]).toHaveTextContent('Su');
  });

  it('calls onChange with the yyyy-mm-dd value when a day is picked', async () => {
    mockCurrentUser({ weekStart: 'sunday' });
    const onChange = vi.fn();
    renderWithProviders(<DateField label="Date" value="" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Date'));
    // The picker opens on the current month; pick the 10th (day buttons are
    // labelled with their full date, e.g. "10 November 2026").
    const now = new Date();
    const dayName = `10 ${now.toLocaleString('en-GB', { month: 'long' })} ${now.getFullYear()}`;
    fireEvent.click(await screen.findByRole('button', { name: dayName }));

    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
    expect(onChange).toHaveBeenCalledWith(expected);
  });
});
