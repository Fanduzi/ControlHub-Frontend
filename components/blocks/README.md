# components/blocks

## Files

- `resource-relation-panel.tsx` — renders and mutates resource relations.
- `resource-search-combobox.tsx` — selects a resource candidate.
- `deployed-resources-card.tsx` — displays deployed resources.

## Interfaces

- `ResourceRelationPanel` accepts relation data and optional resource/environment context.
- `ResourceSearchCombobox` accepts candidate filters and an `onSelect` callback.

## Dependencies

- `app/(console)/resources/[id]/page.tsx` renders `ResourceRelationPanel`.
- Relation services provide relation types, rules, creation, and deletion.
- Shared UI, localization, and resource-summary utilities provide presentation.

`resource-search-combobox.tsx` and `deployed-resources-card.tsx` use root locale labels for resource types.

`topology-panel.tsx` renders a rooted topology graph only after an operator
selects a root. Environment reads without `rootId` treat response `nodes` as
starting CIs and do not draw an edgeless relation graph. Topology group labels
use localized roles only when no cluster name is available.

`environment-topology-content.tsx` accepts an explicit server-resolved
environment for `/topology`; it falls back to the persisted environment only
when the URL omits that parameter, never when it is invalid.
