import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { MOTION_MS, usePresence } from "../lib/motion";

type Tone = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick?: () => void;
  run?: () => void;
  /** Override the lifetime of an action toast (default: 6000ms). */
  durationMs?: number;
}

interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: ToastAction;
}

type Notify = (message: string, tone?: Tone, action?: ToastAction) => void;
const ToastContext = createContext<Notify>(() => {});

/** Undo toasts stay up to 5000ms; a plain action keeps the 6000ms default. */
export function toastDurationMs(action?: ToastAction): number {
  return action?.durationMs ?? (action ? 6000 : 3200);
}

const toneStyles: Record<Tone, { icon: typeof Info; color: string }> = {
  success: { icon: CheckCircle2, color: "text-mint" },
  error: { icon: AlertCircle, color: "text-rose" },
  info: { icon: Info, color: "text-accent" },
};

function ToastItem({ toast, onGone }: { toast: Toast; onGone: (id: number) => void }) {
  const [open, setOpen] = useState(true);
  const presence = usePresence(open, MOTION_MS.base);

  // Auto-dismiss starts as soon as the toast appears; motion never delays it.
  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(false), toastDurationMs(toast.action));
    return () => window.clearTimeout(timer);
  }, [toast.action]);

  useEffect(() => {
    if (!presence.mounted && !open) onGone(toast.id);
  }, [presence.mounted, open, onGone, toast.id]);

  const { icon: Icon, color } = toneStyles[toast.tone];
  const action = toast.action;
  const closing = presence.closing;

  return (
    <div className={`toast-slot ${closing ? "is-closing" : ""}`}>
      <div>
        <div className={`toast-card pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line-2 bg-surface-2/95 px-4 py-2.5 text-sm text-ink shadow-2xl shadow-black/50 backdrop-blur-xl ${closing ? "is-closing" : ""}`}>
          <Icon size={16} className={color} />
          <span>{toast.message}</span>
          {action && (
            <button
              onClick={() => {
                if (action.onClick) action.onClick();
                else action.run?.();
                setOpen(false);
              }}
              className="ui-press ml-1 shrink-0 rounded-lg px-2 text-[13px] font-semibold text-accent hover:bg-accent/10"
            >
              {action.label}
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="ui-press ml-2 text-faint hover:text-ink"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<Notify>((message, tone = "success", action) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone, action }]);
  }, []);

  const onGone = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-[calc(12px+var(--safe-top))] z-[100] flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onGone={onGone} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
