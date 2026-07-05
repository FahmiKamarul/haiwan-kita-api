import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const reviewService = {
  async createReview(projectId: string, userId: string, data: {
    ratingManagement: number;
    ratingSafety: number;
    ratingImpact: number;
    ratingFacility: number;
    comment?: string;
  }) {
    // Calculate overall rating
    const overallRating = (data.ratingManagement + data.ratingSafety + data.ratingImpact + data.ratingFacility) / 4.0;

    return await prisma.missionReview.create({
      data: {
        projectId,
        userId,
        ratingManagement: data.ratingManagement,
        ratingSafety: data.ratingSafety,
        ratingImpact: data.ratingImpact,
        ratingFacility: data.ratingFacility,
        overallRating,
        comment: data.comment,
      },
    });
  },

  async getReviewsByMission(projectId: string) {
    const reviews = await prisma.missionReview.findMany({
      where: { projectId },
      include: {
        user: { select: { name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalReviews = reviews.length;
    let sumOverall = 0, sumManagement = 0, sumSafety = 0, sumImpact = 0, sumFacility = 0;

    for (const r of reviews) {
      sumOverall += r.overallRating;
      sumManagement += r.ratingManagement;
      sumSafety += r.ratingSafety;
      sumImpact += r.ratingImpact;
      sumFacility += r.ratingFacility;
    }

    const summary = {
      totalReviews,
      averageRatings: {
        overall: totalReviews > 0 ? (sumOverall / totalReviews).toFixed(1) : '0.0',
        management: totalReviews > 0 ? (sumManagement / totalReviews).toFixed(1) : '0.0',
        safety: totalReviews > 0 ? (sumSafety / totalReviews).toFixed(1) : '0.0',
        impact: totalReviews > 0 ? (sumImpact / totalReviews).toFixed(1) : '0.0',
        facility: totalReviews > 0 ? (sumFacility / totalReviews).toFixed(1) : '0.0',
      }
    };

    return { summary, reviews };
  },

  async getAdminStats() {
    const totalReviews = await prisma.missionReview.count();
    
    if (totalReviews === 0) {
      return { totalReviews: 0, platformAverage: 0 };
    }
    
    const aggregations = await prisma.missionReview.aggregate({
      _avg: {
        overallRating: true,
      },
    });

    return {
      totalReviews,
      platformAverage: aggregations._avg.overallRating || 0,
    };
  }
};
