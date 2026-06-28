import { Server as SocketServer } from 'socket.io';

// ── Shared Socket.io emitter ─────────────────────────────────────
// Single source of truth for the io instance. Services import from
// here instead of from location.service to avoid circular deps.

let _io: SocketServer | null = null;

export function setIo(io: SocketServer): void {
  _io = io;
}

export function getIo(): SocketServer | null {
  return _io;
}

// ── Typed event helpers ───────────────────────────────────────────

/**
 * Emits `sejarah:updated` to a specific user's personal room.
 * The RN client joins `user-<userId>` on connect to receive these.
 *
 * @param userId   - The target user's ID
 * @param payload  - What changed (event type + relevant data)
 */
export function emitSejarahUpdated(
  userId: string,
  payload: {
    event:
      | 'joined'
      | 'left'
      | 'mission_state_changed'
      | 'attendance_verified'
      | 'certificate_ready'
      | 'certificate_failed';
    projectId: string;
    projectTitle?: string;
    newState?: string;
    certificateUrl?: string;
    timestamp: string;
  },
): void {
  if (!_io) return;
  _io.to(`user-${userId}`).emit('sejarah:updated', payload);
}

/**
 * Emits `sejarah:updated` to every participant of a project.
 * Used when an admin changes a mission state — all enrolled volunteers
 * should see the update live.
 *
 * @param participantUserIds - Array of user IDs enrolled in the project
 * @param payload            - The event payload
 */
export function emitSejarahUpdatedToAll(
  participantUserIds: string[],
  payload: Parameters<typeof emitSejarahUpdated>[1],
): void {
  if (!_io) return;
  for (const uid of participantUserIds) {
    _io.to(`user-${uid}`).emit('sejarah:updated', payload);
  }
}
