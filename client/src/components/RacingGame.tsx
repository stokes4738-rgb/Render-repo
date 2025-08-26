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

interface Car extends Position {
  speed: number;
  lane: number;
}

interface Obstacle extends Position {
  width: number;
  height: number;
  speed: number;
}

interface GameState {
  player: Car;
  obstacles: Obstacle[];
  score: number;
  speed: number;
  gameStatus: "waiting" | "playing" | "gameover";
  distance: number;
  fuel: number;
}

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const LANE_WIDTH = CANVAS_WIDTH / 3;
const CAR_WIDTH = 40;
const CAR_HEIGHT = 60;

export default function RacingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    player: { x: LANE_WIDTH + LANE_WIDTH / 2 - CAR_WIDTH / 2, y: CANVAS_HEIGHT - 100, speed: 0, lane: 1 },
    obstacles: [],
    score: 0,
    speed: 2,
    gameStatus: "waiting",
    distance: 0,
    fuel: 100,
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("racing-best-score") || "0", 10);
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const obstacleIdRef = useRef(0);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Racing Game - drove ${gameState.distance} meters`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 22)} points!`,
      });
    },
  });

  const resetGame = useCallback(() => {
    setGameState({
      player: { x: LANE_WIDTH + LANE_WIDTH / 2 - CAR_WIDTH / 2, y: CANVAS_HEIGHT - 100, speed: 0, lane: 1 },
      obstacles: [],
      score: 0,
      speed: 2,
      gameStatus: "waiting",
      distance: 0,
      fuel: 100,
    });
  }, []);

  const gameLoop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      let newState = { ...prev };

      // Handle input
      if (keysRef.current['ArrowLeft'] && newState.player.lane > 0) {
        newState.player.lane -= 1;
        newState.player.x = newState.player.lane * LANE_WIDTH + LANE_WIDTH / 2 - CAR_WIDTH / 2;
      }
      if (keysRef.current['ArrowRight'] && newState.player.lane < 2) {
        newState.player.lane += 1;
        newState.player.x = newState.player.lane * LANE_WIDTH + LANE_WIDTH / 2 - CAR_WIDTH / 2;
      }

      // Update player speed and fuel
      if (keysRef.current['ArrowUp']) {
        newState.player.speed = Math.min(newState.player.speed + 0.2, 8);
        newState.fuel = Math.max(0, newState.fuel - 0.3);
      } else {
        newState.player.speed = Math.max(newState.player.speed - 0.1, 2);
      }

      // Check fuel
      if (newState.fuel <= 0) {
        newState.gameStatus = "gameover";
        return newState;
      }

      // Update distance and score
      newState.distance += newState.player.speed;
      newState.score = Math.floor(newState.distance / 10);

      // Increase game speed over time
      newState.speed = Math.min(2 + newState.score / 100, 6);

      // Generate obstacles
      if (Math.random() < 0.02 + newState.speed / 1000) {
        const lane = Math.floor(Math.random() * 3);
        newState.obstacles.push({
          x: lane * LANE_WIDTH + LANE_WIDTH / 2 - 20,
          y: -60,
          width: 40,
          height: 60,
          speed: newState.speed + Math.random() * 2,
        });
      }

      // Update obstacles
      newState.obstacles = newState.obstacles
        .map(obstacle => ({
          ...obstacle,
          y: obstacle.y + obstacle.speed,
        }))
        .filter(obstacle => obstacle.y < CANVAS_HEIGHT + 100);

      // Check collisions
      newState.obstacles.forEach(obstacle => {
        if (
          newState.player.x < obstacle.x + obstacle.width &&
          newState.player.x + CAR_WIDTH > obstacle.x &&
          newState.player.y < obstacle.y + obstacle.height &&
          newState.player.y + CAR_HEIGHT > obstacle.y
        ) {
          newState.gameStatus = "gameover";
        }
      });

      // Add fuel occasionally
      if (newState.score > 0 && newState.score % 50 === 0 && Math.random() < 0.1) {
        newState.fuel = Math.min(100, newState.fuel + 20);
      }

      return newState;
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw road
    ctx.fillStyle = "#666";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw lane lines
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 20]);
    
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * LANE_WIDTH, 0);
      ctx.lineTo(i * LANE_WIDTH, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Draw road edges
    ctx.setLineDash([]);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH, 0);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.stroke();

    // Draw obstacles (other cars)
    ctx.fillStyle = "#ff4444";
    gameState.obstacles.forEach(obstacle => {
      // Car body
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      
      // Car details
      ctx.fillStyle = "#333";
      ctx.fillRect(obstacle.x + 5, obstacle.y + 10, obstacle.width - 10, 15);
      ctx.fillRect(obstacle.x + 5, obstacle.y + 35, obstacle.width - 10, 15);
      
      ctx.fillStyle = "#ff4444";
    });

    // Draw player car
    ctx.fillStyle = "#44ff44";
    ctx.fillRect(gameState.player.x, gameState.player.y, CAR_WIDTH, CAR_HEIGHT);
    
    // Player car details
    ctx.fillStyle = "#333";
    ctx.fillRect(gameState.player.x + 5, gameState.player.y + 10, CAR_WIDTH - 10, 15);
    ctx.fillRect(gameState.player.x + 5, gameState.player.y + 35, CAR_WIDTH - 10, 15);

    // Draw UI
    ctx.fillStyle = "#fff";
    ctx.font = "16px Arial";
    ctx.fillText(`Distance: ${Math.floor(gameState.distance)}m`, 10, 25);
    ctx.fillText(`Score: ${gameState.score}`, 10, 45);
    ctx.fillText(`Speed: ${Math.floor(gameState.player.speed)} mph`, 10, 65);

    // Draw fuel bar
    const fuelBarWidth = 100;
    const fuelBarHeight = 10;
    const fuelBarX = CANVAS_WIDTH - fuelBarWidth - 10;
    const fuelBarY = 20;

    ctx.fillStyle = "#333";
    ctx.fillRect(fuelBarX, fuelBarY, fuelBarWidth, fuelBarHeight);
    
    ctx.fillStyle = gameState.fuel > 30 ? "#4CAF50" : gameState.fuel > 10 ? "#FF9800" : "#F44336";
    ctx.fillRect(fuelBarX, fuelBarY, (gameState.fuel / 100) * fuelBarWidth, fuelBarHeight);
    
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(fuelBarX, fuelBarY, fuelBarWidth, fuelBarHeight);

    ctx.fillStyle = "#fff";
    ctx.font = "12px Arial";
    ctx.fillText("FUEL", fuelBarX, fuelBarY - 5);
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
        localStorage.setItem("racing-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 22);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">🏎️ Racing Game</h2>
        <p className="text-sm text-muted-foreground">Drive fast and avoid other cars!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-2">
          <div className="relative bg-gradient-to-b from-blue-400 to-green-600 rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-96"
              data-testid="canvas-racing"
            />
            
            {gameState.gameStatus !== "playing" && (
              <div className="absolute inset-0 flex items-center justify-center text-white bg-black/50">
                <div className="text-center">
                  {gameState.gameStatus === "waiting" && (
                    <>
                      <div className="text-xl mb-2">🏎️ Ready to Race?</div>
                      <div className="text-sm mb-1">Arrow keys to steer and accelerate</div>
                      <div className="text-sm">Watch your fuel!</div>
                    </>
                  )}
                  
                  {gameState.gameStatus === "gameover" && (
                    <>
                      <div className="text-xl mb-2">Race Over!</div>
                      <div className="text-sm mb-2">Distance: {Math.floor(gameState.distance)}m</div>
                      <div className="text-sm mb-2">Final Score: {gameState.score}</div>
                      {gameState.fuel <= 0 && (
                        <div className="text-xs text-yellow-300 mt-1">Ran out of fuel! ⛽</div>
                      )}
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
            <Badge variant="outline">Distance: {Math.floor(gameState.distance)}m</Badge>
            <Badge variant="outline">Fuel: {Math.floor(gameState.fuel)}%</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetGame}>Reset</Button>
            <Button
              onClick={gameState.gameStatus === "waiting" ? startGame : resetGame}
              className="bg-pocket-red hover:bg-pocket-red-dark text-white"
            >
              {gameState.gameStatus === "playing" ? "Reset" : "Race"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5">
          <h3 className="text-sm font-semibold mb-2">How to Play</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Left/Right arrows to change lanes</li>
            <li>• Up arrow to accelerate (uses fuel)</li>
            <li>• Avoid red cars and manage your fuel</li>
            <li>• Drive as far as you can for points</li>
            <li>• Earn 1 ⭐ for every 22 points scored</li>
          </ul>
        </CardContent>
      </Card>
      {/* Mobile Controls */}
      <div className="flex justify-center gap-4 sm:hidden">
        <Button
          variant="outline"
          size="lg"
          className="h-16 w-20"
          onTouchStart={() => { keysRef.current['ArrowLeft'] = true; setTimeout(() => keysRef.current['ArrowLeft'] = false, 100); }}
          onClick={() => { keysRef.current['ArrowLeft'] = true; setTimeout(() => keysRef.current['ArrowLeft'] = false, 100); }}
        >
          ← LEFT
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 w-20"
          onTouchStart={() => { keysRef.current['ArrowRight'] = true; setTimeout(() => keysRef.current['ArrowRight'] = false, 100); }}
          onClick={() => { keysRef.current['ArrowRight'] = true; setTimeout(() => keysRef.current['ArrowRight'] = false, 100); }}
        >
          RIGHT →
        </Button>
      </div>
    </div>
  );
}