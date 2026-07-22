import { useStore } from "../store/useStore";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role="status">
          <span style={{ flex: 1 }}>{t.message}</span>
          {t.undo && (
            <button
              className="btn btn--sm btn--tinted"
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
          <button className="btn btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
