import React, { useEffect } from "react";

/* ---------- Icons (inline SF-style strokes) ---------- */
type IconProps = { className?: string; style?: React.CSSProperties };
const svg = (path: React.ReactNode) => (p: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={p.className}
    style={{ flex: "none", ...p.style }}
    aria-hidden="true"
  >
    {path}
  </svg>
);
export const IconOverview = svg(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>);
export const IconInventory = svg(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>);
export const IconKits = svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>);
export const IconImport = svg(<><path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 21h16" /></>);
export const IconSettings = svg(<><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a7.9 7.9 0 000-6l2-1.2-2-3.4-2.3 1a8 8 0 00-5.2-3l-.4-2.4H8.5L8 3.4a8 8 0 00-5.2 3l-2.3-1-2 3.4 2 1.2a7.9 7.9 0 000 6l-2 1.2 2 3.4 2.3-1a8 8 0 005.2 3l.4 2.4h3l.4-2.4a8 8 0 005.2-3l2.3 1 2-3.4z" /></>);
export const IconChevron = svg(<path d="M9 6l6 6-6 6" />);
export const IconPlus = svg(<><path d="M12 5v14M5 12h14" /></>);
export const IconClose = svg(<path d="M6 6l12 12M18 6L6 18" />);
export const IconSearch = svg(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>);
export const IconCamera = svg(<><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></>);
export const IconMove = svg(<><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /><path d="M12 5L5 12l7 7" /></>);
export const IconTrash = svg(<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></>);
export const IconPrint = svg(<><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 17v4h10v-4" /></>);
export const IconFolder = svg(<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />);
export const IconRefresh = svg(<><path d="M20 11a8 8 0 10-2 6" /><path d="M20 4v6h-6" /></>);
export const IconCheck = svg(<path d="M5 12l5 5L20 6" />);
export const IconGrip = svg(<><circle cx="9" cy="6" r="1.3" /><circle cx="15" cy="6" r="1.3" /><circle cx="9" cy="12" r="1.3" /><circle cx="15" cy="12" r="1.3" /><circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="18" r="1.3" /></>);
export const IconWarn = svg(<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>);

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className="segmented__seg"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grabber" />
        <div className="sheet__header">
          <div className="sheet__title">{title}</div>
          <button className="btn btn--sm" onClick={onClose} aria-label="Close">
            <IconClose className="" />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Field wrappers ---------- */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="empty__title">{title}</div>
      <div className="empty__text">{text}</div>
      {action}
    </div>
  );
}
