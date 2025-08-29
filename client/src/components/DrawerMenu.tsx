import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuthJWT";

interface DrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function DrawerMenu({ isOpen, onClose, activeSection, onSectionChange }: DrawerMenuProps) {
  const { user } = useAuth();

  const handleSectionClick = (section: string) => {
    onSectionChange(section);
    onClose();
  };

  const menuItems = [
    { id: "board", label: "📋 Board" },
    { id: "post", label: "➕ Post" },
    { id: "messages", label: "💬 Messages" },
    { id: "arcade", label: "🎮 Arcade" },
    { id: "account", label: "💳 Account" },
    { id: "profile", label: "👤 Profile" },
    { id: "friends", label: "👥 Friends" },
    { id: "activity", label: "🔔 Activity" },
    { id: "referrals", label: "🎯 Share & Earn" },
    { id: "points", label: "⭐ Buy Points" },
    { id: "admin", label: "👑 Creator Analytics" },
    { id: "inbox", label: "📬 Creator Inbox" },
    { id: "settings", label: "⚙️ Settings" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/35 backdrop-blur-sm z-25 ${
          isOpen ? "block" : "hidden"
        }`}
        onClick={onClose}
        data-testid="drawer-backdrop"
      />
      
      {/* Drawer */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-4/5 max-w-80 bg-card border-r border-border transform transition-transform duration-300 ease-out z-30 flex flex-col theme-transition ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!isOpen}
        data-testid="drawer-menu"
      >
        <div className="flex items-center gap-2.5 p-3.5 border-b border-border">
          <div className="font-bold text-foreground">Menu</div>
          <div className="text-sm text-muted-foreground" data-testid="text-user-handle">
            {user?.handle || "@user"}
          </div>
        </div>
        
        <nav className="grid p-2">
          {menuItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className="justify-start gap-2.5 text-left hover:bg-accent"
              onClick={() => handleSectionClick(item.id)}
              data-testid={`button-nav-${item.id}`}
            >
              {item.label}
            </Button>
          ))}
        </nav>
        
        <div className="mt-auto p-3 border-t border-border flex justify-between items-center">
          <div className="points-pill" data-testid="display-points-drawer">
            <span className="text-base">⭐</span>
            <span>{user?.points || 0}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-secondary text-muted-foreground"
            data-testid="button-test-points"
          >
            +10
          </Button>
        </div>
      </aside>
    </>
  );
}
