import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Star, Trophy, Clock, Edit2, Save, X, Camera, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { navigateToLogin } from "@/lib/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    handle: user?.handle || "",
    bio: user?.bio || "",
    skills: user?.skills || "",
    experience: user?.experience || "",
  });

  // Fetch user's posted bounties and their applications
  const { data: myBounties = [] } = useQuery<any[]>({
    queryKey: ["/api/user/bounties"],
    retry: false,
  });

  // Accept application mutation
  const acceptApplicationMutation = useMutation({
    mutationFn: async ({ applicationId }: { applicationId: string }) => {
      return apiRequest("PATCH", `/api/applications/${applicationId}`, { status: "accepted" });
    },
    onSuccess: () => {
      toast({
        title: "Application Accepted",
        description: "The applicant has been notified and can now start working on your bounty.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/bounties"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to accept application.",
        variant: "destructive",
      });
    },
  });

  // Reject application mutation
  const rejectApplicationMutation = useMutation({
    mutationFn: async ({ applicationId }: { applicationId: string }) => {
      return apiRequest("PATCH", `/api/applications/${applicationId}`, { status: "rejected" });
    },
    onSuccess: () => {
      toast({
        title: "Application Rejected",
        description: "The applicant has been notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/bounties"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject application.",
        variant: "destructive",
      });
    },
  });

  // Complete bounty mutation
  const completeBountyMutation = useMutation({
    mutationFn: async ({ bountyId, applicantId }: { bountyId: string, applicantId: string }) => {
      const response = await apiRequest("PATCH", `/api/bounties/${bountyId}/complete`, {
        completedBy: applicantId
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to complete bounty");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Bounty Completed! 💰",
        description: "Payment has been sent to the bounty hunter from your wallet balance.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/bounties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to complete bounty",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Remove bounty mutation
  const removeBountyMutation = useMutation({
    mutationFn: async ({ bountyId }: { bountyId: string }) => {
      const response = await apiRequest("DELETE", `/api/bounties/${bountyId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove bounty");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Bounty Removed 🗑️",
        description: "Your bounty has been removed and the full amount has been refunded to your balance.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/bounties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove bounty",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Account</h1>
        <Button onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? "Save" : "Edit Profile"}
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="bounties">My Bounties</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Profile Information</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Username</Label>
                    <div className="text-sm text-muted-foreground">{user.username}</div>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-pocket-gold">
                  ${parseFloat(user.balance || "0").toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Current Balance</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  ${parseFloat(user.lifetimeEarned || "0").toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Lifetime Earned</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {user.points || 0}
                </div>
                <div className="text-xs text-muted-foreground">Points</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {user.level || 1}
                </div>
                <div className="text-xs text-muted-foreground">Level</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {user.reviewCount || 0}
                </div>
                <div className="text-xs text-muted-foreground">Reviews</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bounties" className="space-y-6">
          {/* My Bounties Section */}
          <Card>
            <CardHeader>
              <CardTitle>My Posted Bounties</CardTitle>
            </CardHeader>
            <CardContent>
              {myBounties.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't posted any bounties yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myBounties.map((bounty: any) => (
                    <Card key={bounty.id} className="border border-border">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{bounty.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{bounty.description}</p>
                            <div className="flex items-center gap-4 mt-2">
                              <Badge variant="outline">{formatCurrency(parseFloat(bounty.reward))}</Badge>
                              <Badge variant={bounty.status === 'active' ? 'default' : 'secondary'}>
                                {bounty.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Posted {formatDate(new Date(bounty.createdAt))}
                              </span>
                            </div>
                          </div>
                          {bounty.status === 'active' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeBountyMutation.mutate({ bountyId: bounty.id })}
                              disabled={removeBountyMutation.isPending}
                              data-testid={`remove-bounty-${bounty.id}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Remove Post
                            </Button>
                          )}
                        </div>

                        {/* Applications */}
                        {bounty.applications && bounty.applications.length > 0 && (
                          <div className="border-t border-border pt-4">
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" />
                              Applications ({bounty.applications.length})
                            </h4>
                            <div className="space-y-3">
                              {bounty.applications.map((application: any) => (
                                <div
                                  key={application.id}
                                  className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium">{application.applicantUsername}</span>
                                      <Badge
                                        variant={
                                          application.status === 'accepted' 
                                            ? 'default' 
                                            : application.status === 'rejected' 
                                            ? 'destructive' 
                                            : 'secondary'
                                        }
                                      >
                                        {application.status}
                                      </Badge>
                                    </div>
                                    {application.message && (
                                      <p className="text-sm text-muted-foreground">{application.message}</p>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      Applied {formatDate(new Date(application.createdAt))}
                                    </span>
                                  </div>
                                  
                                  {application.status === 'pending' && (
                                    <div className="flex gap-2 ml-4">
                                      <Button
                                        size="sm"
                                        onClick={() => acceptApplicationMutation.mutate({ applicationId: application.id })}
                                        disabled={acceptApplicationMutation.isPending}
                                        className="bg-green-600 hover:bg-green-700"
                                        data-testid={`accept-application-${application.id}`}
                                      >
                                        <CheckCircle className="w-4 h-4 mr-1" />
                                        Accept
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => rejectApplicationMutation.mutate({ applicationId: application.id })}
                                        disabled={rejectApplicationMutation.isPending}
                                        data-testid={`reject-application-${application.id}`}
                                      >
                                        <XCircle className="w-4 h-4 mr-1" />
                                        Reject
                                      </Button>
                                    </div>
                                  )}
                                  
                                  {application.status === 'accepted' && bounty.status !== 'completed' && (
                                    <div className="flex gap-2 ml-4">
                                      <Button
                                        size="sm"
                                        onClick={() => completeBountyMutation.mutate({ 
                                          bountyId: bounty.id, 
                                          applicantId: application.applicantId 
                                        })}
                                        disabled={completeBountyMutation.isPending}
                                        className="bg-purple-600 hover:bg-purple-700"
                                        data-testid={`complete-bounty-${bounty.id}`}
                                      >
                                        <Trophy className="w-4 h-4 mr-1" />
                                        Mark Complete & Pay
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {bounty.applications && bounty.applications.length === 0 && (
                          <div className="border-t border-border pt-4">
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No applications yet. Share your bounty to get more visibility!
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}