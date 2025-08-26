import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Elements, useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useTransactions } from "@/hooks/useTransactions";
import { useDemo } from "@/contexts/DemoContext";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import DemoLockOverlay from "@/components/DemoLockOverlay";
import TwoFactorVerification from "@/components/TwoFactorVerification";
import { navigateToLogin } from "@/lib/navigation";
import { CreditCard, Plus, Trash2, Star, DollarSign, History, Shield, Lock, Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { Transaction } from "@shared/schema";

// Stripe setup
const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY ? 
  loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY) : null;

function AddPaymentMethodForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const setupIntentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/payments/setup-intent", {});
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to initialize card setup",
        variant: "destructive",
      });
    },
  });

  const saveMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      return apiRequest("POST", "/api/payments/save-method", { paymentMethodId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment method added successfully!",
      });
      onSuccess();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to save payment method",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);

    const response = await setupIntentMutation.mutateAsync();
    const clientSecret = (response as any).clientSecret;

    const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: {
        card: elements.getElement(CardElement)!,
      },
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (setupIntent?.payment_method) {
      await saveMethodMutation.mutateAsync(setupIntent.payment_method as string);
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border rounded-lg p-3 bg-background">
        <CardElement 
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>
      <Button 
        type="submit" 
        disabled={!stripe || isLoading}
        className="w-full"
        data-testid="button-save-card"
      >
        <Plus className="mr-2 h-4 w-4" />
        {isLoading ? "Processing..." : "Add Card"}
      </Button>
    </form>
  );
}

