# Work roles and certifications

## Work roles

The **work role catalog** at `/organization/work-roles` defines the responsibilities
that can be slotted on events, for example "Sound technician" or "First aid". Each
work role can require one or more **certifications**.

Permissions: `work-role-management:read` / `work-role-management:write`. On a work
role's detail page you can also see which users hold the role and link or unlink
required certifications.

## Certifications

Certifications (managed with `certification-management:read` / `certification-management:write`)
are qualifications such as "First aid certificate" and can carry an expiry date.

## Assigning roles and certifications to users

- Users add work roles and certifications to themselves on `/profile`.
- Admins manage any user's work roles and certifications at
  `/organization/users/:userId`, including marking a user as **qualified** for a role.

When a user is shown as an assignment candidate for a slot, the app annotates them
with whether they have the role (`hasWorkRole`), whether they are qualified
(`isQualified`), and which required certifications are missing or expired
(`missingCertifications`, with `expiredDate` for expired ones).
