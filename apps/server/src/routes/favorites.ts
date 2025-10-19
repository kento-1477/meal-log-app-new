import { Router } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import {
  FavoriteMealCreateRequestSchema,
  FavoriteMealDetailResponseSchema,
  FavoriteMealListResponseSchema,
  FavoriteMealUpdateRequestSchema,
} from '@meal-log/shared';
import { requireAuth } from '../middleware/require-auth.js';
import {
  createFavoriteMeal,
  logFavoriteMeal,
  deleteFavoriteMeal,
  getFavoriteMeal,
  listFavoriteMeals,
  updateFavoriteMeal,
} from '../services/favorite-service.js';

export const favoritesRouter = Router();

const FavoriteIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

favoritesRouter.use(requireAuth);

favoritesRouter.get('/favorites', async (req, res, next) => {
  try {
    const favorites = await listFavoriteMeals(req.session.userId!);
    const payload = { ok: true, items: favorites } as const;
    FavoriteMealListResponseSchema.parse(payload);
    res.status(StatusCodes.OK).json(payload);
  } catch (error) {
    next(error);
  }
});

favoritesRouter.post('/favorites', async (req, res, next) => {
  try {
    FavoriteMealCreateRequestSchema.parse(req.body);
    const favorite = await createFavoriteMeal(req.session.userId!, req.body);
    const payload = { ok: true, item: favorite } as const;
    FavoriteMealDetailResponseSchema.parse(payload);
    res.status(StatusCodes.CREATED).json(payload);
  } catch (error) {
    next(error);
  }
});

favoritesRouter.get('/favorites/:id', async (req, res, next) => {
  try {
    const params = FavoriteIdParamSchema.parse(req.params);
    const favorite = await getFavoriteMeal(req.session.userId!, params.id);
    const payload = { ok: true, item: favorite } as const;
    FavoriteMealDetailResponseSchema.parse(payload);
    res.status(StatusCodes.OK).json(payload);
  } catch (error) {
    next(error);
  }
});

favoritesRouter.patch('/favorites/:id', async (req, res, next) => {
  try {
    const params = FavoriteIdParamSchema.parse(req.params);
    FavoriteMealUpdateRequestSchema.parse(req.body);
    const favorite = await updateFavoriteMeal(req.session.userId!, params.id, req.body);
    const payload = { ok: true, item: favorite } as const;
    FavoriteMealDetailResponseSchema.parse(payload);
    res.status(StatusCodes.OK).json(payload);
  } catch (error) {
    next(error);
  }
});

favoritesRouter.delete('/favorites/:id', async (req, res, next) => {
  try {
    const params = FavoriteIdParamSchema.parse(req.params);
    await deleteFavoriteMeal(req.session.userId!, params.id);
    res.status(StatusCodes.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

favoritesRouter.post('/favorites/:id/log', async (req, res, next) => {
  try {
    const params = FavoriteIdParamSchema.parse(req.params);
    const result = await logFavoriteMeal(req.session.userId!, params.id);
    res.status(StatusCodes.CREATED).json(result);
  } catch (error) {
    next(error);
  }
});
