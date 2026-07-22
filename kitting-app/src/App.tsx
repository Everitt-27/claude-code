import { useEffect } from "react";
import { useStore } from "./store/useStore";
import { useUI } from "./store/useUI";
import { Overview } from "./pages/Overview";
import { InventoryPage } from "./pages/Inventory";
import { KitsPage } from "./pages/Kits";
import { KitDetail } from "./pages/KitDetail";
import { SettingsPage } from "./pages/Settings";
import { KitBubble } from "./components/KitBubble";
import { Toasts } from "./components/Toasts";
import { IconInventory, IconKits, IconOverview, IconSettings } from "./components/ui";

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
}

export default function App() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const openKitId = useUI((s) => s.openKitId);
  useTheme();

  const tabs = [
    { id: "overview" as const, label: "Overview", Icon: IconOverview },
    { id: "inventory" as const, label: "Inventory", Icon: IconInventory },
    { id: "kits" as const, label: "Kits", Icon: IconKits },
    { id: "settings" as const, label: "Settings", Icon: IconSettings },
  ];

  return (
    <div className="desktop-shell">
      <nav className="tabbar" aria-label="Primary">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="tabbar__item"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="app">
        <div className="app__body">
          {tab === "overview" && <Overview />}
          {tab === "inventory" && <InventoryPage />}
          {tab === "kits" && (openKitId ? <KitDetail kitId={openKitId} /> : <KitsPage />)}
          {tab === "settings" && <SettingsPage />}
        </div>
      </div>

      <KitBubble />
      <Toasts />
    </div>
  );
}
