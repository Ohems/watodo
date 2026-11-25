# Staffing

The staffing page (`/events/staffing`) is the overview for filling slots:

- lists occurrences in a time range, optionally filtered to **unfilled only** or
  **critical only** slots, and by scope (`all`, `mine`, `team`)
- expandable rows show each unfilled slot together with the available volunteers
- a **workload matrix** shows per user: assignment count, assigned hours, critical
  assignment count, absence flags and weekly hour buckets
- the assignment dropdown annotates candidates with overlapping absences
  (`hasAbsence`), missing work role, missing qualification, missing or expired
  certifications, and current assignments in the time range (`assignmentCount`,
  `workloadHours`)

Managers additionally see `managedUnfilledCriticalSlots` on occurrences: critical
unfilled slots of work roles they manage through their teams. A scheduled job
(configured with `CRITICAL_SLOT_ALERT_DAYS` and
`CRITICAL_SLOT_ALERT_INTERVAL_MINUTES`, see
[Configuration](/self-hosting/configuration)) notifies those managers about
upcoming occurrences that still have unfilled critical slots.

Users mark their own unavailability as **absences** on `/absences`; an absence
overlapping an occurrence automatically flags the user as unavailable in the
assignment dropdown and the staffing view.
