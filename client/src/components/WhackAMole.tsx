import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { apiRequest } from "@/lib/queryClient";
import { Maximize, Minimize } from "lucide-react";

interface Mole {
  id: number;
  isActive: boolean;
  timeLeft: number;
}

interface GameState {
  moles: Mole[];
  score: number;
  timeLeft: number;
  gameStatus: "waiting" | "playing" | "gameover";
  combo: number;
  maxCombo: number;
}

const GAME_TIME = 60; // 1 minute
const MOLE_COUNT = 9;

export default function WhackAMole() {
  const [gameState, setGameState] = useState<GameState>({
    moles: Array.from({ length: MOLE_COUNT }, (_, i) => ({
      id: i,
      isActive: false,
      timeLeft: 0,
    })),
    score: 0,
    timeLeft: GAME_TIME,
    gameStatus: "waiting",
    combo: 0,
    maxCombo: 0,
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("whack-a-mole-best-score") || "0", 10);
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
        reason: `Whack-a-Mole - scored ${gameState.score} points`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 8)} points!`,
      });
    },
  });

  const resetGame = useCallback(() => {
    setGameState({
      moles: Array.from({ length: MOLE_COUNT }, (_, i) => ({
        id: i,
        isActive: false,
        timeLeft: 0,
      })),
      score: 0,
      timeLeft: GAME_TIME,
      gameStatus: "waiting",
      combo: 0,
      maxCombo: 0,
    });
  }, []);

  const spawnMole = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      const inactiveMoles = prev.moles.filter(m => !m.isActive);
      if (inactiveMoles.length === 0) return prev;

      const randomMole = inactiveMoles[Math.floor(Math.random() * inactiveMoles.length)];
      const moleUpTime = Math.random() * 2000 + 1000; // 1-3 seconds

      return {
        ...prev,
        moles: prev.moles.map(m =>
          m.id === randomMole.id
            ? { ...m, isActive: true, timeLeft: moleUpTime }
            : m
        ),
      };
    });
  }, []);

  const whackMole = useCallback((moleId: number) => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      const mole = prev.moles.find(m => m.id === moleId);
      if (!mole || !mole.isActive) {
        // Missed or already whacked - reset combo
        return { ...prev, combo: 0 };
      }

      const newCombo = prev.combo + 1;
      const bonusMultiplier = Math.floor(newCombo / 5) + 1; // Bonus every 5 hits
      const points = 10 * bonusMultiplier;

      if (newCombo > prev.maxCombo && newCombo % 5 === 0) {
        toast({
          title: `${newCombo} Hit Combo!`,
          description: `Score multiplier: x${bonusMultiplier}`,
        });
      }

      return {
        ...prev,
        moles: prev.moles.map(m =>
          m.id === moleId ? { ...m, isActive: false, timeLeft: 0 } : m
        ),
        score: prev.score + points,
        combo: newCombo,
        maxCombo: Math.max(prev.maxCombo, newCombo),
      };
    });
  }, [toast]);

  useEffect(() => {
    if (gameState.gameStatus === "playing") {
      // Game timer
      const gameTimer = setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft <= 1) {
            return { ...prev, timeLeft: 0, gameStatus: "gameover" };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);

      // Mole spawn timer
      const spawnTimer = setInterval(() => {
        if (Math.random() < 0.6) { // 60% chance to spawn a mole
          spawnMole();
        }
      }, 800);

      // Mole countdown timer
      const moleTimer = setInterval(() => {
        setGameState(prev => ({
          ...prev,
          moles: prev.moles.map(m => ({
            ...m,
            timeLeft: Math.max(0, m.timeLeft - 100),
            isActive: m.timeLeft > 100 && m.isActive,
          })),
          combo: prev.moles.some(m => m.isActive && m.timeLeft <= 100) ? 0 : prev.combo,
        }));
      }, 100);

      return () => {
        clearInterval(gameTimer);
        clearInterval(spawnTimer);
        clearInterval(moleTimer);
      };
    }
  }, [gameState.gameStatus, spawnMole]);

  useEffect(() => {
    if (gameState.gameStatus === "gameover") {
      const newBestScore = Math.max(bestScore, gameState.score);
      if (newBestScore > bestScore) {
        setBestScore(newBestScore);
        localStorage.setItem("whack-a-mole-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 8);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={gameContainerRef} className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : ''}`}>
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">🔨 Whack-a-Mole</h2>
        <p className="text-sm text-muted-foreground">Hit the moles as fast as you can!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            {gameState.moles.map((mole) => (
              <button
                key={mole.id}
                onClick={() => whackMole(mole.id)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  if (gameState.gameStatus === "playing") {
                    whackMole(mole.id);
                  }
                }}
                disabled={gameState.gameStatus !== "playing"}
                className={`aspect-square rounded-full text-4xl font-bold transition-all duration-200 relative overflow-hidden touch-none select-none ${
                  mole.isActive
                    ? "bg-brown-500 dark:bg-brown-600 hover:bg-brown-600 dark:hover:bg-brown-700 transform scale-110"
                    : "bg-gray-300 dark:bg-gray-700"
                }`}
                style={{
                  background: mole.isActive
                    ? "linear-gradient(145deg, #8b4513, #654321)"
                    : undefined,
                }}
                data-testid={`mole-${mole.id}`}
              >
                {mole.isActive ? (
                  <div className="relative">
                    <span>🦫</span>
                    <div
                      className="absolute bottom-0 left-0 bg-red-500 opacity-50 transition-all duration-100"
                      style={{
                        width: '100%',
                        height: `${(mole.timeLeft / 3000) * 100}%`,
                      }}
                    />
                  </div>
                ) : (
                  <span className="text-gray-600">🕳️</span>
                )}
              </button>
            ))}
          </div>
          
          {gameState.gameStatus !== "playing" && (
            <div className="mt-6 text-center">
              {gameState.gameStatus === "waiting" && (
                <>
                  <div className="text-xl mb-2">🔨 Ready to Whack Some Moles?</div>
                  <div className="text-sm text-muted-foreground">Click the moles when they pop up!</div>
                </>
              )}
              
              {gameState.gameStatus === "gameover" && (
                <>
                  <div className="text-xl mb-2">Time's Up! 🏁</div>
                  <div className="text-sm mb-2">Final Score: {gameState.score}</div>
                  <div className="text-sm mb-2">Max Combo: {gameState.maxCombo}</div>
                  {gameState.score > bestScore && (
                    <div className="text-xs text-yellow-300 mt-1">New Best Score! 🎉</div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5 flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="outline">Time: {formatTime(gameState.timeLeft)}</Badge>
            <Badge variant="outline">Score: {gameState.score}</Badge>
            <Badge variant="outline">Combo: {gameState.combo}</Badge>
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
            >
              {gameState.gameStatus === "playing" ? "Reset" : "Play"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-2">How to Play</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Click on moles when they pop up from holes</li>
            <li>• Build combos for score multipliers</li>
            <li>• Every 5-hit combo increases your multiplier</li>
            <li>• Earn 1 ⭐ for every 8 points scored</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}