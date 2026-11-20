import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { TaskPage } from "./components/task-page/TaskPage";
import { taskIdFromHash } from "./components/task-page/route";
import { StoreProvider, useStore } from "./state/store";
import { ToastProvider } from "./state/toast";

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
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </StoreProvider>
  );
}
