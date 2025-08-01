const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });
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
const CENTER = [2, 2]; // King's Valley position

// Initialize a new game board
function createNewBoard() {
  return [
    [PIECE_RED, PIECE_RED, KING_RED, PIECE_RED, PIECE_RED],  // Red team (top)
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],  // Center is King's Valley
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [PIECE_BLUE, PIECE_BLUE, KING_BLUE, PIECE_BLUE, PIECE_BLUE]  // Blue team (bottom)
  ];
}

// Get the farthest possible position in a direction
function getSlideDestination(board, from, direction) {
  let [r, c] = from;
  const [dr, dc] = direction;
  let lastValid = from;
  
  while (true) {
    r += dr;
    c += dc;
    
    // Stop at board edges
    if (r < 0 || r > 4 || c < 0 || c > 4) {
      return lastValid;
    }
    
    // Stop before hitting any piece
    if (board[r][c] !== EMPTY) {
      return lastValid;
    }
    
    lastValid = [r, c];
  }
}

// Validate and calculate slide move
function calculateValidMove(board, from, to, currentPlayer) {
  // Check if starting position contains current player's piece
  const piece = board[from[0]][from[1]];
  if ((currentPlayer === PLAYER_RED && ![PIECE_RED, KING_RED].includes(piece)) ||
      (currentPlayer === PLAYER_BLUE && ![PIECE_BLUE, KING_BLUE].includes(piece))) {
    return null;
  }

  // Determine direction (8 possible directions)
  const rowDiff = to[0] - from[0];
  const colDiff = to[1] - from[1];
  
  // Must be moving in straight line (horizontal, vertical or diagonal)
  if (rowDiff !== 0 && colDiff !== 0 && Math.abs(rowDiff) !== Math.abs(colDiff)) {
    return null;
  }

  const dr = Math.sign(rowDiff);
  const dc = Math.sign(colDiff);
  const direction = [dr, dc];
  
  // Calculate actual destination based on sliding rules
  const [destR, destC] = getSlideDestination(board, from, direction);
  
  // Must be moving at least one space
  if (destR === from[0] && destC === from[1]) {
    return null;
  }

  return [destR, destC];
}

// Check win condition (king reaches center)
function checkWinCondition(board, lastMove, currentPlayer) {
  const [r, c] = lastMove;
  
  // Check if the moved piece is a king and reached center
  if (r === CENTER[0] && c === CENTER[1]) {
    if (board[r][c] === KING_RED) {
      return PLAYER_RED;
    } else if (board[r][c] === KING_BLUE) {
      return PLAYER_BLUE;
    }
  }
  
  return null;
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join', (roomCode) => {
    roomCode = roomCode.trim().toUpperCase();
    console.log(`Join request for room: ${roomCode}`);

    if (!roomCode || roomCode.length < 4) {
      socket.emit('error', 'Invalid room code');
      return;
    }

    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        board: createNewBoard(),
        currentPlayer: PLAYER_RED,
        winner: null,
        createdAt: Date.now()
      };
      console.log(`Created new room: ${roomCode}`);
    }

    const room = rooms[roomCode];
    
    if (room.players.length >= 2) {
      socket.emit('full', 'Room is full (2 players maximum)');
      return;
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

    // Notify other player in the room
    socket.to(roomCode).emit('playerJoined', { player: playerNumber });
    console.log(`Player ${playerNumber} joined room ${roomCode}`);
  });

  socket.on('move', (move) => {
    try {
      const { from, to } = move;
      const roomCode = Array.from(socket.rooms)[1];
      
      if (!roomCode || !rooms[roomCode]) {
        socket.emit('error', 'Invalid room');
        return;
      }

      const room = rooms[roomCode];
      const playerIndex = room.players.indexOf(socket.id);
      const currentPlayer = playerIndex + 1; // 1 or 2

      if (currentPlayer !== room.currentPlayer || room.winner) {
        socket.emit('error', 'Not your turn or game already ended');
        return;
      }

      // Calculate valid move destination
      const destination = calculateValidMove(room.board, from, to, currentPlayer);
      if (!destination) {
        socket.emit('error', 'Invalid move');
        return;
      }

      // Execute the move
      const piece = room.board[from[0]][from[1]];
      room.board[from[0]][from[1]] = EMPTY;
      room.board[destination[0]][destination[1]] = piece;

      // Check for winner
      room.winner = checkWinCondition(room.board, destination, currentPlayer);

      // Switch player if game continues
      if (!room.winner) {
        room.currentPlayer = currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
      }

      // Broadcast update to all in room
      io.to(roomCode).emit('update', {
        board: room.board,
        currentPlayer: room.currentPlayer,
        winner: room.winner,
        lastMove: { from, to: destination }
      });

    } catch (error) {
      console.error('Move error:', error);
      socket.emit('error', 'Server error processing move');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up empty rooms and notify players
    Object.keys(rooms).forEach(roomCode => {
      const room = rooms[roomCode];
      const index = room.players.indexOf(socket.id);
      
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomCode).emit('playerLeft', { player: index + 1 });
        
        // Remove room if empty
        if (room.players.length === 0) {
          delete rooms[roomCode];
          console.log(`Room ${roomCode} deleted (empty)`);
        }
      }
    });
  });
});

// Clean up old rooms periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 2 * 60 * 60 * 1000; // 2 hours
  
  Object.keys(rooms).forEach(roomCode => {
    if (now - rooms[roomCode].createdAt > timeout && rooms[roomCode].players.length === 0) {
      delete rooms[roomCode];
      console.log(`Room ${roomCode} cleaned up (inactive)`);
    }
  });
}, 30 * 60 * 1000); // Check every 30 minutes

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
