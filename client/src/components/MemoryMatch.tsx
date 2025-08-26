import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { apiRequest } from "@/lib/queryClient";
import { Maximize, Minimize } from "lucide-react";

interface Card {
  id: number;
  symbol: string;
  isFlipped: boolean;
  isMatched: boolean;
}

interface GameState {
  cards: Card[];
  flippedCards: number[];
  moves: number;
  matches: number;
  gameStatus: "waiting" | "playing" | "gameover";
  timeLeft: number;
}

const SYMBOLS = ["🎮", "🎯", "🎲", "🎪", "🎨", "🎭", "🎸", "🎺"];
const GAME_TIME = 120; // 2 minutes

export default function MemoryMatch() {
  const [gameState, setGameState] = useState<GameState>({
    cards: [],
    flippedCards: [],
    moves: 0,
    matches: 0,
    gameStatus: "waiting",
    timeLeft: GAME_TIME,
  });
  
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("memory-match-best-score") || "999", 10);
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Memory Match - completed in ${gameState.moves} moves`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `Great memory skills! You earned ${Math.max(1, Math.floor(50 / gameState.moves))} points!`,
      });
    },
  });

  const shuffleArray = (array: any[]) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  const createCards = useCallback(() => {
    const cardPairs = SYMBOLS.flatMap((symbol, index) => [
      { id: index * 2, symbol, isFlipped: false, isMatched: false },
      { id: index * 2 + 1, symbol, isFlipped: false, isMatched: false },
    ]);
    return shuffleArray(cardPairs);
  }, []);

  const resetGame = useCallback(() => {
    setGameState({
      cards: createCards(),
      flippedCards: [],
      moves: 0,
      matches: 0,
      gameStatus: "waiting",
      timeLeft: GAME_TIME,
    });
  }, [createCards]);

  const flipCard = useCallback((cardId: number) => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing" || prev.flippedCards.length >= 2) return prev;
      
      const card = prev.cards.find(c => c.id === cardId);
      if (!card || card.isFlipped || card.isMatched) return prev;

      const newCards = prev.cards.map(c =>
        c.id === cardId ? { ...c, isFlipped: true } : c
      );

      const newFlippedCards = [...prev.flippedCards, cardId];

      if (newFlippedCards.length === 2) {
        const [firstId, secondId] = newFlippedCards;
        const firstCard = newCards.find(c => c.id === firstId);
        const secondCard = newCards.find(c => c.id === secondId);

        const newMoves = prev.moves + 1;

        if (firstCard?.symbol === secondCard?.symbol) {
          // Match found
          const matchedCards = newCards.map(c =>
            c.id === firstId || c.id === secondId
              ? { ...c, isMatched: true }
              : c
          );

          const newMatches = prev.matches + 1;
          const gameWon = newMatches === SYMBOLS.length;

          setTimeout(() => {
            setGameState(current => ({
              ...current,
              cards: matchedCards,
              flippedCards: [],
              moves: newMoves,
              matches: newMatches,
              gameStatus: gameWon ? "gameover" : "playing",
            }));
          }, 500);

          return {
            ...prev,
            cards: newCards,
            flippedCards: newFlippedCards,
            moves: newMoves,
          };
        } else {
          // No match, flip back after delay
          setTimeout(() => {
            setGameState(current => ({
              ...current,
              cards: current.cards.map(c =>
                c.id === firstId || c.id === secondId
                  ? { ...c, isFlipped: false }
                  : c
              ),
              flippedCards: [],
              moves: newMoves,
            }));
          }, 1000);

          return {
            ...prev,
            cards: newCards,
            flippedCards: newFlippedCards,
            moves: newMoves,
          };
        }
      }

      return {
        ...prev,
        cards: newCards,
        flippedCards: newFlippedCards,
      };
    });
  }, []);

  useEffect(() => {
    if (gameState.gameStatus === "playing" && gameState.timeLeft > 0) {
      const timer = setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft <= 1) {
            return { ...prev, timeLeft: 0, gameStatus: "gameover" };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [gameState.gameStatus, gameState.timeLeft]);

  useEffect(() => {
    if (gameState.gameStatus === "gameover") {
      const isWin = gameState.matches === SYMBOLS.length;
      if (isWin && gameState.moves < bestScore) {
        setBestScore(gameState.moves);
        localStorage.setItem("memory-match-best-score", gameState.moves.toString());
      }
      
      if (isWin) {
        const pointsEarned = Math.max(1, Math.floor(50 / gameState.moves));
        awardPointsMutation.mutate(pointsEarned);
      }
    }
  }, [gameState.gameStatus, gameState.moves, gameState.matches, bestScore, awardPointsMutation]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateScore = () => {
    const baseScore = gameState.matches * 10;
    const timeBonus = gameState.timeLeft;
    const movesPenalty = gameState.moves * 2;
    return Math.max(0, baseScore + timeBonus - movesPenalty);
  };

  return (
    <div ref={gameContainerRef} className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : ''}`}>
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">🧠 Memory Match</h2>
        <p className="text-sm text-muted-foreground">Match all pairs before time runs out!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto">
            {gameState.cards.map((card) => (
              <button
                key={card.id}
                onClick={() => flipCard(card.id)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  if (gameState.gameStatus === "playing" && !card.isMatched) {
                    flipCard(card.id);
                  }
                }}
                disabled={gameState.gameStatus !== "playing" || card.isMatched}
                className={`aspect-square rounded-lg text-2xl font-bold transition-all duration-300 touch-none select-none ${
                  card.isFlipped || card.isMatched
                    ? card.isMatched
                      ? "bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200"
                      : "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200"
                    : "bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600"
                }`}
                data-testid={`card-${card.id}`}
              >
                {(card.isFlipped || card.isMatched) ? card.symbol : "?"}
              </button>
            ))}
          </div>
          
          {gameState.gameStatus !== "playing" && (
            <div className="mt-6 text-center">
              {gameState.gameStatus === "waiting" && (
                <>
                  <div className="text-xl mb-2">🧠 Ready to Test Your Memory?</div>
                  <div className="text-sm text-muted-foreground">Find all matching pairs in 2 minutes!</div>
                </>
              )}
              
              {gameState.gameStatus === "gameover" && (
                <>
                  <div className="text-xl mb-2">
                    {gameState.matches === SYMBOLS.length ? "🎉 Victory!" : "⏰ Time's Up!"}
                  </div>
                  <div className="text-sm mb-2">
                    Matches: {gameState.matches}/{SYMBOLS.length} | Moves: {gameState.moves}
                  </div>
                  <div className="text-sm mb-2">Score: {calculateScore()}</div>
                  {gameState.matches === SYMBOLS.length && gameState.moves < bestScore && (
                    <div className="text-xs text-yellow-300 mt-1">New Best Score! 🎉</div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5 flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="outline">Time: {formatTime(gameState.timeLeft)}</Badge>
            <Badge variant="outline">Moves: {gameState.moves}</Badge>
            <Badge variant="outline">Matches: {gameState.matches}/{SYMBOLS.length}</Badge>
            <Badge variant="outline">Best: {bestScore === 999 ? "--" : bestScore} moves</Badge>
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
            <li>• Click cards to flip them over</li>
            <li>• Find matching pairs of symbols</li>
            <li>• Complete all matches within 2 minutes</li>
            <li>• Fewer moves = higher score and more ⭐</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}