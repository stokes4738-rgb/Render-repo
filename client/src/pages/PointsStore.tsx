import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuthJWT";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { ShoppingCart, Star, Zap, Crown, Gem } from "lucide-react";

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface PointPackage {
  id: string;
  points: number;
  price: number;
  label: string;
  popular?: boolean;
}

interface PurchaseResponse {
  clientSecret: string;
  package: PointPackage;
}

const PackageIcon = ({ packageId }: { packageId: string }) => {
  const iconProps = { className: "h-6 w-6" };
  
  switch (packageId) {
    case "test":
      return <Star {...iconProps} className="h-6 w-6 text-gray-500" />;
    case "starter":
      return <Star {...iconProps} className="h-6 w-6 text-yellow-500" />;
    case "basic":
      return <Zap {...iconProps} className="h-6 w-6 text-blue-500" />;
    case "popular":
      return <Crown {...iconProps} className="h-6 w-6 text-purple-500" />;
    case "premium":
      return <Gem {...iconProps} className="h-6 w-6 text-green-500" />;
    case "mega":
      return <Crown {...iconProps} className="h-6 w-6 text-orange-500" />;
    case "ultimate":
      return <Gem {...iconProps} className="h-6 w-6 text-red-500" />;
    case "supreme":
      return <Crown {...iconProps} className="h-6 w-6 text-gold-500" />;
    default:
      return <Star {...iconProps} />;
  }
};

const CheckoutForm = ({ selectedPackage, onSuccess, onCancel }: { 
  selectedPackage: PointPackage;
  onSuccess: () => void;
  onCancel: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const confirmPurchaseMutation = useMutation({
    mutationFn: async (paymentIntentId: string) => {
      const response = await apiRequest("POST", "/api/points/confirm-purchase", { paymentIntentId });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Purchase Successful! 🎉",
        description: data.message || "Points added successfully!",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to complete purchase",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment succeeded, confirm the purchase on our backend
        console.log("Payment succeeded, attempting confirmation...");
        console.log("Payment Intent ID:", paymentIntent.id);
        confirmPurchaseMutation.mutate(paymentIntent.id);
      } else {
        console.log("Payment status:", paymentIntent?.status);
      }
    } catch (err: any) {
      toast({
        title: "Payment Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageIcon packageId={selectedPackage.id} />
          Complete Purchase
        </CardTitle>
        <div className="text-center">
          <div className="text-2xl font-bold text-pocket-gold">
            {selectedPackage.points} ⭐ Points
          </div>
          <div className="text-lg text-muted-foreground">
            ${selectedPackage.price.toFixed(2)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <PaymentElement />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={isProcessing}
              data-testid="button-cancel-purchase"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-pocket-red hover:bg-pocket-red-dark text-white"
              disabled={!stripe || isProcessing || confirmPurchaseMutation.isPending}
              data-testid="button-complete-purchase"
            >
              {isProcessing || confirmPurchaseMutation.isPending ? "Processing..." : `Pay $${selectedPackage.price.toFixed(2)}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default function PointsStore() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPackage, setSelectedPackage] = useState<PointPackage | null>(null);
  const [purchaseData, setPurchaseData] = useState<PurchaseResponse | null>(null);

  const { data: packages, isLoading } = useQuery<PointPackage[]>({
    queryKey: ["/api/points/packages"],
    enabled: !!user,
  });

  const purchaseMutation = useMutation<PurchaseResponse, Error, string>({
    mutationFn: async (packageId: string) => {
      const response = await apiRequest("POST", "/api/points/purchase", { packageId });
      return response.json();
    },
    onSuccess: (data: PurchaseResponse) => {
      setPurchaseData(data);
    },
    onError: (error: any) => {
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to initiate purchase",
        variant: "destructive",
      });
      setSelectedPackage(null);
    }
  });

  const handlePurchaseClick = (pkg: PointPackage) => {
    setSelectedPackage(pkg);
    purchaseMutation.mutate(pkg.id);
  };

  const handlePurchaseSuccess = () => {
    setSelectedPackage(null);
    setPurchaseData(null);
  };

  const handlePurchaseCancel = () => {
    setSelectedPackage(null);
    setPurchaseData(null);
  };

  if (!user) {
    return (
      <div className="text-center text-muted-foreground mt-8">
        Please log in to purchase points
      </div>
    );
  }

  // Show checkout form if we have purchase data
  if (selectedPackage && purchaseData) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-pocket-gold mb-2">⭐ Points Store</h1>
          <p className="text-muted-foreground">Complete your purchase</p>
        </div>
        
        <Elements stripe={stripePromise} options={{ clientSecret: purchaseData.clientSecret }}>
          <CheckoutForm 
            selectedPackage={selectedPackage}
            onSuccess={handlePurchaseSuccess}
            onCancel={handlePurchaseCancel}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-pocket-gold mb-2">⭐ Points Store</h1>
        <p className="text-muted-foreground">
          Buy points to post more bounties and unlock features!
        </p>
        <div className="mt-2">
          <span className="text-sm text-muted-foreground">Current balance: </span>
          <span className="font-semibold text-pocket-gold">{user.points || 0} ⭐</span>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground">Loading packages...</div>
      ) : packages ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <Card 
              key={pkg.id} 
              className={`relative theme-transition ${
                pkg.popular 
                  ? "border-pocket-red ring-2 ring-pocket-red/20" 
                  : "hover:border-pocket-gold/50"
              }`}
              data-testid={`package-${pkg.id}`}
            >
              {pkg.popular && (
                <Badge 
                  className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-pocket-red text-white"
                >
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <PackageIcon packageId={pkg.id} />
                </div>
                <CardTitle className="text-lg">{pkg.label}</CardTitle>
                <div className="space-y-1">
                  <div className="text-3xl font-bold text-pocket-gold">
                    {pkg.points} ⭐
                  </div>
                  <div className="text-2xl font-semibold">
                    ${pkg.price.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${(pkg.price / pkg.points).toFixed(3)} per point
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <Button
                  className="w-full bg-pocket-red hover:bg-pocket-red-dark text-white"
                  onClick={() => handlePurchaseClick(pkg)}
                  disabled={purchaseMutation.isPending}
                  data-testid={`button-buy-${pkg.id}`}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {purchaseMutation.isPending && selectedPackage?.id === pkg.id 
                    ? "Processing..." 
                    : "Buy Now"
                  }
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground">Failed to load packages</div>
      )}

      {/* Info Section */}
      <Card className="theme-transition border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-800 dark:text-blue-200 flex items-center gap-2">
            <Star className="h-5 w-5" />
            How Points Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-semibold">Post Bounties:</span>
              <span>Use 5 points to post any bounty</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">Earn More:</span>
              <span>Play Flappy Bird or refer friends</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">Safe & Secure:</span>
              <span>Payments processed securely by Stripe</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
            💡 Points never expire and can be used anytime. Bigger packages offer better value per point!
          </div>
        </CardContent>
      </Card>
    </div>
  );
}