# components/blocks

## Files

- `resource-relation-panel.tsx` — renders and mutates resource relations.
- `resource-search-combobox.tsx` — selects a resource candidate.
- `deployed-resources-card.tsx` — displays deployed resources.

## Interfaces

- `ResourceRelationPanel` accepts relation data and optional resource/environment context.
- `ResourceSearchCombobox` accepts candidate filters and an `onSelect` callback.

## Dependencies

- Relation services provide relation types, rules, creation, and deletion.
- Shared UI, localization, and resource-summary utilities provide presentation.
