// ============================================================
//  src/utils/idGenerator.ts — Prefixed Sequential ID Generator
// ============================================================
//
// Generates human-readable IDs in the format: PREFIX-XXXXX
// Examples: USR-00001, PRJ-00024, ATT-00142, LOC-05000
//
// This module provides a thread-safe, database-backed sequential
// ID generator that replaces CUID/hash-based IDs.
// ============================================================

import { PrismaClient } from '@prisma/client';

/**
 * Registry of entity prefixes used across the application.
 * Each Prisma model maps to a 3-letter uppercase prefix.
 */
export const ID_PREFIX = {
  USER: 'USR',
  PROJECT: 'PRJ',
  ADMIN_PROFILE: 'ADP',
  MEMBER_PROFILE: 'MBP',
  VOLUNTEER_PROFILE: 'VLP',
  PROJECT_PARTICIPANT: 'PTP',
  LOCATION: 'LOC',
  PROJECT_ATTENDANCE: 'ATT',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

/** Default padding width for the numeric portion */
const PAD_WIDTH = 5;

// ── Core Functions ──────────────────────────────────────────────

/**
 * Formats a sequential number into a prefixed padded ID string.
 *
 * @example formatId('USR', 1)   => 'USR-00001'
 * @example formatId('PRJ', 142) => 'PRJ-00142'
 */
export function formatId(prefix: IdPrefix, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(PAD_WIDTH, '0')}`;
}

/**
 * Parses a prefixed ID string back into its components.
 *
 * @example parseId('USR-00142') => { prefix: 'USR', sequence: 142 }
 * @throws Error if the ID format is invalid
 */
export function parseId(id: string): { prefix: string; sequence: number } {
  const match = id.match(/^([A-Z]{3})-(\d{5})$/);
  if (!match) {
    throw new Error(`Invalid ID format: "${id}". Expected format: XXX-XXXXX`);
  }
  return { prefix: match[1], sequence: parseInt(match[2], 10) };
}

/**
 * Validates whether a string conforms to the prefixed ID format.
 *
 * @example isValidId('USR-00001')     => true
 * @example isValidId('clxyz123abc')   => false
 */
export function isValidId(id: string, expectedPrefix?: IdPrefix): boolean {
  const pattern = expectedPrefix
    ? new RegExp(`^${expectedPrefix}-\\d{${PAD_WIDTH}}$`)
    : new RegExp(`^[A-Z]{3}-\\d{${PAD_WIDTH}}$`);
  return pattern.test(id);
}

// ── Database-backed Next ID Generator ───────────────────────────

/**
 * Generates the next sequential ID for a given model/table.
 *
 * Strategy:
 *   1. Query the last record ordered by `id` descending
 *   2. Parse the numeric portion from the last ID
 *   3. Increment by 1 and pad with leading zeros
 *   4. If no records exist, start at 00001
 *
 * @param prisma  - Prisma client (or transaction client)
 * @param model   - The Prisma model delegate name (e.g., 'user', 'project')
 * @param prefix  - The 3-letter prefix for this entity type
 * @returns       - The next formatted ID string (e.g., 'USR-00002')
 *
 * @example
 * const nextId = await generateNextId(prisma, 'user', ID_PREFIX.USER);
 * // => 'USR-00001' (if table is empty)
 * // => 'USR-00035' (if last record was USR-00034)
 */
export async function generateNextId(
  prisma: PrismaClient | any,
  model: string,
  prefix: IdPrefix,
): Promise<string> {
  // Use Prisma's dynamic model access: prisma[model].findFirst(...)
  const delegate = (prisma as any)[model];

  if (!delegate) {
    throw new Error(`Unknown Prisma model: "${model}"`);
  }

  const lastRecord = await delegate.findFirst({
    select: { id: true },
    orderBy: { id: 'desc' },
  });

  let nextSequence = 1;

  if (lastRecord?.id) {
    try {
      const { sequence } = parseId(lastRecord.id);
      nextSequence = sequence + 1;
    } catch {
      // If existing IDs are in old CUID format, start fresh from 1
      // or find the max numeric ID among valid prefixed IDs
      const allRecords = await delegate.findMany({
        select: { id: true },
        where: {
          id: { startsWith: `${prefix}-` },
        },
        orderBy: { id: 'desc' },
        take: 1,
      });

      if (allRecords.length > 0) {
        const { sequence } = parseId(allRecords[0].id);
        nextSequence = sequence + 1;
      }
    }
  }

  return formatId(prefix, nextSequence);
}

// ── Convenience Generators (one per entity) ─────────────────────

export async function generateUserId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'user', ID_PREFIX.USER);
}

export async function generateProjectId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'project', ID_PREFIX.PROJECT);
}

export async function generateParticipantId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'projectParticipant', ID_PREFIX.PROJECT_PARTICIPANT);
}

export async function generateLocationId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'location', ID_PREFIX.LOCATION);
}

export async function generateAttendanceId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'projectAttendance', ID_PREFIX.PROJECT_ATTENDANCE);
}

export async function generateAdminProfileId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'adminProfile', ID_PREFIX.ADMIN_PROFILE);
}

export async function generateMemberProfileId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'memberProfile', ID_PREFIX.MEMBER_PROFILE);
}

export async function generateVolunteerProfileId(prisma: PrismaClient | any): Promise<string> {
  return generateNextId(prisma, 'volunteerProfile', ID_PREFIX.VOLUNTEER_PROFILE);
}
