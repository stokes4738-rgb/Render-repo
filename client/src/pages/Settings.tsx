import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
import Tutorial from "@/components/Tutorial";
import { PlayCircle, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuthJWT";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { user } = useAuth();
  const [showTutorial, setShowTutorial] = useState(false);
  
  // Local state for notification preferences
  const [notifications, setNotifications] = useState({
    newBounties: true,
    messages: true,
    payments: true,
    friendRequests: true,
  });
  
  // Local state for privacy settings
  const [privacy, setPrivacy] = useState({
    showOnlineStatus: true,
    publicProfile: true,
    showEarnings: false,
  });

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const handleEditProfile = () => {
    window.location.href = "/profile";
  };

  const handlePaymentMethods = () => {
    window.location.href = "/account";
  };

  const handlePrivacyPolicy = () => {
    toast({
      title: "Privacy Policy",
      description: "Please contact support for privacy policy information.",
    });
  };

  const handleTermsOfService = () => {
    toast({
      title: "Terms of Service",
      description: "Please contact support for terms of service information.",
    });
  };

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    toast({
      title: "Settings Updated",
      description: "Your notification preferences have been saved.",
    });
  };

  const handlePrivacyChange = (key: keyof typeof privacy) => {
    setPrivacy(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    toast({
      title: "Settings Updated",
      description: "Your privacy settings have been saved.",
    });
  };

  const handleTutorialReplay = () => {
    setShowTutorial(true);
  };

  const handleTutorialClose = () => {
    setShowTutorial(false);
  };

  const handleGetHelp = () => {
    toast({
      title: "Contact Support",
      description: (
        <div className="space-y-2 mt-2">
          <p>Need help? Reach out to us:</p>
          <div className="bg-muted p-3 rounded text-sm">
            <p><strong>Email:</strong> support@pocketbounty.life</p>
            <p><strong>Response time:</strong> Within 24 hours</p>
          </div>
          <p className="text-xs">Include your username: {user?.username || 'Not logged in'}</p>
        </div>
      ) as any,
      duration: 10000,
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Settings</h2>

      {/* Appearance */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Appearance</h3>
          <div className="flex justify-between items-center">
            <div>
              <Label className="text-sm">Dark Mode</Label>
              <div className="text-xs text-muted-foreground">
                Switch between light and dark themes
              </div>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={toggleTheme}
              data-testid="switch-dark-mode"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Notifications</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm">New bounties</Label>
              <Switch
                checked={notifications.newBounties}
                onCheckedChange={() => handleNotificationChange("newBounties")}
                data-testid="switch-new-bounties"
              />
            </div>
            
            <div className="flex justify-between items-center">
              <Label className="text-sm">Messages</Label>
              <Switch
                checked={notifications.messages}
                onCheckedChange={() => handleNotificationChange("messages")}
                data-testid="switch-messages"
              />
            </div>
            
            <div className="flex justify-between items-center">
              <Label className="text-sm">Payment updates</Label>
              <Switch
                checked={notifications.payments}
                onCheckedChange={() => handleNotificationChange("payments")}
                data-testid="switch-payments"
              />
            </div>
            
            <div className="flex justify-between items-center">
              <Label className="text-sm">Friend requests</Label>
              <Switch
                checked={notifications.friendRequests}
                onCheckedChange={() => handleNotificationChange("friendRequests")}
                data-testid="switch-friend-requests"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Privacy</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm">Show online status</Label>
              <Switch
                checked={privacy.showOnlineStatus}
                onCheckedChange={() => handlePrivacyChange("showOnlineStatus")}
                data-testid="switch-online-status"
              />
            </div>
            
            <div className="flex justify-between items-center">
              <Label className="text-sm">Public profile</Label>
              <Switch
                checked={privacy.publicProfile}
                onCheckedChange={() => handlePrivacyChange("publicProfile")}
                data-testid="switch-public-profile"
              />
            </div>
            
            <div className="flex justify-between items-center">
              <Label className="text-sm">Show earnings</Label>
              <Switch
                checked={privacy.showEarnings}
                onCheckedChange={() => handlePrivacyChange("showEarnings")}
                data-testid="switch-show-earnings"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help & Support */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Help & Support</h3>
          <div className="space-y-2">
            <Button
              variant="ghost"
              onClick={handleTutorialReplay}
              className="w-full justify-start text-left p-2 text-sm hover:bg-accent"
              data-testid="button-replay-tutorial"
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Replay Interactive Tutorial
            </Button>
            
            <Button
              variant="ghost"
              onClick={handleGetHelp}
              className="w-full justify-start text-left p-2 text-sm hover:bg-accent"
              data-testid="button-get-help"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Get Help & Support
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Account</h3>
          <div className="space-y-2">
            <Button
              variant="ghost"
              onClick={handleEditProfile}
              className="w-full justify-start text-left p-2 text-sm hover:bg-accent"
              data-testid="button-edit-profile"
            >
              Edit Profile
            </Button>
            
            <Button
              variant="ghost"
              onClick={handlePaymentMethods}
              className="w-full justify-start text-left p-2 text-sm hover:bg-accent"
              data-testid="button-payment-methods"
            >
              Payment Methods
            </Button>
            
            <Button
              variant="ghost"
              onClick={handlePrivacyPolicy}
              className="w-full justify-start text-left p-2 text-sm hover:bg-accent"
              data-testid="button-privacy-policy"
            >
              Privacy Policy
            </Button>
            
            <Button
              variant="ghost"
              onClick={handleTermsOfService}
              className="w-full justify-start text-left p-2 text-sm hover:bg-accent"
              data-testid="button-terms-of-service"
            >
              Terms of Service
            </Button>
            
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-left p-2 text-sm text-destructive hover:bg-destructive/10"
              data-testid="button-sign-out"
            >
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999]">
          <div 
            className="bg-background rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-auto border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <Tutorial onClose={handleTutorialClose} />
          </div>
        </div>
      )}
    </div>
  );
}
