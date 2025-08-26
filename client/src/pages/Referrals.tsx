import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuthJWT";
import { Copy, Share2, Users, Gift, CheckCircle2 } from "lucide-react";

interface ReferralStats {
  referralCount: number;
  referrals: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    handle: string | null;
    createdAt: Date;
  }>;
  milestones: Array<{
    count: number;
    points: number;
    reached: boolean;
  }>;
}

interface ReferralCode {
  referralCode: string;
  referralCount: number;
  shareUrl: string;
}

export default function Referrals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: referralCode, isLoading: codeLoading } = useQuery<ReferralCode>({
    queryKey: ["/api/referral/code"],
    enabled: !!user,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referral/stats"],
    enabled: !!user,
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Referral link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const shareNatively = async () => {
    if (navigator.share && referralCode) {
      try {
        await navigator.share({
          title: "Join Pocket Bounty!",
          text: "Join me on Pocket Bounty - turn your weird problems into someone's payday! 🪙",
          url: referralCode.shareUrl,
        });
      } catch (err) {
        // Fallback to copy
        copyToClipboard(referralCode.shareUrl);
      }
    } else if (referralCode) {
      copyToClipboard(referralCode.shareUrl);
    }
  };

  if (!user) {
    return (
      <div className="text-center text-muted-foreground mt-8">
        Please log in to view your referrals
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-pocket-gold mb-2">🎯 Share & Earn</h1>
        <p className="text-muted-foreground">
          Share Pocket Bounty with friends and earn bonus points!
        </p>
      </div>

      {/* Referral Code Card */}
      <Card className="theme-transition">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-pocket-red" />
            Your Referral Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {codeLoading ? (
            <div className="text-center text-muted-foreground">Loading your referral code...</div>
          ) : referralCode ? (
            <>
              <div className="flex items-center gap-2">
                <Input 
                  value={referralCode.referralCode} 
                  readOnly 
                  className="font-mono text-lg text-center bg-muted"
                  data-testid="input-referral-code"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(referralCode.referralCode)}
                  data-testid="button-copy-code"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Share this link:</div>
                <div className="flex items-center gap-2">
                  <Input 
                    value={referralCode.shareUrl} 
                    readOnly 
                    className="text-xs bg-muted"
                    data-testid="input-share-url"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(referralCode.shareUrl)}
                    data-testid="button-copy-url"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button 
                className="w-full bg-pocket-red hover:bg-pocket-red-dark text-white"
                onClick={shareNatively}
                data-testid="button-share-referral"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Referral Link
              </Button>
            </>
          ) : (
            <div className="text-center text-muted-foreground">Failed to load referral code</div>
          )}
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card className="theme-transition">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Your Referral Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="text-center text-muted-foreground">Loading stats...</div>
          ) : stats ? (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-pocket-gold">
                  {stats.referralCount}
                </div>
                <div className="text-sm text-muted-foreground">
                  {stats.referralCount === 1 ? "Person" : "People"} Referred
                </div>
              </div>

              {/* Milestones */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Point Milestones
                </h3>
                <div className="grid gap-2">
                  {stats.milestones.map((milestone) => (
                    <div 
                      key={milestone.count}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        milestone.reached 
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                          : "bg-muted/50"
                      }`}
                      data-testid={`milestone-${milestone.count}`}
                    >
                      <div className="flex items-center gap-2">
                        {milestone.reached ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        <span className="text-sm">
                          {milestone.count} referral{milestone.count > 1 ? "s" : ""}
                        </span>
                      </div>
                      <Badge 
                        variant={milestone.reached ? "default" : "secondary"}
                        className={milestone.reached ? "bg-green-600 text-white" : ""}
                      >
                        +{milestone.points} points
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Referral List */}
              {stats.referrals.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold">People You've Referred</h3>
                  <div className="space-y-2">
                    {stats.referrals.map((referral) => (
                      <div 
                        key={referral.id}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                        data-testid={`referral-${referral.id}`}
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {referral.firstName || referral.lastName 
                              ? `${referral.firstName || ""} ${referral.lastName || ""}`.trim()
                              : referral.handle || "Anonymous User"
                            }
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Joined {new Date(referral.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          +10 ⭐
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground">Failed to load stats</div>
          )}
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card className="theme-transition border-orange-200 dark:border-orange-800">
        <CardHeader>
          <CardTitle className="text-orange-800 dark:text-orange-200">
            🎯 How Referrals Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-orange-700 dark:text-orange-300 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-semibold">1 referral:</span>
              <span>+10 bonus points</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">5 referrals:</span>
              <span>+50 bonus points</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">10 referrals:</span>
              <span>+100 bonus points</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">20 referrals:</span>
              <span>+200 bonus points</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3 p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
            💡 Points are awarded when someone signs up using your referral code. 
            Use points to post bounties or save them up!
          </div>
        </CardContent>
      </Card>
    </div>
  );
}