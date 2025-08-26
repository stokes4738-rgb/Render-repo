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

interface Ship extends Position {
  angle: number;
  velocity: Position;
  thrust: boolean;
}

interface Bullet extends Position {
  id: number;
  velocity: Position;
  life: number;
}

interface Asteroid extends Position {
  id: number;
  velocity: Position;
  size: number;
  angle: number;
  rotationSpeed: number;
}

interface GameState {
  ship: Ship;
  bullets: Bullet[];
  asteroids: Asteroid[];
  score: number;
  lives: number;
  gameStatus: "waiting" | "playing" | "gameover";
  level: number;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const SHIP_SIZE = 12;
const ASTEROID_SIZES = [40, 25, 15];

export default function AsteroidsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    ship: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, angle: 0, velocity: { x: 0, y: 0 }, thrust: false },
    bullets: [],
    asteroids: [],
    score: 0,
    lives: 3,
    gameStatus: "waiting",
    level: 1,
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("asteroids-best-score") || "0", 10);
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const bulletIdRef = useRef(0);
  const asteroidIdRef = useRef(0);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Asteroids - scored ${gameState.score} points`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 12)} points!`,
      });
    },
  });

  const wrapPosition = useCallback((pos: Position): Position => {
    return {
      x: ((pos.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH,
      y: ((pos.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT,
    };
  }, []);

  const createAsteroids = useCallback((level: number) => {
    const asteroids: Asteroid[] = [];
    const count = Math.min(4 + level, 12);
    
    for (let i = 0; i < count; i++) {
      asteroids.push({
        id: asteroidIdRef.current++,
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        velocity: {
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 2,
        },
        size: ASTEROID_SIZES[0],
        angle: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
      });
    }
    
    return asteroids;
  }, []);

  const resetGame = useCallback(() => {
    setGameState({
      ship: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, angle: 0, velocity: { x: 0, y: 0 }, thrust: false },
      bullets: [],
      asteroids: createAsteroids(1),
      score: 0,
      lives: 3,
      gameStatus: "waiting",
      level: 1,
    });
  }, [createAsteroids]);

  const shoot = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;
      
      const bullet: Bullet = {
        id: bulletIdRef.current++,
        x: prev.ship.x + Math.cos(prev.ship.angle) * SHIP_SIZE,
        y: prev.ship.y + Math.sin(prev.ship.angle) * SHIP_SIZE,
        velocity: {
          x: Math.cos(prev.ship.angle) * 8,
          y: Math.sin(prev.ship.angle) * 8,
        },
        life: 60, // 1 second at 60 FPS
      };

      return {
        ...prev,
        bullets: [...prev.bullets, bullet],
      };
    });
  }, []);

  const gameLoop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      let newState = { ...prev };

      // Update ship
      let thrust = keysRef.current['ArrowUp'] || keysRef.current['w'] || keysRef.current['W'];
      let turnLeft = keysRef.current['ArrowLeft'] || keysRef.current['a'] || keysRef.current['A'];
      let turnRight = keysRef.current['ArrowRight'] || keysRef.current['d'] || keysRef.current['D'];

      if (turnLeft) newState.ship.angle -= 0.1;
      if (turnRight) newState.ship.angle += 0.1;

      if (thrust) {
        const thrustPower = 0.3;
        newState.ship.velocity.x += Math.cos(newState.ship.angle) * thrustPower;
        newState.ship.velocity.y += Math.sin(newState.ship.angle) * thrustPower;
        newState.ship.thrust = true;
      } else {
        newState.ship.thrust = false;
      }

      // Apply friction
      newState.ship.velocity.x *= 0.98;
      newState.ship.velocity.y *= 0.98;

      // Update ship position
      newState.ship.x += newState.ship.velocity.x;
      newState.ship.y += newState.ship.velocity.y;
      newState.ship = { ...newState.ship, ...wrapPosition(newState.ship) };

      // Update bullets
      newState.bullets = newState.bullets
        .map(bullet => ({
          ...bullet,
          x: bullet.x + bullet.velocity.x,
          y: bullet.y + bullet.velocity.y,
          life: bullet.life - 1,
        }))
        .map(bullet => ({ ...bullet, ...wrapPosition(bullet) }))
        .filter(bullet => bullet.life > 0);

      // Update asteroids
      newState.asteroids = newState.asteroids.map(asteroid => {
        const newPos = wrapPosition({
          x: asteroid.x + asteroid.velocity.x,
          y: asteroid.y + asteroid.velocity.y,
        });
        return {
          ...asteroid,
          x: newPos.x,
          y: newPos.y,
          angle: asteroid.angle + asteroid.rotationSpeed,
        };
      });

      // Check bullet-asteroid collisions
      newState.bullets.forEach(bullet => {
        newState.asteroids.forEach(asteroid => {
          const dx = bullet.x - asteroid.x;
          const dy = bullet.y - asteroid.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < asteroid.size / 2) {
            // Hit!
            newState.bullets = newState.bullets.filter(b => b.id !== bullet.id);
            newState.asteroids = newState.asteroids.filter(a => a.id !== asteroid.id);
            
            // Score points
            newState.score += ASTEROID_SIZES.indexOf(asteroid.size) === 0 ? 20 : 
                           ASTEROID_SIZES.indexOf(asteroid.size) === 1 ? 50 : 100;
            
            // Break asteroid into smaller pieces
            if (asteroid.size > ASTEROID_SIZES[ASTEROID_SIZES.length - 1]) {
              const newSize = ASTEROID_SIZES[ASTEROID_SIZES.indexOf(asteroid.size) + 1];
              
              for (let i = 0; i < 2; i++) {
                newState.asteroids.push({
                  id: asteroidIdRef.current++,
                  x: asteroid.x,
                  y: asteroid.y,
                  velocity: {
                    x: (Math.random() - 0.5) * 4,
                    y: (Math.random() - 0.5) * 4,
                  },
                  size: newSize,
                  angle: Math.random() * Math.PI * 2,
                  rotationSpeed: (Math.random() - 0.5) * 0.15,
                });
              }
            }
          }
        });
      });

      // Check ship-asteroid collisions
      newState.asteroids.forEach(asteroid => {
        const dx = newState.ship.x - asteroid.x;
        const dy = newState.ship.y - asteroid.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < (asteroid.size / 2 + SHIP_SIZE / 2)) {
          newState.lives -= 1;
          if (newState.lives <= 0) {
            newState.gameStatus = "gameover";
          } else {
            // Reset ship position
            newState.ship = { 
              x: CANVAS_WIDTH / 2, 
              y: CANVAS_HEIGHT / 2, 
              angle: 0, 
              velocity: { x: 0, y: 0 },
              thrust: false 
            };
          }
        }
      });

      // Check if level complete
      if (newState.asteroids.length === 0) {
        newState.level += 1;
        newState.asteroids = createAsteroids(newState.level);
        newState.score += 100; // Level bonus
        toast({
          title: `Level ${newState.level - 1} Complete!`,
          description: "+100 bonus points!",
        });
      }

      return newState;
    });
  }, [wrapPosition, createAsteroids, toast]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#000011";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stars
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 100; i++) {
      const x = (i * 37) % CANVAS_WIDTH;
      const y = (i * 43) % CANVAS_HEIGHT;
      ctx.fillRect(x, y, 1, 1);
    }

    // Draw ship
    ctx.save();
    ctx.translate(gameState.ship.x, gameState.ship.y);
    ctx.rotate(gameState.ship.angle);
    
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE, 0);
    ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2);
    ctx.lineTo(-SHIP_SIZE / 4, 0);
    ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2);
    ctx.closePath();
    ctx.stroke();

    // Draw thrust
    if (gameState.ship.thrust) {
      ctx.strokeStyle = "#ff4400";
      ctx.beginPath();
      ctx.moveTo(-SHIP_SIZE / 4, -3);
      ctx.lineTo(-SHIP_SIZE, 0);
      ctx.lineTo(-SHIP_SIZE / 4, 3);
      ctx.stroke();
    }
    
    ctx.restore();

    // Draw bullets
    ctx.fillStyle = "#ffffff";
    gameState.bullets.forEach(bullet => {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw asteroids
    gameState.asteroids.forEach(asteroid => {
      ctx.save();
      ctx.translate(asteroid.x, asteroid.y);
      ctx.rotate(asteroid.angle);
      
      ctx.strokeStyle = "#888888";
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const points = 8;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const radius = asteroid.size / 2 + Math.sin(angle * 3) * (asteroid.size / 8);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });

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
        localStorage.setItem("asteroids-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 12);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (e.key === ' ' && gameState.gameStatus === "playing") {
        e.preventDefault();
        shoot();
      }
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
  }, [gameState.gameStatus, shoot]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">🚀 Asteroids</h2>
        <p className="text-sm text-muted-foreground">Destroy asteroids and survive in space!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-2">
          <div className="relative bg-gradient-to-b from-purple-900 to-black rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-80"
              data-testid="canvas-asteroids"
            />
            
            {gameState.gameStatus !== "playing" && (
              <div className="absolute inset-0 flex items-center justify-center text-white bg-black/50">
                <div className="text-center">
                  {gameState.gameStatus === "waiting" && (
                    <>
                      <div className="text-xl mb-2">🚀 Ready for Space Combat?</div>
                      <div className="text-sm mb-1">Arrow keys or WASD to move</div>
                      <div className="text-sm">Space to shoot</div>
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
            <li>• Arrow keys or WASD to rotate and thrust</li>
            <li>• Space bar to shoot asteroids</li>
            <li>• Large asteroids break into smaller ones</li>
            <li>• Clear all asteroids to advance levels</li>
            <li>• Earn 1 ⭐ for every 12 points scored</li>
          </ul>
        </CardContent>
      </Card>
      {/* Mobile Controls */}
      <div className="flex justify-center gap-4 sm:hidden">
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-12 w-12 p-0"
            onTouchStart={() => { keysRef.current['ArrowUp'] = true; setTimeout(() => keysRef.current['ArrowUp'] = false, 100); }}
            onClick={() => { keysRef.current['ArrowUp'] = true; setTimeout(() => keysRef.current['ArrowUp'] = false, 100); }}
          >
            ↑
          </Button>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-12 w-12 p-0"
              onTouchStart={() => { keysRef.current['ArrowLeft'] = true; setTimeout(() => keysRef.current['ArrowLeft'] = false, 100); }}
              onClick={() => { keysRef.current['ArrowLeft'] = true; setTimeout(() => keysRef.current['ArrowLeft'] = false, 100); }}
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-12 w-12 p-0"
              onTouchStart={() => { keysRef.current['ArrowRight'] = true; setTimeout(() => keysRef.current['ArrowRight'] = false, 100); }}
              onClick={() => { keysRef.current['ArrowRight'] = true; setTimeout(() => keysRef.current['ArrowRight'] = false, 100); }}
            >
              →
            </Button>
          </div>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="h-16 w-16 rounded-full bg-orange-500 hover:bg-orange-600 text-white"
          onTouchStart={() => { keysRef.current['Space'] = true; setTimeout(() => keysRef.current['Space'] = false, 100); }}
          onClick={() => { keysRef.current['Space'] = true; setTimeout(() => keysRef.current['Space'] = false, 100); }}
        >
          🚀
        </Button>
      </div>
    </div>
  );
}