import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { setSocketServer } from '../services/location.service';
import { setIo } from './emitter';

export function initSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Inject into location service (GPS tracking events)
  setSocketServer(io);

  // Inject into shared emitter (sejarah / mission events)
  setIo(io);

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // ── Admin Portal ────────────────────────────────────────────────
    // Admin joins this room to receive all locationUpdate events.
    socket.on('join-admin', () => {
      socket.join('admin-portal');
      console.log(`[Socket.io] Admin joined: ${socket.id}`);
      socket.emit('joined', { room: 'admin-portal', message: 'Welcome to Admin Portal stream.' });
    });

    // ── Per-user room ───────────────────────────────────────────────
    // Each volunteer/member joins their personal room on app launch.
    // The server pushes `sejarah:updated` events here so the Sejarah
    // tab refreshes in real time without polling.
    socket.on('join-user', (userId: string) => {
      if (!userId) return;
      socket.join(`user-${userId}`);
      console.log(`[Socket.io] User ${userId} joined personal room`);
      socket.emit('joined', { room: `user-${userId}` });
    });

    // Leave personal room (e.g. on logout)
    socket.on('leave-user', (userId: string) => {
      socket.leave(`user-${userId}`);
    });

    // ── Project GPS room ────────────────────────────────────────────
    // Join a specific project's GPS room.
    socket.on('join-project', (projectId: string) => {
      if (!projectId) return;
      socket.join(`project-${projectId}`);
      console.log(`[Socket.io] ${socket.id} joined project room: project-${projectId}`);
      socket.emit('joined', { room: `project-${projectId}` });
    });

    // Leave a project room
    socket.on('leave-project', (projectId: string) => {
      socket.leave(`project-${projectId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} — ${reason}`);
    });
  });

  return io;
}
