import { Server as SocketServer } from 'socket.io';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errorHandler';
import { LocationUpdateInput } from '../schemas/location.schema';
import { generateLocationId } from '../utils/idGenerator';

let io: SocketServer | null = null;

// Called once during app bootstrap to inject the Socket.io instance
export function setSocketServer(socketServer: SocketServer): void {
  io = socketServer;
}

// ── Location Service ────────────────────────────────────────────

export async function updateLocation(userId: string, input: LocationUpdateInput) {
  const { latitude, longitude, accuracy, altitude, speed, projectId, isStreaming } =
    input;

  // 1. If a projectId is provided, verify the project exists
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError(404, 'Project not found for GPS tracking.');
  }

  // 2. Persist GPS record
  let location;
  if (projectId) {
    // Update existing location record for this user in this project to avoid DB bloat
    const existing = await prisma.location.findFirst({
      where: { userId, projectId },
      orderBy: { timestamp: 'desc' },
    });

    if (existing) {
      location = await prisma.location.update({
        where: { id: existing.id },
        data: {
          latitude,
          longitude,
          accuracy,
          altitude,
          speed,
          isStreaming,
          timestamp: new Date(),
        },
      });
    }
  }

  // If no existing record or no projectId provided, create a new one
  if (!location) {
    const locationId = await generateLocationId(prisma);

    location = await prisma.location.create({
      data: {
        id: locationId,  // LOC-XXXXX
        userId,
        projectId,
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        isStreaming,
      },
    });
  }

  // 3. Emit real-time event to Admin Portal via Socket.io
  if (io) {
    const eventPayload = {
      locationId: location.id,
      userId,
      projectId,
      latitude,
      longitude,
      accuracy,
      altitude,
      speed,
      isStreaming,
      timestamp: location.timestamp,
    };

    // Broadcast to admin room
    io.to('admin-portal').emit('locationUpdate', eventPayload);

    // Broadcast to the specific project room (if applicable)
    if (projectId) {
      io.to(`project-${projectId}`).emit('locationUpdate', eventPayload);
    }
  }

  return {
    locationId: location.id,
    status: isStreaming ? 'Lokasi Sedang Dikongsi' : 'Lokasi Tidak Aktif',
    latitude,
    longitude,
    timestamp: location.timestamp,
  };
}

export async function getUserLocationHistory(
  userId: string,
  projectId?: string,
  limit = 50,
) {
  return prisma.location.findMany({
    where: {
      userId,
      ...(projectId && { projectId }),
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

export async function getActiveStreamers(projectId: string) {
  // Get users with active GPS streams in the last 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  return prisma.location.findMany({
    where: {
      projectId,
      isStreaming: true,
      timestamp: { gte: fiveMinutesAgo },
    },
    orderBy: { timestamp: 'desc' },
    distinct: ['userId'],
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
}

export async function getAllLatestLocations() {
  const data = await prisma.location.findMany({
    orderBy: { timestamp: 'desc' },
    distinct: ['userId'],
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return data.map((loc) => ({
    locationId: loc.id,
    userId: loc.userId,
    name: loc.user?.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy: loc.accuracy,
    isStreaming: loc.isStreaming,
    timestamp: loc.timestamp,
  }));
}
