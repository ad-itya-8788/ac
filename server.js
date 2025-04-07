import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files
app.use(express.static(__dirname));

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// In-memory store for waiting users and active rooms
// Note: In a production environment, you might want to use a database or Redis
const waitingUsers = new Set();
const rooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle join request
  socket.on('join', () => {
    // If there's a waiting user, create a room
    if (waitingUsers.size > 0) {
      // Get the first waiting user
      const waitingUser = waitingUsers.values().next().value;
      waitingUsers.delete(waitingUser);

      // Create a room ID
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Add both users to the room
      socket.join(roomId);
      io.sockets.sockets.get(waitingUser)?.join(roomId);

      // Store room information
      rooms.set(roomId, [waitingUser, socket.id]);

      // Notify users they've joined the room
      io.to(waitingUser).emit('joined', { roomId, isInitiator: true });
      socket.emit('joined', { roomId, isInitiator: false });

      console.log(`Room ${roomId} created with users ${waitingUser} and ${socket.id}`);
    } else {
      // Add user to waiting list
      waitingUsers.add(socket.id);
      console.log(`User ${socket.id} is waiting for a match`);
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', ({ description, roomId }) => {
    socket.to(roomId).emit('offer', description);
  });

  socket.on('answer', ({ description, roomId }) => {
    socket.to(roomId).emit('answer', description);
  });

  socket.on('candidate', ({ candidate, roomId }) => {
    socket.to(roomId).emit('candidate', candidate);
  });

  // Handle user leaving
  socket.on('leave', ({ roomId }) => {
    leaveRoom(socket.id, roomId);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // Remove from waiting list if present
    waitingUsers.delete(socket.id);

    // Leave all rooms
    for (const [roomId, users] of rooms.entries()) {
      if (users.includes(socket.id)) {
        leaveRoom(socket.id, roomId);
      }
    }
  });

  // Helper function to handle leaving a room
  function leaveRoom(userId, roomId) {
    if (rooms.has(roomId)) {
      const users = rooms.get(roomId);

      // Notify other user in the room
      const otherUser = users.find(id => id !== userId);
      if (otherUser) {
        io.to(otherUser).emit('disconnected');
      }

      // Remove room
      rooms.delete(roomId);
      console.log(`User ${userId} left room ${roomId}`);
    }
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export the Express API
export default app;