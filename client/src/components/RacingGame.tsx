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
  boost: number;
}

interface Obstacle extends Position {
  width: number;
  height: number;
  speed: number;
  type: 'car' | 'rock' | 'oil';
  color: string;
}

interface Powerup extends Position {
  type: 'fuel' | 'boost' | 'points';
  collected: boolean;
}

interface GameState {
  player: Car;
  obstacles: Obstacle[];
  powerups: Powerup[];
  score: number;
  speed: number;
  gameStatus: "waiting" | "playing" | "gameover";
  distance: number;
  fuel: number;
  level: number;
  lives: number;
  combo: number;
  particles: Particle[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const LANE_WIDTH = CANVAS_WIDTH / 3;
const CAR_WIDTH = 45;
const CAR_HEIGHT = 70;

export default function RacingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [gameState, setGameState] = useState<GameState>({
    player: { x: LANE_WIDTH + LANE_WIDTH / 2 - CAR_WIDTH / 2, y: CANVAS_HEIGHT - 120, speed: 0, lane: 1, boost: 0 },
    obstacles: [],
    powerups: [],
    score: 0,
    speed: 3,
    gameStatus: "waiting",
    distance: 0,
    fuel: 100,
    level: 1,
    lives: 3,
    combo: 0,
    particles: [],
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("racing-best-score") || "0", 10);
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const obstacleIdRef = useRef(0);
  const roadOffsetRef = useRef(0);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Racing Game - Level ${gameState.level}, Score ${gameState.score}`,
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

  const resetGame = useCallback(() => {
    setGameState({
      player: { x: LANE_WIDTH + LANE_WIDTH / 2 - CAR_WIDTH / 2, y: CANVAS_HEIGHT - 120, speed: 0, lane: 1, boost: 0 },
      obstacles: [],
      powerups: [],
      score: 0,
      speed: 3,
      gameStatus: "waiting",
      distance: 0,
      fuel: 100,
      level: 1,
      lives: 3,
      combo: 0,
      particles: [],
    });
    roadOffsetRef.current = 0;
  }, []);

  const createParticles = (x: number, y: number, color: string, count: number = 5) => {
    const newParticles = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        x: x + Math.random() * 20 - 10,
        y: y + Math.random() * 20 - 10,
        vx: Math.random() * 6 - 3,
        vy: Math.random() * 6 - 3,
        life: 1.0,
        color,
        size: Math.random() * 4 + 2,
      });
    }
    return newParticles;
  };

  const gameLoop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      let newState = { ...prev };

      // Handle smooth lane switching
      const targetX = newState.player.lane * LANE_WIDTH + LANE_WIDTH / 2 - CAR_WIDTH / 2;
      if (Math.abs(newState.player.x - targetX) > 2) {
        newState.player.x += (targetX - newState.player.x) * 0.15;
      } else {
        newState.player.x = targetX;
      }

      // Handle input
      if (keysRef.current['ArrowLeft'] && newState.player.lane > 0) {
        newState.player.lane = Math.max(0, newState.player.lane - 1);
      }
      if (keysRef.current['ArrowRight'] && newState.player.lane < 2) {
        newState.player.lane = Math.min(2, newState.player.lane + 1);
      }

      // Handle boost
      if (keysRef.current['Space'] && newState.player.boost > 0) {
        newState.player.speed = Math.min(newState.player.speed + 0.5, 12);
        newState.player.boost = Math.max(0, newState.player.boost - 1);
        newState.particles.push(...createParticles(newState.player.x + CAR_WIDTH/2, newState.player.y + CAR_HEIGHT, '#00ff88', 3));
      } else if (keysRef.current['ArrowUp']) {
        newState.player.speed = Math.min(newState.player.speed + 0.2, 8);
        newState.fuel = Math.max(0, newState.fuel - 0.2);
      } else {
        newState.player.speed = Math.max(newState.player.speed - 0.15, 3);
      }

      // Check fuel
      if (newState.fuel <= 0) {
        newState.lives -= 1;
        newState.fuel = 50; // Emergency fuel
        newState.particles.push(...createParticles(newState.player.x + CAR_WIDTH/2, newState.player.y, '#ff4444', 8));
        if (newState.lives <= 0) {
          newState.gameStatus = "gameover";
          return newState;
        }
      }

      // Update distance, score, and level
      newState.distance += newState.player.speed;
      newState.score = Math.floor(newState.distance / 8) + newState.combo * 5;
      newState.level = Math.floor(newState.distance / 1000) + 1;
      newState.speed = Math.min(3 + newState.level * 0.5, 8);

      // Spawn obstacles with variety
      if (Math.random() < 0.02 + newState.level * 0.005) {
        const lane = Math.floor(Math.random() * 3);
        const obstacleTypes = [
          { type: 'car' as const, color: '#ff4444', width: 40, height: 60 },
          { type: 'rock' as const, color: '#666666', width: 30, height: 30 },
          { type: 'oil' as const, color: '#333333', width: 50, height: 25 },
        ];
        const obstacleType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
        
        newState.obstacles.push({
          x: lane * LANE_WIDTH + LANE_WIDTH / 2 - obstacleType.width / 2,
          y: -obstacleType.height,
          width: obstacleType.width,
          height: obstacleType.height,
          speed: newState.speed + Math.random() * 2,
          type: obstacleType.type,
          color: obstacleType.color,
        });
      }

      // Spawn powerups
      if (Math.random() < 0.008) {
        const lane = Math.floor(Math.random() * 3);
        const powerupTypes: Array<'fuel' | 'boost' | 'points'> = ['fuel', 'boost', 'points'];
        const type = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
        
        newState.powerups.push({
          x: lane * LANE_WIDTH + LANE_WIDTH / 2 - 15,
          y: -30,
          type,
          collected: false,
        });
      }

      // Update obstacles
      newState.obstacles = newState.obstacles.filter(obstacle => {
        obstacle.y += obstacle.speed;
        return obstacle.y < CANVAS_HEIGHT + obstacle.height;
      });

      // Update powerups
      newState.powerups = newState.powerups.filter(powerup => {
        if (!powerup.collected) {
          powerup.y += newState.speed;
          return powerup.y < CANVAS_HEIGHT + 30;
        }
        return false;
      });

      // Update particles
      newState.particles = newState.particles.filter(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 0.02;
        particle.vy += 0.1; // gravity
        return particle.life > 0;
      });

      // Collision detection with obstacles
      for (const obstacle of newState.obstacles) {
        if (
          newState.player.x < obstacle.x + obstacle.width &&
          newState.player.x + CAR_WIDTH > obstacle.x &&
          newState.player.y < obstacle.y + obstacle.height &&
          newState.player.y + CAR_HEIGHT > obstacle.y
        ) {
          if (obstacle.type === 'oil') {
            // Oil slick - lose control briefly
            newState.player.lane = Math.min(2, Math.max(0, newState.player.lane + (Math.random() > 0.5 ? 1 : -1)));
            newState.particles.push(...createParticles(obstacle.x, obstacle.y, '#444444', 6));
          } else {
            newState.lives -= 1;
            newState.combo = 0;
            newState.particles.push(...createParticles(newState.player.x + CAR_WIDTH/2, newState.player.y, '#ff4444', 10));
            if (newState.lives <= 0) {
              newState.gameStatus = "gameover";
              return newState;
            }
          }
          newState.obstacles = newState.obstacles.filter(o => o !== obstacle);
          break;
        }
      }

      // Powerup collection
      for (const powerup of newState.powerups) {
        if (
          !powerup.collected &&
          newState.player.x < powerup.x + 30 &&
          newState.player.x + CAR_WIDTH > powerup.x &&
          newState.player.y < powerup.y + 30 &&
          newState.player.y + CAR_HEIGHT > powerup.y
        ) {
          powerup.collected = true;
          newState.combo += 1;
          
          switch (powerup.type) {
            case 'fuel':
              newState.fuel = Math.min(100, newState.fuel + 30);
              newState.particles.push(...createParticles(powerup.x, powerup.y, '#44ff44', 6));
              break;
            case 'boost':
              newState.player.boost = Math.min(100, newState.player.boost + 50);
              newState.particles.push(...createParticles(powerup.x, powerup.y, '#4444ff', 6));
              break;
            case 'points':
              newState.score += 50;
              newState.particles.push(...createParticles(powerup.x, powerup.y, '#ffff44', 8));
              break;
          }
        }
      }

      return newState;
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#1a1a2e");
    gradient.addColorStop(0.5, "#16213e");
    gradient.addColorStop(1, "#0f1729");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw animated road
    roadOffsetRef.current += gameState.player.speed;
    if (roadOffsetRef.current > 40) roadOffsetRef.current = 0;

    // Road lanes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
      ctx.setLineDash([20, 20]);
      ctx.beginPath();
      ctx.moveTo(i * LANE_WIDTH, 0);
      ctx.lineTo(i * LANE_WIDTH, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Road markings (animated)
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 30]);
    ctx.lineDashOffset = -roadOffsetRef.current;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * LANE_WIDTH, 0);
      ctx.lineTo(i * LANE_WIDTH, CANVAS_HEIGHT);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw obstacles with improved graphics
    gameState.obstacles.forEach(obstacle => {
      ctx.save();
      ctx.translate(obstacle.x + obstacle.width/2, obstacle.y + obstacle.height/2);
      
      if (obstacle.type === 'car') {
        // Draw enemy car with more detail
        ctx.fillStyle = obstacle.color;
        ctx.fillRect(-obstacle.width/2, -obstacle.height/2, obstacle.width, obstacle.height);
        ctx.fillStyle = "#222";
        ctx.fillRect(-obstacle.width/2 + 5, -obstacle.height/2 + 5, obstacle.width - 10, obstacle.height - 10);
        // Headlights
        ctx.fillStyle = "#ffff88";
        ctx.fillRect(-obstacle.width/2 + 8, -obstacle.height/2 + 2, 8, 4);
        ctx.fillRect(obstacle.width/2 - 16, -obstacle.height/2 + 2, 8, 4);
      } else if (obstacle.type === 'rock') {
        // Draw rock
        ctx.fillStyle = obstacle.color;
        ctx.beginPath();
        ctx.arc(0, 0, obstacle.width/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#888";
        ctx.beginPath();
        ctx.arc(-5, -5, obstacle.width/4, 0, Math.PI * 2);
        ctx.fill();
      } else if (obstacle.type === 'oil') {
        // Draw oil spill
        ctx.fillStyle = obstacle.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, obstacle.width/2, obstacle.height/2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#555";
        ctx.beginPath();
        ctx.ellipse(0, 0, obstacle.width/3, obstacle.height/3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // Draw powerups with glow effect
    gameState.powerups.forEach(powerup => {
      if (!powerup.collected) {
        ctx.save();
        ctx.translate(powerup.x + 15, powerup.y + 15);
        
        // Glow effect
        ctx.shadowBlur = 20;
        
        if (powerup.type === 'fuel') {
          ctx.shadowColor = "#44ff44";
          ctx.fillStyle = "#44ff44";
          ctx.fillRect(-10, -10, 20, 20);
          ctx.fillStyle = "#ffffff";
          ctx.font = "12px Arial";
          ctx.textAlign = "center";
          ctx.fillText("⛽", 0, 4);
        } else if (powerup.type === 'boost') {
          ctx.shadowColor = "#4444ff";
          ctx.fillStyle = "#4444ff";
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "12px Arial";
          ctx.textAlign = "center";
          ctx.fillText("🚀", 0, 4);
        } else if (powerup.type === 'points') {
          ctx.shadowColor = "#ffff44";
          ctx.fillStyle = "#ffff44";
          ctx.beginPath();
          ctx.moveTo(0, -12);
          for (let i = 0; i < 5; i++) {
            ctx.lineTo(Math.cos((i * 4 * Math.PI) / 5 - Math.PI/2) * 12, Math.sin((i * 4 * Math.PI) / 5 - Math.PI/2) * 12);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "10px Arial";
          ctx.textAlign = "center";
          ctx.fillText("★", 0, 3);
        }
        ctx.restore();
      }
    });

    // Draw particles
    gameState.particles.forEach(particle => {
      ctx.save();
      ctx.globalAlpha = particle.life;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw player car with improved graphics
    const player = gameState.player;
    ctx.save();
    ctx.translate(player.x + CAR_WIDTH/2, player.y + CAR_HEIGHT/2);
    
    // Main car body
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT);
    
    // Car details
    ctx.fillStyle = "#004422";
    ctx.fillRect(-CAR_WIDTH/2 + 5, -CAR_HEIGHT/2 + 10, CAR_WIDTH - 10, CAR_HEIGHT - 20);
    
    // Windshield
    ctx.fillStyle = "#88ccff";
    ctx.fillRect(-CAR_WIDTH/2 + 8, -CAR_HEIGHT/2 + 15, CAR_WIDTH - 16, 15);
    
    // Headlights
    ctx.fillStyle = "#ffff88";
    ctx.fillRect(-CAR_WIDTH/2 + 3, -CAR_HEIGHT/2 + 2, 10, 6);
    ctx.fillRect(CAR_WIDTH/2 - 13, -CAR_HEIGHT/2 + 2, 10, 6);
    
    // Boost effect
    if (gameState.player.boost > 0 && keysRef.current['Space']) {
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(-CAR_WIDTH/2 + 10, CAR_HEIGHT/2, CAR_WIDTH - 20, 20);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-CAR_WIDTH/2 + 15, CAR_HEIGHT/2 + 5, CAR_WIDTH - 30, 10);
    }
    
    ctx.restore();

    // Draw UI overlay
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, 80);
    
    // Score and stats
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(`Score: ${gameState.score}`, 10, 20);
    ctx.fillText(`Level: ${gameState.level}`, 10, 40);
    ctx.fillText(`Lives: ${"❤️".repeat(gameState.lives)}`, 10, 60);
    
    // Fuel bar
    ctx.fillStyle = "#333";
    ctx.fillRect(150, 10, 100, 15);
    ctx.fillStyle = gameState.fuel > 30 ? "#44ff44" : "#ff4444";
    ctx.fillRect(150, 10, gameState.fuel, 15);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial";
    ctx.fillText("FUEL", 155, 22);
    
    // Boost bar
    ctx.fillStyle = "#333";
    ctx.fillRect(150, 30, 100, 15);
    ctx.fillStyle = "#4444ff";
    ctx.fillRect(150, 30, gameState.player.boost, 15);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("BOOST", 155, 42);
    
    // Speed indicator
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Arial";
    ctx.fillText(`Speed: ${Math.floor(gameState.player.speed)} mph`, 260, 25);
    
    // Combo
    if (gameState.combo > 0) {
      ctx.fillStyle = "#ffff44";
      ctx.font = "14px Arial";
      ctx.fillText(`Combo: ${gameState.combo}x`, 260, 45);
    }
    
    // Distance
    ctx.fillStyle = "#88ccff";
    ctx.font = "12px Arial";
    ctx.fillText(`${Math.floor(gameState.distance)}m`, 300, 65);

  }, [gameState]);

  // Input handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState.gameStatus === "playing") {
      const gameInterval = setInterval(gameLoop, 1000 / 60);
      return () => clearInterval(gameInterval);
    }
  }, [gameState.gameStatus, gameLoop]);

  // Draw loop
  useEffect(() => {
    const drawLoop = () => {
      draw();
      animationRef.current = requestAnimationFrame(drawLoop);
    };
    
    if (gameState.gameStatus !== "waiting") {
      drawLoop();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState.gameStatus, draw]);

  // Handle game over
  useEffect(() => {
    if (gameState.gameStatus === "gameover" && gameState.score > 0) {
      if (gameState.score > bestScore) {
        setBestScore(gameState.score);
        localStorage.setItem("racing-best-score", gameState.score.toString());
        toast({
          title: "🏆 New Best Score!",
          description: `Amazing! You scored ${gameState.score} points!`,
        });
      }

      if (user && gameState.score >= 15) {
        awardPointsMutation.mutate(Math.floor(gameState.score / 15));
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, user, awardPointsMutation, toast]);

  const startGame = () => {
    resetGame();
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">🏁 Turbo Racing</h2>
        <Badge variant="secondary">Best: {bestScore}</Badge>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-4">
          <div className="flex flex-col items-center space-y-4">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="border border-border rounded-lg bg-gray-900"
              style={{ maxWidth: "100%", height: "auto" }}
            />

            {gameState.gameStatus === "waiting" && (
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    🏎️ Race through traffic and collect powerups!
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>• ← → Arrow keys to change lanes</p>
                    <p>• ↑ Arrow key to accelerate</p>
                    <p>• SPACEBAR to boost (when available)</p>
                    <p>• Avoid obstacles, collect powerups!</p>
                    <p>• ⛽ Fuel | 🚀 Boost | ★ Bonus Points</p>
                  </div>
                </div>
                <Button onClick={startGame} className="bg-green-600 hover:bg-green-700">
                  Start Racing
                </Button>
              </div>
            )}

            {gameState.gameStatus === "gameover" && (
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">🏁 Race Finished!</h3>
                  <p className="text-muted-foreground">
                    Final Score: <span className="font-bold text-primary">{gameState.score}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Distance: {Math.floor(gameState.distance)}m | Level: {gameState.level}
                  </p>
                  {gameState.score >= 15 && (
                    <p className="text-xs text-green-400">
                      Earned {Math.floor(gameState.score / 15)} points! 🎯
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={startGame} className="bg-green-600 hover:bg-green-700">
                    Race Again
                  </Button>
                  <Button onClick={resetGame} variant="outline">
                    Menu
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}