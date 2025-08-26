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

interface Bullet extends Position {
  id: number;
}

interface Alien extends Position {
  id: number;
  alive: boolean;
}

interface GameState {
  player: Position;
  bullets: Bullet[];
  aliens: Alien[];
  score: number;
  lives: number;
  gameStatus: "waiting" | "playing" | "gameover" | "victory";
  wave: number;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 8;
const ALIEN_SPEED = 0.5;

export default function SpaceInvaders() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    player: { x: CANVAS_WIDTH / 2 - 15, y: CANVAS_HEIGHT - 40 },
    bullets: [],
    aliens: [],
    score: 0,
    lives: 3,
    gameStatus: "waiting",
    wave: 1,
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("space-invaders-best-score") || "0", 10);
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const bulletIdRef = useRef(0);
  const alienIdRef = useRef(0);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Space Invaders - scored ${gameState.score} points`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${Math.floor(gameState.score / 10)} points!`,
      });
    },
  });

  const createAliens = useCallback((wave: number) => {
    const aliens: Alien[] = [];
    const rows = Math.min(3 + wave, 6);
    const cols = 8;
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        aliens.push({
          id: alienIdRef.current++,
          x: 60 + col * 60,
          y: 50 + row * 40,
          alive: true,
        });
      }
    }
    return aliens;
  }, []);

  const resetGame = useCallback(() => {
    setGameState({
      player: { x: CANVAS_WIDTH / 2 - 15, y: CANVAS_HEIGHT - 40 },
      bullets: [],
      aliens: createAliens(1),
      score: 0,
      lives: 3,
      gameStatus: "waiting",
      wave: 1,
    });
  }, [createAliens]);

  const gameLoop = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;

      let newState = { ...prev };

      // Move player
      if (keysRef.current['ArrowLeft'] && newState.player.x > 0) {
        newState.player = { ...newState.player, x: newState.player.x - PLAYER_SPEED };
      }
      if (keysRef.current['ArrowRight'] && newState.player.x < CANVAS_WIDTH - 30) {
        newState.player = { ...newState.player, x: newState.player.x + PLAYER_SPEED };
      }

      // Move bullets
      newState.bullets = newState.bullets
        .map(bullet => ({ ...bullet, y: bullet.y - BULLET_SPEED }))
        .filter(bullet => bullet.y > 0);

      // Move aliens
      newState.aliens = newState.aliens.map(alien => ({
        ...alien,
        y: alien.y + ALIEN_SPEED,
      }));

      // Check bullet-alien collisions
      newState.bullets.forEach(bullet => {
        newState.aliens.forEach(alien => {
          if (
            alien.alive &&
            bullet.x > alien.x - 15 &&
            bullet.x < alien.x + 30 &&
            bullet.y > alien.y - 15 &&
            bullet.y < alien.y + 30
          ) {
            alien.alive = false;
            newState.score += 10;
            newState.bullets = newState.bullets.filter(b => b.id !== bullet.id);
          }
        });
      });

      // Check if all aliens defeated
      if (!newState.aliens.some(alien => alien.alive)) {
        newState.wave += 1;
        newState.aliens = createAliens(newState.wave);
        newState.score += 100; // Wave bonus
        toast({
          title: `Wave ${newState.wave - 1} Complete!`,
          description: "+100 bonus points!",
        });
      }

      // Check if aliens reach player
      const aliensReachedPlayer = newState.aliens.some(
        alien => alien.alive && alien.y > CANVAS_HEIGHT - 80
      );

      if (aliensReachedPlayer) {
        newState.lives -= 1;
        if (newState.lives <= 0) {
          newState.gameStatus = "gameover";
        } else {
          // Reset aliens position
          newState.aliens = createAliens(newState.wave);
        }
      }

      return newState;
    });
  }, [createAliens, toast]);

  const shoot = useCallback(() => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing") return prev;
      
      const newBullet: Bullet = {
        id: bulletIdRef.current++,
        x: prev.player.x + 15,
        y: prev.player.y,
      };

      return {
        ...prev,
        bullets: [...prev.bullets, newBullet],
      };
    });
  }, []);

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
    for (let i = 0; i < 50; i++) {
      ctx.fillRect(
        Math.random() * CANVAS_WIDTH,
        Math.random() * CANVAS_HEIGHT,
        1, 1
      );
    }

    // Draw player
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(gameState.player.x, gameState.player.y, 30, 20);
    ctx.fillRect(gameState.player.x + 12, gameState.player.y - 10, 6, 10);

    // Draw bullets
    ctx.fillStyle = "#ffff00";
    gameState.bullets.forEach(bullet => {
      ctx.fillRect(bullet.x, bullet.y, 2, 8);
    });

    // Draw aliens
    gameState.aliens.forEach(alien => {
      if (alien.alive) {
        ctx.fillStyle = "#ff0040";
        ctx.fillRect(alien.x, alien.y, 25, 20);
        // Eyes
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(alien.x + 5, alien.y + 5, 3, 3);
        ctx.fillRect(alien.x + 17, alien.y + 5, 3, 3);
      }
    });

    // Draw UI
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(`Score: ${gameState.score}`, 10, 25);
    ctx.fillText(`Lives: ${gameState.lives}`, 10, 45);
    ctx.fillText(`Wave: ${gameState.wave}`, 10, 65);
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
        localStorage.setItem("space-invaders-best-score", newBestScore.toString());
      }
      
      const pointsEarned = Math.floor(gameState.score / 10);
      if (pointsEarned > 0) {
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.score, bestScore, awardPointsMutation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState.gameStatus !== "playing") return;
      
      const validKeys = ['ArrowLeft', 'ArrowRight', ' ', 'a', 'A', 'd', 'D'];
      if (validKeys.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        keysRef.current[e.key] = true;
        
        if (e.key === ' ') {
          shoot();
        }
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
  }, [gameState.gameStatus, shoot]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

  const handleMobileMove = (direction: string) => {
    if (gameState.gameStatus === "playing") {
      keysRef.current[direction] = true;
      setTimeout(() => {
        keysRef.current[direction] = false;
      }, 100);
    }
  };

  const handleMobileShoot = () => {
    if (gameState.gameStatus === "playing") {
      shoot();
    }
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
          <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent">🚀 Space Invaders</h2>
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-lg blur opacity-20 animate-pulse"></div>
        </div>
        <p className="text-sm text-muted-foreground">Defend Earth from the alien invasion!</p>
      </div>

      <Card className="theme-transition shadow-2xl border-2 border-cyan-500/20">
        <CardContent className="p-2">
          <div 
            className="relative bg-gradient-to-b from-blue-900 via-cyan-900/20 to-black rounded-xl overflow-hidden focus:outline-none focus:ring-4 focus:ring-cyan-500/50 shadow-inner border border-cyan-500/30"
            tabIndex={0}
            data-testid="game-container-space-invaders"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/10 to-transparent rounded-xl"></div>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-80 cursor-crosshair relative z-10 rounded-lg"
              data-testid="canvas-space-invaders"
            />
            
            {gameState.gameStatus !== "playing" && (
              <div className="absolute inset-0 flex items-center justify-center text-white bg-gradient-to-br from-black/80 via-cyan-900/60 to-black/80 backdrop-blur-sm rounded-xl">
                <div className="text-center p-6 bg-black/30 rounded-2xl border border-cyan-500/30 backdrop-blur-md">
                  {gameState.gameStatus === "waiting" && (
                    <>
                      <div className="text-2xl mb-4 animate-bounce">🚀 Ready for Battle?</div>
                      <div className="text-sm mb-2 text-cyan-300">Arrow keys or touch controls to move</div>
                      <div className="text-sm text-blue-300">Space bar or tap to shoot</div>
                    </>
                  )}
                  
                  {gameState.gameStatus === "gameover" && (
                    <>
                      <div className="text-2xl mb-4 text-red-400 animate-pulse">💥 Game Over!</div>
                      <div className="text-lg mb-2 font-bold text-cyan-400">Final Score: {gameState.score}</div>
                      <div className="text-sm mb-2 text-blue-400">Reached Wave: {gameState.wave}</div>
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

      <Card className="theme-transition">
        <CardContent className="p-3.5 flex justify-between items-center bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/50 dark:to-blue-950/50">
          <div className="flex gap-3">
            <Badge variant="outline" className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 shadow-md">Score: {gameState.score}</Badge>
            <Badge variant="outline" className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0 shadow-md">Best: {bestScore}</Badge>
            <Badge variant="outline" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 shadow-md">Wave: {gameState.wave}</Badge>
            <Badge variant="outline" className="bg-gradient-to-r from-red-500 to-orange-500 text-white border-0 shadow-md">Lives: {gameState.lives}</Badge>
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
            <li>• Arrow keys to move left and right</li>
            <li>• Spacebar to shoot at aliens</li>
            <li>• Destroy all aliens to advance waves</li>
            <li>• Earn 1 ⭐ for every 10 points scored</li>
          </ul>
        </CardContent>
      </Card>
      {/* Mobile Controls */}
      <div className="flex justify-center gap-8 sm:hidden">
        {/* Movement Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="h-16 w-16"
            onTouchStart={() => handleMobileMove('ArrowLeft')}
            onClick={() => handleMobileMove('ArrowLeft')}
          >
            ←
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-16 w-16"
            onTouchStart={() => handleMobileMove('ArrowRight')}
            onClick={() => handleMobileMove('ArrowRight')}
          >
            →
          </Button>
        </div>
        
        {/* Shoot Button */}
        <Button
          variant="outline"
          size="lg"
          className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 text-white"
          onTouchStart={handleMobileShoot}
          onClick={handleMobileShoot}
        >
          🚀
        </Button>
      </div>
    </div>
  );
}