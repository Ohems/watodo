# Organization admin guide

Watodo is multi-organization: each organization has its own members, teams, sites,
rooms, work roles, certifications, event types and calendars. The first user to log
in on an instance automatically receives a default organization and an `admin` role
in it, so the first person to sign in becomes the instance admin.

## Core concepts

| Concept | What it is | Managed at |
|---------|------------|------------|
| Organization | Top-level container; has a default timezone | `/organization/general` |
| Users | People who log in via OAuth; can belong to several organizations | `/organization/users`, `/users` |
| Roles and permissions | Organization-scoped roles granting permission codes, assignable to users (optionally scoped to a team or event type) | `/organization/users` and user profiles |
| Teams | Groups of members with a leader and manager toggles; can be assigned work roles and event series | `/teams` |
| Sites and rooms | Physical locations and rooms used for event bookings | `/organization/sites` |
| Work roles | The catalog of responsibilities, e.g. "Sound technician" | `/organization/work-roles` |
| Certifications | Qualifications that work roles can require and users can hold | organization settings, `/profile` |
| Event series | Recurring events with work role slots, info slots and comments | `/events/management`, `/events/calendar` |

## Suggested setup order

1. Set the organization name and default timezone (`/organization/general`).
2. Create sites and their rooms (`/organization/sites`).
3. Create certifications, then work roles with required certifications (`/organization/work-roles`).
4. Create teams, assign their work roles, and add members with the manager toggle where needed (`/teams`).
5. Create roles with the permissions your organization needs and assign them to users (`/organization/users`).
6. Create event series, add work role slots, connect teams, and assign users (`/events/management`).
7. Watch `/events/staffing` for unfilled and critical slots and for workload balance.

## Permissions at a glance

Every action in the app is gated by a permission code, and the `admin` permission
bypasses all checks. See [Users and permissions](/admin-guide/users-and-permissions)
for the full list.
