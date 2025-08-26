import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDemo } from "@/contexts/DemoContext";
import { navigateToLogin } from "@/lib/navigation";
import { 
  ArrowLeft, 
  ArrowRight, 
  X, 
  DollarSign, 
  Users, 
  Star, 
  MessageCircle, 
  Trophy,
  Zap,
  Shield,
  PlusCircle,
  CheckCircle,
  CreditCard,
  Gamepad2,
  Heart,
  Award,
  Briefcase,
  TrendingUp,
  Search,
  Filter,
  Bell,
  Eye
} from "lucide-react";

interface TutorialProps {
  onClose: () => void;
}

const getTutorialSteps = (onClose: () => void, setDemoMode: (enabled: boolean) => void) => [
  {
    id: 1,
    title: "Welcome to Pocket Bounty! 🪙",
    description: "Your complete guide to earning money from quick tasks",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-6xl mb-4">🪙</div>
          <p className="text-muted-foreground">
            Turn your skills into cash! Complete bounties, build connections, and earn real money from tasks you're already good at.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
            <DollarSign className="h-8 w-8 mx-auto text-green-600 mb-2" />
            <p className="text-sm font-medium">Real Money</p>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
            <Users className="h-8 w-8 mx-auto text-purple-600 mb-2" />
            <p className="text-sm font-medium">Community</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 2,
    title: "Finding & Applying to Bounties 🎯",
    description: "Your guide to finding and applying for tasks",
    content: (
      <div className="space-y-4">
        <div className="p-4 border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold">Example Bounty</h3>
          </div>
          <h4 className="font-medium mb-2">Walk my dogs for 30 minutes 🐕</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Need someone to walk my 2 friendly golden retrievers around the neighborhood. They're well-behaved!
          </p>
          <div className="flex items-center justify-between">
            <Badge className="bg-green-600">Reward: $100.00</Badge>
            <Badge variant="outline">💼 Local Work</Badge>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-blue-600" />
            <span className="text-sm"><strong>Browse:</strong> View all available bounties on the home page</span>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-purple-600" />
            <span className="text-sm"><strong>Filter:</strong> Sort by reward amount, type, or location</span>
          </div>
          <div className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm"><strong>Apply:</strong> Click "Apply" and send a message</span>
          </div>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-orange-600" />
            <span className="text-sm"><strong>Wait:</strong> Get notified when accepted or rejected</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 3,
    title: "Creating Your Own Bounties 📝",
    description: "Turn your needs into someone's payday",
    content: (
      <div className="space-y-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <PlusCircle className="h-5 w-5 text-pocket-red" />
            <h3 className="font-semibold">Create a Bounty</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title:</span>
              <span>Help me organize my closet</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Description:</span>
              <span>Sort clothes by season/type</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reward:</span>
              <span className="text-green-600">$75.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration:</span>
              <span>3 days</span>
            </div>
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
          <h4 className="font-semibold text-orange-800 dark:text-orange-200 text-sm mb-2">💰 Payment Process:</h4>
          <ul className="text-xs text-orange-700 dark:text-orange-300 space-y-1">
            <li>• Money is held securely when you post</li>
            <li>• When someone completes it → they get paid instantly</li>
            <li>• If no one completes it → automatic refund after 3 days</li>
            <li>• Small platform fee only charged on completion</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 4,
    title: "Managing Applications 📋",
    description: "Accept, reject, and complete bounties",
    content: (
      <div className="space-y-4">
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-3">Your Bounty Applications</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 border rounded">
              <div>
                <span className="font-medium">Deana</span>
                <p className="text-xs text-muted-foreground">Applied to walk your dogs</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Accept
                </Button>
                <Button size="sm" variant="destructive">
                  <X className="h-3 w-3 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">When Work is Complete:</h4>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-purple-600" />
            <span className="text-sm">Click "Mark Complete & Pay" to release payment</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 5,
    title: "Messaging & Communication 💬",
    description: "Stay connected with real-time chat",
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-5 w-5 text-blue-600" />
              <span className="font-medium">Real-time Messaging</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Chat instantly with bounty creators and hunters. Ask questions, share updates, coordinate meetups.
            </p>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">D</div>
              <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg flex-1">
                <p className="text-sm">Hey! I can walk your dogs this afternoon. What time works?</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
                <p className="text-sm">Perfect! How about 3 PM?</p>
              </div>
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">Y</div>
            </div>
          </div>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          Messages are delivered instantly with WebSocket technology
        </div>
      </div>
    )
  },
  {
    id: 6,
    title: "Friends & Social Features 👥",
    description: "Build your network and reputation",
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 border rounded-lg text-center">
            <Users className="h-6 w-6 mx-auto text-blue-600 mb-2" />
            <p className="text-sm font-medium">Add Friends</p>
            <p className="text-xs text-muted-foreground">Connect with people</p>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <Star className="h-6 w-6 mx-auto text-yellow-600 mb-2" />
            <p className="text-sm font-medium">Reviews & Ratings</p>
            <p className="text-xs text-muted-foreground">Build your reputation</p>
          </div>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
              S
            </div>
            <div>
              <p className="font-medium text-sm">Sarah M.</p>
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-500 fill-current" />
                <span className="text-xs text-muted-foreground">4.9 (45 reviews)</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            "Excellent dog walker! My pups loved her and she sent photo updates."
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
          <p className="text-sm text-center">
            Higher ratings = more bounty opportunities and better pay!
          </p>
        </div>
      </div>
    )
  },
  {
    id: 7,
    title: "Account & Wallet Management 💳",
    description: "Manage your money and account settings",
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">$285.50</div>
            <p className="text-xs text-muted-foreground">Wallet Balance</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">$1,250</div>
            <p className="text-xs text-muted-foreground">Total Earned</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-medium text-sm">Payment Methods</p>
              <p className="text-xs text-muted-foreground">Add bank account or debit card</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <Zap className="h-5 w-5 text-orange-600" />
            <div>
              <p className="font-medium text-sm">Instant Withdrawals</p>
              <p className="text-xs text-muted-foreground">Cash out anytime, funds in minutes</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <Shield className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-sm">Secure & Protected</p>
              <p className="text-xs text-muted-foreground">Bank-level security with Stripe</p>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 8,
    title: "Points & Gamification 🎮",
    description: "Level up and earn points while working",
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-orange-600">Level 5</div>
            <p className="text-xs text-muted-foreground">Your current level</p>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">450 pts</div>
            <p className="text-xs text-muted-foreground">Points earned</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <span className="font-medium text-sm">Boost Your Posts</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Use points to boost your bounties for more visibility and faster applications
            </p>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Gamepad2 className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-sm">Mini-Games</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Play Flappy Bird between bounties to earn extra points!
            </p>
          </div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
          <h4 className="font-semibold text-sm mb-1">How to Earn Points:</h4>
          <ul className="text-xs space-y-1">
            <li>• Complete bounties successfully</li>
            <li>• Receive 5-star reviews</li>
            <li>• Play mini-games</li>
            <li>• Daily login bonuses</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 9,
    title: "Mobile App Experience 📱",
    description: "Add Pocket Bounty to your home screen",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-6xl mb-4">📱</div>
          <p className="text-muted-foreground mb-4">
            Install Pocket Bounty as a native app for the best experience
          </p>
        </div>
        <div className="space-y-3">
          <div className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
            <h4 className="font-semibold mb-2">📱 On iPhone:</h4>
            <ol className="text-sm space-y-1 text-muted-foreground">
              <li>1. Tap the Share button (⬆️) in Safari</li>
              <li>2. Scroll down and tap "Add to Home Screen"</li>
              <li>3. Tap "Add" and you're set! 🎉</li>
            </ol>
          </div>
          <div className="p-4 border rounded-lg bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20">
            <h4 className="font-semibold mb-2">🤖 On Android:</h4>
            <ol className="text-sm space-y-1 text-muted-foreground">
              <li>1. Tap the menu (⋮) in Chrome</li>
              <li>2. Select "Add to Home Screen"</li>
              <li>3. Confirm and enjoy! ⚡</li>
            </ol>
          </div>
        </div>
        <div className="bg-pocket-gold/10 border border-pocket-gold/20 p-3 rounded-lg">
          <p className="text-sm text-center font-medium">
            💡 Get push notifications for new bounties and messages!
          </p>
        </div>
      </div>
    )
  },
  {
    id: 10,
    title: "Ready to Start Earning? 🚀",
    description: "Join thousands of users making money on Pocket Bounty",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <CheckCircle className="h-16 w-16 mx-auto text-green-600 mb-4" />
          <h3 className="font-bold text-lg mb-2">You're All Set!</h3>
          <p className="text-muted-foreground mb-4">
            You now understand all of Pocket Bounty's features. Ready to start earning?
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-bold text-green-600">$10K+</div>
            <div className="text-xs text-muted-foreground">Paid Out</div>
          </div>
          <div>
            <div className="text-xl font-bold text-blue-600">500+</div>
            <div className="text-xs text-muted-foreground">Active Users</div>
          </div>
          <div>
            <div className="text-xl font-bold text-purple-600">4.9★</div>
            <div className="text-xs text-muted-foreground">Rating</div>
          </div>
        </div>
        <div className="space-y-3 pt-4">
          <Button 
            className="w-full bg-green-600 hover:bg-green-700 text-white mb-2"
            onClick={() => {
              setDemoMode(true);
              onClose();
              window.location.href = '/';
            }}
            data-testid="button-tutorial-demo"
          >
            🎮 Try Demo Mode First
          </Button>
          <Button 
            variant="outline"
            className="w-full"
            onClick={onClose}
            data-testid="button-tutorial-signup"
          >
            💰 Create Real Account & Start Earning
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Demo: Explore safely with sample data • Real: Start earning immediately
          </p>
        </div>
      </div>
    )
  }
];

