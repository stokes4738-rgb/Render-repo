import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { apiRequest } from "@/lib/queryClient";

interface Position {
  x: number;
  y: number;
}

interface Brick extends Position {
  id: number;
  destroyed: boolean;
  color: string;
}

interface GameState {
  paddle: Position;
  ball: Position & { dx: number; dy: number };
  bricks: Brick[];
  score: number;
  lives: number;
  gameStatus: "waiting" | "playing" | "gameover" | "victory";
  level: number;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const PADDLE_WIDTH = 80;
const PADDLE_HEIGHT = 10;
const BALL_SIZE = 8;
const BRICK_WIDTH = 60;
const BRICK_HEIGHT = 20;
const ROWS = 5;
const COLS = 9;

export default function Breakout() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    paddle: { x: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2, y: CANVAS_HEIGHT - 30 },
    ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 3, dy: -3 },
    bricks: [],
    score: 0,
    lives: 3,
    gameStatus: "waiting",
    level: 1,
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("breakout-best-score") || "0", 10);
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Breakout - scored ${gameState.score} points`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 15)} points!`,
      });
    },
  });

  const createBricks = useCallback((level: number) => {
    const bricks: Brick[] = [];
    const colors = ['#ff6b6b', '#ffd93d', '#6bcf7f', '#4ecdc4', '#45b7d1'];
    
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        bricks.push({
          id: row * COLS + col,
          x: col * (BRICK_WIDTH + 5) + 35,
          y: row * (BRICK_HEIGHT + 5) + 50,
          destroyed: false,
          color: colors[row % colors.length],
        });
      }
    }
    return bricks;
  }, []);

  const resetGame = useCallback(() => {
    setGameState({
      paddle: { x: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2, y: CANVAS_HEIGHT - 30 },
      ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 3, dy: -3 },
      bricks: createBricks(1),
      score: 0,
      lives: 3,
      gameStatus: "waiting",
      level: 1,
    });
  }, [createBricks]);

  const gameLoop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      let newState = { ...prev };

      // Move paddle
      if (keysRef.current['ArrowLeft'] && newState.paddle.x > 0) {
        newState.paddle = { ...newState.paddle, x: newState.paddle.x - 6 };
      }
      if (keysRef.current['ArrowRight'] && newState.paddle.x < CANVAS_WIDTH - PADDLE_WIDTH) {
        newState.paddle = { ...newState.paddle, x: newState.paddle.x + 6 };
      }

      // Move ball
      newState.ball = {
        ...newState.ball,
        x: newState.ball.x + newState.ball.dx,
        y: newState.ball.y + newState.ball.dy,
      };

      // Ball collision with walls
      if (newState.ball.x <= 0 || newState.ball.x >= CANVAS_WIDTH - BALL_SIZE) {
        newState.ball.dx = -newState.ball.dx;
      }
      if (newState.ball.y <= 0) {
        newState.ball.dy = -newState.ball.dy;
      }

      // Ball collision with paddle
      if (
        newState.ball.y + BALL_SIZE >= newState.paddle.y &&
        newState.ball.x + BALL_SIZE >= newState.paddle.x &&
        newState.ball.x <= newState.paddle.x + PADDLE_WIDTH &&
        newState.ball.dy > 0
      ) {
        const hitPos = (newState.ball.x - newState.paddle.x) / PADDLE_WIDTH;
        const angle = (hitPos - 0.5) * Math.PI / 3; // Max 60 degrees
        const speed = 4;
        newState.ball.dx = Math.sin(angle) * speed;
        newState.ball.dy = -Math.cos(angle) * speed;
      }

      // Ball collision with bricks
      newState.bricks = newState.bricks.map(brick => {
        if (
          !brick.destroyed &&
          newState.ball.x + BALL_SIZE >= brick.x &&
          newState.ball.x <= brick.x + BRICK_WIDTH &&
          newState.ball.y + BALL_SIZE >= brick.y &&
          newState.ball.y <= brick.y + BRICK_HEIGHT
        ) {
          newState.ball.dy = -newState.ball.dy;
          newState.score += 10;
          return { ...brick, destroyed: true };
        }
        return brick;
      });

      // Check victory condition
      const activeBricks = newState.bricks.filter(b => !b.destroyed);
      if (activeBricks.length === 0) {
        newState.level += 1;
        newState.bricks = createBricks(newState.level);
        newState.score += 100; // Level bonus
        newState.ball = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 3 + newState.level, dy: -3 - newState.level };
        toast({
          title: `Level ${newState.level - 1} Complete!`,
          description: "+100 bonus points!",
        });
      }

      // Check if ball fell off screen
      if (newState.ball.y > CANVAS_HEIGHT) {
        newState.lives -= 1;
        if (newState.lives <= 0) {
          newState.gameStatus = "gameover";
        } else {
          // Reset ball position
          newState.ball = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 3, dy: -3 };
        }
      }

      return newState;
    });
  }, [createBricks, toast]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw bricks
    gameState.bricks.forEach(brick => {
      if (!brick.destroyed) {
        ctx.fillStyle = brick.color;
        ctx.fillRect(brick.x, brick.y, BRICK_WIDTH, BRICK_HEIGHT);
        // Add shine effect
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(brick.x, brick.y, BRICK_WIDTH, 3);
      }
    });

    // Draw paddle
    const gradient = ctx.createLinearGradient(0, gameState.paddle.y, 0, gameState.paddle.y + PADDLE_HEIGHT);
    gradient.addColorStop(0, "#e74c3c");
    gradient.addColorStop(1, "#c0392b");
    ctx.fillStyle = gradient;
    ctx.fillRect(gameState.paddle.x, gameState.paddle.y, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Draw ball
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath();
    ctx.arc(gameState.ball.x, gameState.ball.y, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw UI
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(`Score: ${gameState.score}`, 10, 25);
    ctx.fillText(`Lives: ${gameState.lives}`, 10, 45);
    ctx.fillText(`Level: ${gameState.level}`, 10, 65);
  }, [gameState]);

  useEffect(() => {
    if (gameState.gameStatus === "playing") {
      const interval = setInterval(gameLoop, 1000 / 60);
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
        localStorage.setItem("breakout-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 15);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState.gameStatus !== "playing") return;
      
      const validKeys = ['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'];
      if (validKeys.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        keysRef.current[e.key] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    if (gameState.gameStatus === "playing") {
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      document.addEventListener("keyup", handleKeyUp, { capture: true });
      return () => {
        document.removeEventListener("keydown", handleKeyDown, { capture: true });
        document.removeEventListener("keyup", handleKeyUp, { capture: true });
      };
    }
  }, [gameState.gameStatus]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">🧱 Breakout</h2>
        <p className="text-sm text-muted-foreground">Destroy all bricks with the bouncing ball!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-2">
          <div 
            className="relative bg-gradient-to-b from-purple-900 to-black rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-pocket-red"
            tabIndex={0}
            data-testid="game-container-breakout"
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-80 cursor-crosshair"
              data-testid="canvas-breakout"
            />
            
            {gameState.gameStatus !== "playing" && (
              <div className="absolute inset-0 flex items-center justify-center text-white bg-black/50">
                <div className="text-center">
                  {gameState.gameStatus === "waiting" && (
                    <>
                      <div className="text-xl mb-2">🧱 Ready to Break Some Bricks?</div>
                      <div className="text-sm mb-2">Arrow keys to move paddle</div>
                    </>
                  )}
                  
                  {gameState.gameStatus === "gameover" && (
                    <>
                      <div className="text-xl mb-2">Game Over!</div>
                      <div className="text-sm mb-2">Final Score: {gameState.score}</div>
                      <div className="text-sm mb-2">Reached Level: {gameState.level}</div>
                      {gameState.score > bestScore && (
                        <div className="text-xs text-yellow-300 mt-1">New Best Score! 🎉</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5 flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="outline">Score: {gameState.score}</Badge>
            <Badge variant="outline">Best: {bestScore}</Badge>
            <Badge variant="outline">Level: {gameState.level}</Badge>
            <Badge variant="outline">Lives: {gameState.lives}</Badge>
          </div>
          <div className="flex gap-2">
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
            <li>• Arrow keys to move the paddle left and right</li>
            <li>• Keep the ball bouncing to destroy all bricks</li>
            <li>• Complete levels to increase difficulty</li>
            <li>• Earn 1 ⭐ for every 15 points scored</li>
          </ul>
        </CardContent>
      </Card>

      {/* Mobile Controls */}
      <div className="flex justify-center gap-4 sm:hidden">
        <Button
          variant="outline"
          size="lg"
          className="h-16 px-8 touch-none select-none"
          onTouchStart={(e) => {
            e.preventDefault();
            setGameState(prev => ({
              ...prev,
              paddle: { x: Math.max(0, prev.paddle.x - 30), y: prev.paddle.y }
            }));
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setGameState(prev => ({
              ...prev,
              paddle: { x: Math.max(0, prev.paddle.x - 30), y: prev.paddle.y }
            }));
          }}
        >
          ← LEFT
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 px-8 touch-none select-none"
          onTouchStart={(e) => {
            e.preventDefault();
            setGameState(prev => ({
              ...prev,
              paddle: { x: Math.min(CANVAS_WIDTH - PADDLE_WIDTH, prev.paddle.x + 30), y: prev.paddle.y }
            }));
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setGameState(prev => ({
              ...prev,
              paddle: { x: Math.min(CANVAS_WIDTH - PADDLE_WIDTH, prev.paddle.x + 30), y: prev.paddle.y }
            }));
          }}
        >
          RIGHT →
        </Button>
      </div>
    </div>
  );
}