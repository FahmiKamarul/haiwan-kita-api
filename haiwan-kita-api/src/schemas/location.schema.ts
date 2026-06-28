import { z } from 'zod';

// ── GPS / Location Schemas ──────────────────────────────────────

export const locationUpdateSchema = z.object({
  latitude: z
    .number()
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180'),
  accuracy: z.number().positive().optional(),
  altitude: z.number().optional(),
  speed: z.number().min(0).optional(),
  projectId: z.string().min(1, 'Project ID is required').optional(),
  isStreaming: z.boolean().default(true),
});

export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
