import { prisma } from '../config/prisma';
import { AppError } from '../utils/errorHandler';
import { MissionQueryInput, JoinMissionInput, CreateMissionInput } from '../schemas/mission.schema';
import { ProjectCategory, ProjectState } from '@prisma/client';

// ── Mission Service ─────────────────────────────────────────────

export async function getMissions(query: MissionQueryInput) {
  const { state, category, page, limit, search } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(state && { state: state as ProjectState }),
    ...(category && { category: category as ProjectCategory }),
    ...(search && {
      OR: [
        { title: { contains: search } },
        { description: { contains: search } },
        { location: { contains: search } },
      ],
    }),
  };

  const [missions, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        state: true,
        location: true,
        latitude: true,
        longitude: true,
        startDate: true,
        endDate: true,
        requiredVolunteers: true,
        currentParticipants: true,
        isGpsRequired: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true, avatarUrl: true },
        },
        // Capacity status flag
        _count: { select: { participants: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  // Add capacity and GPS stream flags
  const enriched = missions.map((m) => ({
    ...m,
    isFull: m.currentParticipants >= m.requiredVolunteers,
    spotsRemaining: Math.max(0, m.requiredVolunteers - m.currentParticipants),
  }));

  return {
    missions: enriched,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMissionById(projectId: string, userId?: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { participants: true, attendances: true } },
    },
  });

  if (!project) {
    throw new AppError(404, 'Mission not found.');
  }

  // Check if this specific user has already joined
  let isJoined = false;
  if (userId) {
    const participant = await prisma.projectParticipant.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    isJoined = !!participant;
  }

  return {
    ...project,
    isFull: project.currentParticipants >= project.requiredVolunteers,
    spotsRemaining: Math.max(0, project.requiredVolunteers - project.currentParticipants),
    isJoined,
  };
}

export async function joinMission(userId: string, input: JoinMissionInput) {
  const { projectId } = input;

  // 1. Fetch project
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Mission not found.');

  // 2. State check
  if (project.state !== 'UPCOMING' && project.state !== 'ACTIVE') {
    throw new AppError(400, 'This mission is no longer accepting volunteers.');
  }

  // 3. Capacity check — prevents over-subscription
  if (project.currentParticipants >= project.requiredVolunteers) {
    throw new AppError(
      409,
      'This mission has reached its volunteer capacity. Try another mission.',
    );
  }

  // 4. Duplicate check
  const existing = await prisma.projectParticipant.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (existing) throw new AppError(409, 'You have already joined this mission.');

  // 5. Join + increment counter atomically
  await prisma.$transaction([
    prisma.projectParticipant.create({ data: { userId, projectId } }),
    prisma.project.update({
      where: { id: projectId },
      data: { currentParticipants: { increment: 1 } },
    }),
  ]);

  return { message: 'Successfully joined the mission!', projectId };
}

export async function leaveMission(userId: string, projectId: string) {
  // 1. Fetch project
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Mission not found.');

  // 2. Must still be UPCOMING or ACTIVE to cancel
  if (project.state === 'COMPLETED' || project.state === 'CANCELLED') {
    throw new AppError(400, 'Cannot cancel registration for a completed or cancelled mission.');
  }

  // 3. Enforce 1-week (7-day) cutoff rule
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const msUntilMission = new Date(project.startDate).getTime() - Date.now();
  if (msUntilMission < ONE_WEEK_MS) {
    throw new AppError(
      400,
      'Pendaftaran tidak boleh dibatalkan dalam tempoh 1 minggu sebelum tarikh misi.',
    );
  }

  // 4. Check they actually joined
  const existing = await prisma.projectParticipant.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!existing) throw new AppError(404, 'You are not registered for this mission.');

  // 5. Remove + decrement atomically
  await prisma.$transaction([
    prisma.projectParticipant.delete({
      where: { userId_projectId: { userId, projectId } },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { currentParticipants: { decrement: 1 } },
    }),
  ]);

  return { message: 'Registration cancelled successfully.', projectId };
}


export async function createMission(userId: string, input: CreateMissionInput) {
  const project = await prisma.project.create({
    data: {
      title: input.title,
      category: input.category as import('@prisma/client').ProjectCategory,
      startDate: new Date(input.startDate),
      endDate: new Date(input.startDate), // default same as start; admin can update
      location: input.location,
      description: input.description,
      requiredVolunteers: input.requiredVolunteers,
      state: 'UPCOMING',           // starts as UPCOMING, admin approves/activates
      createdById: userId,
    },
    select: {
      id: true,
      title: true,
      category: true,
      state: true,
      location: true,
      startDate: true,
      requiredVolunteers: true,
      createdBy: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  return project;
}

export async function updateMissionState(
  adminId: string,
  projectId: string,
  newState: 'ACTIVE' | 'CANCELLED',
  reason?: string
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Mission not found.');
  if (project.state === 'COMPLETED' || project.state === 'CANCELLED') {
    throw new AppError(400, `Cannot change state of a ${project.state.toLowerCase()} mission.`);
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { state: newState },
    select: { id: true, title: true, state: true },
  });

  return {
    projectId: updated.id,
    title: updated.title,
    newState: updated.state,
    message:
      newState === 'ACTIVE'
        ? 'Mission approved and is now visible to volunteers.'
        : `Mission rejected${reason ? ': ' + reason : '.'} `,
  };
}

// ── Participants list for attendance marking ─────────────────────────────────

export async function getMissionParticipants(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Mission not found.');

  const participants = await prisma.projectParticipant.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          volunteerProfile: { select: { skills: true } },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return participants.map((p) => ({
    userId: p.user.id,
    name: p.user.name,
    email: p.user.email,
    avatarUrl: p.user.avatarUrl,
    skills: p.user.volunteerProfile?.skills ?? '',
    joinedAt: p.joinedAt,
  }));
}

// ── Volunteer's own mission history ─────────────────────────────────────────

export async function getMyMissions(userId: string) {
  const participations = await prisma.projectParticipant.findMany({
    where: { userId },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          category: true,
          state: true,
          location: true,
          startDate: true,
          endDate: true,
          requiredVolunteers: true,
          currentParticipants: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });

  return participations.map((p) => ({
    ...p.project,
    joinedAt: p.joinedAt,
    isFull: p.project.currentParticipants >= p.project.requiredVolunteers,
    spotsRemaining: Math.max(0, p.project.requiredVolunteers - p.project.currentParticipants),
    isJoined: true,
  }));
}
