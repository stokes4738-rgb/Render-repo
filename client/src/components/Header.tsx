import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuthJWT";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-safari border-b border-border theme-transition">
      <div className="flex items-center justify-between gap-2.5 px-4 py-3.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onMenuClick}
          className="border-border bg-transparent px-2 py-1 text-lg"
          aria-label="Open menu"
          data-testid="button-menu"
        >
          ☰
        </Button>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-pocket-gold m-0">
            🪙 Pocket Bounty
          </h1>
          <div className="text-xs text-muted-foreground/50 mt-0.5 leading-none">
            Built by Dallas Abbott
          </div>
        </div>
        <div className="points-pill" data-testid="display-points">
          <span className="text-base">⭐</span>
          <span>{user?.points || 0}</span>
        </div>
      </div>
    </header>
  );
}