function DepositForm({ paymentMethods }: { paymentMethods: any[] }) {
  const [amount, setAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [showTwoFA, setShowTwoFA] = useState(false);
  const [pendingDeposit, setPendingDeposit] = useState<{amount: string, paymentMethodId: string} | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const depositMutation = useMutation({
    mutationFn: async (data: { amount: string; paymentMethodId: string; twoFactorCode?: string }) => {
      return apiRequest("POST", "/api/payments/deposit", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Deposit completed successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/transactions"] });
      setAmount("");
      setSelectedMethod("");
      setShowTwoFA(false);
      setPendingDeposit(null);
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      
      // Check if 2FA is required
      let errorData;
      try {
        errorData = JSON.parse(error.message.split(': ').slice(1).join(': '));
      } catch {
        errorData = { message: error.message };
      }
      
      if (errorData.requires2FA) {
        // Store the deposit data and show 2FA modal
        setPendingDeposit({ amount, paymentMethodId: selectedMethod });
        setShowTwoFA(true);
        return;
      }
      
      const errorMessage = errorData.message || "Failed to process deposit";
      toast({
        title: "Payment Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handle2FAVerification = async (code: string) => {
    if (!pendingDeposit) return;
    
    await depositMutation.mutateAsync({
      ...pendingDeposit,
      twoFactorCode: code
    });
  };

  const handle2FACancel = () => {
    setShowTwoFA(false);
    setPendingDeposit(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !selectedMethod) {
      toast({
        title: "Error",
        description: "Please select amount and payment method",
        variant: "destructive",
      });
      return;
    }

    const numAmount = parseFloat(amount);
    if (numAmount < 1 || numAmount > 1000) {
      toast({
        title: "Error",
        description: "Amount must be between $1 and $1000",
        variant: "destructive",
      });
      return;
    }

    depositMutation.mutate({ amount, paymentMethodId: selectedMethod });
  };

  if (showTwoFA) {
    return (
      <TwoFactorVerification
        onVerify={handle2FAVerification}
        onCancel={handle2FACancel}
        isVerifying={depositMutation.isPending}
        title="Security Verification Required"
        description={`Enter your 2FA code to complete the deposit of $${pendingDeposit?.amount || amount}.`}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="amount">Amount ($)</Label>
        <Input
          id="amount"
          type="tel"
          pattern="[0-9]*\.?[0-9]*"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount (e.g., 10.00)"
          data-testid="input-deposit-amount"
        />
      </div>
      <div>
        <Label htmlFor="payment-method">Payment Method</Label>
        <select
          id="payment-method"
          value={selectedMethod}
          onChange={(e) => setSelectedMethod(e.target.value)}
          className="w-full p-2 border rounded-lg"
          data-testid="select-payment-method"
        >
          <option value="">Select payment method</option>
          {paymentMethods.map((method) => (
            <option key={method.stripePaymentMethodId} value={method.stripePaymentMethodId}>
              {method.brand?.toUpperCase()} •••• {method.last4} {method.isDefault ? "(Default)" : ""}
            </option>
          ))}
        </select>
      </div>
      <Button 
        type="submit" 
        disabled={depositMutation.isPending}
        className="w-full bg-green-600 hover:bg-green-700"
        data-testid="button-deposit"
      >
        {depositMutation.isPending ? "Processing..." : "Deposit"}
      </Button>
    </form>
  );
}

export default function Account() {
  const [showAddCard, setShowAddCard] = useState(false);
  const [showDemoLock, setShowDemoLock] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  
  const { user } = useAuth();
  const { isDemoMode } = useDemo();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { paymentMethods, isLoading: methodsLoading } = usePaymentMethods();
  const { transactions, isLoading: transactionsLoading } = useTransactions();

  const { data: paymentHistory = [], isError: historyError } = useQuery<any[]>({
    queryKey: ["/api/payments/history"],
    retry: false,
    enabled: !!user, // Only fetch when user is authenticated
  });

  // Refetch payment methods when user changes
  useEffect(() => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/transactions"] });
    }
  }, [user, queryClient]);

  const handleWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      setShowDemoLock(true);
      return;
    }
    
    const amount = parseFloat(payoutAmount);
    if (amount < 5) {
      toast({
        title: "Invalid Amount",
        description: "Minimum withdrawal amount is $5.00",
        variant: "destructive",
      });
      return;
    }

    if (!payoutMethod) {
      toast({
        title: "Select Method",
        description: "Please select a payout method",
        variant: "destructive",
      });
      return;
    }

    withdrawalMutation.mutate({ amount: payoutAmount, method: payoutMethod });
  };

  const connectBankMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/payments/connect-bank");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.alreadyConnected) {
        toast({
          title: "Already Connected",
          description: "Your bank account is already connected!",
        });
      } else if (data.onboardingUrl) {
        // Redirect to Stripe Connect onboarding
        window.location.href = data.onboardingUrl;
      } else {
        toast({
          title: "Connection Started",
          description: data.message || "Please complete the bank account connection process.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to start bank account connection",
        variant: "destructive",
      });
    },
  });

  const handleConnectBank = () => {
    if (isDemoMode) {
      setShowDemoLock(true);
      return;
    }
    connectBankMutation.mutate();
  };

  const withdrawalMutation = useMutation({
    mutationFn: async (data: { amount: string; method: string }) => {
      return apiRequest("POST", "/api/payments/withdraw", data);
    },
    onSuccess: () => {
      toast({
        title: "Withdrawal Requested",
        description: "Your payout request has been submitted and will be processed within 1-2 business days.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/transactions"] });
      setPayoutAmount("");
      setPayoutMethod("");
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      
      let errorMessage = "Failed to request withdrawal";
      try {
        const errorData = JSON.parse(error.message.split(': ').slice(1).join(': '));
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = error.message || errorMessage;
      }
      
      toast({
        title: "Withdrawal Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      return apiRequest("POST", "/api/payments/set-default", { paymentMethodId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Default payment method updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/methods"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update default payment method",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/payments/methods/${id}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment method removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/methods"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to remove payment method",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-pocket-gold" />
        <h1 className="text-2xl font-bold">Account</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="theme-transition">
          <CardContent className="p-3">
            <h3 className="text-xs text-muted-foreground font-semibold mb-1.5">
              Available Balance
            </h3>
            <div className="text-lg font-bold text-pocket-gold" data-testid="text-balance">
              {user ? formatCurrency(user.balance || "0") : "$0.00"}
            </div>
          </CardContent>
        </Card>
        
        <Card className="theme-transition">
          <CardContent className="p-3">
            <h3 className="text-xs text-muted-foreground font-semibold mb-1.5">
              Lifetime Earned
            </h3>
            <div className="text-lg font-bold text-pocket-gold" data-testid="text-lifetime-earned">
              {user ? formatCurrency(user.lifetimeEarned || "0") : "$0.00"}
            </div>
          </CardContent>
        </Card>
        
        <Card className="theme-transition">
          <CardContent className="p-3">
            <h3 className="text-xs text-muted-foreground font-semibold mb-1.5">
              Points
            </h3>
            <div className="text-lg font-bold text-pocket-gold" data-testid="text-points">
              {user ? (user.points || 0) : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card className="theme-transition">
            <CardContent className="p-3.5">
              <h3 className="text-sm font-semibold mb-3">Recent Transactions</h3>
              {transactionsLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading transactions...</p>
                </div>
              ) : !user ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Please log in to view your transactions</p>
                  <Button 
                    onClick={() => navigateToLogin()}
                    className="mt-4"
                  >
                    Log In
                  </Button>
                </div>
              ) : (transactions as Transaction[]).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-4xl mb-4">💎</div>
                  <h3 className="text-lg font-semibold mb-3 text-foreground">Your earning journey starts here!</h3>
                  <div className="max-w-md mx-auto space-y-4">
                    <p className="text-muted-foreground">
                      All your earnings and withdrawals will be tracked here.
                    </p>
                    <div className="bg-muted/30 rounded-lg p-4 text-left">
                      <h4 className="font-medium text-sm mb-2">💡 How to start earning:</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Find bounties that sound fun</li>
                        <li>• Jump in with a quick "I can do this!" message</li>
                        <li>• Complete the task</li>
                        <li>• Money hits your account instantly! ⚡</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {(transactions as Transaction[]).slice(0, 10).map((transaction: Transaction) => (
                    <div 
                      key={transaction.id} 
                      className="flex justify-between items-center py-2 border-b last:border-0"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {transaction.type === "earning" ? (
                          <ArrowDownLeft className="h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-red-500" />
                        )}
                        <div>
                          <div className="text-sm font-medium">
                            {transaction.description}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(transaction.createdAt || new Date())}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${
                          transaction.type === "earning" ? "text-green-500" : "text-red-500"
                        }`}>
                          {transaction.type === "earning" ? "+" : "-"}
                          {formatCurrency(transaction.amount)}
                        </div>
                        <Badge 
                          variant={transaction.status === "completed" ? "default" : "secondary"}
                          className={transaction.status === "completed" 
                            ? "bg-pocket-gold text-gray-900" 
                            : "bg-orange-500 text-white"
                          }
                        >
                          {(transaction.status || 'pending').toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deposit Tab */}
        <TabsContent value="deposit" className="space-y-4">
          <Card className="theme-transition">
            <CardHeader>
              <CardTitle className="text-lg">Add Funds</CardTitle>
            </CardHeader>
            <CardContent>
              {!stripePromise ? (
                <div className="text-center py-4">
                  <Shield className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-sm text-muted-foreground">
                    Payment system in test mode
                  </p>
                </div>
              ) : paymentMethods.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    {methodsLoading ? "Loading payment methods..." : "Add a payment method to deposit funds"}
                  </p>
                  {!methodsLoading && (
                    <Button 
                      onClick={() => setActiveTab("cards")}
                      className="bg-pocket-red hover:bg-pocket-red-dark"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Payment Method
                    </Button>
                  )}
                </div>
              ) : (
                <DepositForm paymentMethods={paymentMethods} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Withdraw Tab */}
        <TabsContent value="withdraw" className="space-y-4">
          <Card className="theme-transition">
            <CardHeader>
              <CardTitle className="text-lg">Cash Out</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Bank Connection Status */}
              <div className={`mb-4 p-3 rounded-lg border ${
                (user as any)?.stripeConnectStatus === 'connected' 
                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                  : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className={`text-sm font-semibold ${
                      (user as any)?.stripeConnectStatus === 'connected'
                        ? 'text-green-900 dark:text-green-100'
                        : 'text-blue-900 dark:text-blue-100'
                    }`}>
                      Bank Account Connection
                    </h4>
                    <p className={`text-xs mt-1 ${
                      (user as any)?.stripeConnectStatus === 'connected'
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-blue-700 dark:text-blue-300'
                    }`}>
                      {(user as any)?.stripeConnectStatus === 'connected'
                        ? '✓ Your bank account is connected and ready for payouts'
                        : 'Connect your bank account to receive instant payouts'}
                    </p>
                  </div>
                  {(user as any)?.stripeConnectStatus !== 'connected' && (
                    <Button
                      onClick={handleConnectBank}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={connectBankMutation.isPending}
                    >
                      {connectBankMutation.isPending ? "Connecting..." : "Connect Bank"}
                    </Button>
                  )}
                </div>
              </div>
              
              <form onSubmit={handleWithdrawal} className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">
                    Payment Method
                  </Label>
                  <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                    <SelectTrigger data-testid="select-payment-method">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="debit_card">Instant Debit Card</SelectItem>
                      <SelectItem value="cash_app">Cash App</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">
                    Amount (Min: $5.00)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input 
                      type="tel"
                      pattern="[0-9]*\.?[0-9]*"
                      placeholder="5.00" 
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      className="pl-8"
                      data-testid="input-payout-amount"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Available: {formatCurrency(user?.balance || "0")}
                  </div>
                </div>
                
                <Button 
                  type="submit"
                  className="w-full bg-pocket-red hover:bg-pocket-red-dark text-white"
                  disabled={withdrawalMutation.isPending || !payoutMethod || !payoutAmount}
                  data-testid="button-request-payout"
                >
                  {withdrawalMutation.isPending ? "Processing..." : "Request Payout"}
                </Button>
                
                <div className="text-xs text-muted-foreground text-center">
                  Payouts are processed within 1-2 business days
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cards Tab */}
        <TabsContent value="cards" className="space-y-4">
          <Card className="theme-transition">
            <CardHeader>
              <CardTitle className="text-lg">Payment Methods</CardTitle>
            </CardHeader>
            <CardContent>
              {!stripePromise ? (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 mx-auto mb-3 text-blue-500" />
                  <h3 className="text-lg font-semibold mb-2">Test Mode Active</h3>
                  <p className="text-sm text-muted-foreground">
                    Payment system running in test mode
                  </p>
                </div>
              ) : (
                <Elements stripe={stripePromise}>
                  <div className="space-y-4">
                    {/* Saved Payment Methods */}
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Your Saved Cards ({paymentMethods.length})
                      </h3>
                    </div>
                    
                    {/* Existing Payment Methods */}
                    {methodsLoading ? (
                      <div className="text-center py-4">
                        <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading your saved cards...</p>
                      </div>
                    ) : paymentMethods.length > 0 ? (
                      <div className="space-y-3">
                        {paymentMethods.map((method) => (
                          <div 
                            key={method.id} 
                            className="flex items-center justify-between p-3 border rounded-lg"
                            data-testid={`payment-method-${method.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <CreditCard className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <div className="font-medium">
                                  {method.brand?.toUpperCase()} •••• {method.last4}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Expires {method.expiryMonth}/{method.expiryYear}
                                </div>
                              </div>
                              {method.isDefault && (
                                <Badge className="bg-pocket-gold text-gray-900">Default</Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {!method.isDefault && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDefaultMutation.mutate(method.stripePaymentMethodId)}
                                  disabled={setDefaultMutation.isPending}
                                  data-testid={`button-set-default-${method.id}`}
                                >
                                  Set Default
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteMutation.mutate(method.id)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-${method.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        No payment methods added yet
                      </div>
                    )}

                    {/* Add New Card Form */}
                    {showAddCard ? (
                      <div className="border-t pt-4">
                        <AddPaymentMethodForm 
                          onSuccess={() => {
                            setShowAddCard(false);
                            queryClient.invalidateQueries({ queryKey: ["/api/payments/methods"] });
                          }}
                        />
                        <Button
                          variant="ghost"
                          className="w-full mt-2"
                          onClick={() => setShowAddCard(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => {
                          if (isDemoMode) {
                            setShowDemoLock(true);
                          } else {
                            setShowAddCard(true);
                          }
                        }}
                        data-testid="button-add-payment-method"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Payment Method
                      </Button>
                    )}
                  </div>
                </Elements>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showDemoLock && (
        <DemoLockOverlay
          action="Manage payment methods"
          onClose={() => setShowDemoLock(false)}
        />
      )}
    </div>
  );
}