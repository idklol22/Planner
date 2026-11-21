import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";

interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: ToastAction;
}

type Notify = (message: string, tone?: Tone, action?: ToastAction) => void;

const ToastContext = createContext<Notify>(() => {});

const toneStyles: Record<Tone, { icon: typeof Info; color: string }> = {
  success: { icon: CheckCircle2, color: "text-mint" },
  error: { icon: AlertCircle, color: "text-rose" },
  info: { icon: Info, color: "text-accent" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<Notify>((message, tone = "success", action) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone, action }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, action ? 6000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-5 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((toast) => {
          const { icon: Icon, color } = toneStyles[toast.tone];
          const action = toast.action;
          return (
            <div
              key={toast.id}
              className="animate-toast pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line-2 bg-surface-2/95 px-4 py-2.5 text-sm text-ink shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              <Icon size={16} className={color} />
              <span>{toast.message}</span>
              {action && (
                <button
                  onClick={() => {
                    action.run();
                    setToasts((current) => current.filter((item) => item.id !== toast.id));
                  }}
                  className="font-semibold text-accent hover:underline"
                >
                  {action.label}
                </button>
              )}
              <button
                onClick={() =>
                  setToasts((current) => current.filter((item) => item.id !== toast.id))
                }
                className="ml-2 text-faint hover:text-ink"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
