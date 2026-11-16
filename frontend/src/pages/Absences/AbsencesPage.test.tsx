import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { type MockApi, mockApi } from '../../test/api-mock.js';
import { renderWithProviders } from '../../test/test-utils.js';
import type { Absence } from '../../types/index.js';
import AbsencesPage from './AbsencesPage.js';

const mockAbsences: Absence[] = [
  {
    id: 1,
    userId: 'u1',
    type: 'sick',
    description: 'Flu',
    startDate: '2026-03-10',
    endDate: '2026-03-12',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 2,
    userId: 'u1',
    type: 'away',
    description: 'Vacation',
    startDate: '2026-10-20',
    endDate: '2026-10-20',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
];

function mockAbsenceRoutes(mock: MockApi, state: { absences: Absence[] }) {
  mock.on('GET', '/api/v1/users/@me/absences', () => state.absences);
  mock.on('POST', '/api/v1/users/@me/absences', () => {
    const body = mock.lastBody('POST', '/api/v1/users/@me/absences') as Partial<Absence>;
    const created: Absence = {
      id: 99,
      userId: 'u1',
      type: body.type ?? 'other',
      description: body.description ?? '',
      startDate: body.startDate ?? '',
      endDate: body.endDate ?? '',
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    };
    state.absences = [...state.absences, created];
    return created;
  });
  mock.on('DELETE', /\/api\/v1\/users\/@me\/absences\/\d+$/, () => {
    const url = mock.calls.filter(c => c.method === 'DELETE').at(-1)?.url ?? '';
    const id = Number(url.split('/').at(-1));
    state.absences = state.absences.filter(a => a.id !== id);
    return { success: true };
  });
}

/** Formats a Date as the yyyy-mm-dd value used by the date fields and the API. */
function formatDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Picks a date in the date field with the given label. The picker opens on
 * the current month, so the date must be in the current month. Day buttons
 * are labelled with their full date (e.g. "10 November 2026").
 */
async function pickDate(label: RegExp, date: Date) {
  fireEvent.click(screen.getByLabelText(label));
  const dayName = `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'long' })} ${date.getFullYear()}`;
  fireEvent.click(await screen.findByRole('button', { name: dayName }));
}

describe('AbsencesPage', () => {
  let mock: MockApi;
  let state: { absences: Absence[] };

  beforeEach(() => {
    mock = mockApi();
    state = { absences: [...mockAbsences] };
    mockAbsenceRoutes(mock, state);
  });

  it('lists the absences with type, dates and description', async () => {
    renderWithProviders(<AbsencesPage />, { route: '/absences' });
    expect(await screen.findByText('Absences')).toBeInTheDocument();
    expect(await screen.findByText('Sick')).toBeInTheDocument();
    expect(screen.getByText('Away')).toBeInTheDocument();
    expect(screen.getByText('2026-03-10 - 2026-03-12')).toBeInTheDocument();
    expect(screen.getByText('2026-10-20')).toBeInTheDocument();
    expect(screen.getByText('Flu')).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
  });

  it('shows an empty state when there are no absences', async () => {
    state.absences = [];
    renderWithProviders(<AbsencesPage />, { route: '/absences' });
    expect(await screen.findByText('No absences yet')).toBeInTheDocument();
  });

  it('creates an absence through the add dialog', async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 10);
    const end = new Date(now.getFullYear(), now.getMonth(), 12);

    renderWithProviders(<AbsencesPage />, { route: '/absences' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add absence' }));

    const dialog = await screen.findByRole('dialog');
    await pickDate(/^Start date/, start);
    await pickDate(/^End date/, end);
    fireEvent.change(dialog.querySelector('textarea') as HTMLElement, {
      target: { value: 'Conference' },
    });
    // The type select defaults to "Away".
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mock.callCount('POST', '/api/v1/users/@me/absences')).toBe(1);
    });
    const body = mock.lastBody('POST', '/api/v1/users/@me/absences') as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 'away',
      description: 'Conference',
      startDate: formatDate(start),
      endDate: formatDate(end),
    });
    // The new absence shows up in the list after the cache invalidation.
    expect(
      await screen.findByText(`${formatDate(start)} - ${formatDate(end)}`),
    ).toBeInTheDocument();
  });

  it('defaults the end date to the start date when only the start is set', async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 10);

    renderWithProviders(<AbsencesPage />, { route: '/absences' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add absence' }));

    await screen.findByRole('dialog');
    await pickDate(/^Start date/, start);

    expect(screen.getByLabelText(/^End date/)).toHaveTextContent(formatDate(start));
  });

  it('deletes an absence', async () => {
    renderWithProviders(<AbsencesPage />, { route: '/absences' });
    await screen.findByText('Flu');
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => {
      expect(mock.callCount('DELETE', /\/api\/v1\/users\/@me\/absences\/\d+$/)).toBe(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('Flu')).not.toBeInTheDocument();
    });
  });
});
