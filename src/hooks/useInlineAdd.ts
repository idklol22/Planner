import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useKeyboardInset } from "../lib/keyboard";

export function useInlineAdd({
  categoryId,
  kind,
  onClose,
}: {
  categoryId: string | null;
  kind: "task" | "goal";
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const closed = useRef(false);
  const keyboard = useKeyboardInset();

  const save = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    if (kind === "goal" && categoryId) {
      // actions.addGoal(categoryId, clean);
    } else {
      // actions.addTask(date, clean, categoryId);
    }
    onClose();
  };

  useEffect(() => {
    const onBlur = () => {
      if (closed.current) return;
      closed.current = true;
      save(valueRef.current);
    };

    const input = inputRef.current;
    if (input) {
      input.addEventListener("blur", onBlur);
      const observer = new ResizeObserver(() => {
        if (keyboard === 0 && !closed.current) {
          save(valueRef.current);
        }
      });
      observer.observe(input);
      return () => {
        input.removeEventListener("blur", onBlur);
        observer.disconnect();
      };
    }
  }, [keyboard]);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (closed.current) return;
      const root = document.querySelector(".inline-add-root");
      if (root && !root.contains(e.target as Node)) {
        const input = document.querySelector('input[placeholder*="New task"], input[placeholder*="New goal"]');
        if (input) input.blur();
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && !closed.current) {
        closed.current = true;
        save(valueRef.current);
      }
    };
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
    };
  }, []);

  function addNext() {
    if (closed.current) return;
    const clean = valueRef.current.trim();
    if (clean) save(clean);
    valueRef.current = "";
    setValue("");
    inputRef.current?.focus();
  }

  function cancel() {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }

  return {
    value,
    setValue,
    inputRef,
    addNext,
    cancel,
  };
}
