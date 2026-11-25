# Sites and rooms

Sites are physical locations (venues) and rooms belong to a site. Manage sites at
`/organization/sites`, then open a site to manage its rooms.

Events (event series) can be booked to:

- a **site**, optionally **reserving the whole site**, and/or
- a specific **room** within a site

## Booking conflicts

Conflict detection is automatic: whenever a booking changes (series create/update,
occurrence reschedule or materialization, split), the affected occurrences are
expanded and overlaps with other series of the same organization are reported as a
`conflicts` warning array in the API response. Two bookings conflict when they
overlap in time and share the same room, or when either side reserves the whole
site. Conflicts are warnings, not errors: the write is still accepted, and the
conflicting bookings are surfaced in the UI so they can be fixed.

## Permissions

`site-management:read` / `site-management:write` for sites,
`room-management:read` / `room-management:write` for rooms.
