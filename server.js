const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: ["https://kings-valley-production.up.railway.app"],
    methods: ["GET", "POST"],
    credentials: true
  }
});
const path = require('path');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const rooms = {};
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

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join', (roomCode) => {
    roomCode = roomCode.trim().toUpperCase();
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        board: createNewBoard(),
        currentPlayer: PLAYER_RED,
        winner: null
      };
    }

    const room = rooms[roomCode];
    if (room.players.length >= 2) {
      socket.emit('full');
      return;
    }

    const playerNumber = room.players.length + 1;
    room.players.push(socket.id);
    socket.join(roomCode);
    socket.emit('init', { 
      player: playerNumber,
      game: room,
      room: roomCode
    });
  });

  socket.on('move', (move) => {
    const { from, to } = move;
    const roomCode = Object.keys(socket.rooms)[1];
    const room = rooms[roomCode];
    
    // Basic move validation would go here
    room.board[to[0]][to[1]] = room.board[from[0]][from[1]];
    room.board[from[0]][from[1]] = EMPTY;
    
    io.to(roomCode).emit('update', room);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
