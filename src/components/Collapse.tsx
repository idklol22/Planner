import type { ReactNode } from "react";
import { MOTION_MS, usePresence } from "../lib/motion";

/** Short height collapse using the 0fr/1fr grid technique. Content mounts
 *  synchronously on open (so a tapped input can focus from the same gesture),
 *  and stays mounted until the exit has finished. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const presence = usePresence(open, MOTION_MS.base);
  return (
    <div className={`collapse-grid ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="collapse-inner">{presence.mounted ? children : null}</div>
    </div>
  );
}
