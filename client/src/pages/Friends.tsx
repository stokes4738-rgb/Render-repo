import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuthJWT";
import type { Friendship, User } from "@shared/schema";

export default function Friends() {
  const [searchTerm, setSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [showUserSearch, setShowUserSearch] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const { data: friends = [], isLoading: friendsLoading } = useQuery<(Friendship & { friend: User })[]>({
    queryKey: ["/api/friends"],
  });

  const { data: friendRequests = [], isLoading: requestsLoading } = useQuery<(Friendship & { requester: User })[]>({
    queryKey: ["/api/friends/requests"],
  });

  const respondToRequestMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      return apiRequest("PATCH", `/api/friends/${requestId}`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Friend request updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
    },
    onError: (error) => {
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
      toast({
        title: "Error",
        description: "Failed to update friend request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getInitials = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.handle?.[1]?.toUpperCase() || "U";
  };

  const getDisplayName = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.handle || user.email || "Unknown User";
  };

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<User[]>({
    queryKey: [`/api/users/search?searchTerm=${userSearchTerm}`],
    enabled: userSearchTerm.length > 0 && showUserSearch,
  });

  const sendFriendRequestMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      return apiRequest("POST", "/api/friends/request", { addresseeId: recipientId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Friend request sent!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/search"] });
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
      toast({
        title: "Error",
        description: error.message || "Failed to send friend request",
        variant: "destructive",
      });
    },
  });

  const handleFindFriends = () => {
    setShowUserSearch(!showUserSearch);
    if (!showUserSearch) {
      setUserSearchTerm("");
    }
  };

  const filteredFriends = friends.filter((friendship) => {
    const name = getDisplayName(friendship.friend).toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  if (friendsLoading || requestsLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-6 bg-muted rounded w-24 animate-pulse"></div>
          <div className="h-8 bg-muted rounded w-24 animate-pulse"></div>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-2.5 animate-pulse">
            <div className="flex gap-2.5">
              <div className="w-9 h-9 bg-muted rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-24"></div>
                <div className="h-3 bg-muted rounded w-32"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Friends</h2>
        <Button 
          className="bg-pocket-red hover:bg-pocket-red-dark text-white"
          size="sm"
          onClick={handleFindFriends}
          data-testid="button-find-friends"
        >
          {showUserSearch ? "Close Search" : "Find Friends"}
        </Button>
      </div>

      {/* User Search */}
      {showUserSearch && (
        <Card className="theme-transition">
          <CardContent className="p-3.5">
            <h3 className="text-sm font-semibold mb-3">Find New Friends</h3>
            <div className="relative mb-3">
              <Input 
                placeholder="Search users by name or handle..." 
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-users"
              />
              <UserPlus className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            
            {userSearchTerm.length > 0 && (
              <div className="space-y-2">
                {searchLoading ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <div className="text-sm">Searching...</div>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <div className="text-sm">No users found</div>
                  </div>
                ) : (
                  searchResults
                    .filter((u: any) => u.id !== currentUser?.id)
                    .map((user: any) => (
                      <div 
                        key={user.id} 
                        className="flex gap-2.5 items-center p-2 border rounded-lg"
                        data-testid={`search-result-${user.id}`}
                      >
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-sm">
                          {getInitials(user)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {getDisplayName(user)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.handle} • Level {user.level || 1}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => sendFriendRequestMutation.mutate(user.id)}
                          disabled={sendFriendRequestMutation.isPending}
                          data-testid={`button-add-friend-${user.id}`}
                        >
                          Add Friend
                        </Button>
                      </div>
                    ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Friend Requests */}
      {friendRequests.length > 0 && (
        <Card className="theme-transition">
          <CardContent className="p-3.5">
            <h3 className="text-sm font-semibold mb-3">Friend Requests</h3>
            <div className="space-y-2.5">
              {friendRequests.map((request: any) => (
                <div 
                  key={request.id} 
                  className="flex gap-2.5 items-center"
                  data-testid={`friend-request-${request.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-sm">
                    {getInitials(request.requester)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm" data-testid="text-requester-name">
                      {getDisplayName(request.requester)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Sent you a friend request
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => respondToRequestMutation.mutate({ 
                        requestId: request.id, 
                        status: "accepted" 
                      })}
                      disabled={respondToRequestMutation.isPending}
                      className="bg-pocket-red hover:bg-pocket-red-dark text-white"
                      data-testid={`button-accept-${request.id}`}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => respondToRequestMutation.mutate({ 
                        requestId: request.id, 
                        status: "declined" 
                      })}
                      disabled={respondToRequestMutation.isPending}
                      data-testid={`button-decline-${request.id}`}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <div className="relative">
            <Input 
              placeholder="Search friends..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-friends"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Friends List */}
      <div className="space-y-2.5">
        {filteredFriends.length === 0 ? (
          <Card className="theme-transition">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-lg font-semibold mb-2">
                {friends.length === 0 ? "No friends yet" : "No friends found"}
              </h3>
              <div className="max-w-md mx-auto">
                {friends.length === 0 ? (
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      Building your network opens doors to better opportunities!
                    </p>
                    <div className="bg-muted/30 rounded-lg p-4 text-left">
                      <h4 className="font-medium text-sm mb-2">🤝 Friend benefits:</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Get tagged in bounties that match your weirdness</li>
                        <li>• Team up for bigger, weirder projects</li>
                        <li>• Learn creative money-making tricks</li>
                        <li>• Build your rep as the go-to person for [insert random skill]</li>
                      </ul>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      💡 Tip: Find people who do the same weird stuff you're good at
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Try a different search term.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredFriends.map((friendship: any) => (
            <Card 
              key={friendship.id} 
              className="theme-transition"
              data-testid={`friend-${friendship.id}`}
            >
              <CardContent className="p-2.5">
                <div className="flex gap-2.5 items-center">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-bold text-sm">
                    {getInitials(friendship.friend)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" data-testid="text-friend-name">
                      {getDisplayName(friendship.friend)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {friendship.friend.handle} • Level {friendship.friend.level || 1} • ⭐ {friendship.friend.rating || "0.0"}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Navigate to messages section and set up a thread with this friend
                      const event = new CustomEvent('navigate-to-messages', { 
                        detail: { userId: friendship.friend.id } 
                      });
                      window.dispatchEvent(event);
                    }}
                    data-testid={`button-message-${friendship.id}`}
                  >
                    Message
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Friend Recommendations */}
      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-3">Friend Recommendations</h3>
          <div className="text-center py-4 text-muted-foreground">
            <div className="text-2xl mb-2">🤖</div>
            <div className="text-sm">No recommendations available</div>
            <div className="text-xs">We'll suggest friends based on your activity</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
