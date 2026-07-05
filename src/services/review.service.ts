import { prisma } from '../config/prisma';
import { AppError } from '../utils/errorHandler';
import { z } from 'zod';

export const SubmitReviewSchema = z.object({
  ratingManagement: z.number().min(1).max(5),
  ratingSafety: z.number().min(1).max(5),
  ratingImpact: z.number().min(1).max(5),
  ratingFacility: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export type SubmitReviewInput = z.infer<typeof SubmitReviewSchema>;

export async function submitReview(userId: string, projectId: string, input: SubmitReviewInput) {
  // 1. Check if the project exists and is COMPLETED
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new AppError(404, 'Mission not found.');
  }

  if (project.state !== 'COMPLETED') {
    throw new AppError(400, 'Anda hanya boleh memberi ulasan untuk misi yang telah selesai.');
  }

  // 2. Check if the user participated and their attendance was VERIFIED or GENERATED
  const attendance = await prisma.projectAttendance.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  if (!attendance) {
    throw new AppError(403, 'Anda tidak menyertai misi ini.');
  }

  // 3. Check if user already submitted a review
  const existingReview = await prisma.missionReview.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  if (existingReview) {
    throw new AppError(409, 'Anda telah pun menghantar ulasan untuk misi ini.');
  }

  // 4. Create the review
  // Generate an ID (REV-XXXXX)
  const lastReview = await prisma.missionReview.findFirst({
    orderBy: { id: 'desc' },
  });
  let nextNum = 1;
  if (lastReview && lastReview.id.startsWith('REV-')) {
    const num = parseInt(lastReview.id.replace('REV-', ''), 10);
    if (!isNaN(num)) nextNum = num + 1;
  }
  const reviewId = `REV-${nextNum.toString().padStart(5, '0')}`;

  const review = await prisma.missionReview.create({
    data: {
      id: reviewId,
      userId,
      projectId,
      ratingManagement: input.ratingManagement,
      ratingSafety: input.ratingSafety,
      ratingImpact: input.ratingImpact,
      ratingFacility: input.ratingFacility,
      comment: input.comment,
    },
  });

  return review;
}

export async function getProjectReviews(projectId: string) {
  const reviews = await prisma.missionReview.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  let avgManagement = 0;
  let avgSafety = 0;
  let avgImpact = 0;
  let avgFacility = 0;
  let avgOverall = 0;

  if (reviews.length > 0) {
    const sumManagement = reviews.reduce((sum, r) => sum + r.ratingManagement, 0);
    const sumSafety = reviews.reduce((sum, r) => sum + r.ratingSafety, 0);
    const sumImpact = reviews.reduce((sum, r) => sum + r.ratingImpact, 0);
    const sumFacility = reviews.reduce((sum, r) => sum + r.ratingFacility, 0);

    avgManagement = sumManagement / reviews.length;
    avgSafety = sumSafety / reviews.length;
    avgImpact = sumImpact / reviews.length;
    avgFacility = sumFacility / reviews.length;
    avgOverall = (avgManagement + avgSafety + avgImpact + avgFacility) / 4;
  }

  return {
    summary: {
      totalReviews: reviews.length,
      averageRatings: {
        overall: Number(avgOverall.toFixed(1)),
        management: Number(avgManagement.toFixed(1)),
        safety: Number(avgSafety.toFixed(1)),
        impact: Number(avgImpact.toFixed(1)),
        facility: Number(avgFacility.toFixed(1)),
      },
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      user: r.user,
      ratingManagement: r.ratingManagement,
      ratingSafety: r.ratingSafety,
      ratingImpact: r.ratingImpact,
      ratingFacility: r.ratingFacility,
      overallRating: (r.ratingManagement + r.ratingSafety + r.ratingImpact + r.ratingFacility) / 4,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
  };
}

export async function getAdminReviewStats() {
  const allReviews = await prisma.missionReview.findMany({
    include: {
      project: { select: { id: true, title: true } }
    }
  });
  
  if (allReviews.length === 0) {
    return {
      totalReviews: 0,
      platformAverage: 0,
      recentReviews: [],
      topProjects: []
    };
  }

  const sumManagement = allReviews.reduce((sum, r) => sum + r.ratingManagement, 0);
  const sumSafety = allReviews.reduce((sum, r) => sum + r.ratingSafety, 0);
  const sumImpact = allReviews.reduce((sum, r) => sum + r.ratingImpact, 0);
  const sumFacility = allReviews.reduce((sum, r) => sum + r.ratingFacility, 0);

  const avgManagement = sumManagement / allReviews.length;
  const avgSafety = sumSafety / allReviews.length;
  const avgImpact = sumImpact / allReviews.length;
  const avgFacility = sumFacility / allReviews.length;
  const platformAverage = (avgManagement + avgSafety + avgImpact + avgFacility) / 4;

  const projectStats: Record<string, { title: string; totalRating: number; count: number }> = {};
  
  allReviews.forEach(r => {
    if (!projectStats[r.projectId]) {
      projectStats[r.projectId] = { title: r.project.title, totalRating: 0, count: 0 };
    }
    const rOverall = (r.ratingManagement + r.ratingSafety + r.ratingImpact + r.ratingFacility) / 4;
    projectStats[r.projectId].totalRating += rOverall;
    projectStats[r.projectId].count += 1;
  });

  const topProjects = Object.entries(projectStats)
    .map(([id, stats]) => ({
      projectId: id,
      title: stats.title,
      averageRating: Number((stats.totalRating / stats.count).toFixed(1)),
      reviewCount: stats.count
    }))
    .sort((a, b) => b.averageRating - a.averageRating)
    .slice(0, 5);

  const recentReviews = [...allReviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectTitle: r.project.title,
      overallRating: Number(((r.ratingManagement + r.ratingSafety + r.ratingImpact + r.ratingFacility) / 4).toFixed(1)),
      comment: r.comment,
      createdAt: r.createdAt
    }));

  return {
    totalReviews: allReviews.length,
    platformAverage: Number(platformAverage.toFixed(1)),
    categoryAverages: {
      management: Number(avgManagement.toFixed(1)),
      safety: Number(avgSafety.toFixed(1)),
      impact: Number(avgImpact.toFixed(1)),
      facility: Number(avgFacility.toFixed(1)),
    },
    topProjects,
    recentReviews
  };
}
