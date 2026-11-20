import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { TaskPage } from "./components/task-page/TaskPage";
import { taskIdFromHash } from "./components/task-page/route";
import { useHandoff } from "./lib/handoff";
import { StoreProvider, useStore } from "./state/store";
import { SyncProvider } from "./state/sync";
import { ToastProvider } from "./state/toast";

/** Keeps the hand-off engine alive for the whole app session. */
function HandoffRunner() {
  useHandoff();
  return null;
}

/** Tiny hash router: `#/task/<id>` shows the task document over the day view
 *  (the day view stays mounted underneath so its date and mode are kept). */
function Routes() {
  const { ready } = useStore();
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
          <HandoffRunner />
          <Routes />
        </ToastProvider>
      </SyncProvider>
    </StoreProvider>
  );
}
