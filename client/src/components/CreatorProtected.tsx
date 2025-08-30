import { useAuth } from "@/hooks/useAuthJWT";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldOff } from "lucide-react";

export default function CreatorProtected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    // Only Dallas1221 can access Creator tab
    if (user && user.username !== "Dallas1221") {
      navigate("/home");
    }
  }, [user, navigate]);

  // Show unauthorized message if not Dallas1221
  if (!user || user.username !== "Dallas1221") {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <ShieldOff className="w-6 h-6" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The Creator tab is restricted to authorized accounts only.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              This feature is exclusively for the platform administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}