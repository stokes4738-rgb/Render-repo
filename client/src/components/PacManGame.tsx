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

interface Ghost extends Position {
  id: number;
  direction: Position;
  color: string;
  scared: boolean;
}

interface GameState {
  player: Position;
  ghosts: Ghost[];
  dots: Position[];
  powerPellets: Position[];
  score: number;
  lives: number;
  gameStatus: "waiting" | "playing" | "gameover";
  level: number;
  powerMode: boolean;
  powerModeTime: number;
}

const GRID_SIZE = 20;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 400;
const CELL_SIZE = CANVAS_WIDTH / GRID_SIZE;

export default function PacManGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    player: { x: 10, y: 15 },
    ghosts: [],
    dots: [],
    powerPellets: [],
    score: 0,
    lives: 3,
    gameStatus: "waiting",
    level: 1,
    powerMode: false,
    powerModeTime: 0,
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("pacman-best-score") || "0", 10);
  });

  const [direction, setDirection] = useState<Position>({ x: 0, y: 0 });

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Pac-Man - scored ${gameState.score} points`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 18)} points!`,
      });
    },
  });

  const createMaze = useCallback(() => {
    const dots: Position[] = [];
    const powerPellets: Position[] = [];
    
    // Simple maze - create dots everywhere except walls and starting positions
    for (let x = 1; x < GRID_SIZE - 1; x++) {
      for (let y = 1; y < GRID_SIZE - 1; y++) {
        // Skip walls (simple pattern)
        if ((x % 4 === 0 && y % 4 === 0) || 
            (x === 10 && y === 15) || // player start
            (x >= 8 && x <= 12 && y >= 8 && y <= 12)) { // ghost area
          continue;
        }
        
        // Power pellets in corners
        if ((x === 1 && y === 1) || (x === 1 && y === GRID_SIZE - 2) ||
            (x === GRID_SIZE - 2 && y === 1) || (x === GRID_SIZE - 2 && y === GRID_SIZE - 2)) {
          powerPellets.push({ x, y });
        } else {
          dots.push({ x, y });
        }
      }
    }
    
    return { dots, powerPellets };
  }, []);

  const createGhosts = useCallback((): Ghost[] => {
    const colors = ["#ff0000", "#ffb8ff", "#00ffff", "#ffb852"];
    const ghosts: Ghost[] = [];
    
    for (let i = 0; i < 4; i++) {
      ghosts.push({
        id: i,
        x: 9 + i,
        y: 10,
        direction: { x: 0, y: -1 },
        color: colors[i],
        scared: false,
      });
    }
    
    return ghosts;
  }, []);

  const resetGame = useCallback(() => {
    const { dots, powerPellets } = createMaze();
    setGameState({
      player: { x: 10, y: 15 },
      ghosts: createGhosts(),
      dots,
      powerPellets,
      score: 0,
      lives: 3,
      gameStatus: "waiting",
      level: 1,
      powerMode: false,
      powerModeTime: 0,
    });
    setDirection({ x: 0, y: 0 });
  }, [createMaze, createGhosts]);

  const isValidMove = useCallback((pos: Position): boolean => {
    return pos.x >= 0 && pos.x < GRID_SIZE && 
           pos.y >= 0 && pos.y < GRID_SIZE &&
           !(pos.x % 4 === 0 && pos.y % 4 === 0); // Simple wall detection
  }, []);

  const gameLoop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      let newState = { ...prev };

      // Move player
      if (direction.x !== 0 || direction.y !== 0) {
        const newPlayerPos = {
          x: newState.player.x + direction.x,
          y: newState.player.y + direction.y,
        };

        if (isValidMove(newPlayerPos)) {
          newState.player = newPlayerPos;
        }
      }

      // Check dot collection
      newState.dots = newState.dots.filter(dot => {
        if (dot.x === newState.player.x && dot.y === newState.player.y) {
          newState.score += 10;
          return false;
        }
        return true;
      });

      // Check power pellet collection
      newState.powerPellets = newState.powerPellets.filter(pellet => {
        if (pellet.x === newState.player.x && pellet.y === newState.player.y) {
          newState.score += 50;
          newState.powerMode = true;
          newState.powerModeTime = 300; // 5 seconds at 60 FPS
          newState.ghosts = newState.ghosts.map(ghost => ({ ...ghost, scared: true }));
          return false;
        }
        return true;
      });

      // Update power mode
      if (newState.powerMode) {
        newState.powerModeTime -= 1;
        if (newState.powerModeTime <= 0) {
          newState.powerMode = false;
          newState.ghosts = newState.ghosts.map(ghost => ({ ...ghost, scared: false }));
        }
      }

      // Move ghosts (simple AI)
      newState.ghosts = newState.ghosts.map(ghost => {
        const possibleMoves = [
          { x: ghost.x + 1, y: ghost.y },
          { x: ghost.x - 1, y: ghost.y },
          { x: ghost.x, y: ghost.y + 1 },
          { x: ghost.x, y: ghost.y - 1 },
        ].filter(pos => isValidMove(pos));

        if (possibleMoves.length > 0) {
          let nextMove;
          
          if (ghost.scared) {
            // Move away from player
            const distances = possibleMoves.map(pos => {
              const dx = pos.x - newState.player.x;
              const dy = pos.y - newState.player.y;
              return { pos, distance: Math.sqrt(dx * dx + dy * dy) };
            });
            nextMove = distances.sort((a, b) => b.distance - a.distance)[0].pos;
          } else {
            // Move towards player (simple pathfinding)
            const distances = possibleMoves.map(pos => {
              const dx = pos.x - newState.player.x;
              const dy = pos.y - newState.player.y;
              return { pos, distance: Math.sqrt(dx * dx + dy * dy) };
            });
            nextMove = distances.sort((a, b) => a.distance - b.distance)[0].pos;
          }

          return {
            ...ghost,
            x: nextMove.x,
            y: nextMove.y,
            direction: {
              x: nextMove.x - ghost.x,
              y: nextMove.y - ghost.y,
            },
          };
        }

        return ghost;
      });

      // Check ghost collisions
      newState.ghosts.forEach(ghost => {
        if (ghost.x === newState.player.x && ghost.y === newState.player.y) {
          if (ghost.scared && newState.powerMode) {
            // Eat ghost
            newState.score += 200;
            ghost.x = 10; // Reset ghost position
            ghost.y = 10;
            ghost.scared = false;
          } else {
            // Player dies
            newState.lives -= 1;
            if (newState.lives <= 0) {
              newState.gameStatus = "gameover";
            } else {
              // Reset positions
              newState.player = { x: 10, y: 15 };
              newState.ghosts = createGhosts();
              newState.powerMode = false;
              newState.powerModeTime = 0;
            }
          }
        }
      });

      // Check level complete
      if (newState.dots.length === 0 && newState.powerPellets.length === 0) {
        newState.level += 1;
        const { dots, powerPellets } = createMaze();
        newState.dots = dots;
        newState.powerPellets = powerPellets;
        newState.score += 1000; // Level bonus
        newState.player = { x: 10, y: 15 };
        newState.ghosts = createGhosts();
        newState.powerMode = false;
        newState.powerModeTime = 0;
        
        toast({
          title: `Level ${newState.level - 1} Complete!`,
          description: "+1000 bonus points!",
        });
      }

      return newState;
    });
  }, [direction, isValidMove, createGhosts, createMaze, toast]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw maze walls
    ctx.fillStyle = "#0000ff";
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (x % 4 === 0 && y % 4 === 0) {
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    // Draw dots
    ctx.fillStyle = "#ffff00";
    gameState.dots.forEach(dot => {
      ctx.beginPath();
      ctx.arc(
        dot.x * CELL_SIZE + CELL_SIZE / 2,
        dot.y * CELL_SIZE + CELL_SIZE / 2,
        2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });

    // Draw power pellets
    ctx.fillStyle = "#ffffff";
    gameState.powerPellets.forEach(pellet => {
      ctx.beginPath();
      ctx.arc(
        pellet.x * CELL_SIZE + CELL_SIZE / 2,
        pellet.y * CELL_SIZE + CELL_SIZE / 2,
        6,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });

    // Draw player (Pac-Man)
    ctx.fillStyle = gameState.powerMode ? "#ffff80" : "#ffff00";
    const playerX = gameState.player.x * CELL_SIZE + CELL_SIZE / 2;
    const playerY = gameState.player.y * CELL_SIZE + CELL_SIZE / 2;
    
    ctx.beginPath();
    ctx.arc(playerX, playerY, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw mouth
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(playerX, playerY);
    ctx.arc(playerX, playerY, CELL_SIZE / 2 - 2, 0, Math.PI / 3);
    ctx.fill();

    // Draw ghosts
    gameState.ghosts.forEach(ghost => {
      ctx.fillStyle = ghost.scared && gameState.powerMode ? "#0000ff" : ghost.color;
      const ghostX = ghost.x * CELL_SIZE + CELL_SIZE / 2;
      const ghostY = ghost.y * CELL_SIZE + CELL_SIZE / 2;
      
      // Body
      ctx.beginPath();
      ctx.arc(ghostX, ghostY - 2, CELL_SIZE / 2 - 2, Math.PI, 0);
      ctx.fillRect(ghostX - CELL_SIZE / 2 + 2, ghostY - 2, CELL_SIZE - 4, CELL_SIZE / 2);
      ctx.fill();
      
      // Eyes
      if (!ghost.scared) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(ghostX - 4, ghostY - 6, 3, 4);
        ctx.fillRect(ghostX + 1, ghostY - 6, 3, 4);
        ctx.fillStyle = "#000";
        ctx.fillRect(ghostX - 3, ghostY - 5, 1, 2);
        ctx.fillRect(ghostX + 2, ghostY - 5, 1, 2);
      }
    });

    // Draw score
    ctx.fillStyle = "#fff";
    ctx.font = "16px Arial";
    ctx.fillText(`Score: ${gameState.score}`, 10, 25);
    ctx.fillText(`Lives: ${gameState.lives}`, 10, 45);
    ctx.fillText(`Level: ${gameState.level}`, 10, 65);
    
    if (gameState.powerMode) {
      ctx.fillStyle = "#ffff00";
      ctx.fillText("POWER MODE!", CANVAS_WIDTH - 120, 25);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState.gameStatus === "playing") {
      const interval = setInterval(gameLoop, 1000 / 10); // Slower than other games
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
        localStorage.setItem("pacman-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 18);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState.gameStatus !== "playing") return;

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          e.stopPropagation();
          setDirection({ x: 0, y: -1 });
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          e.stopPropagation();
          setDirection({ x: 0, y: 1 });
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          e.stopPropagation();
          setDirection({ x: -1, y: 0 });
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          e.stopPropagation();
          setDirection({ x: 1, y: 0 });
          break;
      }
    };

    if (gameState.gameStatus === "playing") {
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
    }
  }, [gameState.gameStatus]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">👻 Pac-Man</h2>
        <p className="text-sm text-muted-foreground">Collect dots and avoid ghosts!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-2">
          <div 
            className="relative bg-black rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-pocket-red"
            tabIndex={0}
            data-testid="game-container-pacman"
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-96 cursor-crosshair"
              data-testid="canvas-pacman"
            />
            
            {gameState.gameStatus !== "playing" && (
              <div className="absolute inset-0 flex items-center justify-center text-white bg-black/50">
                <div className="text-center">
                  {gameState.gameStatus === "waiting" && (
                    <>
                      <div className="text-xl mb-2">👻 Ready to Play Pac-Man?</div>
                      <div className="text-sm mb-1">Arrow keys to move</div>
                      <div className="text-sm">Collect all dots to win!</div>
                    </>
                  )}
                  
                  {gameState.gameStatus === "gameover" && (
                    <>
                      <div className="text-xl mb-2">Game Over!</div>
                      <div className="text-sm mb-2">Final Score: {gameState.score}</div>
                      <div className="text-sm mb-2">Level Reached: {gameState.level}</div>
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
            <li>• Arrow keys to move around the maze</li>
            <li>• Collect yellow dots for points</li>
            <li>• Power pellets make ghosts scared (blue)</li>
            <li>• Eat scared ghosts for bonus points</li>
            <li>• Earn 1 ⭐ for every 18 points scored</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}