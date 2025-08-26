import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Bug, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<"bug" | "feedback" | "suggestion">("feedback");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const sendFeedbackMutation = useMutation({
    mutationFn: async (data: { message: string; type: string }) => {
      return apiRequest("POST", "/api/feedback", data);
    },
    onSuccess: () => {
      toast({
        title: "Feedback Sent! 📬",
        description: "Thanks for your feedback! Dallas will get back to you soon.",
      });
      setMessage("");
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/messages/threads"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Please Log In",
          description: "You need to be logged in to send feedback.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description: "Failed to send feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    
    const typePrefix = {
      bug: "🐛 Bug Report: ",
      feedback: "💭 Feedback: ",
      suggestion: "💡 Suggestion: "
    }[feedbackType];

    sendFeedbackMutation.mutate({
      message: `${typePrefix}${message.trim()}`,
      type: feedbackType
    });
  };

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-20 right-4 z-50 bg-pocket-red hover:bg-pocket-red-dark text-white border-pocket-red shadow-lg"
        onClick={() => {
          toast({
            title: "Please Log In",
            description: "You need to be logged in to send feedback to the creator.",
            variant: "default",
          });
          setTimeout(() => {
            window.location.href = "/api/login";
          }, 1500);
        }}
        data-testid="button-feedback-login"
      >
        <MessageCircle className="h-4 w-4 mr-2" />
        💬 Talk to Creator
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-20 right-4 z-50 bg-pocket-red hover:bg-pocket-red-dark text-white border-pocket-red shadow-lg"
          data-testid="button-feedback"
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          💬 Talk to Creator
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-pocket-red" />
            Send Feedback to Dallas
          </DialogTitle>
          <DialogDescription>
            Found a bug? Have a suggestion? Want to give feedback? Dallas Abbott (the creator) would love to hear from you!
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={feedbackType === "feedback" ? "default" : "outline"}
              size="sm"
              onClick={() => setFeedbackType("feedback")}
              className="flex-1"
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Feedback
            </Button>
            <Button
              variant={feedbackType === "bug" ? "default" : "outline"}
              size="sm"
              onClick={() => setFeedbackType("bug")}
              className="flex-1"
            >
              <Bug className="h-4 w-4 mr-1" />
              Bug Report
            </Button>
            <Button
              variant={feedbackType === "suggestion" ? "default" : "outline"}
              size="sm"
              onClick={() => setFeedbackType("suggestion")}
              className="flex-1"
            >
              <Lightbulb className="h-4 w-4 mr-1" />
              Suggestion
            </Button>
          </div>

          <Textarea
            placeholder={
              feedbackType === "bug" 
                ? "Describe the bug you found - what happened and what you expected to happen..."
                : feedbackType === "suggestion"
                ? "What feature or improvement would you like to see..."
                : "Share your thoughts about the app..."
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="resize-none"
            data-testid="textarea-feedback-message"
          />

          <div className="flex justify-between items-center">
            <div className="text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                💬 Chat with creator
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={sendFeedbackMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={!message.trim() || sendFeedbackMutation.isPending}
                className="bg-pocket-red hover:bg-pocket-red-dark"
                data-testid="button-send-feedback"
              >
                {sendFeedbackMutation.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}