import { useEffect, useReducer, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Camera, Images } from "lucide-react";
import { nextHeading, toggledBlockType, type ListType } from "./formatting";
import type { PlannerEditor } from "./schema";

type AnyBlock = { id: string; type: string; props?: Record<string, unknown> };

/** Keeps the keyboard and the text cursor where they are when a button is tapped. */
function keepFocus(event: MouseEvent | PointerEvent) {
  event.preventDefault();
}

function BarButton({
  label,
  children,
  pressed,
  disabled,
  onAction,
  className = "",
}: {
  label: string;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onAction: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={keepFocus}
      onPointerDown={keepFocus}
      onClick={onAction}
      className={`bar-button ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * The only toolbar on the note screen. Flat, 44px tall, pinned just above the
 * keyboard; every control keeps focus in the editor so formatting never needs
 * a second tap to bring the keyboard back.
 */
export function KeyboardBar({
  editor,
  keyboard,
  busy,
  onCamera,
  onPhotos,
}: {
  editor: PlannerEditor;
  keyboard: number;
  busy: boolean;
  onCamera: () => void;
  onPhotos: () => void;
}) {
  // Selection/content changes must repaint the active glyphs.
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offSelection = editor.onSelectionChange(repaint);
    const offContent = editor.onChange(repaint);
    return () => {
      offSelection();
      offContent();
    };
  }, [editor]);

  function currentBlock(): AnyBlock | undefined {
    try {
      return editor.getTextCursorPosition().block as unknown as AnyBlock | undefined;
    } catch {
      return undefined;
    }
  }

  function activeStyles(): Record<string, unknown> {
    try {
      return editor.getActiveStyles() as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  function update(update: Record<string, unknown>) {
    const block = currentBlock();
    if (!block) return;
    editor.updateBlock(block.id, update as never);
    editor.focus();
  }

  function setList(type: ListType) {
    const next = toggledBlockType(currentBlock()?.type ?? "paragraph", type);
    update({
      type: next,
      ...(next === "checkListItem" ? { props: { checked: false } } : {}),
    });
  }

  const type = currentBlock()?.type ?? "paragraph";
  const level = currentBlock()?.props?.level as number | undefined;
  const styles = activeStyles();

  return (
    <div className="keyboard-bar" style={{ bottom: keyboard, paddingBottom: keyboard ? 0 : "var(--safe-bottom)" }}>
      <div className="keyboard-bar-row">
        <BarButton
          label="Heading"
          pressed={type === "heading"}
          onAction={() => {
            const next = nextHeading(type, level);
            update({ type: next.type, ...(next.type === "heading" ? { props: { level: next.level } } : {}) });
          }}
        >
          H
        </BarButton>
        <BarButton
          label="Bullet list"
          pressed={type === "bulletListItem"}
          onAction={() => setList("bulletListItem")}
        >
          <span aria-hidden>&bull;</span>
        </BarButton>
        <BarButton
          label="Numbered list"
          pressed={type === "numberedListItem"}
          onAction={() => setList("numberedListItem")}
        >
          1.
        </BarButton>
        <BarButton
          label="Checklist"
          pressed={type === "checkListItem"}
          onAction={() => setList("checkListItem")}
        >
          <span aria-hidden>&#9746;&#65038;</span>
        </BarButton>
        <BarButton
          label="Bold"
          pressed={!!styles.bold}
          onAction={() => {
            editor.toggleStyles({ bold: true } as never);
            editor.focus();
          }}
          className="bar-bold"
        >
          B
        </BarButton>
        <BarButton
          label="Italic"
          pressed={!!styles.italic}
          onAction={() => {
            editor.toggleStyles({ italic: true } as never);
            editor.focus();
          }}
          className="bar-italic"
        >
          I
        </BarButton>
        <BarButton label="Camera" disabled={busy} onAction={onCamera}>
          <Camera size={18} aria-hidden />
        </BarButton>
        <BarButton label="Photos" disabled={busy} onAction={onPhotos}>
          <Images size={18} aria-hidden />
        </BarButton>
        {keyboard > 0 && (
          <BarButton label="Done" onAction={() => editor.blur()} className="bar-done">
            Done
          </BarButton>
        )}
      </div>
    </div>
  );
}
