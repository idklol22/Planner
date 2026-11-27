import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { TaskPage } from "./components/task-page/TaskPage";
import { taskIdFromHash } from "./components/task-page/route";
import { useHandoff } from "./lib/handoff";
import { MessagesProvider } from "./state/messages";
import { StoreProvider, useStore } from "./state/store";
import { SyncProvider } from "./state/sync";
import { ToastProvider } from "./state/toast";
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
  return (
    <>
      <AppShell />
      {ready && taskId && <TaskPage taskId={taskId} />}
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <SyncProvider>
        <ToastProvider>
          <MessagesProvider>
            <Scene />
            <HandoffRunner />
            <Routes />
          </MessagesProvider>
        </ToastProvider>
      </SyncProvider>
    </StoreProvider>
  );
}
