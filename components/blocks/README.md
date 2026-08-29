# components/blocks

Reusable blocks shared across console pages and sheets.

`resource-relation-panel.tsx` renders localized relations for every operator,
keeps successfully deleted rows hidden across stale refresh props, and
independently guards each in-flight row deletion. Its admin-only add form has
an accessible explicit direction choice. It gets source-specific backend rules
for the actual source, validates target type/environment before submit, and
uses the selected source ID in the existing create path; backend create
validation remains authoritative.

`resource-search-combobox.tsx` and `deployed-resources-card.tsx` use root locale labels for resource types.
