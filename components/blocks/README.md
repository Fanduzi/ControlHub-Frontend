# components/blocks

Reusable blocks shared across console pages and sheets.

`resource-relation-panel.tsx` renders localized relations for every operator and removes a successfully deleted row before refreshing. Its
admin-only add form consumes backend relation rules to limit relation types
and passes their target type/environment constraints to
`resource-search-combobox.tsx`; backend create validation remains authoritative.

`resource-search-combobox.tsx` and `deployed-resources-card.tsx` use root locale labels for resource types.
