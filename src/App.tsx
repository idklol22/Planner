import { useEffect, useRef, useState } from "react";
import { AppShell } from "./components/AppShell";
import { TaskPage } from "./components/task-page/TaskPage";
import { taskIdFromHash } from "./components/task-page/route";
import { useHandoff } from "./lib/handoff";
import { MOTION_MS, usePresence } from "./lib/motion";
import { DeeplinkProvider } from "./state/deeplink";
import { HealthProvider } from "./state/health";
import { StoreProvider, useStore } from "./state/store";
import { SyncProvider } from "./state/sync";
import { ToastProvider } from "./state/toast";
import { WidgetRunner } from "./state/widgets";
import { Scene } from "./theme/Scene";
import { useThemeState } from "./theme/store";

/** Keeps the hand-off engine alive for the whole app session. */
function HandoffRunner() {
  useHandoff();
  return null;
}

/** Tiny hash router: `#/task/<id>` shows the task document over the day view
 *  (the day view stays mounted underneath so its date and mode are kept). */
function Routes() {
  const { ready } = useStore();
  useThemeState(); // category colours are re-lit per theme
  const [taskId, setTaskId] = useState(() => taskIdFromHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setTaskId(taskIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Keep the page mounted through its slide-out. Re-opening (a deep link, a
  // different task, or Back during the exit) cancels the exit in usePresence.
  const presence = usePresence(!!taskId, MOTION_MS.base);
  const lastTaskId = useRef(taskId);
  if (taskId) lastTaskId.current = taskId;
  const shownId = taskId ?? lastTaskId.current;

  return (
    <>
      <AppShell />
      {ready && presence.mounted && shownId && (
        <TaskPage key={shownId} taskId={shownId} closing={presence.closing} />
      )}
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <SyncProvider>
        <ToastProvider>
          <HealthProvider>
            <DeeplinkProvider>
              <Scene />
              <HandoffRunner />
              <WidgetRunner />
              <Routes />
            </DeeplinkProvider>
          </HealthProvider>
        </ToastProvider>
      </SyncProvider>
    </StoreProvider>
  );
}
