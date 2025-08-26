import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<LoginForm | RegisterForm>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema),
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const response = await apiRequest("POST", "/api/login", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Welcome back!",
        description: "You've successfully logged in to Pocket Bounty.",
      });
      // Invalidate and refetch user data
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      // Handle navigation for both web and mobile
      if (Capacitor.isNativePlatform()) {
        // For mobile apps, use window.location to avoid routing issues
        window.location.href = "/";
      } else {
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      const response = await apiRequest("POST", "/api/register", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Registration failed");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Welcome to Pocket Bounty!",
        description: "Your account has been created successfully. You got 50 welcome bonus points!",
      });
      // Invalidate and refetch user data
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      // Handle navigation for both web and mobile
      if (Capacitor.isNativePlatform()) {
        // For mobile apps, use window.location to avoid routing issues
        window.location.href = "/";
      } else {
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginForm | RegisterForm) => {
    if (isLogin) {
      loginMutation.mutate(data as LoginForm);
    } else {
      registerMutation.mutate(data as RegisterForm);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    reset();
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 lg:mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Pocket Bounty
            </h1>
            <p className="text-blue-200 text-sm sm:text-base">
              Where weird meets wallet-friendly
            </p>
          </div>

          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl sm:text-2xl text-white">
                {isLogin ? "Welcome Back!" : "Join the Chaos!"}
              </CardTitle>
              <p className="text-blue-200 text-sm">
                {isLogin ? "Sign in to your account" : "Create your account and start earning"}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
                {!isLogin && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName" className="text-white">
                        First Name
                      </Label>
                      <Input
                        id="firstName"
                        type="text"
                        {...registerField("firstName")}
                        className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                        placeholder="John"
                        data-testid="input-first-name"
                      />
                      {!isLogin && (errors as any).firstName && (
                        <p className="text-red-300 text-sm mt-1">
                          {(errors as any).firstName.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="lastName" className="text-white">
                        Last Name
                      </Label>
                      <Input
                        id="lastName"
                        type="text"
                        {...registerField("lastName")}
                        className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                        placeholder="Doe"
                        data-testid="input-last-name"
                      />
                      {!isLogin && (errors as any).lastName && (
                        <p className="text-red-300 text-sm mt-1">
                          {(errors as any).lastName.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="username" className="text-white">
                    Username
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    {...registerField("username")}
                    className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                    placeholder={isLogin ? "Enter your username" : "Choose a unique username"}
                    data-testid="input-username"
                    autoComplete="username"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    style={{ fontSize: '16px', WebkitUserSelect: 'text', userSelect: 'text' }}
                    onTouchStart={(e) => {
                      e.currentTarget.focus();
                      e.currentTarget.click();
                    }}
                    onFocus={(e) => {
                      setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
                    }}
                  />
                  {errors.username && (
                    <p className="text-red-300 text-sm mt-1">
                      {errors.username.message}
                    </p>
                  )}
                </div>

                {!isLogin && (
                  <div>
                    <Label htmlFor="email" className="text-white">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      {...registerField("email")}
                      className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                      placeholder="john@example.com"
                      data-testid="input-email"
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      style={{ fontSize: '16px', WebkitUserSelect: 'text', userSelect: 'text' }}
                      onTouchStart={(e) => {
                        e.currentTarget.focus();
                        e.currentTarget.click();
                      }}
                      onFocus={(e) => {
                        setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
                      }}
                    />
                    {!isLogin && (errors as any).email && (
                      <p className="text-red-300 text-sm mt-1">
                        {(errors as any).email.message}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <Label htmlFor="password" className="text-white">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    {...registerField("password")}
                    className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                    placeholder={isLogin ? "Enter your password" : "Choose a secure password"}
                    data-testid="input-password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    style={{ fontSize: '16px', WebkitUserSelect: 'text', userSelect: 'text' }}
                    onTouchStart={(e) => {
                      e.currentTarget.focus();
                      e.currentTarget.click();
                    }}
                    onFocus={(e) => {
                      setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
                    }}
                  />
                  {errors.password && (
                    <p className="text-red-300 text-sm mt-1">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-pocket-red hover:bg-pocket-red-dark text-white"
                  disabled={isPending}
                  data-testid={isLogin ? "button-login" : "button-register"}
                >
                  {isPending 
                    ? (isLogin ? "Signing in..." : "Creating Account...")
                    : (isLogin ? "Sign In" : "Create Account")
                  }
                </Button>
              </form>

              <div className="mt-4 sm:mt-6 text-center">
                <p className="text-blue-200 text-sm">
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                  <button
                    onClick={toggleMode}
                    className="text-pocket-gold hover:underline font-medium"
                    data-testid={isLogin ? "button-show-register" : "button-show-login"}
                  >
                    {isLogin ? "Create one here" : "Sign in here"}
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Right Side - Hero Section - Hidden on mobile */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-indigo-900 to-purple-900 items-center justify-center p-8">
        <div className="text-center text-white max-w-lg">
          <div className="text-6xl mb-6">🤪</div>
          <h2 className="text-3xl font-bold mb-4">
            Get Paid for Being Weird
          </h2>
          <p className="text-xl text-blue-200 mb-8">
            From rating outfits to naming pet rocks, turn your quirky skills into cold hard cash.
          </p>
          
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">$10K+</div>
              <div className="text-sm text-blue-200">Paid Out</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">500+</div>
              <div className="text-sm text-blue-200">Active Users</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">4.9★</div>
              <div className="text-sm text-blue-200">Rating</div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-white/10 rounded-lg">
            <h4 className="font-semibold mb-2">💡 Real bounties that exist:</h4>
            <ul className="text-sm text-blue-200 space-y-1">
              <li>• "Rate my outfit for a first date 👗 - $8"</li>
              <li>• "Help me name my pet rock 🪨 - $12"</li>
              <li>• "Tell me if this meme is funny 😂 - $5"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}