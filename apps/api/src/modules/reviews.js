// Product reviews for shoppers: paged list with summary, filters and customer photos; photo upload for reviewers;
// "helpful" votes. Reviews are written in catalog.js (POST /api/products/:id/reviews) via services/orders.createReview.
import express from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../../../packages/shared/src/index.js';
import { uuid } from '../../../../packages/validation/src/index.js';
import { transaction } from '../lib/db.js';
import { requireAuth } from '../http/middleware.js';
import { processImage, MAX_IMAGE_BYTES } from '../services/media.js';

const SORTS = {
  helpful: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }],
};
const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  size: z.coerce.number().int().min(1).max(30).default(10),
  sort: z.enum(['helpful', 'newest', 'highest', 'lowest']).default('helpful'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  photos: z.enum(['true', 'false']).optional(),
});
const DAILY_UPLOADS = 40;

export function registerReviews(app, { prisma, storage }) {
  /** Reviews of one product: a page of reviews plus the rating summary and a strip of customer photos. */
  app.get('/api/products/:id/reviews', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const q = listQuery.parse(req.query);
    const base = { catalogProductId: id, status: 'PUBLISHED' };
    const where = { ...base, ...(q.rating ? { rating: q.rating } : {}), ...(q.photos === 'true' ? { NOT: { images: { isEmpty: true } } } : {}) };
    const [rows, total, breakdown, avg, withPhotos, photoRows] = await Promise.all([
      prisma.review.findMany({ where, orderBy: SORTS[q.sort], skip: (q.page - 1) * q.size, take: q.size }),
      prisma.review.count({ where }),
      prisma.review.groupBy({ by: ['rating'], where: base, _count: { _all: true } }),
      prisma.review.aggregate({ where: base, _avg: { rating: true }, _count: { _all: true } }),
      prisma.review.count({ where: { ...base, NOT: { images: { isEmpty: true } } } }),
      q.page === 1 ? prisma.review.findMany({ where: { ...base, NOT: { images: { isEmpty: true } } }, orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }], take: 12, select: { id: true, images: true } }) : [],
    ]);
    const voted = req.user && rows.length
      ? new Set((await prisma.reviewVote.findMany({ where: { userId: req.user.id, reviewId: { in: rows.map((r) => r.id) } }, select: { reviewId: true } })).map((v) => v.reviewId))
      : new Set();
    res.set('Cache-Control', 'no-store');
    res.json({
      reviews: rows.map((r) => ({
        id: r.id, authorName: r.authorName, rating: r.rating, title: r.title, body: r.body, images: r.images, helpfulCount: r.helpfulCount,
        createdAt: r.createdAt, verified: true, mine: req.user?.id === r.userId, votedHelpful: voted.has(r.id),
      })),
      total, page: q.page, pages: Math.max(1, Math.ceil(total / q.size)),
      summary: {
        average: avg._count._all ? Math.round(avg._avg.rating * 10) / 10 : null,
        count: avg._count._all,
        breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: breakdown.find((b) => b.rating === stars)?._count._all ?? 0 })),
        withPhotos,
      },
      photos: photoRows.flatMap((r) => r.images.map((url) => ({ url, reviewId: r.id }))).slice(0, 24),
    });
  });

  /** Photo for a review. Only customers who have received something can upload, with a daily cap. */
  app.post('/api/reviews/media', requireAuth, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_IMAGE_BYTES }), async (req, res) => {
    const delivered = await prisma.orderItem.count({ where: { order: { userId: req.user.id }, sellerOrder: { status: 'DELIVERED' } } });
    if (!delivered) throw new DomainError('Photos can be added once you have received an order', 403);
    const today = await prisma.mediaAsset.count({ where: { ownerType: 'REVIEW', uploadedBy: req.user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (today >= DAILY_UPLOADS) throw new DomainError('You have uploaded a lot of photos today. Please try again tomorrow.', 429);
    const image = await processImage(req.body, { minSize: 200, maxSize: 1600 });
    const stored = await storage.put(image.data, image.mime);
    const asset = await prisma.mediaAsset.create({ data: { ownerType: 'REVIEW', uploadedBy: req.user.id, storageKey: stored.key, url: stored.url, mime: image.mime, width: image.width, height: image.height, bytes: image.data.length, originalName: String(req.get('x-file-name') || '').slice(0, 120) || null } });
    res.status(201).json({ media: { id: asset.id, url: asset.url, width: asset.width, height: asset.height } });
  });

  /** Marks a review helpful, or takes the vote back. Reviewers can't vote for their own review. */
  app.post('/api/reviews/:id/helpful', requireAuth, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const result = await transaction(prisma, async (tx) => {
      const [review] = await tx.$queryRaw(Prisma.sql`SELECT id, "userId", status FROM reviews WHERE id = ${id}::uuid FOR UPDATE`);
      if (!review || review.status !== 'PUBLISHED') throw new DomainError('Review not found', 404);
      if (review.userId === req.user.id) throw new DomainError('You can’t vote for your own review', 409);
      const existing = await tx.reviewVote.findUnique({ where: { reviewId_userId: { reviewId: id, userId: req.user.id } } });
      if (existing) await tx.reviewVote.delete({ where: { reviewId_userId: { reviewId: id, userId: req.user.id } } });
      else await tx.reviewVote.create({ data: { reviewId: id, userId: req.user.id } });
      const count = await tx.reviewVote.count({ where: { reviewId: id } });
      await tx.review.update({ where: { id }, data: { helpfulCount: count } });
      return { helpful: !existing, helpfulCount: count };
    });
    res.json(result);
  });
}
