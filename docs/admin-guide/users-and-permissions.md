# Users and permissions

## Permission codes

| Permission | Allows |
|------------|--------|
| `admin` | Full administrative access; bypasses all permission checks |
| `user-management:read` | View users |
| `user-management:write` | Create, update and delete users |
| `role-management:read` | View roles and role assignments |
| `role-management:write` | Create, update and delete roles, and assign them to users |
| `organization:read` | View organization members, teams, sites, rooms and work roles |
| `organization:write` | Edit the details of organizations the user belongs to |
| `events:read` | View event series and their occurrences |
| `events:write` | Create, update and delete event series; manage occurrences, work role slots and comments |
| `team-management:read` | View teams and their members |
| `team-management:write` | Create, update and delete teams; manage team members |
| `site-management:read` / `site-management:write` | View / create, update and delete sites |
| `room-management:read` / `room-management:write` | View / create, update and delete rooms |
| `work-role-management:read` / `work-role-management:write` | View / manage the work role catalog |
| `certification-management:read` / `certification-management:write` | View / manage certifications |

## Roles

Roles belong to an organization. A role grants a set of permission codes and is
assigned to users; an assignment can additionally be scoped to a single team and/or
a single event type. A user's effective permissions are the union of the permissions
of all roles they hold in the organizations they belong to.

Manage roles and their assignments in the organization user views
(`/organization/users`, `/organization/users/:userId`). An `Admin` role with the
`admin` permission is created automatically for the first user of an instance.

## Team managers

A team member with the manager toggle can manage that specific team (its members,
and the work roles assigned to it on connected event series) even without
organization-wide `team-management` permissions. Creating and deleting teams always
requires organization-wide `team-management:write`.

## User list and profiles

- `/users` and `/users/:userId`: the directory of users and their profiles, including
  work roles, certifications and upcoming event assignments.
- `/organization/users`: organization members, with management controls for users
  holding the required permissions.
