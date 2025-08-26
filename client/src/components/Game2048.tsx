import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { apiRequest } from "@/lib/queryClient";
import { Maximize, Minimize } from "lucide-react";

type Board = number[][];

interface GameStats {
  score: number;
  bestScore: number;
  moves: number;
}

const BOARD_SIZE = 4;
const WIN_TILE = 2048;

export default function Game2048() {
  const [board, setBoard] = useState<Board>(() => initializeBoard());
  const [gameStats, setGameStats] = useState<GameStats>({
    score: 0,
    bestScore: parseInt(localStorage.getItem("2048-best-score") || "0", 10),
    moves: 0,
  });
  const [gameWon, setGameWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `2048 game - scored ${gameStats.score} points`,
      });
    },
    onSuccess: (_, points) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned ${points} points from your 2048 game!`,
      });
    },
  });

  function initializeBoard(): Board {
    const newBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
    addRandomTile(newBoard);
    addRandomTile(newBoard);
    return newBoard;
  }

  function addRandomTile(board: Board): Board {
    const emptyCells: [number, number][] = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        if (board[i][j] === 0) {
          emptyCells.push([i, j]);
        }
      }
    }
    
    if (emptyCells.length > 0) {
      const [row, col] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      board[row][col] = Math.random() < 0.9 ? 2 : 4;
    }
    
    return board;
  }

  function moveRow(row: number[], direction: 'left' | 'right'): { newRow: number[]; scoreGain: number; moved: boolean } {
    let scoreGain = 0;
    let moved = false;
    
    // Filter out zeros
    let filteredRow = row.filter(cell => cell !== 0);
    
    // Reverse if moving right
    if (direction === 'right') {
      filteredRow = filteredRow.reverse();
    }
    
    // Merge tiles
    const mergedRow = [];
    let i = 0;
    while (i < filteredRow.length) {
      if (i < filteredRow.length - 1 && filteredRow[i] === filteredRow[i + 1]) {
        const mergedValue = filteredRow[i] * 2;
        mergedRow.push(mergedValue);
        scoreGain += mergedValue;
        i += 2;
      } else {
        mergedRow.push(filteredRow[i]);
        i++;
      }
    }
    
    // Add zeros and reverse back if needed
    let finalRow;
    if (direction === 'right') {
      finalRow = [...Array(BOARD_SIZE - mergedRow.length).fill(0), ...mergedRow.reverse()];
    } else {
      finalRow = [...mergedRow, ...Array(BOARD_SIZE - mergedRow.length).fill(0)];
    }
    
    if (JSON.stringify(row) !== JSON.stringify(finalRow)) {
      moved = true;
    }
    
    return { newRow: finalRow, scoreGain, moved };
  }

  function move(direction: 'left' | 'right' | 'up' | 'down'): void {
    let newBoard = [...board.map(row => [...row])];
    let totalScore = 0;
    let anyMoved = false;
    
    if (direction === 'left' || direction === 'right') {
      // Move rows horizontally
      for (let i = 0; i < BOARD_SIZE; i++) {
        const { newRow, scoreGain, moved } = moveRow(newBoard[i], direction);
        newBoard[i] = newRow;
        totalScore += scoreGain;
        if (moved) anyMoved = true;
      }
    } else {
      // Move columns vertically
      for (let j = 0; j < BOARD_SIZE; j++) {
        const column = newBoard.map(row => row[j]);
        const { newRow, scoreGain, moved } = moveRow(column, direction === 'up' ? 'left' : 'right');
        for (let i = 0; i < BOARD_SIZE; i++) {
          newBoard[i][j] = newRow[i];
        }
        totalScore += scoreGain;
        if (moved) anyMoved = true;
      }
    }
    
    if (anyMoved) {
      addRandomTile(newBoard);
      setBoard(newBoard);
      setGameStats(prev => ({
        ...prev,
        score: prev.score + totalScore,
        moves: prev.moves + 1,
      }));
      setAnimationKey(prev => prev + 1);
      
      // Check for win condition
      if (!gameWon && newBoard.some(row => row.some(cell => cell >= WIN_TILE))) {
        setGameWon(true);
        const finalScore = gameStats.score + totalScore;
        const pointsEarned = Math.floor(finalScore / 50); // Better reward for winning
        if (pointsEarned > 0) {
          awardPointsMutation.mutate(pointsEarned);
        }
        toast({
          title: "🎉 You Won!",
          description: `You reached 2048! Earned ${pointsEarned} points! Keep playing for more.`,
        });
      }
      
      // Check for game over
      if (isGameOver(newBoard)) {
        setGameOver(true);
        const finalScore = gameStats.score + totalScore;
        const pointsEarned = Math.floor(finalScore / 100); // Still decent points for trying
        if (pointsEarned > 0) {
          awardPointsMutation.mutate(pointsEarned);
        }
        toast({
          title: "Game Over",
          description: `Final score: ${finalScore}. You earned ${pointsEarned} points!`,
        });
      }
    }
  }

  function isGameOver(board: Board): boolean {
    // Check for empty cells
    for (let i = 0; i < BOARD_SIZE; i++) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        if (board[i][j] === 0) return false;
      }
    }
    
    // Check for possible merges
    for (let i = 0; i < BOARD_SIZE; i++) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        const current = board[i][j];
        if (
          (i < BOARD_SIZE - 1 && board[i + 1][j] === current) ||
          (j < BOARD_SIZE - 1 && board[i][j + 1] === current)
        ) {
          return false;
        }
      }
    }
    
    return true;
  }

  function resetGame() {
    const newBoard = initializeBoard();
    setBoard(newBoard);
    setGameStats(prev => ({
      score: 0,
      bestScore: Math.max(prev.bestScore, prev.score),
      moves: 0,
    }));
    setGameWon(false);
    setGameOver(false);
    setAnimationKey(0);
  }

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

  // Save best score to localStorage
  useEffect(() => {
    if (gameStats.score > gameStats.bestScore) {
      localStorage.setItem("2048-best-score", gameStats.score.toString());
    }
  }, [gameStats.score, gameStats.bestScore]);

  // Handle movement for both keyboard and mobile
  const handleMove = useCallback((direction: "left" | "right" | "up" | "down") => {
    if (gameOver) return;
    move(direction);
  }, [gameOver]);

  const handleKeyPress = useCallback((e: { key: string }) => {
    if (gameOver) return;
    
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        handleMove('left');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        handleMove('right');
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        handleMove('up');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        handleMove('down');
        break;
    }
  }, [gameOver, handleMove]);

  // Keyboard controls
  useEffect(() => {
    const keyboardHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleKeyPress({ key: e.key });
    };

    if (!gameOver) {
      document.addEventListener('keydown', keyboardHandler, { capture: true });
      return () => document.removeEventListener('keydown', keyboardHandler, { capture: true });
    }
  }, [gameOver, handleKeyPress]);

  function getTileColor(value: number): string {
    const colors: Record<number, string> = {
      2: "bg-slate-100 text-slate-800",
      4: "bg-slate-200 text-slate-800",
      8: "bg-orange-200 text-orange-800",
      16: "bg-orange-300 text-orange-900",
      32: "bg-orange-400 text-white",
      64: "bg-orange-500 text-white",
      128: "bg-yellow-300 text-yellow-900",
      256: "bg-yellow-400 text-yellow-900",
      512: "bg-yellow-500 text-white",
      1024: "bg-red-400 text-white",
      2048: "bg-red-500 text-white",
    };
    
    return colors[value] || "bg-red-600 text-white";
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="relative inline-block">
          <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-orange-400 to-red-600 bg-clip-text text-transparent">🔢 2048</h2>
          <div className="absolute -inset-1 bg-gradient-to-r from-orange-400 to-red-600 rounded-lg blur opacity-20 animate-pulse"></div>
        </div>
        <p className="text-sm text-muted-foreground">
          Merge tiles and reach the ultimate 2048 goal!
        </p>
      </div>

      {/* Game Stats */}
      <Card className="theme-transition">
        <CardContent className="p-3 flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="outline" data-testid="badge-2048-score">
              Score: <span className="font-bold">{gameStats.score}</span>
            </Badge>
            <Badge variant="outline" data-testid="badge-2048-best">
              Best: <span className="font-bold">{gameStats.bestScore}</span>
            </Badge>
            <Badge variant="outline" data-testid="badge-2048-moves">
              Moves: <span className="font-bold">{gameStats.moves}</span>
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetGame}
            data-testid="button-2048-reset"
          >
            New Game
          </Button>
        </CardContent>
      </Card>

      {/* Game Board */}
      <Card className="theme-transition shadow-2xl border-2 border-orange-500/20">
        <CardContent className="p-4 bg-gradient-to-br from-orange-50/50 to-red-50/50 dark:from-orange-950/20 dark:to-red-950/20">
          <div 
            className="grid grid-cols-4 gap-3 bg-gradient-to-br from-orange-200 to-red-200 dark:from-orange-900/50 dark:to-red-900/50 p-4 rounded-xl max-w-80 mx-auto focus:outline-none focus:ring-4 focus:ring-orange-500/50 shadow-inner border border-orange-300 dark:border-orange-700"
            data-testid="board-2048"
            tabIndex={0}
            key={animationKey}
          >
            {board.map((row, i) =>
              row.map((cell, j) => (
                <div
                  key={`${i}-${j}`}
                  className={`
                    w-16 h-16 rounded flex items-center justify-center font-bold text-sm
                    transition-all duration-150 ease-in-out
                    ${cell === 0 
                      ? "bg-slate-200 dark:bg-slate-600" 
                      : `${getTileColor(cell)} transform scale-105`
                    }
                  `}
                  data-testid={`tile-${i}-${j}`}
                >
                  {cell !== 0 && cell}
                </div>
              ))
            )}
          </div>

          {/* Touch Controls for Mobile */}
          <div className="grid grid-cols-3 gap-2 mt-4 max-w-48 mx-auto">
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onPointerDown={() => move('up')}
              data-testid="button-2048-up"
            >
              ↑
            </Button>
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onPointerDown={() => move('left')}
              data-testid="button-2048-left"
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPointerDown={() => move('down')}
              data-testid="button-2048-down"
            >
              ↓
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPointerDown={() => move('right')}
              data-testid="button-2048-right"
            >
              →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Game Status */}
      {(gameWon || gameOver) && (
        <Card className="theme-transition border-pocket-gold">
          <CardContent className="p-4 text-center">
            {gameWon && !gameOver && (
              <div className="space-y-2">
                <div className="text-xl font-bold text-pocket-gold">🎉 You Won!</div>
                <div className="text-sm text-muted-foreground">
                  You reached 2048! Continue playing for a higher score.
                </div>
              </div>
            )}
            {gameOver && (
              <div className="space-y-2">
                <div className="text-xl font-bold text-red-500">Game Over!</div>
                <div className="text-sm text-muted-foreground">
                  Final Score: {gameStats.score}
                </div>
                <Button
                  onClick={resetGame}
                  className="mt-2"
                  data-testid="button-2048-play-again"
                >
                  Play Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="theme-transition">
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <div><strong>HOW TO PLAY:</strong> Use arrow keys to move tiles.</div>
            <div>When two tiles with the same number touch, they merge into one!</div>
            <div><strong>POINTS:</strong> Win = 1 point per 50 score, Game Over = 1 point per 100 score</div>
          </div>
        </CardContent>
      </Card>
      {/* Mobile Controls */}
      <div className="flex justify-center gap-8 sm:hidden">
        {/* Directional Pad */}
        <div className="relative">
          <div className="grid grid-cols-3 gap-1 w-32 h-32">
            {/* Top */}
            <div></div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 p-0"
              onTouchStart={() => handleKeyPress({ key: 'ArrowUp' } as KeyboardEvent)}
              onClick={() => handleKeyPress({ key: 'ArrowUp' } as KeyboardEvent)}
              disabled={gameOver}
            >
              ↑
            </Button>
            <div></div>
            
            {/* Middle */}
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 p-0"
              onTouchStart={() => handleKeyPress({ key: 'ArrowLeft' } as KeyboardEvent)}
              onClick={() => handleKeyPress({ key: 'ArrowLeft' } as KeyboardEvent)}
              disabled={gameOver}
            >
              ←
            </Button>
            <div className="w-10 h-10 flex items-center justify-center text-xs text-muted-foreground">2048</div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 p-0"
              onTouchStart={() => handleKeyPress({ key: 'ArrowRight' } as KeyboardEvent)}
              onClick={() => handleKeyPress({ key: 'ArrowRight' } as KeyboardEvent)}
              disabled={gameOver}
            >
              →
            </Button>
            
            {/* Bottom */}
            <div></div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 p-0"
              onTouchStart={() => handleKeyPress({ key: 'ArrowDown' } as KeyboardEvent)}
              onClick={() => handleKeyPress({ key: 'ArrowDown' } as KeyboardEvent)}
              disabled={gameOver}
            >
              ↓
            </Button>
            <div></div>
          </div>
        </div>
      </div>
    </div>
  );
}