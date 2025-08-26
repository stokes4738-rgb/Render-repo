import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { apiRequest } from "@/lib/queryClient";
import { Maximize, Minimize } from "lucide-react";

interface Position {
  x: number;
  y: number;
}

interface GameState {
  snake: Position[];
  food: Position;
  direction: Position;
  score: number;
  gameStatus: "waiting" | "playing" | "gameover";
}

const GRID_SIZE = 20;
const CANVAS_SIZE = 400;

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    snake: [{ x: 10, y: 10 }],
    food: { x: 15, y: 15 },
    direction: { x: 0, y: 0 },
    score: 0,
    gameStatus: "waiting",
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("snake-best-score") || "0", 10);
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
        reason: `Snake game - scored ${gameState.score} points`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 3)} points!`,
      });
    },
  });

  const generateFood = useCallback((snake: Position[]): Position => {
    const maxPos = CANVAS_SIZE / GRID_SIZE - 1;
    let newFood: Position;
    do {
      newFood = {
        x: Math.floor(Math.random() * maxPos),
        y: Math.floor(Math.random() * maxPos),
      };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
    return newFood;
  }, []);

  const resetGame = useCallback(() => {
    const initialSnake = [{ x: 10, y: 10 }];
    setGameState({
      snake: initialSnake,
      food: generateFood(initialSnake),
      direction: { x: 0, y: 0 },
      score: 0,
      gameStatus: "waiting",
    });
  }, [generateFood]);

  const gameLoop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      const newSnake = [...prev.snake];
      const head = { ...newSnake[0] };
      
      head.x += prev.direction.x;
      head.y += prev.direction.y;

      // Check wall collision
      const maxPos = CANVAS_SIZE / GRID_SIZE - 1;
      if (head.x < 0 || head.x > maxPos || head.y < 0 || head.y > maxPos) {
        return { ...prev, gameStatus: "gameover" };
      }

      // Check self collision
      if (newSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
        return { ...prev, gameStatus: "gameover" };
      }

      newSnake.unshift(head);

      let newFood: Position = prev.food;
      let newScore = prev.score;

      // Check food collision
      if (head.x === prev.food.x && head.y === prev.food.y) {
        newScore += 10;
        newFood = generateFood(newSnake);
      } else {
        newSnake.pop();
      }

      return {
        ...prev,
        snake: newSnake,
        food: newFood,
        score: newScore,
      };
    });
  }, [generateFood]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw snake
    ctx.fillStyle = "#4ade80";
    gameState.snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? "#22c55e" : "#4ade80";
      ctx.fillRect(
        segment.x * GRID_SIZE,
        segment.y * GRID_SIZE,
        GRID_SIZE - 2,
        GRID_SIZE - 2
      );
    });

    // Draw food
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(
      gameState.food.x * GRID_SIZE,
      gameState.food.y * GRID_SIZE,
      GRID_SIZE - 2,
      GRID_SIZE - 2
    );

    // Draw grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = 0; i <= CANVAS_SIZE; i += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_SIZE, i);
      ctx.stroke();
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState.gameStatus === "playing") {
      const interval = setInterval(gameLoop, 150);
      return () => clearInterval(interval);
    }
  }, [gameState.gameStatus, gameLoop]);

  useEffect(() => {
    draw();
  }, [gameState, draw]);

  useEffect(() => {
    if (gameState.gameStatus === "gameover") {
      const newBestScore = Math.max(bestScore, gameState.score);
      if (newBestScore > bestScore) {
        setBestScore(newBestScore);
        localStorage.setItem("snake-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 3);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if game is playing and focus is on game area
      if (gameState.gameStatus !== "playing") return;
      
      const keyDirections: { [key: string]: Position } = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
        W: { x: 0, y: -1 },
        S: { x: 0, y: 1 },
        A: { x: -1, y: 0 },
        D: { x: 1, y: 0 },
      };

      const newDirection = keyDirections[e.key];
      if (newDirection) {
        e.preventDefault();
        e.stopPropagation();
        setGameState(prev => {
          // Prevent reverse direction
          if (newDirection.x === -prev.direction.x && newDirection.y === -prev.direction.y) {
            return prev;
          }
          return { ...prev, direction: newDirection };
        });
      }
    };

    if (gameState.gameStatus === "playing") {
      document.addEventListener("keydown", handleKeyPress, { capture: true });
      return () => document.removeEventListener("keydown", handleKeyPress, { capture: true });
    }
  }, [gameState.gameStatus, gameState.direction]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing", direction: { x: 1, y: 0 } }));
  };

  const handleDirectionChange = (newDirection: Position) => {
    if (gameState.gameStatus !== "playing") return;
    
    setGameState(prev => {
      // Prevent reverse direction
      if (newDirection.x === -prev.direction.x && newDirection.y === -prev.direction.y) {
        return prev;
      }
      return { ...prev, direction: newDirection };
    });
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

  return (
    <div ref={gameContainerRef} className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : ''}`}>
      <div className="text-center">
        <div className="relative inline-block">
          <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent">🐍 Snake Game</h2>
          <div className="absolute -inset-1 bg-gradient-to-r from-green-400 to-emerald-600 rounded-lg blur opacity-20 animate-pulse"></div>
        </div>
        <p className="text-sm text-muted-foreground">Eat the red food to grow and become the ultimate snake!</p>
      </div>

      <Card className="theme-transition shadow-2xl border-2 border-green-500/20">
        <CardContent className="p-2">
          <div className="relative bg-gradient-to-br from-gray-900 via-green-900/20 to-gray-900 rounded-xl overflow-hidden shadow-inner border border-green-500/30">
            <div 
              className="relative focus:outline-none focus:ring-4 focus:ring-green-500/50 rounded-xl"
              tabIndex={0}
              data-testid="game-container-snake"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-900/10 to-transparent rounded-xl"></div>
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="w-full h-96 cursor-crosshair relative z-10 rounded-xl"
                data-testid="canvas-snake-game"
              />
            </div>
            
            {gameState.gameStatus !== "playing" && (
              <div className="absolute inset-0 flex items-center justify-center text-white bg-gradient-to-br from-black/80 via-green-900/60 to-black/80 backdrop-blur-sm rounded-xl">
                <div className="text-center p-6 bg-black/30 rounded-2xl border border-green-500/30 backdrop-blur-md">
                  {gameState.gameStatus === "waiting" && (
                    <>
                      <div className="text-2xl mb-4 animate-bounce">🐍 Ready to Play?</div>
                      <div className="text-sm mb-2 text-green-300">Use arrow keys or touch controls to move</div>
                      <div className="text-xs text-gray-400">Eat food to grow and earn points!</div>
                    </>
                  )}
                  
                  {gameState.gameStatus === "gameover" && (
                    <>
                      <div className="text-2xl mb-4 text-red-400 animate-pulse">💀 Game Over!</div>
                      <div className="text-lg mb-2 font-bold text-green-400">Score: {gameState.score}</div>
                      {gameState.score > bestScore && (
                        <div className="text-sm text-yellow-300 mt-2 animate-bounce">🏆 New Best Score! 🎉</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mobile Controls */}
      <div className="sm:hidden flex flex-col items-center gap-4">
        <div className="grid grid-cols-3 gap-2 w-48">
          <div></div>
          <Button
            variant="outline"
            size="lg"
            className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 border-2 border-green-300 dark:border-green-700 active:bg-green-200 dark:active:bg-green-800"
            onTouchStart={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: 0, y: -1 });
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: 0, y: -1 });
            }}
          >
            <span className="text-2xl text-green-600 dark:text-green-400">↑</span>
          </Button>
          <div></div>
          
          <Button
            variant="outline"
            size="lg"
            className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 border-2 border-green-300 dark:border-green-700 active:bg-green-200 dark:active:bg-green-800"
            onTouchStart={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: -1, y: 0 });
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: -1, y: 0 });
            }}
          >
            <span className="text-2xl text-green-600 dark:text-green-400">←</span>
          </Button>
          <div></div>
          <Button
            variant="outline"
            size="lg"
            className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 border-2 border-green-300 dark:border-green-700 active:bg-green-200 dark:active:bg-green-800"
            onTouchStart={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: 1, y: 0 });
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: 1, y: 0 });
            }}
          >
            <span className="text-2xl text-green-600 dark:text-green-400">→</span>
          </Button>
          
          <div></div>
          <Button
            variant="outline"
            size="lg"
            className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 border-2 border-green-300 dark:border-green-700 active:bg-green-200 dark:active:bg-green-800"
            onTouchStart={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: 0, y: 1 });
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDirectionChange({ x: 0, y: 1 });
            }}
          >
            <span className="text-2xl text-green-600 dark:text-green-400">↓</span>
          </Button>
          <div></div>
        </div>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-3.5 flex justify-between items-center bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50">
          <div className="flex gap-3">
            <Badge variant="outline" className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-md">Score: {gameState.score}</Badge>
            <Badge variant="outline" className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0 shadow-md">Best: {bestScore}</Badge>
            <Badge variant="outline" className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0 shadow-md">Length: {gameState.snake.length}</Badge>
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
            <li>• Use arrow keys or on-screen controls</li>
            <li>• Eat red food to grow and score points</li>
            <li>• Avoid walls and your own tail</li>
            <li>• Earn 1 ⭐ for every 3 points scored</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}