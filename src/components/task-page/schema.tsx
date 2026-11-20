import { useState } from "react";
import katex from "katex";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";

/** A checklist row that is bound to a real subtask (`subtaskId`). */
export const taskItemBlock = createReactBlockSpec(
  {
    type: "taskItem",
    propSchema: {
      subtaskId: { default: "" },
      checked: { default: false },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div className="task-block" data-checked={block.props.checked ? "true" : "false"}>
        <button
          type="button"
          role="checkbox"
          aria-checked={block.props.checked}
          aria-label="Toggle task"
          contentEditable={false}
          className="task-check"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor.isEditable &&
            editor.updateBlock(block, { type: "taskItem", props: { checked: !block.props.checked } })
          }
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <circle cx="12" cy="12" r="9" className="task-check-ring" />
            <path d="M7.8 12.3l2.9 2.9 5.6-6" className="task-check-tick" />
          </svg>
        </button>
        <div className="inline-content" ref={contentRef} />
      </div>
    ),
  },
);

function Katex({ latex }: { latex: string }) {
  let html = "";
  try {
    html = katex.renderToString(latex || "\\square", { throwOnError: false, output: "html" });
  } catch {
    html = latex;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Inline maths. Typing `$x^2$` converts to this node; click to edit. */
export const mathInline = createReactInlineContentSpec(
  {
    type: "math",
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <MathChip
        latex={inlineContent.props.latex}
        editable={editor.isEditable}
        onChange={(latex) => updateInlineContent({ type: "math", props: { latex } })}
      />
    ),
    toExternalHTML: ({ inlineContent }) => <span>{`$${inlineContent.props.latex}$`}</span>,
  },
);

function MathChip({
  latex,
  editable,
  onChange,
}: {
  latex: string;
  editable: boolean;
  onChange: (latex: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  if (editing && editable) {
    const commit = () => {
      setEditing(false);
      if (draft.trim() && draft !== latex) onChange(draft.trim());
    };
    return (
      <input
        autoFocus
        className="math-input"
        value={draft}
        size={Math.max(draft.length, 3)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            commit();
          }
        }}
      />
    );
  }
  return (
    <span
      className="math-chip"
      title={editable ? "Click to edit" : undefined}
      onClick={() => {
        setDraft(latex);
        setEditing(true);
      }}
    >
      <Katex latex={latex} />
    </span>
  );
}

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, taskItem: taskItemBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, math: mathInline },
});

export type PlannerEditor = typeof schema.BlockNoteEditor;
