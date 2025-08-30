import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CreatorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatorAuthModal({ isOpen, onClose, onSuccess }: CreatorAuthModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/creator/verify", {
        username,
        password
      });

      const data = await response.json();
      
      if (data.success && data.username === "Dallas1221") {
        toast({
          title: "Access Granted",
          description: "Welcome to Creator Dashboard",
        });
        sessionStorage.setItem("creatorAuthenticated", "true");
        sessionStorage.setItem("creatorAuthTime", Date.now().toString());
        onSuccess();
        // Reset form
        setUsername("");
        setPassword("");
      } else {
        setError("Invalid credentials. Creator access denied.");
        toast({
          title: "Access Denied",
          description: "Only authorized creator accounts can access this area.",
          variant: "destructive",
        });
      }
    } catch (err) {
      setError("Authentication failed. Please try again.");
      toast({
        title: "Error",
        description: "Failed to verify credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setPassword("");
    }
  };

  const handleClose = () => {
    setUsername("");
    setPassword("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-pocket-gold" />
            Creator Authentication Required
          </DialogTitle>
          <DialogDescription>
            This section contains sensitive analytics data. Please enter creator credentials to continue.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="creator-username">Username</Label>
            <Input
              id="creator-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter creator username"
              required
              autoComplete="off"
              data-testid="input-creator-username"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="creator-password">Password</Label>
            <Input
              id="creator-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter creator password"
              required
              autoComplete="off"
              data-testid="input-creator-password"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              data-testid="button-creator-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              data-testid="button-creator-authenticate"
            >
              {isLoading ? "Authenticating..." : "Authenticate"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}