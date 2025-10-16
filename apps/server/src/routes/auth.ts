import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
} from '@meal-log/shared';
import { authenticateUser, findUserById, registerUser } from '../services/auth-service.js';
import { evaluateAiUsage, summarizeUsageStatus } from '../services/ai-usage-service.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = RegisterRequestSchema.parse(req.body);
    const user = await registerUser(body);
    req.session.userId = user.id;
    req.session.userPlan = user.plan;
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    res.status(StatusCodes.CREATED).json({
      message: 'User registered successfully',
      user,
      usage,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = LoginRequestSchema.parse(req.body);
    const user = await authenticateUser(body);
    req.session.userId = user.id;
    req.session.userPlan = user.plan;
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    res.status(StatusCodes.OK).json({
      message: 'Logged in successfully',
      user,
      usage,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', async (req, res) => {
  req.session.destroy(() => {
    res.status(StatusCodes.OK).json({ message: 'Logged out successfully' });
  });
});

authRouter.get('/session', async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ authenticated: false });
    }
    const user = await findUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => undefined);
      return res.status(StatusCodes.UNAUTHORIZED).json({ authenticated: false });
    }
    req.session.userPlan = user.plan;
    req.session.aiCredits = user.aiCredits;
    const usageStatus = await evaluateAiUsage(user.id);
    const usage = summarizeUsageStatus(usageStatus);
    return res.status(StatusCodes.OK).json({ authenticated: true, user, usage });
  } catch (error) {
    next(error);
  }
});
