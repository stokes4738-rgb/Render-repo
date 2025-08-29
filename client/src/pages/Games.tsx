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

// Snake Game Component
function SnakeGame() {
  const [snake, setSnake] = useState([{ x: 10, y: 10 }]);
  const [food, setFood] = useState({ x: 5, y: 5 });
  const [direction, setDirection] = useState({ x: 0, y: 0 });
  const [gameRunning, setGameRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const submitScoreMutation = useMutation({
    mutationFn: async (score: number) => {
      const points = Math.floor(score * 2); // 2 points per food eaten
      return apiRequest("POST", "/api/user/points", { 
        points, 
        reason: `Snake game - ate ${score} food items` 
      });
    },
    onSuccess: (data: any) => {
      const pointsEarned = Math.floor(score * 2);
      if (pointsEarned > 0) {
        toast({
          title: "Points Earned! 🐍",
          description: `You earned ${pointsEarned} points for your snake skills!`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
    },
  });

  const resetSnake = () => {
    setSnake([{ x: 10, y: 10 }]);
    setFood({ x: 5, y: 5 });
    setDirection({ x: 0, y: 0 });
    setGameRunning(false);
    setScore(0);
    setGameOver(false);
  };

  const startSnake = () => {
    resetSnake();
    setDirection({ x: 1, y: 0 });
    setGameRunning(true);
  };

  // Snake game loop
  useEffect(() => {
    if (!gameRunning || gameOver) return;

    const gameInterval = setInterval(() => {
      setSnake(currentSnake => {
        const newSnake = [...currentSnake];
        const head = { x: newSnake[0].x + direction.x, y: newSnake[0].y + direction.y };

        // Wall collision
        if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20) {
          setGameOver(true);
          setGameRunning(false);
          if (score > 0) submitScoreMutation.mutate(score);
          return currentSnake;
        }

        // Self collision
        if (newSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
          setGameOver(true);
          setGameRunning(false);
          if (score > 0) submitScoreMutation.mutate(score);
          return currentSnake;
        }

        newSnake.unshift(head);

        // Check food collision
        if (head.x === food.x && head.y === food.y) {
          setScore(s => s + 1);
          setFood({
            x: Math.floor(Math.random() * 20),
            y: Math.floor(Math.random() * 20),
          });
        } else {
          newSnake.pop();
        }

        return newSnake;
      });
    }, 120); // Faster game speed

    return () => clearInterval(gameInterval);
  }, [gameRunning, gameOver, direction, food, score, submitScoreMutation]);

  // Snake controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!gameRunning || gameOver) return;
      
      switch (e.key) {
        case 'ArrowUp':
          if (direction.y === 0) setDirection({ x: 0, y: -1 });
          break;
        case 'ArrowDown':
          if (direction.y === 0) setDirection({ x: 0, y: 1 });
          break;
        case 'ArrowLeft':
          if (direction.x === 0) setDirection({ x: -1, y: 0 });
          break;
        case 'ArrowRight':
          if (direction.x === 0) setDirection({ x: 1, y: 0 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [direction, gameRunning, gameOver]);

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🐍 Snake Game</span>
          <Badge variant="secondary">Score: {score}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-20 gap-0 w-80 h-80 mx-auto border border-border rounded-lg overflow-hidden">
          {Array.from({ length: 400 }).map((_, index) => {
            const x = index % 20;
            const y = Math.floor(index / 20);
            const isSnake = snake.some(segment => segment.x === x && segment.y === y);
            const isFood = food.x === x && food.y === y;
            const isHead = snake[0]?.x === x && snake[0]?.y === y;
            
            return (
              <div
                key={index}
                className={`w-4 h-4 ${
                  isSnake 
                    ? isHead ? 'bg-green-500' : 'bg-green-400' 
                    : isFood 
                    ? 'bg-red-500' 
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
                data-testid={`snake-cell-${x}-${y}`}
              />
            );
          })}
        </div>

        <div className="flex gap-2 mb-4">
          {!gameRunning && !gameOver && (
            <Button onClick={startSnake} className="flex-1" data-testid="button-start-snake">
              <Play className="w-4 h-4 mr-2" />
              Start Snake
            </Button>
          )}
          
          {gameOver && (
            <Button onClick={startSnake} className="flex-1" data-testid="button-restart-snake">
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
          )}
          
          {gameRunning && (
            <Button onClick={() => { setGameRunning(false); setGameOver(true); }} variant="outline" className="flex-1" data-testid="button-pause-snake">
              <Pause className="w-4 h-4 mr-2" />
              End Game
            </Button>
          )}
        </div>

        {/* Touch Controls for Snake */}
        <div className="grid grid-cols-3 gap-2 max-w-40 mx-auto">
          <div></div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirection({ x: 0, y: -1 })}
            disabled={!gameRunning || gameOver || direction.y !== 0}
            data-testid="button-snake-up"
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
          <div></div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirection({ x: -1, y: 0 })}
            disabled={!gameRunning || gameOver || direction.x !== 0}
            data-testid="button-snake-left"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center text-white text-xs">🐍</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirection({ x: 1, y: 0 })}
            disabled={!gameRunning || gameOver || direction.x !== 0}
            data-testid="button-snake-right"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
          
          <div></div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirection({ x: 0, y: 1 })}
            disabled={!gameRunning || gameOver || direction.y !== 0}
            data-testid="button-snake-down"
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
          <div></div>
        </div>

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🎯 Use arrow keys OR touch controls above</p>
          <p>🍎 Eat red food to grow and earn points!</p>
          <p>💰 Earn 2 points per food eaten</p>
        </div>
      </CardContent>
    </Card>
  );
}

// 2048 Game Component  
function Game2048() {
  const [board, setBoard] = useState(() => {
    const newBoard = Array(4).fill(null).map(() => Array(4).fill(0));
    addNewTile(newBoard);
    addNewTile(newBoard);
    return newBoard;
  });
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const submitScoreMutation = useMutation({
    mutationFn: async (score: number) => {
      const points = Math.floor(score / 100); // 1 point per 100 score
      return apiRequest("POST", "/api/user/points", { 
        points, 
        reason: `2048 game - scored ${score} points` 
      });
    },
    onSuccess: (data: any) => {
      const pointsEarned = Math.floor(score / 100);
      if (pointsEarned > 0) {
        toast({
          title: "Points Earned! 🎯",
          description: `You earned ${pointsEarned} points for your 2048 skills!`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
    },
  });

  function addNewTile(board: number[][]) {
    const emptyCells = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (board[i][j] === 0) {
          emptyCells.push({ row: i, col: j });
        }
      }
    }
    if (emptyCells.length > 0) {
      const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      board[randomCell.row][randomCell.col] = Math.random() < 0.9 ? 2 : 4;
    }
  }

  function moveLeft(board: number[][]) {
    let newBoard = board.map(row => [...row]);
    let newScore = 0;
    let moved = false;

    for (let row = 0; row < 4; row++) {
      let arr = newBoard[row].filter(cell => cell !== 0);
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] === arr[i + 1]) {
          arr[i] *= 2;
          newScore += arr[i];
          if (arr[i] === 2048) setWon(true);
          arr[i + 1] = 0;
        }
      }
      arr = arr.filter(cell => cell !== 0);
      while (arr.length < 4) arr.push(0);
      
      for (let col = 0; col < 4; col++) {
        if (newBoard[row][col] !== arr[col]) moved = true;
        newBoard[row][col] = arr[col];
      }
    }

    return { board: newBoard, score: newScore, moved };
  }

  function rotate90(board: number[][]) {
    return board[0].map((_, index) => board.map(row => row[index]).reverse());
  }

  const move = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (gameOver) return;

    let boardToMove = [...board];
    let rotations = 0;

    switch (direction) {
      case 'left': rotations = 0; break;
      case 'up': rotations = 1; break;
      case 'right': rotations = 2; break;
      case 'down': rotations = 3; break;
    }

    for (let i = 0; i < rotations; i++) {
      boardToMove = rotate90(boardToMove);
    }

    const { board: movedBoard, score: moveScore, moved } = moveLeft(boardToMove);

    for (let i = 0; i < (4 - rotations) % 4; i++) {
      boardToMove = rotate90(movedBoard);
    }

    if (moved) {
      addNewTile(boardToMove);
      setBoard(boardToMove);
      setScore(prevScore => prevScore + moveScore);

      // Check game over
      const hasEmptyCell = boardToMove.some(row => row.some(cell => cell === 0));
      if (!hasEmptyCell) {
        let canMove = false;
        for (let i = 0; i < 4 && !canMove; i++) {
          for (let j = 0; j < 3 && !canMove; j++) {
            if (boardToMove[i][j] === boardToMove[i][j + 1] || 
                boardToMove[j][i] === boardToMove[j + 1][i]) {
              canMove = true;
            }
          }
        }
        if (!canMove) {
          setGameOver(true);
          if (score > 0) submitScoreMutation.mutate(score);
        }
      }
    }
  };

  // 2048 controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (gameOver) return;
      switch (e.key) {
        case 'ArrowUp': move('up'); break;
        case 'ArrowDown': move('down'); break;
        case 'ArrowLeft': move('left'); break;
        case 'ArrowRight': move('right'); break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameOver, board, score]);

  const reset2048 = () => {
    const newBoard = Array(4).fill(null).map(() => Array(4).fill(0));
    addNewTile(newBoard);
    addNewTile(newBoard);
    setBoard(newBoard);
    setScore(0);
    setGameOver(false);
    setWon(false);
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🎯 2048 Game</span>
          <Badge variant="secondary">Score: {score}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2 w-80 h-80 mx-auto p-4 bg-gray-200 dark:bg-gray-700 rounded-lg">
          {board.flat().map((cell, index) => (
            <div
              key={index}
              className={`w-16 h-16 rounded flex items-center justify-center text-lg font-bold ${
                cell === 0 
                  ? 'bg-gray-300 dark:bg-gray-600' 
                  : cell <= 4 
                  ? 'bg-orange-100 text-orange-800' 
                  : cell <= 16
                  ? 'bg-orange-200 text-orange-900'
                  : cell <= 64
                  ? 'bg-red-200 text-red-900'
                  : cell <= 256
                  ? 'bg-purple-200 text-purple-900'
                  : cell <= 1024
                  ? 'bg-blue-200 text-blue-900'
                  : 'bg-yellow-200 text-yellow-900'
              }`}
              data-testid={`cell-2048-${index}`}
            >
              {cell !== 0 && cell}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {gameOver || won ? (
            <Button onClick={reset2048} className="flex-1" data-testid="button-restart-2048">
              <RotateCcw className="w-4 h-4 mr-2" />
              {won ? 'You Won! Play Again' : 'Play Again'}
            </Button>
          ) : (
            <Button onClick={reset2048} variant="outline" className="flex-1" data-testid="button-reset-2048">
              <RotateCcw className="w-4 h-4 mr-2" />
              New Game
            </Button>
          )}
        </div>

        {/* Touch Controls for 2048 */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 max-w-48 mx-auto">
            <div></div>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => move('up')} 
              disabled={gameOver}
              className="h-12"
              data-testid="button-up-2048"
            >
              <ArrowUp className="w-5 h-5" />
            </Button>
            <div></div>
            
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => move('left')} 
              disabled={gameOver}
              className="h-12"
              data-testid="button-left-2048"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center justify-center">
              <div className="w-10 h-10 rounded bg-orange-500 flex items-center justify-center text-white font-bold">2048</div>
            </div>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => move('right')} 
              disabled={gameOver}
              className="h-12"
              data-testid="button-right-2048"
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
            
            <div></div>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => move('down')} 
              disabled={gameOver}
              className="h-12"
              data-testid="button-down-2048"
            >
              <ArrowDown className="w-5 h-5" />
            </Button>
            <div></div>
          </div>
          
          {/* Swipe gesture hint */}
          <p className="text-xs text-center text-muted-foreground">
            💡 Tip: Use arrow keys or touch controls to move tiles
          </p>
        </div>

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🎯 Use arrow keys to move tiles</p>
          <p>🎪 Combine same numbers to reach 2048!</p>
          <p>💰 Earn 1 point per 100 score</p>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const [userSequence, setUserSequence] = useState<number[]>([]);
  const [isShowing, setIsShowing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [activeButton, setActiveButton] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'];
  const sounds = ['C', 'D', 'E', 'F'];

  const submitScoreMutation = useMutation({
    mutationFn: async (level: number) => {
      const points = level * 3; // 3 points per level completed
      return apiRequest("POST", "/api/user/points", { 
        points, 
        reason: `Simon Says game - completed level ${level}` 
      });
    },
    onSuccess: (data: any) => {
      const pointsEarned = sequence.length * 3;
      toast({
        title: "Simon Says Success! 🎵",
        description: `You earned ${pointsEarned} points for completing level ${sequence.length}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const startSimon = () => {
    const newSequence = [Math.floor(Math.random() * 4)];
    setSequence(newSequence);
    setUserSequence([]);
    setCurrentStep(0);
    setGameStarted(true);
    setGameOver(false);
    showSequence(newSequence);
  };

  const showSequence = (seq: number[]) => {
    setIsShowing(true);
    seq.forEach((color, index) => {
      setTimeout(() => {
        setActiveButton(color);
        setTimeout(() => setActiveButton(null), 300);
        if (index === seq.length - 1) {
          setTimeout(() => setIsShowing(false), 400);
        }
      }, (index + 1) * 600);
    });
  };

  const handleButtonClick = (buttonIndex: number) => {
    if (isShowing || gameOver) return;

    const newUserSequence = [...userSequence, buttonIndex];
    setUserSequence(newUserSequence);

    setActiveButton(buttonIndex);
    setTimeout(() => setActiveButton(null), 200);

    if (buttonIndex !== sequence[newUserSequence.length - 1]) {
      setGameOver(true);
      if (sequence.length > 1) submitScoreMutation.mutate(sequence.length - 1);
      return;
    }

    if (newUserSequence.length === sequence.length) {
      // User completed this level
      setTimeout(() => {
        const nextSequence = [...sequence, Math.floor(Math.random() * 4)];
        setSequence(nextSequence);
        setUserSequence([]);
        showSequence(nextSequence);
      }, 1000);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🎵 Simon Says</span>
          <Badge variant="secondary">Level: {sequence.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 w-80 h-80 mx-auto p-4">
          {colors.map((color, index) => (
            <button
              key={index}
              onClick={() => handleButtonClick(index)}
              disabled={isShowing || gameOver}
              className={`w-32 h-32 rounded-lg transition-all transform ${color} ${
                activeButton === index ? 'scale-95 brightness-150' : 'hover:scale-105'
              } ${
                isShowing || gameOver ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              }`}
              data-testid={`simon-button-${index}`}
            />
          ))}
        </div>

        <div className="text-center">
          {!gameStarted ? (
            <Button onClick={startSimon} data-testid="button-start-simon">
              <Zap className="w-4 h-4 mr-2" />
              Start Simon Says
            </Button>
          ) : gameOver ? (
            <div className="space-y-2">
              <p className="text-lg font-bold text-red-600">Game Over!</p>
              <p>You reached level {sequence.length}</p>
              <Button onClick={startSimon} data-testid="button-restart-simon">
                <RotateCcw className="w-4 h-4 mr-2" />
                Play Again
              </Button>
            </div>
          ) : isShowing ? (
            <p className="text-lg font-semibold">🎵 Watch the sequence...</p>
          ) : (
            <p className="text-lg font-semibold">🎯 Repeat the pattern!</p>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🎵 Watch the color sequence</p>
          <p>🎯 Click the colors in the same order!</p>
          <p>💰 Earn 3 points per level completed</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Flappy Bird Game Component (extracted)
function FlappyBirdGame() {
  return (
    <div className="text-center py-8">
      <p className="text-lg">🐦 Flappy Bird game is integrated above!</p>
      <p className="text-sm text-muted-foreground mt-2">
        The main Flappy Bird game is shown at the top of this page.
      </p>
    </div>
  );
}

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
          <div className="space-y-3">
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
            
            {/* Large Touch Control for Flappy Bird */}
            {gameState.gameStarted && !gameState.gameOver && (
              <Button 
                onClick={jump} 
                size="lg"
                className="w-full h-16 text-lg bg-blue-500 hover:bg-blue-600"
                data-testid="button-flappy-touch"
              >
                🐦 TAP TO FLY
              </Button>
            )}
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