import { useState, useEffect } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Input } from "@/components/ui/input";
import Tutorial from "@/components/Tutorial";
import { useAuth } from "@/hooks/useAuthJWT";

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
  dateOfBirth: z.string().min(1, "Date of birth is required").refine((date) => {
    const birthDate = new Date(date);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;
    return actualAge >= 16;
  }, {
    message: "You must be at least 16 years old to use this platform"
  }),
  parentalConsent: z.boolean().optional(),
  parentEmail: z.string().email("Valid parent email required").optional(),
  parentName: z.string().min(1, "Parent name required").optional(),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { loginMutation, registerMutation, isAuthenticated } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  
  // Direct state management instead of react-hook-form to avoid iOS issues
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    parentalConsent: false,
    parentEmail: '',
    parentName: ''
  });
  
  const [userAge, setUserAge] = useState<number | null>(null);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showTutorial, setShowTutorial] = useState(false);

  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    // Calculate age when date of birth changes
    if (field === 'dateOfBirth' && typeof value === 'string') {
      if (value) {
        const birthDate = new Date(value);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;
        setUserAge(actualAge);
      } else {
        setUserAge(null);
      }
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  // Login/register success handlers are now in the auth hook
  useEffect(() => {
    if (loginMutation.isSuccess || registerMutation.isSuccess) {
      setTimeout(() => {
        setLocation("/");
      }, 100);
    }
  }, [loginMutation.isSuccess, registerMutation.isSuccess, setLocation]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    }
    
    if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    
    if (!isLogin) {
      if (!formData.email || !formData.email.includes('@')) {
        newErrors.email = "Invalid email address";
      }
      if (!formData.firstName) {
        newErrors.firstName = "First name is required";
      }
      if (!formData.lastName) {
        newErrors.lastName = "Last name is required";
      }
      if (!formData.dateOfBirth) {
        newErrors.dateOfBirth = "Date of birth is required";
      } else {
        // Age validation
        const birthDate = new Date(formData.dateOfBirth);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;
        if (actualAge < 16) {
          newErrors.dateOfBirth = "You must be at least 16 years old to use this platform";
        } else if (actualAge >= 16 && actualAge < 18) {
          // Users 16-17 need parental consent
          if (!formData.parentalConsent) {
            newErrors.parentalConsent = "Parental consent required for users under 18";
          }
          if (!formData.parentEmail) {
            newErrors.parentEmail = "Parent email required for users under 18";
          }
          if (!formData.parentName) {
            newErrors.parentName = "Parent name required for users under 18";
          }
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Form submitted with data:', formData);
    
    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }
    
    if (isLogin) {
      console.log('Attempting login...');
      loginMutation.mutate({
        username: formData.username,
        password: formData.password
      } as any);
    } else {
      console.log('Attempting registration...');
      registerMutation.mutate({
        username: formData.username,
        password: formData.password,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        dateOfBirth: formData.dateOfBirth,
        parentalConsent: formData.parentalConsent,
        parentEmail: formData.parentEmail,
        parentName: formData.parentName
      } as any);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormData({
      username: '',
      password: '',
      email: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      parentalConsent: false,
      parentEmail: '',
      parentName: ''
    });
    setErrors({});
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
              <form 
                onSubmit={onSubmit} 
                className="space-y-3 sm:space-y-4"
              >
                {!isLogin && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName" className="text-white">
                        First Name
                      </Label>
                      <Input
                        id="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                        placeholder="John"
                      />
                      {errors.firstName && (
                        <p className="text-red-300 text-sm mt-1">
                          {errors.firstName}
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
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                        placeholder="Doe"
                      />
                      {errors.lastName && (
                        <p className="text-red-300 text-sm mt-1">
                          {errors.lastName}
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
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                    placeholder={isLogin ? "Enter your username" : "Choose a unique username"}
                    autoComplete="username"
                  />
                  {errors.username && (
                    <p className="text-red-300 text-sm mt-1">
                      {errors.username}
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
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                      placeholder="john@example.com"
                      autoComplete="email"
                    />
                    {errors.email && (
                      <p className="text-red-300 text-sm mt-1">
                        {errors.email}
                      </p>
                    )}
                  </div>
                )}

                {!isLogin && (
                  <div>
                    <Label htmlFor="dateOfBirth" className="text-white">
                      Date of Birth <span className="text-red-300">*</span>
                    </Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => updateField('dateOfBirth', e.target.value)}
                      className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 13)).toISOString().split('T')[0]} // Max age 13 years
                    />
                    {errors.dateOfBirth && (
                      <p className="text-red-300 text-sm mt-1">
                        {errors.dateOfBirth}
                      </p>
                    )}
                    <p className="text-blue-200 text-xs mt-1">
                      Must be at least 16 years old to create an account
                    </p>
                    {userAge !== null && userAge >= 16 && userAge < 18 && (
                      <p className="text-yellow-200 text-xs mt-1 font-medium">
                        ⚠️ Users 16-17 require parental approval to use this platform
                      </p>
                    )}
                  </div>
                )}

                {/* Parental Consent Section for 16-17 year olds */}
                {!isLogin && userAge !== null && userAge >= 16 && userAge < 18 && (
                  <div className="bg-yellow-50/10 border border-yellow-300/30 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-yellow-900 text-xs font-bold">!</span>
                      </div>
                      <h3 className="text-yellow-200 font-semibold text-sm">Parental Approval Required</h3>
                    </div>
                    
                    <p className="text-yellow-200 text-xs mb-3">
                      Since you're under 18, we need a parent or guardian's permission and contact information.
                    </p>

                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <Label htmlFor="parentName" className="text-yellow-100">
                          Parent/Guardian Full Name <span className="text-red-300">*</span>
                        </Label>
                        <Input
                          id="parentName"
                          type="text"
                          value={formData.parentName}
                          onChange={(e) => updateField('parentName', e.target.value)}
                          className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                          placeholder="Parent or Guardian Full Name"
                        />
                        {errors.parentName && (
                          <p className="text-red-300 text-sm mt-1">
                            {errors.parentName}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="parentEmail" className="text-yellow-100">
                          Parent/Guardian Email <span className="text-red-300">*</span>
                        </Label>
                        <Input
                          id="parentEmail"
                          type="email"
                          value={formData.parentEmail}
                          onChange={(e) => updateField('parentEmail', e.target.value)}
                          className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                          placeholder="parent@example.com"
                        />
                        {errors.parentEmail && (
                          <p className="text-red-300 text-sm mt-1">
                            {errors.parentEmail}
                          </p>
                        )}
                        <p className="text-yellow-200 text-xs mt-1">
                          We'll send a verification email to confirm parental consent
                        </p>
                      </div>

                      <div className="flex items-start space-x-2 mt-3">
                        <input
                          type="checkbox"
                          id="parentalConsent"
                          checked={formData.parentalConsent}
                          onChange={(e) => updateField('parentalConsent', e.target.checked)}
                          className="mt-1 w-4 h-4 text-yellow-500 bg-white/20 border-white/30 rounded focus:ring-yellow-500"
                        />
                        <div>
                          <Label htmlFor="parentalConsent" className="text-yellow-100 text-sm cursor-pointer">
                            I confirm that my parent/guardian has given permission for me to create an account on this platform <span className="text-red-300">*</span>
                          </Label>
                          {errors.parentalConsent && (
                            <p className="text-red-300 text-sm mt-1">
                              {errors.parentalConsent}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="password" className="text-white">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="bg-white/20 border-white/30 text-white placeholder:text-gray-300"
                    placeholder={isLogin ? "Enter your password" : "Choose a secure password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                  />
                  {errors.password && (
                    <p className="text-red-300 text-sm mt-1">
                      {errors.password}
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

              <div className="mt-4 sm:mt-6 text-center space-y-3">
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
                
                <div className="border-t border-white/20 pt-3">
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="text-pocket-gold hover:text-white transition-colors text-sm font-medium flex items-center justify-center gap-2 mx-auto"
                    data-testid="button-show-tutorial"
                  >
                    📚 How Pocket Bounty Works - Complete Guide
                  </button>
                  <p className="text-blue-200/70 text-xs mt-1">
                    Learn all features before signing up
                  </p>
                </div>
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
      
      {/* Tutorial Modal */}
      {showTutorial && (
        <Tutorial onClose={() => setShowTutorial(false)} />
      )}
    </div>
  );
}