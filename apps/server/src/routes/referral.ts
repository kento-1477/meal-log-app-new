/**
 * Referral API Routes
 * 
 * 紹介制度関連のエンドポイント
 */

import { Router } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import {
  getOrCreateInviteLink,
  claimReferralCode,
  getReferralStats,
  getRecentReferrals,
  generateDeviceFingerprint,
} from '../services/referral-service.js';
import { getClientIp, getClientUserAgent } from '../utils/client-info.js';

const router = Router();

/**
 * POST /api/referral/invite-link
 * 招待リンクを生成
 */
router.post('/invite-link', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        ok: false,
        error: '認証が必要です',
      });
    }

    const result = await getOrCreateInviteLink(userId);
    
    res.status(StatusCodes.OK).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/referral/claim
 * 招待コードをクレーム（被紹介者として登録）
 */
const ClaimRequestSchema = z.object({
  code: z.string().min(1),
});

router.post('/claim', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        ok: false,
        error: '認証が必要です',
      });
    }

    const parsed = ClaimRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        ok: false,
        error: '無効なリクエストです',
      });
    }

    const ip = getClientIp(req);
    const userAgent = getClientUserAgent(req);
    const deviceFingerprint = generateDeviceFingerprint(ip, userAgent);

    const result = await claimReferralCode({
      userId,
      code: parsed.data.code,
      deviceFingerprint,
    });

    res.status(StatusCodes.OK).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/referral/my-status
 * 自分の紹介状況を取得
 */
router.get('/my-status', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        ok: false,
        error: '認証が必要です',
      });
    }

    const inviteLink = await getOrCreateInviteLink(userId);
    const stats = await getReferralStats(userId);
    const recentReferrals = await getRecentReferrals(userId, 5);

    res.status(StatusCodes.OK).json({
      ok: true,
      inviteCode: inviteLink.code,
      inviteLink: inviteLink.inviteLink,
      webLink: inviteLink.webLink,
      stats,
      recentReferrals,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
