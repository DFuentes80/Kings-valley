const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: [
      'https://kings-valley-production.up.railway.app',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST'],
    transports: ['websocket', 'polling']
  }
});
const path = require('path');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = {};

// Game constants
const PLAYER_RED = 1;
const PLAYER_BLUE = 2;
const PIECE_RED = 1;
const PIECE_BLUE = 2;
const KING_RED = 3;
const KING_BLUE = 4;
const EMPTY = 0;
const CENTER = [2, 2];

function createNewBoard() {
  return [
    [PIECE_RED, PIECE_RED, KING_RED, PIECE_RED, PIECE_RED],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [PIECE_BLUE, PIECE_BLUE, KING_BLUE, PIECE_BLUE, PIECE_BLUE]
  ];
}

function getSlideDestination(board, from, direction) {
  let [r, c] = from;
  const [dr, dc] = direction;
  let lastValid = from;
  
  while (true) {
    r += dr;
    c += dc;
    
    if (r < 0 || r > 4 || c < 0 || c > 4) return lastValid;
    if (board[r][c] !== EMPTY) return lastValid;
    
    lastValid = [r, c];
  }
}

function calculateValidMove(board, from, to, currentPlayer) {
  const piece = board[from[0]][from[1]];
  if ((currentPlayer === PLAYER_RED && ![PIECE_RED, KING_RED].includes(piece)) ||
      (currentPlayer === PLAYER_BLUE && ![PIECE_BLUE, KING_BLUE].includes(piece))) {
    return null;
  }

  const rowDiff = to[0] - from[0];
  const colDiff = to[1] - from[1];
  
  if (rowDiff !== 0 && colDiff !== 0 && Math.abs(rowDiff) !== Math.abs(colDiff)) {
    return null;
  }

  const dr = Math.sign(rowDiff);
  const dc = Math.sign(colDiff);
  const [destR, destC] = getSlideDestination(board, from, [dr, dc]);
  
  return (destR === from[0] && destC === from[1]) ? null : [destR, destC];
}

function checkWinCondition(board, lastMove) {
  const [r, c] = lastMove;
  if (r === CENTER[0] && c === CENTER[1]) {
    return board[r][c] === KING_RED ? PLAYER_RED : 
           board[r][c] === KING_BLUE ? PLAYER_BLUE : null;
  }
  return null;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Server error');
});

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join', (roomCode) => {
    try {
      roomCode = roomCode.trim().toUpperCase();
      if (!roomCode || roomCode.length < 4) {
        throw new Error('Invalid room code');
      }

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
      if (room.players.length >= 2) {
        throw new Error('Room is full');
      }

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

  socket.on('move', (move) => {
    try {
      const { from, to } = move;
      const roomCode = Array.from(socket.rooms)[1];
      if (!roomCode || !rooms[roomCode]) throw new Error('Invalid room');

      const room = rooms[roomCode];
      const playerIndex = room.players.indexOf(socket.id);
      const currentPlayer = playerIndex + 1;

      if (currentPlayer !== room.currentPlayer || room.winner) {
        throw new Error('Not your turn');
      }

      const destination = calculateValidMove(room.board, from, to, currentPlayer);
      if (!destination) throw new Error('Invalid move');

      const piece = room.board[from[0]][from[1]];
      room.board[from[0]][from[1]] = EMPTY;
      room.board[destination[0]][destination[1]] = piece;

      room.winner = checkWinCondition(room.board, destination);
      if (!room.winner) {
        room.currentPlayer = currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
      }

      io.to(roomCode).emit('update', {
        board: room.board,
        currentPlayer: room.currentPlayer,
        winner: room.winner,
        lastMove: { from, to: destination }
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

// Create .gitignore file content
const gitignoreContent = `node_modules/
.env
.DS_Store
*.log
`;

// Create the file if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('.gitignore')) {
  fs.writeFileSync('.gitignore', gitignoreContent);
  console.log('Created .gitignore file');
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
