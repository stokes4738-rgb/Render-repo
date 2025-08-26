import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuthJWT";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/utils";

export default function Messages() {
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: threads = [], isLoading: threadsLoading } = useQuery({
    queryKey: ["/api/messages/threads"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/messages/threads", selectedThread?.id],
    enabled: !!selectedThread?.id,
  });

  // WebSocket for real-time messages
  useWebSocket({
    onMessage: (data) => {
      if (data.type === "new_message") {
        queryClient.invalidateQueries({ queryKey: ["/api/messages/threads"] });
        if (selectedThread?.id === data.threadId) {
          queryClient.invalidateQueries({ 
            queryKey: ["/api/messages/threads", selectedThread.id] 
          });
        }
      }
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", "/api/messages", {
        threadId: selectedThread.id,
        content,
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ 
        queryKey: ["/api/messages/threads", selectedThread.id] 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/threads"] });
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
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    sendMessageMutation.mutate(messageText.trim());
  };

  if (threadsLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-6 bg-muted rounded w-32 animate-pulse"></div>
          <div className="h-8 bg-muted rounded w-16 animate-pulse"></div>
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

  if (selectedThread) {
    return (
      <div className="space-y-4">
        {/* Chat Header */}
        <Card className="theme-transition">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedThread(null)}
              data-testid="button-back-to-threads"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-sm">
              {selectedThread.otherUser.firstName?.[0] || selectedThread.otherUser.handle?.[1] || "U"}
            </div>
            <div className="font-semibold text-sm" data-testid="text-chat-user-name">
              {selectedThread.otherUser.firstName || selectedThread.otherUser.handle}
            </div>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card className="theme-transition">
          <CardContent className="p-3.5">
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {messagesLoading ? (
                <div className="text-center py-4">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-2xl mb-2">💬</div>
                  <div className="text-sm">No messages yet</div>
                  <div className="text-xs">Start the conversation!</div>
                </div>
              ) : (
                messages.map((message: any) => {
                  const isMe = message.senderId === user?.id;
                  return (
                    <div 
                      key={message.id}
                      className={`max-w-4/5 ${isMe ? "ml-auto" : ""}`}
                      data-testid={`message-${message.id}`}
                    >
                      <div className={`p-2.5 rounded-xl text-sm ${
                        isMe 
                          ? "bg-secondary text-right" 
                          : "bg-accent"
                      }`}>
                        {message.content}
                      </div>
                      <div className={`text-xs text-muted-foreground mt-1 ${
                        isMe ? "text-right" : ""
                      }`}>
                        {formatDate(message.createdAt)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Message Input */}
            <div className="flex gap-2">
              <Input 
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a message..."
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                data-testid="input-message"
              />
              <Button 
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sendMessageMutation.isPending}
                className="bg-pocket-red hover:bg-pocket-red-dark text-white"
                data-testid="button-send-message"
              >
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Messages</h2>
        <Button 
          className="bg-pocket-red hover:bg-pocket-red-dark text-white"
          size="sm"
          data-testid="button-new-message"
        >
          + New
        </Button>
      </div>

      {/* Threads List */}
      <div className="space-y-2.5">
        {threads.length === 0 ? (
          <Card className="theme-transition">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">💬</div>
              <h3 className="text-lg font-semibold mb-3">Let's start connecting!</h3>
              <div className="max-w-md mx-auto space-y-4">
                <p className="text-muted-foreground">
                  Your conversations will appear here. Get the ball rolling!
                </p>
                <div className="bg-muted/30 rounded-lg p-4 text-left">
                  <h4 className="font-medium text-sm mb-2">💡 Ways to start chatting:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Jump on bounties that sound fun to you</li>
                    <li>• Connect with fellow weirdos in Friends</li>
                    <li>• Ask "wait, what exactly do you need?" 😅</li>
                    <li>• Share your random talents with bounty posters</li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  💫 Tip: Be yourself - personality pays here!
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          threads.map((thread: any) => (
            <Card 
              key={thread.id} 
              className="cursor-pointer hover:bg-accent/50 theme-transition"
              onClick={() => setSelectedThread(thread)}
              data-testid={`thread-${thread.id}`}
            >
              <CardContent className="p-2.5">
                <div className="flex gap-2.5 items-center">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-bold text-sm">
                    {thread.otherUser.firstName?.[0] || thread.otherUser.handle?.[1] || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm" data-testid="text-thread-user-name">
                      {thread.otherUser.firstName || thread.otherUser.handle}
                    </div>
                    <div className="text-xs text-muted-foreground truncate" data-testid="text-thread-last-message">
                      {thread.lastMessage?.content || "No messages yet"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {thread.lastMessage && formatDate(thread.lastMessage.createdAt)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
