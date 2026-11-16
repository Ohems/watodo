import type { LocaleBundle } from '../types.js';

// American English notification message templates (canonical server-side
// source, see en-GB.ts).
const enUS: LocaleBundle = {
  notifications: {
    welcome: {
      title: 'Welcome to Watodo',
      body: 'Your organization has been set up. Explore the calendar and invite your team.',
    },
    upcomingEvent: {
      title: 'Upcoming event',
      body: '{{eventTitle}} is happening this month. Check the calendar for details.',
    },
    workRoleAssigned: {
      title: 'You have been assigned a work role',
      body: 'You are assigned to "{{role}}" for {{eventTitle}}.',
    },
    workRoleUnassigned: {
      title: 'Work role assignment removed',
      body: 'You are no longer assigned to "{{role}}" for {{eventTitle}}.',
    },
    newEventComment: {
      title: 'New event comment',
      body: 'Someone commented on {{eventTitle}}.',
    },
    roleAssigned: {
      title: 'Role assigned',
      body: 'You have been assigned the {{roleName}} role.',
    },
    eventCancelled: {
      title: 'Event cancelled',
      body: '{{eventTitle}} on {{start}} has been cancelled.',
    },
    eventRescheduled: {
      title: 'Event rescheduled',
      body: '{{eventTitle}} ({{start}}) has been rescheduled to {{newStart}} - {{newEnd}}.',
    },
    unfilledCriticalSlot: {
      title: 'Critical role still unfilled',
      body: 'Critical role(s) still unfilled for {{eventTitle}} on {{start}}: {{roles}}.',
    },
    assignmentRemovedDueToAbsence: {
      title: 'Assignment removed due to absence',
      body: '{{userName}} was removed from "{{eventTitle}}" ({{start}}) because of an absence ({{absenceType}}, {{absenceStart}} - {{absenceEnd}}).',
    },
  },
};

export default enUS;
