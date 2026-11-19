import { AppShell } from "./components/AppShell";
import { StoreProvider } from "./state/store";
import { ToastProvider } from "./state/toast";

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </StoreProvider>
  );
}
