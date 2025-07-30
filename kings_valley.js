const readline = require("readline");

// King's Valley 5x5 Board Simulation

class Game {
  constructor() {
    this.size = 5;
    this.board = this.createBoard();
    this.currentPlayer = 1; // Player 1 starts
    this.setupPieces();
  }

  createBoard() {
    // Initialize empty 5x5 board with 0 (empty)
    return Array(this.size)
      .fill(null)
      .map(() => Array(this.size).fill(0));
  }

  setupPieces() {
    // Player 1 pieces = 1, Player 2 pieces = 2
    // Place 5 pieces on row 0 and row 4, center pieces are kings (marked as 3 for Player 1 king, 4 for Player 2 king)
    for (let i = 0; i < this.size; i++) {
      if (i === 2) {
        this.board[0][i] = 3; // Player 1 King
        this.board[4][i] = 4; // Player 2 King
      } else {
        this.board[0][i] = 1; // Player 1 pieces
        this.board[4][i] = 2; // Player 2 pieces
      }
    }
  }

  printBoard() {
    console.log("\nBoard:");
    console.log("  A  B  C  D  E");
    for (let r = 0; r < this.size; r++) {
      let row = (r + 1) + " ";
      for (let c = 0; c < this.size; c++) {
        switch (this.board[r][c]) {
          case 0:
            row += ".  ";
            break;
          case 1:
            row += "1  ";
            break;
          case 2:
            row += "2  ";
            break;
          case 3:
            row += "K1 ";
            break;
          case 4:
            row += "K2 ";
            break;
        }
      }
      console.log(row);
    }
  }

  isInsideBoard(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  directions = [
    [-1, 0], // up
    [1, 0], // down
    [0, -1], // left
    [0, 1], // right
    [-1, -1], // up-left
    [-1, 1], // up-right
    [1, -1], // down-left
    [1, 1], // down-right
  ];

  getValidMove(r, c, dr, dc) {
    let nr = r;
    let nc = c;
    while (true) {
      let tr = nr + dr;
      let tc = nc + dc;
      if (!this.isInsideBoard(tr, tc)) break;
      if (this.board[tr][tc] !== 0) break;
      nr = tr;
      nc = tc;
    }
    if (nr === r && nc === c) return null; // No move possible
    return [nr, nc];
  }

  getAllValidMoves(r, c) {
    const moves = [];
    for (const [dr, dc] of this.directions) {
      const move = this.getValidMove(r, c, dr, dc);
      if (move) moves.push(move);
    }
    return moves;
  }

  movePiece(fromR, fromC, toR, toC) {
    if (!this.isInsideBoard(fromR, fromC) || !this.isInsideBoard(toR, toC)) {
      console.log("Invalid move: outside board");
      return false;
    }
    const piece = this.board[fromR][fromC];
    if (
      (this.currentPlayer === 1 && (piece !== 1 && piece !== 3)) ||
      (this.currentPlayer === 2 && (piece !== 2 && piece !== 4))
    ) {
      console.log("Invalid move: not your piece");
      return false;
    }

    const validMoves = this.getAllValidMoves(fromR, fromC);
    if (!validMoves.some(([r, c]) => r === toR && c === toC)) {
      console.log("Invalid move: destination not valid");
      return false;
    }

    // Move piece
    this.board[toR][toC] = this.board[fromR][fromC];
    this.board[fromR][fromC] = 0;

    // Check win condition: king in center
    if (
      (this.board[toR][toC] === 3 || this.board[toR][toC] === 4) &&
      toR === 2 &&
      toC === 2
    ) {
      console.log(`\nPlayer ${this.currentPlayer} wins by moving King to King's Valley!`);
      this.printBoard();
      process.exit(0); // End program
    }

    // Switch turn
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    return true;
  }

  parsePosition(pos) {
    // Expect input like "A1", "C3", etc.
    if (!pos || pos.length !== 2) return null;
    const col = pos[0].toUpperCase().charCodeAt(0) - 65; // 'A' = 0
    const row = parseInt(pos[1], 10) - 1;
    if (this.isInsideBoard(row, col)) return [row, col];
    return null;
  }
}

const game = new Game();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function promptMove() {
  console.log(`\nPlayer ${game.currentPlayer}'s turn.`);
  game.printBoard();
  rl.question("Enter move (e.g. A1 C3): ", (input) => {
    const parts = input.trim().split(" ");
    if (parts.length !== 2) {
      console.log("Invalid input format. Use: <from> <to> (e.g. A1 C3)");
      promptMove();
      return;
    }
    const from = game.parsePosition(parts[0]);
    const to = game.parsePosition(parts[1]);
    if (!from || !to) {
      console.log("Invalid board positions.");
      promptMove();
      return;
    }
    if (game.movePiece(from[0], from[1], to[0], to[1])) {
      promptMove();
    } else {
      promptMove();
    }
  });
}

console.log("Welcome to King's Valley!");
console.log("Move pieces by typing moves like 'A1 C3' (from-to).");
promptMove();
