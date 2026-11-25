# Events and scheduling

Events in Watodo are **event series**: a title, description, schedule (a recurrence
rule), location, connected teams, work role slots, info slots and comments. A series
is expanded into individual **occurrences** on the fly, so a weekly event can run for
years without maintenance.

## Views

- `/events/calendar`: calendar of occurrences
- `/events/management`: list of series for management
- `/events/:eventId`: one series (general info, work role slots, info slots, schedule, location, teams)
- `/events/occurrences/:occurrenceRef`: one occurrence (readiness, slots, assignees, info slot values, comments)
- `/events/staffing`: staffing overview (see [Staffing](/admin-guide/staffing))

## Occurrences and exceptions

- **Cancel** hides a single occurrence; **restore** brings it back.
- **Reschedule** moves a single occurrence to a new time.
- **Split** ("edit this and all following") starts a new, independent series at the
  chosen occurrence and truncates the original series just before it.
- Changing a series' start, recurrence rule or timezone resets all of its exceptions.

Occurrences are **materialized** (given a stable numeric ID) on the first write such
as a slot, comment, cancel or reschedule. Series-wide slots and info slots are
inherited by materialized occurrences as occurrence-level copies (re-importing never
duplicates or deletes).

## Work role slots

A slot references a work role from the catalog and is either **series-wide** (applies
to every occurrence) or **occurrence-specific**. Slots can be marked **critical**.
Users are assigned to slots; the same user cannot be assigned twice to the same slot.
A bulk assignment can assign one user to the same slot across many occurrences at
once. Assignment candidates are annotated with absence, qualification and workload
information (see [Staffing](/admin-guide/staffing)).

## Info slots

Info slots are form-like text fields on a series (title, optional description, default
value). They are inherited by each materialized occurrence, and only the occurrence
copy's **value** is editable per occurrence; info slots cannot be added or deleted per
occurrence.

## Comments

Comments can be attached to a whole series or to a single occurrence. Anyone with
`events:write` can comment; only the author can edit or delete their own comment.

## Permissions

`events:read` to view, `events:write` to create/edit/delete series and to manage
occurrences, slots, assignments and comments. See
[Events internals and API](/Events) for the data model and the endpoint reference.
