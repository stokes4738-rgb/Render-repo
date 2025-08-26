import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuthJWT";
import { apiRequest } from "@/lib/queryClient";

interface GameState {
  board: string[][];
  currentPlayer: string;
  gameStatus: "waiting" | "playing" | "gameover";
  winner: string | null;
  winningCells: number[][];
  playerScore: number;
  aiScore: number;
  moves: number;
}

const ROWS = 6;
const COLS = 7;
const PLAYER = "red";
const AI = "yellow";

export default function ConnectFour() {
  const [gameState, setGameState] = useState<GameState>({
    board: Array(ROWS).fill(null).map(() => Array(COLS).fill("")),
    currentPlayer: PLAYER,
    gameStatus: "waiting",
    winner: null,
    winningCells: [],
    playerScore: 0,
    aiScore: 0,
    moves: 0,
  });
  
  const [totalWins, setTotalWins] = useState(() => {
    return parseInt(localStorage.getItem("connect-four-wins") || "0", 10);
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const awardPointsMutation = useMutation({
    mutationFn: async (points: number) => {
      return apiRequest("POST", "/api/user/points", {
        points,
        reason: `Connect Four - ${gameState.winner === PLAYER ? 'won' : 'lost'} game`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Points Earned!",
        description: `You earned points for playing Connect Four!`,
      });
    },
  });

  const resetGame = useCallback(() => {
    setGameState({
      board: Array(ROWS).fill(null).map(() => Array(COLS).fill("")),
      currentPlayer: PLAYER,
      gameStatus: "waiting",
      winner: null,
      winningCells: [],
      playerScore: 0,
      aiScore: 0,
      moves: 0,
    });
  }, []);

  const checkWin = useCallback((board: string[][], row: number, col: number, player: string): number[][] => {
    const directions = [
      [0, 1], [1, 0], [1, 1], [1, -1] // horizontal, vertical, diagonal1, diagonal2
    ];

    for (const [dr, dc] of directions) {
      const cells = [[row, col]];
      
      // Check in positive direction
      for (let i = 1; i < 4; i++) {
        const newRow = row + dr * i;
        const newCol = col + dc * i;
        if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS && board[newRow][newCol] === player) {
          cells.push([newRow, newCol]);
        } else {
          break;
        }
      }
      
      // Check in negative direction
      for (let i = 1; i < 4; i++) {
        const newRow = row - dr * i;
        const newCol = col - dc * i;
        if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS && board[newRow][newCol] === player) {
          cells.unshift([newRow, newCol]);
        } else {
          break;
        }
      }
      
      if (cells.length >= 4) {
        return cells.slice(0, 4);
      }
    }
    
    return [];
  }, []);

  const getAIMove = useCallback((board: string[][]): number => {
    // Simple AI: try to win, then block player, then random
    
    // Try to win
    for (let col = 0; col < COLS; col++) {
      const row = getLowestEmptyRow(board, col);
      if (row !== -1) {
        const newBoard = board.map((r, i) => r.map((c, j) => (i === row && j === col) ? AI : c));
        if (checkWin(newBoard, row, col, AI).length > 0) {
          return col;
        }
      }
    }
    
    // Try to block player
    for (let col = 0; col < COLS; col++) {
      const row = getLowestEmptyRow(board, col);
      if (row !== -1) {
        const newBoard = board.map((r, i) => r.map((c, j) => (i === row && j === col) ? PLAYER : c));
        if (checkWin(newBoard, row, col, PLAYER).length > 0) {
          return col;
        }
      }
    }
    
    // Random move (prefer center)
    const availableCols = [];
    for (let col = 0; col < COLS; col++) {
      if (getLowestEmptyRow(board, col) !== -1) {
        // Prefer center columns
        const weight = col === 3 ? 3 : (col === 2 || col === 4) ? 2 : 1;
        for (let i = 0; i < weight; i++) {
          availableCols.push(col);
        }
      }
    }
    
    return availableCols[Math.floor(Math.random() * availableCols.length)] || 0;
  }, [checkWin]);

  const getLowestEmptyRow = (board: string[][], col: number): number => {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === "") {
        return row;
      }
    }
    return -1;
  };

  const dropPiece = useCallback((col: number) => {
    setGameState(prev => {
      if (prev.gameStatus !== "playing" || prev.currentPlayer !== PLAYER) return prev;

      const row = getLowestEmptyRow(prev.board, col);
      if (row === -1) return prev; // Column is full

      const newBoard = prev.board.map((r, i) => 
        r.map((c, j) => (i === row && j === col) ? PLAYER : c)
      );

      const winningCells = checkWin(newBoard, row, col, PLAYER);
      const newMoves = prev.moves + 1;

      if (winningCells.length > 0) {
        // Player wins
        const newWins = totalWins + 1;
        setTotalWins(newWins);
        localStorage.setItem("connect-four-wins", newWins.toString());
        
        const pointsEarned = Math.max(5, 20 - newMoves); // More points for faster wins
        awardPointsMutation.mutate(pointsEarned);
        
        toast({
          title: "You Win! 🎉",
          description: `Congratulations! You won in ${newMoves} moves!`,
        });

        return {
          ...prev,
          board: newBoard,
          gameStatus: "gameover",
          winner: PLAYER,
          winningCells,
          playerScore: prev.playerScore + 1,
          moves: newMoves,
        };
      }

      // Check for tie
      const isFull = newBoard.every(row => row.every(cell => cell !== ""));
      if (isFull) {
        toast({
          title: "It's a Tie!",
          description: "The board is full - game over!",
        });
        return {
          ...prev,
          board: newBoard,
          gameStatus: "gameover",
          winner: null,
          moves: newMoves,
        };
      }

      // AI's turn
      const aiCol = getAIMove(newBoard);
      const aiRow = getLowestEmptyRow(newBoard, aiCol);
      
      if (aiRow !== -1) {
        const aiBoard = newBoard.map((r, i) => 
          r.map((c, j) => (i === aiRow && j === aiCol) ? AI : c)
        );

        const aiWinningCells = checkWin(aiBoard, aiRow, aiCol, AI);
        
        if (aiWinningCells.length > 0) {
          // AI wins
          toast({
            title: "AI Wins! 🤖",
            description: "Better luck next time!",
          });

          return {
            ...prev,
            board: aiBoard,
            gameStatus: "gameover",
            winner: AI,
            winningCells: aiWinningCells,
            aiScore: prev.aiScore + 1,
            moves: newMoves + 1,
          };
        }

        return {
          ...prev,
          board: aiBoard,
          currentPlayer: PLAYER,
          moves: newMoves + 1,
        };
      }

      return {
        ...prev,
        board: newBoard,
        currentPlayer: PLAYER,
        moves: newMoves,
      };
    });
  }, [checkWin, getAIMove, totalWins, awardPointsMutation, toast]);

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStatus: "playing" }));
  };

  const isWinningCell = (row: number, col: number) => {
    return gameState.winningCells.some(([winRow, winCol]) => winRow === row && winCol === col);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold mb-2">🔴 Connect Four</h2>
        <p className="text-sm text-muted-foreground">Get four in a row to win!</p>
      </div>

      <Card className="theme-transition">
        <CardContent className="p-4">
          <div className="relative">
            {/* Game board */}
            <div className="grid grid-cols-7 gap-2 bg-blue-600 p-4 rounded-lg mx-auto max-w-md">
              {Array.from({ length: ROWS }, (_, row) =>
                Array.from({ length: COLS }, (_, col) => (
                  <button
                    key={`${row}-${col}`}
                    onClick={() => dropPiece(col)}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      if (gameState.gameStatus === "playing" && gameState.currentPlayer === PLAYER) {
                        dropPiece(col);
                      }
                    }}
                    disabled={gameState.gameStatus !== "playing" || gameState.currentPlayer !== PLAYER}
                    className={`aspect-square rounded-full border-2 border-blue-800 transition-all duration-200 touch-none select-none ${
                      gameState.board[row][col] === PLAYER
                        ? `bg-red-500 ${isWinningCell(row, col) ? 'ring-4 ring-yellow-400' : ''}`
                        : gameState.board[row][col] === AI
                        ? `bg-yellow-500 ${isWinningCell(row, col) ? 'ring-4 ring-red-400' : ''}`
                        : "bg-white hover:bg-gray-200 cursor-pointer"
                    } ${gameState.gameStatus !== "playing" || gameState.currentPlayer !== PLAYER ? "cursor-not-allowed" : ""}`}
                    data-testid={`cell-${row}-${col}`}
                  />
                ))
              )}
            </div>

            {/* Current turn indicator */}
            {gameState.gameStatus === "playing" && (
              <div className="mt-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className={`w-4 h-4 rounded-full ${gameState.currentPlayer === PLAYER ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="text-sm font-semibold">
                    {gameState.currentPlayer === PLAYER ? "Your turn" : "AI thinking..."}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {gameState.gameStatus !== "playing" && (
            <div className="mt-6 text-center">
              {gameState.gameStatus === "waiting" && (
                <>
                  <div className="text-xl mb-2">🔴 Ready to Play Connect Four?</div>
                  <div className="text-sm text-muted-foreground">Drop pieces to get four in a row!</div>
                </>
              )}
              
              {gameState.gameStatus === "gameover" && (
                <>
                  <div className="text-xl mb-2">
                    {gameState.winner === PLAYER ? "🎉 You Win!" : 
                     gameState.winner === AI ? "🤖 AI Wins!" : "🤝 Tie Game!"}
                  </div>
                  <div className="text-sm mb-2">Game completed in {gameState.moves} moves</div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="theme-transition">
        <CardContent className="p-3.5 flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="outline">Your Wins: {gameState.playerScore}</Badge>
            <Badge variant="outline">AI Wins: {gameState.aiScore}</Badge>
            <Badge variant="outline">Total Wins: {totalWins}</Badge>
            <Badge variant="outline">Moves: {gameState.moves}</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetGame}>New Game</Button>
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
            <li>• Click a column to drop your red piece</li>
            <li>• Get four pieces in a row (any direction)</li>
            <li>• Beat the AI to win points</li>
            <li>• Faster wins earn more ⭐</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}