import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Heart, Lock, Rocket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { useBounties } from "@/hooks/useBounties";
import { useDemo } from "@/contexts/DemoContext";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import DemoLockOverlay from "@/components/DemoLockOverlay";
import BoostDialog from "@/components/BoostDialog";
import { navigateToLogin } from "@/lib/navigation";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/EnhancedAnimations";
import { InteractiveCard } from "@/components/InteractiveElements";
import { CardSkeleton } from "@/components/LoadingStates";
import type { Bounty } from "@shared/schema";

export default function Board() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [favoritedBounties, setFavoritedBounties] = useState<Set<string>>(new Set());
  const [showDemoLock, setShowDemoLock] = useState(false);
  const [boostBountyId, setBoostBountyId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isDemoMode } = useDemo();
  const queryClient = useQueryClient();

  const { bounties, isLoading } = useBounties();

  const handleApply = (bountyId: string) => {
    if (isDemoMode) {
      setShowDemoLock(true);
      return;
    }
    applyMutation.mutate(bountyId);
  };

  const applyMutation = useMutation({
    mutationFn: async (bountyId: string) => {
      return apiRequest("POST", `/api/bounties/${bountyId}/apply`, {
        message: "I'd like to work on this bounty!"
      });
    },
    onSuccess: () => {
      toast({
        title: "Application Sent!",
        description: "Your application has been submitted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bounties"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to apply to bounty. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFavorite = (bountyId: string) => {
    const isFavorited = favoritedBounties.has(bountyId);
    const newFavorites = new Set(favoritedBounties);
    
    if (isFavorited) {
      newFavorites.delete(bountyId);
      toast({
        title: "Removed from Favorites",
        description: "Bounty removed from your favorites.",
      });
    } else {
      newFavorites.add(bountyId);
      toast({
        title: "Added to Favorites",
        description: "Bounty saved to your favorites!",
      });
    }
    
    setFavoritedBounties(newFavorites);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
          <div className="h-9 bg-muted rounded w-32 animate-pulse"></div>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-3.5 animate-pulse">
            <div className="h-4 bg-muted rounded mb-2"></div>
            <div className="h-8 bg-muted rounded mb-2"></div>
            <div className="h-4 bg-muted rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Available Bounties</h2>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-40" data-testid="select-category-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bounties</SelectItem>
            <SelectItem value="quick_cash">💵 Quick Cash ($5-15)</SelectItem>
            <SelectItem value="good_money">💰 Good Money ($16-50)</SelectItem>
            <SelectItem value="big_bucks">💎 Big Bucks ($51-100)</SelectItem>
            <SelectItem value="major_bag">🏆 Major Bag ($100+)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bounties List */}
      <div className="space-y-3">
        {(bounties as Bounty[]).length === 0 ? (
          <Card className="theme-transition bg-gradient-to-br from-primary/5 to-accent/5">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-lg font-semibold mb-3">Ready to get things done?</h3>
              <div className="max-w-md mx-auto space-y-4">
                <p className="text-muted-foreground">
                  {selectedCategory === "all" 
                    ? "No bounties posted yet. Be the pioneer who gets this community started!"
                    : `No bounties in this price range yet. Perfect opportunity to be first!`
                  }
                </p>
                <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg p-4 text-left border border-purple-500/20">
                  <h4 className="font-medium text-sm mb-2">💡 Bounty ideas that actually exist:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• "Rate my outfit for a first date 👗 - $8"</li>
                    <li>• "Help me name my pet rock 🪨 - $12"</li>
                    <li>• "Tell me if this meme is funny 😂 - $5"</li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  🎯 Tip: Weird pays well here - embrace the chaos!
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          (bounties as Bounty[]).map((bounty: Bounty) => (
            <Card key={bounty.id} className="theme-transition hover:shadow-lg hover:shadow-primary/10 border-l-4 border-l-transparent hover:border-l-primary transition-all duration-300" data-testid={`bounty-${bounty.id}`}>
              <CardContent className="p-3.5">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold mb-1.5" data-testid="text-bounty-title">
                      {bounty.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2" data-testid="text-bounty-description">
                      {bounty.description}
                    </p>
                    
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <Badge variant="secondary">{bounty.category}</Badge>
                      {bounty.tags?.map((tag: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      <span>Posted by </span>
                      <span className="text-foreground font-medium">@{bounty.authorId}</span>
                      <span> • {formatDate(bounty.createdAt || new Date())}</span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-pocket-gold mb-1" data-testid="text-bounty-reward">
                      {formatCurrency(bounty.reward)}
                    </div>
                    {(bounty.boostLevel || 0) > 0 && bounty.boostExpiresAt && new Date(bounty.boostExpiresAt) > new Date() && (
                      <div className="boost-pill">
                        <span>🚀</span>
                        <span>Boost {bounty.boostLevel}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  <Button
                    className="bg-pocket-red hover:bg-pocket-red-dark text-white flex-1"
                    onClick={() => handleApply(bounty.id)}
                    disabled={applyMutation.isPending || bounty.authorId === user?.id}
                    data-testid={`button-apply-${bounty.id}`}
                  >
                    {bounty.authorId === user?.id ? "Your Bounty" : "Apply"}
                    {isDemoMode && bounty.authorId !== user?.id && (
                      <Lock className="h-3 w-3 ml-2" />
                    )}
                  </Button>
                  {bounty.authorId === user?.id && bounty.status === "active" && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setBoostBountyId(bounty.id)}
                      data-testid={`button-boost-${bounty.id}`}
                      title="Boost this bounty"
                    >
                      <Rocket className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleFavorite(bounty.id)}
                    data-testid={`button-favorite-${bounty.id}`}
                  >
                    <Heart 
                      className={`h-4 w-4 ${favoritedBounties.has(bounty.id) ? 'fill-red-500 text-red-500' : ''}`} 
                    />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      
      {showDemoLock && (
        <DemoLockOverlay
          action="Apply to bounties"
          onClose={() => setShowDemoLock(false)}
        />
      )}
      {boostBountyId && (
        <BoostDialog 
          bountyId={boostBountyId} 
          userPoints={user?.points || 0}
          onClose={() => setBoostBountyId(null)} 
        />
      )}
    </div>
  );
}
