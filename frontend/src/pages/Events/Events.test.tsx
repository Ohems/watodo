import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarsApi, eventsApi, organizationsApi, usersApi } from '../../api/index.js';
import EventOccurrenceDialog from '../../components/EventOccurrenceDialog/EventOccurrenceDialog.js';
import userReducer, { setCurrentUser } from '../../store/user-slice.js';
import type { Calendar, EventOccurrenceDetail, EventSeries, User } from '../../types/index.js';
import Events from './Events.js';

vi.mock('../../api/index.js', () => ({
  getToken: () => null,
  setToken: vi.fn(),
  clearToken: vi.fn(),
  usersApi: {
    getUsers: vi.fn(),
    getUserList: vi.fn().mockResolvedValue([{ id: 'u1', name: 'Alice' }]),
    getCurrentUser: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  },
  authApi: {
    getProviders: vi.fn(),
    loginUrl: vi.fn(),
    logout: vi.fn(),
  },
  operationsApi: {
    getOperations: vi.fn(),
    getOperation: vi.fn(),
    upsertOperation: vi.fn(),
    deleteOperation: vi.fn(),
    addAssignment: vi.fn(),
    updateAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
  },
  organizationsApi: {
    getMyOrganizations: vi
      .fn()
      .mockResolvedValue([{ id: 'org-1', name: 'Org', defaultTimezone: 'Europe/Berlin' }]),
  },
  calendarsApi: {
    getCalendars: vi.fn(),
    createCalendar: vi.fn(),
  },
  eventsApi: {
    getEventSeries: vi.fn(),
    getEventSeriesById: vi.fn(),
    createEventSeries: vi.fn(),
    updateEventSeries: vi.fn(),
    deleteEventSeries: vi.fn(),
    getOccurrences: vi.fn().mockResolvedValue([]),
    getSeriesOccurrences: vi.fn().mockResolvedValue([]),
    getOccurrenceDetail: vi.fn(),
    cancelOccurrence: vi.fn(),
    rescheduleOccurrence: vi.fn(),
    deleteException: vi.fn(),
    splitEventSeries: vi.fn(),
    listExceptions: vi.fn().mockResolvedValue([]),
    listJobs: vi.fn().mockResolvedValue([]),
    createJob: vi.fn(),
    updateJob: vi.fn(),
    deleteJob: vi.fn(),
    assignUserToJob: vi.fn(),
    unassignUserFromJob: vi.fn(),
    listComments: vi.fn().mockResolvedValue([]),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  },
}));

