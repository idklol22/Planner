import { AppShell } from "./components/AppShell";
import { useHandoff } from "./lib/handoff";
import { StoreProvider } from "./state/store";
import { ToastProvider } from "./state/toast";

/** Keeps the hand-off engine alive for the whole app session. */
function HandoffRunner() {
  useHandoff();
  return null;
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HandoffRunner />
        <AppShell />
      </ToastProvider>
    </StoreProvider>
  );
}
