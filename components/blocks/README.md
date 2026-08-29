# components/blocks

Reusable blocks shared across console pages and sheets.

`resource-relation-panel.tsx` renders relations for every operator. Its
admin-only add form consumes backend relation rules to limit relation types
and passes their target type/environment constraints to
`resource-search-combobox.tsx`; backend create validation remains authoritative.
