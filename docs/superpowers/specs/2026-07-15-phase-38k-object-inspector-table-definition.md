# Phase 38K Delivery C: Object Inspector Table Definition

## Status

Complete on frontend `main` at `8472d94`. This frontend delivery consumes the
governed backend table-definition endpoint shipped in Phase 38K Delivery B. It
does not alter the backend contract, query execution, schema metadata
persistence, or credential flows.

## User Outcome

An operator can open the existing Object Inspector for a MySQL table and
explicitly request its `CREATE TABLE` definition. The definition is rendered
read-only inside that Inspector. Views deliberately have no definition action.

## API Contract

The only new browser request is:

```text
GET /query-targets/{targetId}/schema/table-definition?database={database}&name={name}
```

The typed response is:

```ts
type TableDefinitionResponse = {
  targetResourceId: number;
  database: string;
  name: string;
  kind: "table";
  dialect: "mysql";
  definition: string;
  truncated: boolean;
};
```

The frontend sends only the active target id, database, and table name through
the URL. It must not send SQL, DSNs, credentials, actor ids, result values, or
referenced-object data.

## Required Behavior

- The existing Inspector opening flow performs no definition request.
- A localized `View definition` action is available only when the loaded
  `ObjectDetailResponse.kind` is `table`.
- The action triggers exactly one on-demand request for the currently inspected
  table. While pending it is disabled and exposes a localized loading state.
- A successful response renders its `definition` as plain, read-only,
  whitespace-preserving text. There is no editor, copy button, export, download,
  right-click menu, or automatic SQL insertion.
- If `truncated` is true, the UI shows a localized truncation notice alongside
  the response. It must not imply the displayed text is complete.
- Errors use localized, controlled messages. Raw API exception messages are not
  rendered. Retry is explicit and repeats only the definition request.
- The action is absent for views, unavailable details, locked targets, and
  malformed/non-table detail state.
- Desktop Dialog and mobile bottom Sheet retain the existing Inspector close,
  Escape, focus-restoration, dark-mode, English, and Simplified Chinese
  behavior.

## State and Concurrency Rules

Definition data is Inspector-local ephemeral state. It is not placed in a
worksheet, URL, local storage, schema store, history, audit UI, or cache.

Each request has an AbortController and monotonically increasing definition
generation. Completion may update state only if the Inspector is still open for
the same target/database/table and the generation is current. Target changes,
object collapse, Inspector close, detail replacement, and component unmount
abort or invalidate the request and clear definition state. A response for a
previous object must never appear under a new Inspector.

## Error Presentation

Map HTTP outcomes to stable localized UI states rather than server text:

- 400: definition unavailable for this object
- 403: target access is not allowed
- 404: table is no longer available
- 408: metadata request timed out
- 502 and unknown failures: definition could not be loaded

The UI may retain a previously successful definition only while it still belongs
to the same Inspector identity. It must clear it before a retry for a different
identity.

## Acceptance Criteria

- Desktop English path: Objects -> table -> Inspect -> View definition displays
  a real `CREATE TABLE` result from backend `c897cfb` or a descendant.
- Mobile 375px and Simplified Chinese paths use the same explicit action and
  localized labels.
- Opening the Inspector alone makes no table-definition, execute, or related
  records request.
- A view never renders the action.
- Loading, controlled error/retry, truncation, cancellation/stale response, and
  focus behavior have focused component coverage.
- The real E2E suite has zero failed and zero skipped tests. Fixture absence is
  a loud setup error, never `test.skip`.

## Explicit Non-Goals

No `SHOW CREATE VIEW`, routines, triggers, grants, schema persistence, DDL
execution, SQL editor insertion, copying/exporting/downloading definition text,
search, result-grid changes, credential controls, backend changes, migrations,
or API contract changes are included.
