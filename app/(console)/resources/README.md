# resources

Server composition for the authenticated resource inventory route. The page
resolves the optional environment slug before fetching inventory, fails closed
to an empty result for an unknown scope, and supplies settings-backed lifecycle
options to the table.

## Files

| File | Responsibility |
|------|---------------|
| `page.tsx` | Loads resources, resource types, lifecycle/health settings, and subtype options for `ResourceTable`. |

## Interfaces

- `ResourcesPage` renders the inventory route from normalized URL search parameters.

## Dependencies

- Upstream: `lib/view-models`, `lib/list-page-search-params`, `services/settings`
- Downstream: `components/resources/ResourceTable`
