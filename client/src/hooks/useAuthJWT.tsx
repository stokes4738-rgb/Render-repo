import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  token: string | null;
  isAuthenticated: boolean;
  loginMutation: UseMutationResult<any, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<any, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

// Store token in localStorage
const TOKEN_KEY = "pocket_bounty_token";

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Add token to all fetch requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const token = getStoredToken();
  if (token) {
    const [url, config = {}] = args;
    const headers = config.headers || {};
    if (typeof url === 'string' && url.includes('/api/')) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
    }
    args[1] = { ...config, headers };
  }
  return originalFetch.apply(this, args);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(getStoredToken());
  
  console.log("AuthProvider - Initial token from localStorage:", token);

  const {
    data: user,
    error,
    isLoading,
    refetch,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const currentToken = getStoredToken();
      console.log("Fetching user with token:", currentToken);
      if (!currentToken) {
        console.log("No token found, returning null");
        return null;
      }
      
      const res = await fetch("/api/user", {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });
      
      console.log("User fetch response status:", res.status);
      
      if (!res.ok) {
        if (res.status === 401) {
          console.log("Token invalid, clearing...");
          clearStoredToken();
          setToken(null);
          return null;
        }
        throw new Error("Failed to fetch user");
      }
      
      const userData = await res.json();
      console.log("User data received:", userData);
      return userData;
    },
    enabled: !!token,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      console.log("Login successful, received data:", data);
      if (data.token) {
        setStoredToken(data.token);
        setToken(data.token);
        console.log("Token stored in localStorage");
      } else {
        console.error("No token received in login response!");
      }
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.user.username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Registration failed");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      setStoredToken(data.token);
      setToken(data.token);
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Account created!",
        description: "Welcome to Pocket Bounty!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      clearStoredToken();
      setToken(null);
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      toast({
        title: "Logged out",
        description: "See you soon!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        token,
        isAuthenticated: !!token && !!user,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  
  // Debug logging
  console.log("Auth context state:", {
    isAuthenticated: context.isAuthenticated,
    user: context.user,
    token: context.token,
    isLoading: context.isLoading
  });
  
  return context;
}