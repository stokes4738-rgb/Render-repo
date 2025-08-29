import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Gamepad2, Trophy, Star, RotateCcw, Maximize, Play, Pause, Grid3X3, Brain, Zap, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";

// Game state interface
interface GameState {
  bird: { x: number; y: number; velocity: number };
  pipes: Array<{ x: number; topHeight: number; bottomHeight: number; id: number }>;
  score: number;
  gameStarted: boolean;
  gameOver: boolean;
  bestScore: number;
}

// Initial game state
const initialGameState: GameState = {
  bird: { x: 100, y: 200, velocity: 0 },
  pipes: [],
  score: 0,
  gameStarted: false,
  gameOver: false,
  bestScore: 0,
};

const GAME_CONFIG = {
  gravity: 0.6,
  jumpStrength: -12,
  pipeWidth: 80,
  pipeGap: 150,
  pipeSpeed: 3,
  birdSize: 20,
  canvasWidth: 400,
  canvasHeight: 400,
};

// Game type definitions
type GameType = 'flappy' | 'snake' | '2048' | 'memory' | 'simon';

export default function Games() {
  const [selectedGame, setSelectedGame] = useState<GameType>('flappy');
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Load best score from localStorage on mount
  useEffect(() => {
    const savedBestScore = localStorage.getItem('flappy-best-score');
    if (savedBestScore) {
      setGameState(prev => ({ ...prev, bestScore: parseInt(savedBestScore) }));
    }
  }, []);

  const submitScoreMutation = useMutation({
    mutationFn: async (score: number) => {
      const points = Math.floor(score / 5); // 1 point per 5 score
      return apiRequest("POST", "/api/user/points", { 
        points, 
        reason: `Flappy Bird game - scored ${score} points` 
      });
    },
    onSuccess: (data: any) => {
      const pointsEarned = Math.floor(gameState.score / 5);
      if (pointsEarned > 0) {
        toast({
          title: "Points Earned! 🎉",
          description: `You earned ${pointsEarned} points for scoring ${gameState.score}!`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
    },
    onError: () => {
      toast({
        title: "Score Submit Failed",
        description: "Couldn't submit your score, but the game still counts!",
        variant: "destructive",
      });
    },
  });

  const resetGame = useCallback(() => {
    setGameState(initialGameState);
  }, []);

  const startGame = useCallback(() => {
    setGameState(prev => ({ 
      ...prev, 
      gameStarted: true, 
      gameOver: false,
      bird: { x: 100, y: 200, velocity: 0 },
      pipes: [],
      score: 0
    }));
  }, []);

  const jump = useCallback(() => {
    if (!gameState.gameStarted) {
      startGame();
      return;
    }
    
    if (gameState.gameOver) {
      resetGame();
      return;
    }

    setGameState(prev => ({
      ...prev,
      bird: { ...prev.bird, velocity: GAME_CONFIG.jumpStrength }
    }));
  }, [gameState.gameStarted, gameState.gameOver, startGame, resetGame]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        jump();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [jump]);

  // Game loop
  useEffect(() => {
    if (!gameState.gameStarted || gameState.gameOver) return;

    const gameLoop = () => {
      setGameState(prev => {
        const newState = { ...prev };
        
        // Update bird
        newState.bird.velocity += GAME_CONFIG.gravity;
        newState.bird.y += newState.bird.velocity;

        // Generate pipes
        if (newState.pipes.length === 0 || newState.pipes[newState.pipes.length - 1].x < GAME_CONFIG.canvasWidth - 200) {
          const topHeight = Math.random() * (GAME_CONFIG.canvasHeight - GAME_CONFIG.pipeGap - 100) + 50;
          newState.pipes.push({
            x: GAME_CONFIG.canvasWidth,
            topHeight,
            bottomHeight: GAME_CONFIG.canvasHeight - topHeight - GAME_CONFIG.pipeGap,
            id: Date.now()
          });
        }

        // Move pipes and check for scoring
        newState.pipes = newState.pipes.map(pipe => ({ ...pipe, x: pipe.x - GAME_CONFIG.pipeSpeed }))
          .filter(pipe => pipe.x > -GAME_CONFIG.pipeWidth);

        // Check for score
        newState.pipes.forEach(pipe => {
          if (pipe.x + GAME_CONFIG.pipeWidth < newState.bird.x && pipe.x + GAME_CONFIG.pipeWidth > newState.bird.x - GAME_CONFIG.pipeSpeed) {
            newState.score += 1;
          }
        });

        // Collision detection
        const birdTop = newState.bird.y - GAME_CONFIG.birdSize / 2;
        const birdBottom = newState.bird.y + GAME_CONFIG.birdSize / 2;
        const birdLeft = newState.bird.x - GAME_CONFIG.birdSize / 2;
        const birdRight = newState.bird.x + GAME_CONFIG.birdSize / 2;

        // Check ground and ceiling collision
        if (birdTop <= 0 || birdBottom >= GAME_CONFIG.canvasHeight) {
          newState.gameOver = true;
        }

        // Check pipe collision
        newState.pipes.forEach(pipe => {
          if (birdRight > pipe.x && birdLeft < pipe.x + GAME_CONFIG.pipeWidth) {
            if (birdTop < pipe.topHeight || birdBottom > GAME_CONFIG.canvasHeight - pipe.bottomHeight) {
              newState.gameOver = true;
            }
          }
        });

        // Handle game over
        if (newState.gameOver && newState.score > 0) {
          if (newState.score > newState.bestScore) {
            newState.bestScore = newState.score;
            localStorage.setItem('flappy-best-score', newState.score.toString());
          }
          
          // Submit score for points
          submitScoreMutation.mutate(newState.score);
        }

        return newState;
      });

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState.gameStarted, gameState.gameOver, submitScoreMutation]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);

    // Draw background
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_CONFIG.canvasHeight);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#98FB98');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);

    // Draw bird
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(gameState.bird.x, gameState.bird.y, GAME_CONFIG.birdSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Bird eye
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(gameState.bird.x + 5, gameState.bird.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw pipes
    ctx.fillStyle = '#228B22';
    gameState.pipes.forEach(pipe => {
      // Top pipe
      ctx.fillRect(pipe.x, 0, GAME_CONFIG.pipeWidth, pipe.topHeight);
      // Bottom pipe
      ctx.fillRect(pipe.x, GAME_CONFIG.canvasHeight - pipe.bottomHeight, GAME_CONFIG.pipeWidth, pipe.bottomHeight);
    });

    // Draw score
    ctx.fillStyle = '#000';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(gameState.score.toString(), GAME_CONFIG.canvasWidth / 2, 40);

    // Draw instructions/game over text
    if (!gameState.gameStarted) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🐦 Flappy Bird', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 - 40);
      ctx.font = '16px Arial';
      ctx.fillText('Click or press SPACE to start!', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2);
      ctx.fillText('Earn points for high scores!', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 + 30);
    }

    if (gameState.gameOver) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.fillRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 - 40);
      ctx.font = '18px Arial';
      ctx.fillText(`Score: ${gameState.score}`, GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2);
      ctx.fillText(`Best: ${gameState.bestScore}`, GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 + 30);
      ctx.font = '14px Arial';
      ctx.fillText('Click to play again!', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 + 60);
    }
  }, [gameState]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2 mb-2">
          <Gamepad2 className="w-6 h-6 text-primary" />
          🎮 Arcade Games
        </h1>
        <p className="text-muted-foreground">
          Play games and earn points! Higher scores = more rewards!
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Star className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{user?.points || 0}</div>
            <div className="text-sm text-muted-foreground">Points</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Trophy className="w-6 h-6 text-orange-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{gameState.bestScore}</div>
            <div className="text-sm text-muted-foreground">Best Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Gamepad2 className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{gameState.score}</div>
            <div className="text-sm text-muted-foreground">Current</div>
          </CardContent>
        </Card>
      </div>

      {/* Flappy Bird Game */}
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🐦 Flappy Bird</span>
            <Badge variant="secondary">Earn Points!</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={GAME_CONFIG.canvasWidth}
              height={GAME_CONFIG.canvasHeight}
              onClick={jump}
              className={`border border-border rounded-lg cursor-pointer mx-auto block ${
                isFullscreen ? 'fixed inset-0 z-50 w-full h-full' : ''
              }`}
              style={{ 
                maxWidth: '100%',
                imageRendering: 'pixelated'
              }}
              data-testid="canvas-flappy-bird"
            />
            
            {/* Game overlay buttons */}
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleFullscreen}
                className="bg-background/80 backdrop-blur-sm"
                data-testid="button-fullscreen-toggle"
              >
                <Maximize className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Game Controls */}
          <div className="flex gap-2">
            {!gameState.gameStarted || gameState.gameOver ? (
              <Button 
                onClick={jump} 
                className="flex-1 gap-2"
                data-testid="button-start-game"
              >
                <Play className="w-4 h-4" />
                {gameState.gameOver ? 'Play Again' : 'Start Game'}
              </Button>
            ) : (
              <Button 
                onClick={jump} 
                className="flex-1 gap-2"
                data-testid="button-jump"
              >
                <span className="animate-bounce">🐦</span>
                Jump!
              </Button>
            )}
            
            <Button 
              variant="outline" 
              onClick={resetGame}
              data-testid="button-reset-game"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>🎯 <strong>Controls:</strong> Click, SPACE, or ↑ Arrow to jump</p>
            <p>🏆 <strong>Scoring:</strong> Higher scores earn more points!</p>
            <p>💡 <strong>Tip:</strong> Stay calm and time your jumps!</p>
          </div>
        </CardContent>
      </Card>

      {/* Game Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5" />
            🎮 Choose Your Game
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Button
              variant={selectedGame === 'flappy' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('flappy')}
              className="h-20 flex-col gap-2"
              data-testid="button-select-flappy"
            >
              <span className="text-2xl">🐦</span>
              <span className="text-sm">Flappy Bird</span>
            </Button>
            
            <Button
              variant={selectedGame === 'snake' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('snake')}
              className="h-20 flex-col gap-2"
              data-testid="button-select-snake"
            >
              <span className="text-2xl">🐍</span>
              <span className="text-sm">Snake</span>
            </Button>
            
            <Button
              variant={selectedGame === '2048' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('2048')}
              className="h-20 flex-col gap-2"
              data-testid="button-select-2048"
            >
              <Grid3X3 className="w-6 h-6" />
              <span className="text-sm">2048</span>
            </Button>
            
            <Button
              variant={selectedGame === 'memory' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('memory')}
              className="h-20 flex-col gap-2"
              data-testid="button-select-memory"
            >
              <Brain className="w-6 h-6" />
              <span className="text-sm">Memory</span>
            </Button>
            
            <Button
              variant={selectedGame === 'simon' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('simon')}
              className="h-20 flex-col gap-2"
              data-testid="button-select-simon"
            >
              <Zap className="w-6 h-6" />
              <span className="text-sm">Simon Says</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Game Components */}
      {selectedGame === 'flappy' && <FlappyBirdGame />}
      {selectedGame === 'snake' && <SnakeGame />}
      {selectedGame === '2048' && <Game2048 />}
      {selectedGame === 'memory' && <MemoryGame />}
      {selectedGame === 'simon' && <SimonGame />}
    </div>
  );
}