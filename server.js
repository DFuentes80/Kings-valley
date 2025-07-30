const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

function createInitialGame() {
  const size = 5;
  const board = Array(size).fill(null).map(() => Array(size).fill(0));
  for (let i = 0; i < size; i++) {
    if (i === 2) {
      board[0][i] = 3; // Player 1 King
      board[4][i] = 4; // Player 2 King
    } else {
      board[0][i] = 1; // Player 1 pieces
      board[4][i] = 2; // Player 2 pieces
    }
  }
  return {
    board,
    currentPlayer: 1,
    winner: null,
  };
}

function isInsideBoard(r, c) {
  return r >= 0 && r < 5 && c >= 0 && c < 5;
}

const directions = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function getValidMove(board, r, c, dr, dc) {
  let nr = r, nc = c;
  while (true) {
    let tr = nr + dr, tc = nc + dc;
    if (!isInsideBoard(tr, tc)) break;
    if (board[tr][tc] !== 0) break;
    nr = tr; nc = tc;
  }
  if (nr === r && nc === c) return null;
  return [nr, nc];
}

function getAllValidMoves(board, r, c) {
  const moves = [];
  for (const [dr, dc] of directions) {
    const move = getValidMove(board, r, c, dr, dc);
    if (move) moves.push(move);
  }
  return moves;
}

function movePiece(state, fromR, fromC, toR, toC) {
  if (!isInsideBoard(fromR, fromC) || !isInsideBoard(toR, toC)) return false;
  const piece = state.board[fromR][fromC];
  if (
    (state.currentPlayer === 1 && (piece !== 1 && piece !== 3)) ||
    (state.currentPlayer === 2 && (piece !== 2 && piece !== 4))
  ) return false;

  const validMoves = getAllValidMoves(state.board, fromR, fromC);
  if (!validMoves.some(([r, c]) => r === toR && c === toC)) return false;

  state.board[toR][toC] = state.board[fromR][fromC];
  state.board[fromR][fromC] = 0;

  // Win condition
  if (
    (state.board[toR][toC] === 3 || state.board[toR][toC] === 4) &&
    toR === 2 && toC === 2
  ) {
    state.winner = state.currentPlayer;
  }

  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  return true;
}

// --- Room management ---
const rooms = {}; // roomCode -> { players: [socket.id, ...], gameState }

io.on("connection", (socket) => {
  let currentRoom = null;
  let playerNum = null;

  socket.on("join", (roomCode) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: [], gameState: createInitialGame() };
    }
    const room = rooms[roomCode];
    if (room.players.length >= 2) {
      socket.emit("full");
      return;
    }
    room.players.push(socket.id);
    currentRoom = roomCode;
    playerNum = room.players.length;
    socket.join(roomCode);
    socket.emit("init", { player: playerNum, game: room.gameState, room: roomCode });
    io.to(roomCode).emit("update", room.gameState);
  });

  socket.on("move", ({ from, to }) => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room || room.gameState.winner) return;
    const idx = room.players.indexOf(socket.id);
    if (idx === -1 || idx + 1 !== room.gameState.currentPlayer) return;
    if (movePiece(room.gameState, from[0], from[1], to[0], to[1])) {
      io.to(currentRoom).emit("update", room.gameState);
    }
  });

  socket.on("disconnect", () => {
    if (currentRoom && rooms[currentRoom]) {
      const room = rooms[currentRoom];
      room.players = room.players.filter((id) => id !== socket.id);
      if (room.players.length === 0) delete rooms[currentRoom];
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});