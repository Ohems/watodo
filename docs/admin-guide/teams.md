# Teams

Teams group members around a responsibility area. Manage them at `/teams` and drill
into `/teams/:teamId` for one team.

A team has:

- an optional **team leader**
- **members**, each with an optional **manager** toggle (team managers can manage
  this team without organization-wide permissions; see
  [Users and permissions](/admin-guide/users-and-permissions))
- assigned **work roles**: managers of the team are considered managers of those
  work roles on connected event series
- assigned **event series**: connecting a series to a team makes the team's
  leader and managers the managers of that series

Creating and deleting teams requires `team-management:write`. Viewing and editing a
specific team is also allowed for its managers.
