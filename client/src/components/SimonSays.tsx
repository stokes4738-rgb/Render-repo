import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { apiRequest } from "@/lib/queryClient";
import { Maximize, Minimize } from "lucide-react";

interface GameState {
  sequence: number[];
  playerSequence: number[];
  currentStep: number;
  showingSequence: boolean;
  score: number;
  gameStatus: "waiting" | "playing" | "gameover" | "showing";
  round: number;
  showingIndex: number;
}

const COLORS = [
  { id: 0, color: "bg-red-500", activeColor: "bg-red-300", sound: "C4" },
  { id: 1, color: "bg-blue-500", activeColor: "bg-blue-300", sound: "E4" },
  { id: 2, color: "bg-green-500", activeColor: "bg-green-300", sound: "G4" },
  { id: 3, color: "bg-yellow-500", activeColor: "bg-yellow-300", sound: "C5" },
];

export default function SimonSays() {
  const [gameState, setGameState] = useState<GameState>({
    sequence: [],
    playerSequence: [],
    currentStep: 0,
    showingSequence: false,
    score: 0,
    gameStatus: "waiting",
    round: 0,
    showingIndex: 0,
  });
  
  const [activeButtons, setActiveButtons] = useState<number[]>([]);
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("simon-says-best-score") || "0", 10);
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Simon Says - reached round ${gameState.round}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 6)} points!`,
      });
    },
  });

  const playSound = useCallback((colorId: number) => {
    // Simple audio feedback using Web Audio API
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      const frequencies = { 0: 261.63, 1: 329.63, 2: 392.00, 3: 523.25 }; // C4, E4, G4, C5
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequencies[colorId as keyof typeof frequencies];
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    }
  }, []);

  const flashButton = useCallback((colorId: number, duration: number = 600) => {
    setActiveButtons(prev => [...prev, colorId]);
    playSound(colorId);
    
    setTimeout(() => {
      setActiveButtons(prev => prev.filter(id => id !== colorId));
    }, duration);
  }, [playSound]);

  const addToSequence = useCallback(() => {
    const newColor = Math.floor(Math.random() * 4);
    setGameState(prev => ({
      ...prev,
      sequence: [...prev.sequence, newColor],
      round: prev.round + 1,
      score: prev.score + prev.round * 10,
    }));
  }, []);

  const showSequence = useCallback(() => {
    setGameState(prev => ({ ...prev, gameStatus: "showing", showingIndex: 0 }));
    
    const showNext = (index: number) => {
      if (index >= gameState.sequence.length) {
        setGameState(prev => ({ 
          ...prev, 
          gameStatus: "playing", 
          playerSequence: [],
          currentStep: 0 
        }));
        return;
      }
      
      setTimeout(() => {
        flashButton(gameState.sequence[index]);
        showNext(index + 1);
      }, 800);
    };
    
    showNext(0);
  }, [gameState.sequence, flashButton]);

  const resetGame = useCallback(() => {
    setGameState({
      sequence: [],
      playerSequence: [],
      currentStep: 0,
      showingSequence: false,
      score: 0,
      gameStatus: "waiting",
      round: 0,
      showingIndex: 0,
    });
    setActiveButtons([]);
  }, []);

  const startGame = useCallback(() => {
    resetGame();
    setTimeout(() => {
      setGameState(prev => ({ ...prev, gameStatus: "playing" }));
      addToSequence();
    }, 100);
  }, [resetGame, addToSequence]);

  const toggleFullscreen = async () => {
    if (!gameContainerRef.current) return;
    
    try {
      if (!isFullscreen) {
        if (gameContainerRef.current.requestFullscreen) {
          await gameContainerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleButtonPress = useCallback((colorId: number) => {
    if (gameState.gameStatus !== "playing") return;
    
    flashButton(colorId, 200);
    
    setGameState(prev => {
      const newPlayerSequence = [...prev.playerSequence, colorId];
      const expectedColor = prev.sequence[prev.currentStep];
      
      if (colorId !== expectedColor) {
        // Wrong color - game over
        toast({
          title: "Wrong Color!",
          description: `You reached round ${prev.round}`,
          variant: "destructive",
        });
        return { ...prev, gameStatus: "gameover" };
      }
      
      const newCurrentStep = prev.currentStep + 1;
      
      if (newCurrentStep === prev.sequence.length) {
        // Completed the sequence - add new color and show again
        toast({
          title: `Round ${prev.round} Complete!`,
          description: "Watch the new sequence!",
        });
        
        setTimeout(() => {
          addToSequence();
          setTimeout(() => showSequence(), 500);
        }, 1000);
        
        return {
          ...prev,
          playerSequence: newPlayerSequence,
          currentStep: newCurrentStep,
          gameStatus: "showing",
        };
      }
      
      return {
        ...prev,
        playerSequence: newPlayerSequence,
        currentStep: newCurrentStep,
      };
    });
  }, [gameState.gameStatus, gameState.sequence, flashButton, toast, addToSequence, showSequence]);

  useEffect(() => {
    if (gameState.sequence.length > 0 && gameState.gameStatus === "playing" && gameState.currentStep === 0) {
      showSequence();
    }
  }, [gameState.sequence, gameState.gameStatus, gameState.currentStep, showSequence]);

  useEffect(() => {
    if (gameState.gameStatus === "gameover") {
      const newBestScore = Math.max(bestScore, gameState.score);
      if (newBestScore > bestScore) {
        setBestScore(newBestScore);
        localStorage.setItem("simon-says-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 6);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  return (
    <div ref={gameContainerRef} className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : ''}`}>
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">🎵 Simon Says</h2>
        <p className="text-sm text-muted-foreground">Repeat the color sequence to earn points!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            {COLORS.map((color) => (
              <button
                key={color.id}
                onClick={() => handleButtonPress(color.id)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  if (gameState.gameStatus === "playing") {
                    handleButtonPress(color.id);
                  }
                }}
                disabled={gameState.gameStatus !== "playing"}
                className={`aspect-square rounded-2xl transition-all duration-200 border-4 border-gray-300 dark:border-gray-600 touch-none select-none ${
                  activeButtons.includes(color.id)
                    ? `${color.activeColor} scale-95 border-white`
                    : `${color.color} hover:scale-105 shadow-lg`
                } ${
                  gameState.gameStatus === "playing" ? "cursor-pointer" : "cursor-not-allowed opacity-75"
                }`}
                data-testid={`simon-button-${color.id}`}
              >
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white drop-shadow-lg">
                  {color.id === 0 && "🔴"}
                  {color.id === 1 && "🔵"}
                  {color.id === 2 && "🟢"}
                  {color.id === 3 && "🟡"}
                </div>
              </button>
            ))}
          </div>
          
          {gameState.gameStatus !== "playing" && gameState.gameStatus !== "showing" && (
            <div className="mt-6 text-center">
              {gameState.gameStatus === "waiting" && (
                <>
                  <div className="text-xl mb-2">🎵 Ready to Play Simon Says?</div>
                  <div className="text-sm text-muted-foreground">Watch the sequence, then repeat it!</div>
                </>
              )}
              
              {gameState.gameStatus === "gameover" && (
                <>
                  <div className="text-xl mb-2">Game Over! 🎮</div>
                  <div className="text-sm mb-2">Final Score: {gameState.score}</div>
                  <div className="text-sm mb-2">Rounds Completed: {gameState.round - 1}</div>
                  {gameState.score > bestScore && (
                    <div className="text-xs text-yellow-300 mt-1">New Best Score! 🎉</div>
                  )}
                </>
              )}
            </div>
          )}

          {gameState.gameStatus === "showing" && (
            <div className="mt-6 text-center">
              <div className="text-lg mb-2">👀 Watch the Sequence</div>
              <div className="text-sm text-muted-foreground">Round {gameState.round}</div>
            </div>
          )}

          {gameState.gameStatus === "playing" && gameState.currentStep > 0 && (
            <div className="mt-6 text-center">
              <div className="text-lg mb-2">🎯 Your Turn</div>
              <div className="text-sm text-muted-foreground">
                Step {gameState.currentStep + 1} of {gameState.sequence.length}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5 flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="outline">Score: {gameState.score}</Badge>
            <Badge variant="outline">Round: {gameState.round}</Badge>
            <Badge variant="outline">Best: {bestScore}</Badge>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={toggleFullscreen}
              className="px-2"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
            <Button variant="outline" onClick={resetGame}>Reset</Button>
            <Button
              onClick={gameState.gameStatus === "waiting" ? startGame : resetGame}
              className="bg-pocket-red hover:bg-pocket-red-dark text-white"
              disabled={gameState.gameStatus === "showing"}
            >
              {gameState.gameStatus === "playing" || gameState.gameStatus === "showing" ? "Reset" : "Play"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-2">How to Play</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Watch the sequence of colors that flash</li>
            <li>• Click the colors in the same order</li>
            <li>• Each round adds one more color</li>
            <li>• Earn 1 ⭐ for every 6 points scored</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}