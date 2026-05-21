import { z } from 'zod';

// ── Mission / Project Schemas ────────────────────────────────────

export const missionQuerySchema = z.object({
  state: z
    .enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
    .optional(),
  category: z
    .enum(['RESCUE', 'ADOPTION', 'MEDICAL', 'AWARENESS', 'FEEDING', 'OTHER'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().max(100).optional(),
});

export const joinMissionSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
});

export const verifyAttendanceSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  userId: z.string().cuid('Invalid user ID').optional(),
  notes: z.string().max(500).optional(),
});

export const createMissionSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(150),
  category: z.enum(['RESCUE', 'ADOPTION', 'MEDICAL', 'AWARENESS', 'FEEDING', 'OTHER']),
  startDate: z.string().datetime({ message: 'startDate must be an ISO 8601 datetime string' }),
  location: z.string().min(3, 'Location is required').max(200),
  description: z.string().min(20, 'Description must be at least 20 characters').max(2000),
  requiredVolunteers: z.number().int().min(1).max(200),
});

export type MissionQueryInput = z.infer<typeof missionQuerySchema>;
export type JoinMissionInput = z.infer<typeof joinMissionSchema>;
export type VerifyAttendanceInput = z.infer<typeof verifyAttendanceSchema>;
export type CreateMissionInput = z.infer<typeof createMissionSchema>;
