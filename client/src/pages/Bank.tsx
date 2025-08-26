import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuthJWT";
import { useTransactions } from "@/hooks/useTransactions";
import { useDemo } from "@/contexts/DemoContext";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import DemoLockOverlay from "@/components/DemoLockOverlay";
import type { Transaction } from "@shared/schema";

export default function Bank() {
  const { user } = useAuth();
  const { isDemoMode } = useDemo();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [showDemoLock, setShowDemoLock] = useState(false);
  
  const { transactions, isLoading } = useTransactions();
  
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
          window.location.href = "/api/login";
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-3 animate-pulse">
              <div className="h-4 bg-muted rounded mb-2"></div>
              <div className="h-6 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="theme-transition">
          <CardContent className="p-3">
            <h3 className="text-xs text-muted-foreground font-semibold mb-1.5">
              Available Balance
            </h3>
            <div className="text-lg font-bold text-pocket-gold" data-testid="text-balance">
              {formatCurrency(user?.balance || "0")}
            </div>
          </CardContent>
        </Card>
        
        <Card className="theme-transition">
          <CardContent className="p-3">
            <h3 className="text-xs text-muted-foreground font-semibold mb-1.5">
              Lifetime Earned
            </h3>
            <div className="text-lg font-bold text-pocket-gold" data-testid="text-lifetime-earned">
              {formatCurrency(user?.lifetimeEarned || "0")}
            </div>
          </CardContent>
        </Card>
        
        <Card className="theme-transition">
          <CardContent className="p-3">
            <h3 className="text-xs text-muted-foreground font-semibold mb-1.5">
              Points
            </h3>
            <div className="text-lg font-bold text-pocket-gold" data-testid="text-points">
              {user?.points || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Recent Transactions</h3>
          {transactions.length === 0 ? (
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
                    <li>• Find bounties that sound fun (or hilariously weird)</li>
                    <li>• Jump in with a quick "I can do this!" message</li>
                    <li>• Do the thing and have some fun with it</li>
                    <li>• Money hits your account instantly! ⚡</li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  🎯 Mission: Get your first weird bounty and join the fun!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.slice(0, 5).map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="flex justify-between items-center"
                  data-testid={`transaction-${transaction.id}`}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {transaction.description}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(transaction.createdAt || new Date())}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${
                      transaction.type === "earning" ? "text-green-400" : "text-red-400"
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

      {/* Cash Out Section */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Cash Out</h3>
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
                  <SelectItem value="paypal">PayPal (Coming Soon)</SelectItem>
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
              Payouts are processed within 1-2 business days.
              <br />Bank transfers are free, instant debit has a small fee.
            </div>
          </form>
        </CardContent>
      </Card>
      
      {showDemoLock && (
        <DemoLockOverlay
          action="Withdraw money"
          onClose={() => setShowDemoLock(false)}
        />
      )}
    </div>
  );
}
