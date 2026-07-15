# Phase 38K Delivery C: Table Definition Inspector Design

## Decision

Extend `QueryObjectInspector` rather than creating a second schema panel or a
third fixed workbench column. The object explorer continues to own Inspector
identity and focus restoration; the Inspector owns definition request state and
rendering.

## Data Flow

```text
Object Explorer (loaded table detail)
  -> existing Inspect action
  -> QueryObjectInspector(detail, targetId, open)
  -> explicit View definition action
  -> getTableDefinition(targetId, { database, name, signal })
  -> Inspector-local definition state
  -> read-only preformatted definition panel
```

The service constructs the encoded URL with `URLSearchParams` and delegates to
the shared authenticated `apiClient`. It does not create browser-side SQL.

## Identity and Cancellation

The Inspector identity is the tuple `(targetId, database, name, kind)`. A
definition response is valid only for the identity captured when the request
started and its current monotonically increasing generation. The component
creates an AbortController for each request and cancels it on close, identity
change, target change, or unmount. This duplicates the safety boundary already
used by the object explorer rather than relying on timing.

## UI Shape

The action appears near the Inspector title or above the existing metadata
sections. After success, a fourth read-only Definition section follows the
columns, indexes, and foreign keys sections. It uses the project color tokens,
an `overflow-x-auto` wrapper, and a `pre` element so quoted MySQL identifiers
and line breaks are preserved without interpreting the definition as HTML.

The only interactive controls added are the explicit action and retry button.
They are ordinary accessible buttons with localized names. Existing Dialog and
Sheet primitives continue to manage modal behavior; the current Inspector
trigger focus restoration remains unchanged.

## Safety Boundaries

- No definition request on Inspector open, object tree expansion, or target
  switch.
- Never render `ApiError.message` or an arbitrary `Error.message`.
- Definition text never enters query statement, URL state, local storage,
  history, logs, clipboard, or analytics.
- Client hides the action for every object other than `detail.kind === "table"`;
  the backend remains the authoritative table-only enforcement point.
- No local cache: closing an Inspector drops the definition.

## Test Strategy

Service tests verify exact encoded URL, forwarded abort signal, response shape,
and no prohibited request fields. Component tests drive the action, loading,
success, truncation, controlled errors/retry, view omission, no eager request,
and stale/cancelled request behavior. E2E covers real table definition on
desktop English, 375px mobile English, and desktop Simplified Chinese, while
also proving the Inspector open alone is network-quiet.

## Rejected Alternatives

- Preload every definition with object details: needless DDL exposure and slow
  schema exploration.
- Add SHOW CREATE commands to the editor: changes the execution/security
  boundary and bypasses the governed API.
- Add copy/export/download controls: broadens scope and creates data-egress UX.
- Support views now: backend intentionally rejects views because their
  definitions can include a definer clause.
