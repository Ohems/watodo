# Notifications

Notifications are stored language-neutrally as a message key plus parameters and are
rendered in each recipient's own language.

## Message keys

| Key | Category | Sent when |
|-----|----------|-----------|
| `welcome` | general | A user logs in for the first time (not configurable) |
| `upcomingEvent` | general | An event the user participates in or manages is coming up |
| `workRoleAssigned` / `workRoleUnassigned` | general | The user is assigned to or removed from a work role slot |
| `newEventComment` | general | A comment is added to an event the user is involved in |
| `roleAssigned` | general | A role is assigned to the user |
| `eventCancelled` / `eventRescheduled` | general | An occurrence the user is involved in is cancelled or rescheduled |
| `unfilledCriticalSlot` | management | An upcoming occurrence has an unfilled critical slot (scheduled job) |
| `assignmentRemovedDueToAbsence` | management | An assignment was removed because of an absence |

`general` notifications go to everyone affected; `management` notifications go only
to event/team managers.

## Channels and preferences

Each user configures every message key per channel on the Account page (`/account`):

- **in-app** (default on; always enforced when the notification is created)
- **email** (default on; requires the `MAIL_*` server configuration)
- **push** (default off; requires the `VAPID_*` server configuration)

See [Configuration](/self-hosting/configuration) for the server-side email and push
setup.
