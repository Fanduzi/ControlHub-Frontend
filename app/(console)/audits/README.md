# audits

Authenticated audit list route. Explicit URL environment scope wins, including
`environment=all`; when absent, the page reads the persisted environment cookie.
Unknown slugs fail closed to an empty table. Audit reads are admin-only; a
403 from the backend renders a localized forbidden notice instead of the
generic backend-down error boundary.
