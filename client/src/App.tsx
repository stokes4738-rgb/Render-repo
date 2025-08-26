import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { DemoProvider } from "@/contexts/DemoContext";
import DemoIndicator from "@/components/DemoIndicator";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import PWAInputFix from "@/components/PWAInputFix";

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
            <Route path="/profile" component={AuthPage} />
            <Route path="/account" component={AuthPage} />
            <Route path="/creator-inbox" component={AuthPage} />
            <Route path="/messages" component={AuthPage} />
            <Route path="/inbox" component={AuthPage} />
            <Route path="/home" component={AuthPage} />
            <Route path="/dashboard" component={AuthPage} />
            <Route path="/bounties" component={AuthPage} />
            <Route component={AuthPage} />
          </>
        ) : (
          <>
            <Route path="/profile" component={Profile} />
            <Route path="/account" component={Account} />
            <Route path="/creator-inbox" component={CreatorInbox} />
            <Route path="/messages" component={CreatorInbox} />
            <Route path="/inbox" component={CreatorInbox} />
            <Route component={Home} />
          </>
        )}
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
              <PWAInputFix />
              <Router />
              
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </DemoProvider>
    </QueryClientProvider>
  );
}

export default App;
