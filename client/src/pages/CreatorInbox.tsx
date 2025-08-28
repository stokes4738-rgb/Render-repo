import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, MessageCircle, Bug, Lightbulb, Users, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuthJWT";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/utils";

export default function CreatorInbox() {
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();


  const { data: feedbackThreads = [], isLoading: threadsLoading } = useQuery({
    queryKey: ["/api/creator/feedback-threads"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/messages/threads", selectedThread?.id],
    enabled: !!selectedThread?.id,
  });

  // WebSocket for real-time messages
  useWebSocket({
    onMessage: (data) => {
      if (data.type === "new_message") {
        queryClient.invalidateQueries({ queryKey: ["/api/creator/feedback-threads"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/creator/feedback-threads"] });
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

  const getFeedbackIcon = (message: string) => {
    if (message.includes("🐛 Bug Report:")) return <Bug className="h-4 w-4 text-red-500" />;
    if (message.includes("💡 Suggestion:")) return <Lightbulb className="h-4 w-4 text-yellow-500" />;
    return <MessageCircle className="h-4 w-4 text-blue-500" />;
  };

  const getFeedbackType = (message: string) => {
    if (message.includes("🐛 Bug Report:")) return { label: "Bug", color: "destructive" as const };
    if (message.includes("💡 Suggestion:")) return { label: "Suggestion", color: "secondary" as const };
    return { label: "Feedback", color: "default" as const };
  };

  if (threadsLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
          <div className="h-8 bg-muted rounded w-16 animate-pulse"></div>
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-muted rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-32"></div>
                <div className="h-3 bg-muted rounded w-48"></div>
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
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedThread(null)}
            data-testid="button-back-to-inbox"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Inbox
          </Button>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={selectedThread.otherUser?.profileImageUrl} />
              <AvatarFallback>
                {selectedThread.otherUser?.firstName?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-sm">
                {selectedThread.otherUser?.firstName} {selectedThread.otherUser?.lastName}
              </p>
              <p className="text-xs text-muted-foreground">
                @{selectedThread.otherUser?.handle || 'user'}
              </p>
            </div>
          </div>
        </div>

        <Card className="h-[400px] flex flex-col">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messagesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                    <div className="bg-muted rounded-lg p-3 max-w-[70%] animate-pulse">
                      <div className="h-4 bg-muted-foreground/20 rounded w-32"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              messages.map((message: any) => (
                <div
                  key={message.id}
                  className={`flex ${message.senderId === user.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`rounded-lg p-3 max-w-[70%] ${
                    message.senderId === user.id
                      ? 'bg-pocket-red text-white'
                      : 'bg-muted'
                  }`}>
                    <div className="flex items-start gap-2">
                      {message.senderId !== user.id && getFeedbackIcon(message.content)}
                      <div className="flex-1">
                        <p className="text-sm">{message.content}</p>
                        <p className={`text-xs mt-1 ${
                          message.senderId === user.id ? 'text-white/70' : 'text-muted-foreground'
                        }`}>
                          {formatDate(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
          
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Reply to user..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                data-testid="input-creator-reply"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sendMessageMutation.isPending}
                className="bg-pocket-red hover:bg-pocket-red-dark text-white"
                data-testid="button-send-creator-reply"
              >
                Send
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-pocket-red" />
            Creator Inbox
          </h2>
          <p className="text-sm text-muted-foreground">
            User feedback, bug reports, and suggestions
          </p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {feedbackThreads.length} conversations
        </Badge>
      </div>

      {feedbackThreads.length === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">No feedback yet</h3>
            <p className="text-muted-foreground">
              When users send feedback, bug reports, or suggestions, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feedbackThreads.map((thread: any) => {
            const feedbackType = getFeedbackType(thread.lastMessage?.content || "");
            return (
              <Card
                key={thread.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => setSelectedThread(thread)}
                data-testid={`thread-${thread.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={thread.otherUser?.profileImageUrl} />
                      <AvatarFallback>
                        {thread.otherUser?.firstName?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm">
                          {thread.otherUser?.firstName} {thread.otherUser?.lastName}
                        </p>
                        <Badge variant={feedbackType.color} className="text-xs">
                          {feedbackType.label}
                        </Badge>
                        {!thread.lastMessage?.readAt && thread.lastMessage?.senderId !== user.id && (
                          <Badge variant="destructive" className="text-xs">New</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {thread.lastMessage?.content || "No messages yet"}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          {formatDate(thread.lastMessageAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}