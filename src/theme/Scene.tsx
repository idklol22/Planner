import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { startScene } from "./scenes";
import { useThemeState } from "./store";
import { THEMES } from "./themes";

/** The fixed canvas behind the app for scene themes. Renders nothing for the others (and for high contrast). */
export function Scene() {
  const { theme, animation, fx } = useThemeState();
  const kind = !fx || theme === "contrast" ? undefined : THEMES[theme].scene;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !kind) return;
    const handle = startScene(kind, cv, { animate: animation });
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => handle.resize(), 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      handle.stop();
    };
  }, [kind, animation]);
  if (!kind) return null;
  // Portalled to <body> so it sits behind #root (z-index 1) rather than inside its stacking context.
  return createPortal(<canvas key={kind} ref={ref} id="scene" aria-hidden="true" data-scene={kind} />, document.body);
}
