import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Gamepad2, Trophy, Star, RotateCcw, Maximize, Play, Pause, Brain, Zap } from "lucide-react";

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
type GameType = 'flappy' | 'memory' | 'simon';

// Memory Game Component
function MemoryGame() {
  const [cards, setCards] = useState<Array<{id: number, value: string, flipped: boolean, matched: boolean}>>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cardEmojis = ['🎮', '🎯', '🎪', '🎨', '🎭', '🎸', '🎲', '🎳'];

  const submitScoreMutation = useMutation({
    mutationFn: async (moves: number) => {
      const points = Math.max(1, Math.floor(50 - moves)); // More points for fewer moves
      return apiRequest("POST", "/api/user/points", { 
        points, 
        reason: `Memory game - completed in ${moves} moves` 
      });
    },
    onSuccess: (data: any) => {
      const pointsEarned = Math.max(1, Math.floor(50 - moves));
      toast({
        title: "Memory Master! 🧠",
        description: `You earned ${pointsEarned} points for your memory skills!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const initializeCards = () => {
    const shuffled = [...cardEmojis, ...cardEmojis]
      .sort(() => Math.random() - 0.5)
      .map((value, index) => ({
        id: index,
        value,
        flipped: false,
        matched: false
      }));
    setCards(shuffled);
    setFlippedCards([]);
    setMoves(0);
    setMatches(0);
    setGameStarted(true);
  };

  const flipCard = (id: number) => {
    if (flippedCards.length === 2 || cards.find(c => c.id === id)?.flipped) return;

    setCards(prev => prev.map(card => 
      card.id === id ? { ...card, flipped: true } : card
    ));
    
    const newFlipped = [...flippedCards, id];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      
      setTimeout(() => {
        const card1 = cards.find(c => c.id === newFlipped[0]);
        const card2 = cards.find(c => c.id === newFlipped[1]);
        
        if (card1?.value === card2?.value) {
          setCards(prev => prev.map(card => 
            newFlipped.includes(card.id) ? { ...card, matched: true } : card
          ));
          setMatches(m => {
            const newMatches = m + 1;
            if (newMatches === 8) {
              submitScoreMutation.mutate(moves + 1);
            }
            return newMatches;
          });
        } else {
          setCards(prev => prev.map(card => 
            newFlipped.includes(card.id) ? { ...card, flipped: false } : card
          ));
        }
        setFlippedCards([]);
      }, 1000);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🧠 Memory Game</span>
          <Badge variant="secondary">Moves: {moves}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!gameStarted ? (
          <div className="text-center py-8">
            <Button onClick={initializeCards} className="flex-1" data-testid="button-start-memory">
              <Brain className="w-4 h-4 mr-2" />
              Start Memory Game
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 w-80 h-80 mx-auto">
            {cards.map(card => (
              <div
                key={card.id}
                onClick={() => flipCard(card.id)}
                className={`w-18 h-18 rounded-lg flex items-center justify-center text-2xl cursor-pointer transition-all ${
                  card.flipped || card.matched
                    ? 'bg-blue-200 dark:bg-blue-800'
                    : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                }`}
                data-testid={`memory-card-${card.id}`}
              >
                {(card.flipped || card.matched) ? card.value : '❓'}
              </div>
            ))}
          </div>
        )}

        {matches === 8 && (
          <div className="text-center">
            <p className="text-lg font-bold text-green-600">🎉 You Won!</p>
            <Button onClick={initializeCards} className="mt-2" data-testid="button-play-again-memory">
              Play Again
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🎯 Match all pairs of cards</p>
          <p>🧠 Remember where each card is!</p>
          <p>💰 Fewer moves = more points</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Simon Says Game Component
function SimonGame() {
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerSequence, setPlayerSequence] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShowingSequence, setIsShowingSequence] = useState(false);
  const [level, setLevel] = useState(0);
  const [activeButton, setActiveButton] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const colors = [
    { id: 0, color: 'bg-red-500', activeColor: 'bg-red-400', name: 'Red' },
    { id: 1, color: 'bg-blue-500', activeColor: 'bg-blue-400', name: 'Blue' },
    { id: 2, color: 'bg-green-500', activeColor: 'bg-green-400', name: 'Green' },
    { id: 3, color: 'bg-yellow-500', activeColor: 'bg-yellow-400', name: 'Yellow' },
  ];

  const submitScoreMutation = useMutation({
    mutationFn: async (level: number) => {
      const points = level * 5; // 5 points per level
      return apiRequest("POST", "/api/user/points", { 
        points, 
        reason: `Simon Says - reached level ${level}` 
      });
    },
    onSuccess: (data: any) => {
      const pointsEarned = level * 5;
      toast({
        title: "Simon Says Master! ⚡",
        description: `You earned ${pointsEarned} points for reaching level ${level}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const startGame = () => {
    setSequence([Math.floor(Math.random() * 4)]);
    setPlayerSequence([]);
    setLevel(1);
    setIsPlaying(true);
    setTimeout(() => showSequence([Math.floor(Math.random() * 4)]), 1000);
  };

  const showSequence = (seq: number[]) => {
    setIsShowingSequence(true);
    let i = 0;
    
    const interval = setInterval(() => {
      if (i < seq.length) {
        setActiveButton(seq[i]);
        setTimeout(() => setActiveButton(null), 500);
        i++;
      } else {
        clearInterval(interval);
        setIsShowingSequence(false);
      }
    }, 800);
  };

  const handleButtonClick = (buttonId: number) => {
    if (!isPlaying || isShowingSequence) return;

    setActiveButton(buttonId);
    setTimeout(() => setActiveButton(null), 200);

    const newPlayerSequence = [...playerSequence, buttonId];
    setPlayerSequence(newPlayerSequence);

    // Check if the player's input is correct
    if (sequence[newPlayerSequence.length - 1] !== buttonId) {
      // Game over
      toast({
        title: "Game Over! 😢",
        description: `You reached level ${level}. Try again!`,
        variant: "destructive",
      });
      if (level > 1) submitScoreMutation.mutate(level);
      setIsPlaying(false);
      setSequence([]);
      setPlayerSequence([]);
      setLevel(0);
    } else if (newPlayerSequence.length === sequence.length) {
      // Level complete
      setPlayerSequence([]);
      const nextSequence = [...sequence, Math.floor(Math.random() * 4)];
      setSequence(nextSequence);
      setLevel(level + 1);
      
      toast({
        title: "Level Up! 🎉",
        description: `Level ${level + 1}`,
      });
      
      setTimeout(() => showSequence(nextSequence), 1000);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>⚡ Simon Says</span>
          <Badge variant="secondary">Level: {level}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 w-80 h-80 mx-auto p-4">
          {colors.map(color => (
            <button
              key={color.id}
              onClick={() => handleButtonClick(color.id)}
              disabled={!isPlaying || isShowingSequence}
              className={`rounded-lg transition-all transform active:scale-95 ${
                activeButton === color.id ? color.activeColor : color.color
              } ${!isPlaying || isShowingSequence ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer'}`}
              data-testid={`simon-button-${color.id}`}
            >
              <span className="text-white text-lg font-bold">{color.name}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {!isPlaying ? (
            <Button onClick={startGame} className="flex-1" data-testid="button-start-simon">
              <Zap className="w-4 h-4 mr-2" />
              Start Game
            </Button>
          ) : (
            <Button onClick={() => {
              setIsPlaying(false);
              setSequence([]);
              setPlayerSequence([]);
              setLevel(0);
            }} variant="outline" className="flex-1" data-testid="button-stop-simon">
              <Pause className="w-4 h-4 mr-2" />
              Stop Game
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🎯 Watch the sequence and repeat it</p>
          <p>⚡ Each level adds one more to the sequence</p>
          <p>💰 Earn 5 points per level reached</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Flappy Bird Game Component (extracted)
function FlappyBirdGame() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    ...initialGameState,
    bestScore: parseInt(localStorage.getItem('flappy-best-score') || '0')
  }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const submitScoreMutation = useMutation({
    mutationFn: async (score: number) => {
      const points = Math.floor(score * 3); // 3 points per pipe passed
      return apiRequest("POST", "/api/user/points", { 
        points, 
        reason: `Flappy Bird - scored ${score} points` 
      });
    },
    onSuccess: (data: any) => {
      const pointsEarned = Math.floor(gameState.score * 3);
      if (pointsEarned > 0) {
        toast({
          title: "Points Earned! 🐦",
          description: `You earned ${pointsEarned} points for your flying skills!`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
    },
  });

  const jump = useCallback(() => {
    setGameState(prev => {
      if (!prev.gameStarted || prev.gameOver) {
        // Start or restart game
        return {
          ...initialGameState,
          gameStarted: true,
          bestScore: prev.bestScore,
        };
      }
      // Jump
      return {
        ...prev,
        bird: { ...prev.bird, velocity: GAME_CONFIG.jumpStrength },
      };
    });
  }, []);

  const resetGame = useCallback(() => {
    setGameState(prev => ({
      ...initialGameState,
      bestScore: prev.bestScore,
    }));
  }, []);

  // Handle keyboard and touch controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [jump]);

  // Game loop
  useEffect(() => {
    if (!gameState.gameStarted || gameState.gameOver) return;

    const pipeGenerationInterval = setInterval(() => {
      setGameState(prev => {
        if (!prev.gameStarted || prev.gameOver) return prev;
        
        const topHeight = Math.random() * (GAME_CONFIG.canvasHeight - GAME_CONFIG.pipeGap - 100) + 50;
        const bottomHeight = GAME_CONFIG.canvasHeight - topHeight - GAME_CONFIG.pipeGap;
        
        return {
          ...prev,
          pipes: [
            ...prev.pipes,
            {
              x: GAME_CONFIG.canvasWidth,
              topHeight,
              bottomHeight,
              id: Date.now(),
            },
          ].slice(-5), // Keep only last 5 pipes
        };
      });
    }, 2000);

    return () => clearInterval(pipeGenerationInterval);
  }, [gameState.gameStarted, gameState.gameOver]);

  // Physics and collision detection
  useEffect(() => {
    if (!gameState.gameStarted || gameState.gameOver) return;

    const gameLoop = () => {
      setGameState(prev => {
        if (!prev.gameStarted || prev.gameOver) return prev;

        const newState = { ...prev };
        
        // Update bird physics
        newState.bird.velocity = Math.min(newState.bird.velocity + GAME_CONFIG.gravity, 15);
        newState.bird.y = Math.max(0, Math.min(newState.bird.y + newState.bird.velocity, GAME_CONFIG.canvasHeight - GAME_CONFIG.birdSize));

        // Update pipes
        newState.pipes = newState.pipes.map(pipe => ({
          ...pipe,
          x: pipe.x - GAME_CONFIG.pipeSpeed,
        })).filter(pipe => pipe.x > -GAME_CONFIG.pipeWidth);

        // Score calculation
        newState.pipes.forEach(pipe => {
          if (pipe.x + GAME_CONFIG.pipeWidth === newState.bird.x - GAME_CONFIG.birdSize / 2) {
            newState.score += 1;
          }
        });

        // Collision detection
        const birdTop = newState.bird.y - GAME_CONFIG.birdSize / 2;
        const birdBottom = newState.bird.y + GAME_CONFIG.birdSize / 2;
        const birdLeft = newState.bird.x - GAME_CONFIG.birdSize / 2;
        const birdRight = newState.bird.x + GAME_CONFIG.birdSize / 2;

        // Ground collision
        if (birdBottom >= GAME_CONFIG.canvasHeight || birdTop <= 0) {
          newState.gameOver = true;
        }

        // Pipe collision
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
      ctx.fillText('Tap or press SPACE to start!', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2);
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
      ctx.fillText('Tap to play again!', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 + 60);
    }
  }, [gameState]);

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🐦 Flappy Bird</span>
          <Badge variant="secondary">Score: {gameState.score}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={GAME_CONFIG.canvasWidth}
            height={GAME_CONFIG.canvasHeight}
            onClick={jump}
            className="border border-border rounded-lg cursor-pointer mx-auto block"
            style={{ 
              maxWidth: '100%',
              height: 'auto',
              imageRendering: 'pixelated',
              touchAction: 'none'
            }}
            data-testid="canvas-flappy-bird"
          />
        </div>

        {/* Game Controls */}
        <div className="space-y-3">
          <div className="flex gap-2">
            {!gameState.gameStarted || gameState.gameOver ? (
              <Button 
                onClick={jump} 
                className="flex-1 gap-2"
                size="lg"
                data-testid="button-start-game"
              >
                <Play className="w-5 h-5" />
                {gameState.gameOver ? 'Play Again' : 'Start Game'}
              </Button>
            ) : (
              <Button 
                onClick={jump} 
                className="flex-1 gap-2 bg-blue-500 hover:bg-blue-600"
                size="lg"
                data-testid="button-jump"
              >
                <span className="animate-bounce text-2xl">🐦</span>
                TAP TO FLY
              </Button>
            )}
            
            <Button 
              variant="outline" 
              onClick={resetGame}
              size="lg"
              data-testid="button-reset-game"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🎯 <strong>Mobile:</strong> Tap anywhere to fly</p>
          <p>💻 <strong>Desktop:</strong> Press SPACE or ↑</p>
          <p>💰 <strong>Rewards:</strong> 3 points per pipe!</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Games() {
  const { user } = useAuth();
  const [selectedGame, setSelectedGame] = useState<GameType>('flappy');
  const [isFullscreen, setIsFullscreen] = useState(false);

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
            <div className="text-2xl font-bold">3</div>
            <div className="text-sm text-muted-foreground">Games</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Gamepad2 className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">Play</div>
            <div className="text-sm text-muted-foreground">& Earn</div>
          </CardContent>
        </Card>
      </div>

      {/* Game Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5" />
            🎮 Choose Your Game
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant={selectedGame === 'flappy' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('flappy')}
              className="h-24 flex-col gap-2"
              data-testid="button-select-flappy"
            >
              <span className="text-3xl">🐦</span>
              <span className="text-sm font-medium">Flappy Bird</span>
            </Button>
            
            <Button
              variant={selectedGame === 'memory' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('memory')}
              className="h-24 flex-col gap-2"
              data-testid="button-select-memory"
            >
              <Brain className="w-8 h-8" />
              <span className="text-sm font-medium">Memory</span>
            </Button>
            
            <Button
              variant={selectedGame === 'simon' ? 'default' : 'outline'}
              onClick={() => setSelectedGame('simon')}
              className="h-24 flex-col gap-2"
              data-testid="button-select-simon"
            >
              <Zap className="w-8 h-8" />
              <span className="text-sm font-medium">Simon Says</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Game Components */}
      {selectedGame === 'flappy' && <FlappyBirdGame />}
      {selectedGame === 'memory' && <MemoryGame />}
      {selectedGame === 'simon' && <SimonGame />}
    </div>
  );
}