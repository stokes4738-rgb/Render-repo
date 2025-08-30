import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Lock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CreatorLoginProps {
  onSuccess: () => void;
}

export default function CreatorLogin({ onSuccess }: CreatorLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
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
        sessionStorage.setItem("creator_verified", "true");
        onSuccess();
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-pocket-gold" />
            Creator Authentication
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            This area requires special authorization
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="creator-username">Username</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="creator-username"
                  type="text"
                  placeholder="Enter creator username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10"
                  required
                  data-testid="input-creator-username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="creator-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="creator-password"
                  type="password"
                  placeholder="Enter creator password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  data-testid="input-creator-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-pocket-red hover:bg-pocket-red-dark text-white"
              disabled={isLoading}
              data-testid="button-creator-login"
            >
              {isLoading ? "Verifying..." : "Unlock Creator Access"}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Only the platform administrator can access this section
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}