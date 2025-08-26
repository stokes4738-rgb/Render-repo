import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth, AuthProvider } from "@/hooks/useAuthJWT";
import { DemoProvider } from "@/contexts/DemoContext";
import DemoIndicator from "@/components/DemoIndicator";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
// import PWAInputFix from "@/components/PWAInputFix";

// Lazy load pages for better performance
const Landing = lazy(() => import("@/pages/Landing"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const Home = lazy(() => import("@/pages/Home"));
const Profile = lazy(() => import("@/pages/Profile"));
const Account = lazy(() => import("@/pages/Account"));
const CreatorInbox = lazy(() => import("@/pages/CreatorInbox"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-2xl mb-2">🪙</div>
          <div className="text-lg font-semibold text-pocket-gold">Pocket Bounty</div>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-2xl mb-2">🪙</div>
          <div className="text-lg font-semibold text-pocket-gold">Pocket Bounty</div>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    }>
      <Switch>
        {!isAuthenticated ? (
          <>
            <Route path="/auth" component={AuthPage} />
            <Route path="/login" component={AuthPage} />
            <Route path="/signup" component={AuthPage} />
            <Route path="/create-account" component={AuthPage} />
            <Route path="/register" component={AuthPage} />
            <Route path="/ref/:code" component={AuthPage} />
            <Route path="/referral/:code" component={AuthPage} />
            <Route path="/invite/:code" component={AuthPage} />
            <Route path="/" component={AuthPage} />
          </>
        ) : (
          <>
            <Route path="/" component={Home} />
            <Route path="/home" component={Home} />
            <Route path="/dashboard" component={Home} />
            <Route path="/bounties" component={Home} />
            <Route path="/profile" component={Profile} />
            <Route path="/account" component={Account} />
            <Route path="/creator-inbox" component={CreatorInbox} />
            <Route path="/messages" component={CreatorInbox} />
            <Route path="/inbox" component={CreatorInbox} />
            <Route path="/ref/:code" component={Home} />
            <Route path="/referral/:code" component={Home} />
            <Route path="/invite/:code" component={Home} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DemoProvider>
          <ThemeProvider>
            <TooltipProvider>
              <div className="relative">
                <Toaster />
                <DemoIndicator />
                <div className="fixed top-4 left-4 right-4 z-50 pointer-events-none">
                  <div className="pointer-events-auto">
                    <PWAInstallPrompt />
                  </div>
                </div>
                {/* <PWAInputFix /> Disabled - causing input issues */}
                <Router />
                
              </div>
            </TooltipProvider>
          </ThemeProvider>
        </DemoProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