const mockCalendar: Calendar = {
  id: 'cal-1',
  name: 'Main Calendar',
  googleCalendarId: null,
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockSeries: EventSeries = {
  id: 1,
  title: 'Weekly Sync',
  description: 'Team sync',
  calendarId: 'cal-1',
  start: '2026-01-05T10:00:00.000Z',
  durationMinutes: 60,
  isAllDay: false,
  timezone: 'Europe/Berlin',
  isVisible: true,
  rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
  recurrence: { freq: 'WEEKLY', byWeekdays: [1] },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockDetail: EventOccurrenceDetail = {
  series: mockSeries,
  occurrence: {
    seriesId: 1,
    title: 'Weekly Sync',
    description: 'Team sync',
    isAllDay: false,
    occurrenceStart: '2026-01-05T10:00:00.000Z',
    start: '2026-01-05T10:00:00.000Z',
    end: '2026-01-05T11:00:00.000Z',
    isRescheduled: false,
    isCancelled: false,
    exceptionId: null,
  },
  jobs: [
    {
      id: 7,
      seriesId: 1,
      occurrenceStart: '2026-01-05T10:00:00.000Z',
      title: 'Bring coffee',
      description: '',
      assignments: [
        {
          id: 3,
          jobId: 7,
          userId: 'u1',
          userName: 'Alice',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  comments: [
    {
      id: 9,
      seriesId: 1,
      occurrenceStart: '2026-01-05T10:00:00.000Z',
      userId: 'u1',
      userName: 'Alice',
      body: 'First!',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ],
};

function makeUser(permissions: string[]): User {
  return {
    id: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    description: '',
    permissions,
    state: 'active',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function renderWithUser(ui: React.ReactElement, permissions: string[]) {
  const store = configureStore({ reducer: { user: userReducer } });
  store.dispatch(setCurrentUser(makeUser(permissions)));
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('Events page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calendarsApi.getCalendars).mockResolvedValue([mockCalendar]);
    vi.mocked(eventsApi.getEventSeries).mockResolvedValue([mockSeries]);
  });

  it('lists the event series', async () => {
    renderWithUser(<Events />, ['events:read', 'events:write']);

    expect(await screen.findByText('Weekly Sync')).toBeInTheDocument();
    expect(screen.getByText('Main Calendar')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New event series' })).toBeInTheDocument();
  });

  it('hides write actions for users without events:write', async () => {
    renderWithUser(<Events />, ['events:read']);

    expect(await screen.findByText('Weekly Sync')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New event series' })).not.toBeInTheDocument();
  });
});

describe('EventOccurrenceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventsApi.getOccurrenceDetail).mockResolvedValue(mockDetail);
    vi.mocked(usersApi.getUserList).mockResolvedValue([{ id: 'u1', name: 'Alice' }]);
  });

  it('shows the occurrence detail with jobs and comments', async () => {
    renderWithUser(
      <EventOccurrenceDialog
        seriesId={1}
        occurrenceStart="2026-01-05T10:00:00.000Z"
        onClose={() => {}}
        onChanged={() => {}}
      />,
      ['events:read', 'events:write'],
    );

    expect(await screen.findByText('Bring coffee')).toBeInTheDocument();
    expect(screen.getByText(/First!/)).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cancel this occurrence' })).toBeInTheDocument();
    expect(eventsApi.getOccurrenceDetail).toHaveBeenCalledWith(1, '2026-01-05T10:00:00.000Z');
  });

  it('shows a cancelled notice for cancelled occurrences', async () => {
    vi.mocked(eventsApi.getOccurrenceDetail).mockResolvedValue({
      ...mockDetail,
      occurrence: {
        ...mockDetail.occurrence,
        isCancelled: true,
        exceptionId: 42,
      },
    });

    renderWithUser(
      <EventOccurrenceDialog
        seriesId={1}
        occurrenceStart="2026-01-05T10:00:00.000Z"
        onClose={() => {}}
        onChanged={() => {}}
      />,
      ['events:read', 'events:write'],
    );

    expect(await screen.findByText('This occurrence is cancelled.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore occurrence' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel this occurrence' }),
    ).not.toBeInTheDocument();
  });

  it('hides write actions for users without events:write', async () => {
    renderWithUser(
      <EventOccurrenceDialog
        seriesId={1}
        occurrenceStart="2026-01-05T10:00:00.000Z"
        onClose={() => {}}
        onChanged={() => {}}
      />,
      ['events:read'],
    );

    expect(await screen.findByText('Bring coffee')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel this occurrence' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument();
  });

  it('splits the series from an occurrence after showing the warning', async () => {
    vi.mocked(calendarsApi.getCalendars).mockResolvedValue([mockCalendar]);
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([
      { id: 'org-1', name: 'Org', defaultTimezone: 'Europe/Berlin' },
    ]);
    vi.mocked(eventsApi.splitEventSeries).mockResolvedValue(mockSeries);
    const onClose = vi.fn();
    const onChanged = vi.fn();
    renderWithUser(
      <EventOccurrenceDialog
        seriesId={1}
        occurrenceStart="2026-01-05T10:00:00.000Z"
        onClose={onClose}
        onChanged={onChanged}
      />,
      ['events:read', 'events:write'],
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit this and all following' }));
    expect(await screen.findByText('Edit this and all following occurrences')).toBeInTheDocument();
    expect(screen.getByText(/new, independent series/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(eventsApi.splitEventSeries).toHaveBeenCalledWith(
        1,
        '2026-01-05T10:00:00.000Z',
        expect.objectContaining({ title: 'Weekly Sync' }),
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });
});
