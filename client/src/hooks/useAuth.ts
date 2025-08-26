import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { useDemo } from "@/contexts/DemoContext";

export function useAuth() {
  const { isDemoMode, demoUser } = useDemo();
  
  const { data: realUser, isLoading } = useQuery<User>({
    queryKey: ["/api/user"],
    retry: false,
    enabled: !isDemoMode, // Only fetch real user data when not in demo mode
    refetchInterval: false, // Disable automatic polling
    staleTime: 60000, // Consider data fresh for 1 minute
    refetchOnWindowFocus: false, // Disable refetch on focus to avoid auth issues
  });

  // Return demo user data when in demo mode, otherwise real user data
  const user = isDemoMode ? demoUser : realUser;
  const isAuthenticated = isDemoMode ? true : !!realUser;

  return {
    user,
    isLoading: isDemoMode ? false : isLoading,
    isAuthenticated,
  };
}
