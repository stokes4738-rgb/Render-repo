import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { navigateToLogin } from "@/lib/navigation";

const postBountySchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(255, "Title too long"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  category: z.string().min(1, "Please select a category"),
  reward: z.string().refine((val) => parseFloat(val) >= 5, "Minimum reward is $5"),
  tags: z.string().optional(),
  duration: z.string().min(1, "Please select a duration"),
  isRemote: z.boolean().default(true),
  locationAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  locationRadius: z.number().optional(),
});

type PostBountyForm = z.infer<typeof postBountySchema>;

export default function Post() {
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [showLocationFields, setShowLocationFields] = useState(false);

  // Show login prompt if not authenticated
  if (!isLoading && !user) {
    return (
      <div className="text-center space-y-4 mt-8">
        <div className="text-6xl">🔒</div>
        <h2 className="text-lg font-bold">Please Log In</h2>
        <p className="text-muted-foreground">You need to be logged in to post bounties.</p>
        <Button 
          onClick={() => navigateToLogin()}
          className="bg-pocket-red hover:bg-pocket-red-dark"
        >
          Log In to Post Bounties
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center space-y-4 mt-8">
        <div className="text-4xl">⏳</div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const form = useForm<PostBountyForm>({
    resolver: zodResolver(postBountySchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      reward: "5",
      tags: "",
      duration: "7",
      isRemote: true,
      locationAddress: "",
      city: "",
      state: "",
      locationRadius: 10,
    },
  });

  const postMutation = useMutation({
    mutationFn: async (data: PostBountyForm) => {
      const tags = data.tags ? data.tags.split(",").map(tag => tag.trim()).filter(Boolean) : [];
      return apiRequest("POST", "/api/bounties", {
        ...data,
        reward: parseFloat(data.reward),
        duration: parseInt(data.duration),
        tags,
      });
    },
    onSuccess: () => {
      toast({
        title: "Bounty Posted!",
        description: "Your bounty has been posted successfully.",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/bounties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
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
      
      // Parse error message from backend
      let errorMessage = "Failed to post bounty. Please try again.";
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = error.message;
      } else if (error && error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PostBountyForm) => {
    const reward = parseFloat(data.reward);
    
    if ((user?.points || 0) < 5) {
      toast({
        title: "Insufficient Points",
        description: "You need at least 5 points to post a bounty.",
        variant: "destructive",
      });
      return;
    }

    if ((parseFloat(user?.balance || "0")) < reward) {
      toast({
        title: "Insufficient Balance",
        description: `You need $${reward.toFixed(2)} in your account balance to post this bounty. Your current balance: $${parseFloat(user?.balance || "0").toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    postMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Post a New Bounty</h2>
      
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      Bounty Title
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="What do you need done?" 
                        {...field}
                        data-testid="input-bounty-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      Description
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the task in detail..." 
                        rows={4}
                        className="resize-none"
                        {...field}
                        data-testid="textarea-bounty-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        Value Range
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-bounty-category">
                            <SelectValue placeholder="Select value range" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="quick_cash">💵 Quick Cash ($5-15)</SelectItem>
                          <SelectItem value="good_money">💰 Good Money ($16-50)</SelectItem>
                          <SelectItem value="big_bucks">💎 Big Bucks ($51-100)</SelectItem>
                          <SelectItem value="major_bag">🏆 Major Bag ($100+)</SelectItem>
                          <SelectItem value="other">🎲 Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="reward"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        Reward Amount ($)
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="tel"
                          pattern="[0-9]*\.?[0-9]*"
                          placeholder="5.00"
                          {...field}
                          data-testid="input-bounty-reward"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      Tags (comma separated)
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="mobile, testing, feedback" 
                        {...field}
                        data-testid="input-bounty-tags"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      Duration
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-bounty-duration">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 day</SelectItem>
                        <SelectItem value="3">3 days</SelectItem>
                        <SelectItem value="7">1 week</SelectItem>
                        <SelectItem value="14">2 weeks</SelectItem>
                        <SelectItem value="30">1 month</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Location Type Toggle */}
              <FormField
                control={form.control}
                name="isRemote"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        <MapPin className="inline w-4 h-4 mr-2" />
                        Remote Work
                      </FormLabel>
                      <div className="text-xs text-muted-foreground">
                        Can this be done from anywhere?
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          setShowLocationFields(!checked);
                        }}
                        data-testid="switch-remote-work"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              {/* Location Fields (shown when not remote) */}
              {showLocationFields && (
                <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                  <FormField
                    control={form.control}
                    name="locationAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Location Address
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="123 Main St, or general area" 
                            {...field}
                            data-testid="input-location-address"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            City
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Dallas" 
                              {...field}
                              data-testid="input-city"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            State
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="TX" 
                              {...field}
                              data-testid="input-state"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="locationRadius"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Radius (miles)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="number"
                            min="1"
                            max="100"
                            placeholder="10" 
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                            data-testid="input-location-radius"
                          />
                        </FormControl>
                        <FormMessage />
                        <div className="text-xs text-muted-foreground">
                          How far from the location can workers be?
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Platform Fee Warning */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Platform Fee Notice</h3>
                </div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                  <p><strong>Pocket Bounty charges a platform fee:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>5%</strong> for bounties under $250</li>
                    <li><strong>3.5%</strong> for bounties $250 and over</li>
                  </ul>
                  <p className="mt-2">
                    <strong>Your bounty fee: {parseFloat(form.watch("reward") || "5") >= 250 ? "3.5%" : "5%"}</strong> 
                    (${((parseFloat(form.watch("reward") || "5")) * (parseFloat(form.watch("reward") || "5") >= 250 ? 0.035 : 0.05)).toFixed(2)})
                  </p>
                  <p className="text-xs mt-1">Fee is deducted only if bounty goes unclaimed after the selected duration and auto-refunds.</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Button 
                  type="submit" 
                  className="w-full bg-pocket-red hover:bg-pocket-red-dark text-white"
                  disabled={postMutation.isPending || (user?.points || 0) < 5 || (parseFloat(user?.balance || "0")) < parseFloat(form.watch("reward") || "5")}
                  data-testid="button-post-bounty"
                >
                  {postMutation.isPending ? "Posting..." : "Post Bounty"}
                </Button>
                <div className="text-xs text-muted-foreground text-center">
                  💰 Full amount held in escrow until completion
                </div>
                {(user?.points || 0) < 5 && (
                  <div className="text-xs text-destructive text-center">
                    You need at least 5 points to post a bounty
                  </div>
                )}
                {(parseFloat(user?.balance || "0")) < parseFloat(form.watch("reward") || "5") && (
                  <div className="text-xs text-destructive text-center">
                    Insufficient balance: Need ${parseFloat(form.watch("reward") || "5").toFixed(2)}, have ${parseFloat(user?.balance || "0").toFixed(2)}
                  </div>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
