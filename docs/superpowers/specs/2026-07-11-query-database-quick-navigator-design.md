# Query Database Context and Quick Navigator Design

## Goal

Give every query worksheet its own metadata database context and provide a
keyboard-first object navigator without changing SQL execution context.

## Architecture

`LocalWorksheet` gains `activeDatabase: string | null`. A guarded metadata
load initializes it from the backend `defaultDatabase` only while it is null;
switching worksheets therefore restores its saved context. Target selection
clears the worksheet context and uses a new request generation, preventing a
late response for the previous target from writing the new one.

`QueryWorkbench` owns metadata fetches, the shared `QuerySchemaStore`, and a
controlled explorer reveal target. It passes the active worksheet context into
the schema browser and quick navigator. Changing the database changes only
these metadata consumers. It never constructs `USE` and never calls query
execution.

The navigator is a Base UI dialog opened by Cmd/Ctrl+P only on `/query`. It
fetches a bounded database page and bounded table/view pages for matching
databases. Columns are derived exclusively from existing ready entries in the
shared detail cache. Database selection updates worksheet context; object
selection reveals it in the explorer. SQL changes only when the operator uses
the explicit Insert action.

## Identifier Contract

The new pure helper quotes every identifier segment with backticks and doubles
embedded backticks. For an object in the worksheet database it returns
`` `object` ``; otherwise it returns `` `database`.`object` ``. A second helper
replaces the current CodeMirror selection, or inserts at the cursor when the
selection is empty.

## Accessibility and Failure States

The dialog uses the project dialog primitive for modal focus trapping and
restores focus on close. The search input receives initial focus. Arrow keys
move an active row, Enter performs the currently selected row's primary action,
and Escape closes. Visible focus styles, no-result, loading, error, and retry
states are all localized.

## Scope Boundaries

Only databases, tables, views, and cached columns are searchable. Routines,
triggers, grants, history, cross-target search, automatic execution, and
automatic `USE` statements are excluded.
