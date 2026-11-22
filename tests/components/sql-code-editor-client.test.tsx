import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { SqlCodeEditorClient } from "@/components/query/sql-code-editor-client";
import type { WorksheetRunScope } from "@/lib/sql-run-scope";

function renderEditor(doc: string, engine = "mysql") {
  const onScopeChange = vi.fn();
  const viewHolder: { view: EditorView | null } = { view: null };
  const utils = render(
    <SqlCodeEditorClient
      value={doc}
      onChange={() => {}}
      engine={engine}
      onEditorView={(view) => {
        viewHolder.view = view;
      }}
      onRunScopeChange={onScopeChange}
    />,
  );
  return { ...utils, onScopeChange, viewHolder };
}

async function select(view: EditorView, anchor: number, head: number) {
  await act(async () => {
    view.dispatch({ selection: EditorSelection.range(anchor, head) });
  });
}

// Scope reports are queued with queueMicrotask so they never fire React
// updates inside a CodeMirror transaction; flush one tick to observe them.
async function flushScopeReport() {
  await act(async () => {
    await Promise.resolve();
  });
}

const lastScope = (onScopeChange: ReturnType<typeof vi.fn>): WorksheetRunScope | undefined =>
  onScopeChange.mock.calls.at(-1)?.[0];

describe("SqlCodeEditorClient run scope", () => {
  it("marks the cursor statement and reports 'statement' for a multi-statement doc", async () => {
    const doc = "SELECT 1 AS a;\nSELECT 2 AS b;";
    const { container, onScopeChange } = renderEditor(doc);
    await flushScopeReport();
    const marked = container.querySelectorAll(".cm-runscope");
    expect(marked.length).toBeGreaterThan(0);
    expect(marked[0]!.textContent).toBe("SELECT 1 AS a;");
    expect(lastScope(onScopeChange)).toBe("statement");
  });

  it("reports 'document' and marks nothing for a single-statement doc", async () => {
    const { container, onScopeChange } = renderEditor("SELECT 1");
    await flushScopeReport();
    expect(container.querySelector(".cm-runscope")).toBeNull();
    expect(lastScope(onScopeChange)).toBe("document");
  });

  it("moves the mark when the cursor enters another statement", async () => {
    const doc = "SELECT 1 AS a;\nSELECT 2 AS b;";
    const { container, viewHolder } = renderEditor(doc);
    const view = viewHolder.view!;
    await select(view, doc.indexOf("2 AS"), doc.indexOf("2 AS"));
    const marked = container.querySelectorAll(".cm-runscope");
    expect(marked.length).toBeGreaterThan(0);
    expect(marked[0]!.textContent).toBe("SELECT 2 AS b;");
  });

  it("clears the mark and reports 'selection' while text is selected", async () => {
    const doc = "SELECT 1 AS a;\nSELECT 2 AS b;";
    const { container, viewHolder, onScopeChange } = renderEditor(doc);
    await select(viewHolder.view!, 0, 8);
    expect(container.querySelector(".cm-runscope")).toBeNull();
    expect(lastScope(onScopeChange)).toBe("selection");
  });

  it("never marks anything for native engines", async () => {
    const doc = "GET a\nHGET h f";
    const { container, viewHolder, onScopeChange } = renderEditor(doc, "redis");
    await flushScopeReport();
    expect(container.querySelector(".cm-runscope")).toBeNull();
    expect(lastScope(onScopeChange)).toBe("document");
    await select(viewHolder.view!, 0, 5);
    expect(container.querySelector(".cm-runscope")).toBeNull();
    expect(lastScope(onScopeChange)).toBe("selection");
  });
});
