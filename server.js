// Add this before any other code
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: ["https://kings-valley-production.up.railway.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
    transports: ['websocket', 'polling'],
    credentials: true
  }
});
const path = require('path');

// ======================
// GAME CONSTANTS
// ======================
const PLAYER_RED = 1;
const PLAYER_BLUE = 2;
const PIECE_RED = 1;
const PIECE_BLUE = 2;
const KING_RED = 3;
const KING_BLUE = 4;
const EMPTY = 0;
const CENTER = [2, 2]; // King's Valley position
const BOARD_SIZE = 5;

// ======================
// GAME STATE
// ======================
const rooms = {};

function createNewBoard() {
  return [
    [PIECE_RED, PIECE_RED, KING_RED, PIECE_RED, PIECE_RED],  // Row 0: Red pieces + king
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],                     // Row 1: Empty
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],                     // Row 2: Center (King's Valley)
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],                     // Row 3: Empty
    [PIECE_BLUE, PIECE_BLUE, KING_BLUE, PIECE_BLUE, PIECE_BLUE]  // Row 4: Blue pieces + king
  ];
}

// ======================
// GAME LOGIC
// ======================
function isValidMove(board, from, to, player) {
  // Check boundaries
  if (from[0] < 0 || from[0] >= BOARD_SIZE || from[1] < 0 || from[1] >= BOARD_SIZE ||
      to[0] < 0 || to[0] >= BOARD_SIZE || to[1] < 0 || to[1] >= BOARD_SIZE) {
    return false;
  }

  const piece = board[from[0]][from[1]];
  const isRedPlayer = player === PLAYER_RED;
  const isValidPiece = isRedPlayer 
    ? [PIECE_RED, KING_RED].includes(piece)
    : [PIECE_BLUE, KING_BLUE].includes(piece);

  if (!isValidPiece) return false;

  // Calculate movement direction
  const rowDiff = to[0] - from[0];
  const colDiff = to[1] - from[1];
  const isStraight = rowDiff === 0 || colDiff === 0;
  const isDiagonal = Math.abs(rowDiff) === Math.abs(colDiff);

  if (!isStraight && !isDiagonal) return false;

  // Check path is clear
  const rowStep = Math.sign(rowDiff);
  const colStep = Math.sign(colDiff);
  let r = from[0] + rowStep;
  let c = from[1] + colStep;

  while (r !== to[0] || c !== to[1]) {
    if (board[r][c] !== EMPTY) return false;
    r += rowStep;
    c += colStep;
  }

  return board[to[0]][to[1]] === EMPTY;
}

function checkWinCondition(board, lastMove) {
  const [row, col] = lastMove;
  if (row === CENTER[0] && col === CENTER[1]) {
    return board[row][col] === KING_RED ? PLAYER_RED :
           board[row][col] === KING_BLUE ? PLAYER_BLUE : null;
  }
  return null;
}

// ======================
// SERVER SETUP
// ======================
app.use(express.static(path.join(__dirname, 'public')));

// HTTPS redirect for production
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// ======================
// SOCKET.IO HANDLERS
// ======================
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join', (roomCode) => {
    try {
      roomCode = roomCode.trim().toUpperCase();
      if (!roomCode || roomCode.length < 4) throw new Error('Invalid room code');

      if (!rooms[roomCode]) {
        rooms[roomCode] = {
          players: [],
          board: createNewBoard(),
          currentPlayer: PLAYER_RED,
          winner: null,
          createdAt: Date.now()
        };
      }

      const room = rooms[roomCode];
      if (room.players.length >= 2) throw new Error('Room is full');

      const playerNumber = room.players.length + 1;
      room.players.push(socket.id);
      socket.join(roomCode);

      socket.emit('init', {
        player: playerNumber,
        game: {
          board: room.board,
          currentPlayer: room.currentPlayer,
          winner: room.winner
        },
        room: roomCode
      });

      socket.to(roomCode).emit('playerJoined', { player: playerNumber });
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('move', ({ from, to }) => {
    try {
      const roomCode = Array.from(socket.rooms)[1];
      if (!roomCode || !rooms[roomCode]) throw new Error('Invalid room');

      const room = rooms[roomCode];
      const playerIndex = room.players.indexOf(socket.id);
      const currentPlayer = playerIndex + 1;

      if (currentPlayer !== room.currentPlayer || room.winner) {
        throw new Error('Not your turn');
      }

      if (!isValidMove(room.board, from, to, currentPlayer)) {
        throw new Error('Invalid move');
      }

      // Execute move
      room.board[to[0]][to[1]] = room.board[from[0]][from[1]];
      room.board[from[0]][from[1]] = EMPTY;

      // Check win condition
      room.winner = checkWinCondition(room.board, to);
      if (!room.winner) {
        room.currentPlayer = currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
      }

      io.to(roomCode).emit('update', {
        board: room.board,
        currentPlayer: room.currentPlayer,
        winner: room.winner,
        lastMove: { from, to }
      });
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(roomCode => {
      const room = rooms[roomCode];
      const index = room.players.indexOf(socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomCode).emit('playerLeft', { player: index + 1 });
        if (room.players.length === 0) {
          delete rooms[roomCode];
        }
      }
    });
  });
});

// ======================
// SERVER START
// ======================
const PORT = process.env.PORT || 3000;
const server = http.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Enhanced error handling
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use, retrying with ${PORT + 1}...`);
    http.listen(PORT + 1, '0.0.0.0');
  } else {
    console.error('Server error:', err);
  }
});

// Clean up inactive rooms
setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach(roomCode => {
    if (now - rooms[roomCode].createdAt > 3600000 && rooms[roomCode].players.length === 0) {
      delete rooms[roomCode];
    }
  });
}, 1800000); // Check every 30 minutes

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