export default function Tutorial({ onClose }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { setDemoMode } = useDemo();
  const tutorialSteps = getTutorialSteps(onClose, setDemoMode);
  const currentStepData = tutorialSteps[currentStep];
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    setCurrentStep(tutorialSteps.length - 1);
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto theme-transition">
        <CardHeader className="relative">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="text-xs">
              Step {currentStep + 1} of {tutorialSteps.length}
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              data-testid="button-close-tutorial"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Progress value={progress} className="mb-4" />
          <CardTitle className="text-xl">{currentStepData.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{currentStepData.description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentStepData.content}
          
          <div className="flex items-center justify-between pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={handlePrevious}
              disabled={currentStep === 0}
              data-testid="button-tutorial-previous"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            
            <div className="flex gap-2">
              {currentStep < tutorialSteps.length - 1 && (
                <Button 
                  variant="ghost" 
                  onClick={handleSkip}
                  data-testid="button-tutorial-skip"
                >
                  Skip to End
                </Button>
              )}
              
              {currentStep < tutorialSteps.length - 1 ? (
                <Button 
                  onClick={handleNext}
                  data-testid="button-tutorial-next"
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button 
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setDemoMode(true);
                      onClose();
                      window.location.href = '/';
                    }}
                    data-testid="button-tutorial-demo-final"
                  >
                    Try Demo
                  </Button>
                  <Button 
                    onClick={onClose}
                    data-testid="button-tutorial-close-final"
                  >
                    Get Started!
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}