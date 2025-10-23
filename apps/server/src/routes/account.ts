import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/require-auth.js';
import { getPremiumStatus, getAllPremiumGrants } from '../services/premium-service.js';

export const accountRouter = Router();

/**
 * GET /api/user/premium-status
 * プレミアムステータスを取得
 */
accountRouter.get('/premium-status', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    
    const status = await getPremiumStatus(userId);
    const grants = await getAllPremiumGrants(userId);

    res.status(StatusCodes.OK).json({
      ok: true,
      isPremium: status.isPremium,
      source: status.source,
      daysRemaining: status.daysRemaining,
      expiresAt: status.expiresAt?.toISOString() ?? null,
      grants: grants.map((grant) => ({
        source: grant.source,
        days: grant.days,
        startDate: grant.startDate.toISOString(),
        endDate: grant.endDate.toISOString(),
        createdAt: grant.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    await prisma.$transaction(async (tx) => {
      const logs = await tx.mealLog.findMany({ where: { userId }, select: { id: true } });
      const logIds = logs.map((log) => log.id);

      if (logIds.length > 0) {
        await tx.mediaAsset.deleteMany({ where: { mealLogId: { in: logIds } } });
        await tx.mealLogEdit.deleteMany({ where: { mealLogId: { in: logIds } } });
        await tx.mealLogPeriodHistory.deleteMany({ where: { mealLogId: { in: logIds } } });
        await tx.logShareToken.deleteMany({ where: { mealLogId: { in: logIds } } });
        await tx.favoriteMeal.updateMany({ where: { sourceMealLogId: { in: logIds } }, data: { sourceMealLogId: null } });
      }

      await tx.favoriteMeal.deleteMany({ where: { userId } });
      await tx.ingestRequest.deleteMany({ where: { userId } });
      await tx.aiUsageCounter.deleteMany({ where: { userId } });
      await tx.iapReceipt.deleteMany({ where: { userId } });
      await tx.mealLog.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    req.session.destroy(() => undefined);
    res.status(StatusCodes.OK).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
