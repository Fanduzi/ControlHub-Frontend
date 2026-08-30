# audits

Authenticated audit list route. Explicit URL environment scope wins, including
`environment=all`; when absent, the page reads the persisted environment cookie.
Unknown slugs fail closed to an empty table.
