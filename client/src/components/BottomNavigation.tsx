import { Button } from "@/components/ui/button";

interface BottomNavigationProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function BottomNavigation({ activeSection, onSectionChange }: BottomNavigationProps) {
  const navItems = [
    { id: "board", icon: "📋", label: "Board" },
    { id: "friends", icon: "👥", label: "Friends" },
    { id: "account", icon: "💳", label: "Account" },
    { id: "post", icon: "➕", label: "Post" },
    { id: "messages", icon: "💬", label: "Messages" },
    { id: "arcade", icon: "🎮", label: "Arcade" },
  ];

  return (
    <footer 
      className="fixed left-0 right-0 bottom-0 h-16 bg-card/95 backdrop-blur-md border-t border-border flex justify-around items-center theme-transition z-10 shadow-lg"
      style={{ paddingBottom: "var(--safe-area-bottom)" }}
    >
      {navItems.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <Button
            key={item.id}
            variant="ghost"
            className={`flex-1 border-none bg-transparent text-xs flex flex-col items-center gap-0.5 pt-1.5 h-auto ${
              isActive 
                ? "text-primary font-bold" 
                : "text-muted-foreground hover:text-foreground transition-colors"
            }`}
            onClick={() => onSectionChange(item.id)}
            data-testid={`button-nav-${item.id}`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </Button>
        );
      })}
    </footer>
  );
}
