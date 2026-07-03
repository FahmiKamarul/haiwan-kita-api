import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errorHandler';
import { RegisterInput, LoginInput, UpdateProfileInput, UpdatePasswordInput } from '../schemas/auth.schema';
import { Role } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import {
  generateUserId,
  generateMemberProfileId,
  generateVolunteerProfileId,
} from '../utils/idGenerator';

const SALT_ROUNDS = 12;
const MEMBERSHIP_FEE_RM = 50;

// ── Auth Service ────────────────────────────────────────────────

export async function registerUser(
  input: RegisterInput,
  fastify: FastifyInstance,
) {
  const { name, email, password, role, phone } = input;

  // 1. Prevent duplicate emails
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'An account with this email already exists.');
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // 3. Generate prefixed sequential IDs before inserting
  const userId = await generateUserId(prisma);

  // 4. Create user + role-specific profile in a transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        id: userId,  // USR-XXXXX
        name,
        email,
        passwordHash,
        role: role as Role,
        phone,
      },
    });

    if (role === 'MEMBER') {
      // Simulate payment: create MemberProfile with PENDING payment
      const membershipExpiry = new Date();
      membershipExpiry.setFullYear(membershipExpiry.getFullYear() + 1);
      const memberProfileId = await generateMemberProfileId(tx);

      await tx.memberProfile.create({
        data: {
          id: memberProfileId,  // MBP-XXXXX
          userId: newUser.id,
          paymentStatus: 'PENDING',
          membershipExpiry,
        },
      });
    } else if (role === 'VOLUNTEER') {
      const volunteerProfileId = await generateVolunteerProfileId(tx);

      await tx.volunteerProfile.create({
        data: {
          id: volunteerProfileId,  // VLP-XXXXX
          userId: newUser.id,
        },
      });
    }

    return newUser;
  });

  // 4. Generate JWT
  const token = fastify.jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    { expiresIn: '7d' },
  );

  // 5. Build response (no sensitive fields)
  const responsePayload: Record<string, unknown> = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    token,
  };

  // If Member, include payment info
  if (role === 'MEMBER') {
    responsePayload.paymentRequired = true;
    responsePayload.membershipFeeRM = MEMBERSHIP_FEE_RM;
    responsePayload.paymentStatus = 'PENDING';
    responsePayload.message =
      'Account created. Please complete the RM50 annual membership payment to activate your Member privileges.';
  }

  return responsePayload;
}

export async function loginUser(input: LoginInput, fastify: FastifyInstance) {
  const { email, password } = input;

  // 1. Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberProfile: true,
      volunteerProfile: true,
    },
  });

  if (!user) {
    throw new AppError(401, 'Invalid email or password.');
  }

  if (!user.isActive) {
    throw new AppError(403, 'Your account has been deactivated. Contact support.');
  }

  // 2. Compare password
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError(401, 'Invalid email or password.');
  }

  // 3. Generate JWT
  const token = fastify.jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    { expiresIn: '7d' },
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    token,
    memberProfile: user.memberProfile
      ? {
          paymentStatus: user.memberProfile.paymentStatus,
          membershipExpiry: user.memberProfile.membershipExpiry,
        }
      : null,
    volunteerProfile: user.volunteerProfile
      ? {
          totalMissions: user.volunteerProfile.totalMissions,
        }
      : null,
  };
}

// ── Simulated Payment Service ────────────────────────────────────
export async function processMemberPayment(userId: string) {
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId },
  });

  if (!memberProfile) {
    throw new AppError(404, 'Member profile not found.');
  }

  if (memberProfile.paymentStatus === 'PAID') {
    throw new AppError(409, 'Membership fee has already been paid.');
  }

  // Simulate payment gateway success
  const updated = await prisma.memberProfile.update({
    where: { userId },
    data: {
      paymentStatus: 'PAID',
      amountPaid: MEMBERSHIP_FEE_RM,
      paidAt: new Date(),
    },
  });

  return {
    paymentStatus: updated.paymentStatus,
    amountPaid: Number(updated.amountPaid),
    paidAt: updated.paidAt,
    membershipExpiry: updated.membershipExpiry,
    message: `RM${MEMBERSHIP_FEE_RM} membership fee paid successfully. Welcome to Haiwan Kita!`,
  };
}

export async function updateUserProfile(userId: string, input: UpdateProfileInput) {
  const { name, phone, skills } = input;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
      },
    });

    if (skills !== undefined && user.role === 'VOLUNTEER') {
      await tx.volunteerProfile.update({
        where: { userId },
        data: { skills },
      });
    }
  });

  // Re-fetch volunteerProfile to get the updated skills
  const finalUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberProfile: true,
      volunteerProfile: true,
    },
  });

  return {
    id: finalUser!.id,
    name: finalUser!.name,
    email: finalUser!.email,
    role: finalUser!.role,
    phone: finalUser!.phone,
    avatarUrl: finalUser!.avatarUrl,
    memberProfile: finalUser!.memberProfile
      ? {
          paymentStatus: finalUser!.memberProfile.paymentStatus,
          membershipExpiry: finalUser!.memberProfile.membershipExpiry,
        }
      : null,
    volunteerProfile: finalUser!.volunteerProfile
      ? {
          totalMissions: finalUser!.volunteerProfile.totalMissions,
          skills: finalUser!.volunteerProfile.skills,
        }
      : null,
  };
}

export async function updateUserPassword(userId: string, input: UpdatePasswordInput) {
  const { currentPassword, newPassword } = input;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new AppError(400, 'Current password is incorrect.');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { message: 'Password updated successfully.' };
}
