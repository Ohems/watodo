import type { LocaleBundle } from '../types.js';

// British English notification message templates. This file is the canonical
// server-side source: the frontend receives it via GET /api/v1/locales/:lng
// and email/push delivery renders it with renderNotificationMessage.
const enGB: LocaleBundle = {
  notifications: {
    welcome: {
      title: 'Welcome to Watodo',
      body: 'Your organisation has been set up. Explore the calendar and invite your team.',
    },
    organizationCreated: {
      title: 'New organisation ready',
      body: '{{organizationName}} has been created. Start adding events.',
    },
    upcomingEvent: {
      title: 'Upcoming event',
      body: '{{eventTitle}} is happening this month. Check the calendar for details.',
    },
    workRoleAssigned: {
      title: 'You have been assigned a work role',
      body: 'You are assigned to "{{role}}" for {{eventTitle}}.',
    },
    newEventComment: {
      title: 'New event comment',
      body: 'Someone commented on {{eventTitle}}.',
    },
    roleAssigned: {
      title: 'Role assigned',
      body: 'You have been assigned the {{roleName}} role.',
    },
    assignmentRemovedDueToAbsence: {
      title: 'Assignment removed due to absence',
      body: '{{userName}} was removed from "{{eventTitle}}" ({{start}}) because of an absence ({{absenceType}}, {{absenceStart}} - {{absenceEnd}}).',
    },
  },
};

export default enGB;
