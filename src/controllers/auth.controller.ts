import { FastifyRequest, FastifyReply } from 'fastify';
import { registerSchema, loginSchema, updateProfileSchema, updatePasswordSchema } from '../schemas/auth.schema';
import {
  registerUser,
  loginUser,
  createPaymentIntent as createPaymentIntentService,
  updateUserProfile,
  updateUserPassword,
  getCurrentUser,
} from '../services/auth.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

// ── Auth Controller ─────────────────────────────────────────────

export async function register(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const input = registerSchema.parse(request.body);
  const data = await registerUser(input, request.server);
  successResponse(reply, data, 'Registration successful.', 201);
}

export async function login(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const input = loginSchema.parse(request.body);
  const data = await loginUser(input, request.server);
  successResponse(reply, data, 'Login successful.');
}

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2024-04-10', // Or whatever the latest version is
});

export async function createPaymentIntent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  if (user.role !== 'MEMBER') {
    throw new AppError(403, 'Only Members need to pay membership fees.');
  }
  
  // Call the service
  const data = await createPaymentIntentService(user.sub);
  successResponse(reply, data, 'Payment Intent created successfully.');
}

export async function stripeWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sig = request.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';

  let event;

  try {
    // FastifyRawBody makes raw payload available at request.rawBody
    event = stripe.webhooks.constructEvent(request.rawBody as string, sig as string, endpointSecret);
  } catch (err: any) {
    request.log.error(`Webhook Error: ${err.message}`);
    reply.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const userId = paymentIntent.metadata.userId;

    if (userId) {
      // Update member status
      const { prisma } = require('../config/prisma');
      await prisma.memberProfile.update({
        where: { userId },
        data: {
          paymentStatus: 'PAID',
          amountPaid: paymentIntent.amount / 100, // convert back from cents
          paidAt: new Date(),
        },
      });
      request.log.info(`Membership activated for user ${userId}`);
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  reply.send({ received: true });
}

export async function getMe(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  
  const data = await getCurrentUser(user.sub);
  successResponse(reply, data);
}

export async function updateProfile(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = updateProfileSchema.parse(request.body);
  const data = await updateUserProfile(user.sub, input);
  successResponse(reply, data, 'Profile updated successfully.');
}

export async function updatePassword(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = updatePasswordSchema.parse(request.body);
  const data = await updateUserPassword(user.sub, input);
  successResponse(reply, data, 'Password updated successfully.');
}
