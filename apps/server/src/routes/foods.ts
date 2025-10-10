import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { requireAuth } from '../middleware/require-auth.js';

const FOOD_CATALOGUE = [
  { name: '鶏むね肉グリル', calories: 165, protein_g: 31, fat_g: 3.6, carbs_g: 0 },
  { name: '鮭の塩焼き', calories: 230, protein_g: 25, fat_g: 14, carbs_g: 0 },
  { name: 'サーモン寿司', calories: 320, protein_g: 20, fat_g: 9, carbs_g: 38 },
  { name: 'サラダボウル', calories: 180, protein_g: 5, fat_g: 8, carbs_g: 20 },
  { name: '味噌汁', calories: 80, protein_g: 6, fat_g: 3, carbs_g: 8 },
  { name: 'カレーライス', calories: 650, protein_g: 18, fat_g: 24, carbs_g: 80 },
  { name: '照り焼きチキン', calories: 420, protein_g: 28, fat_g: 18, carbs_g: 32 },
  { name: 'オートミール', calories: 380, protein_g: 13, fat_g: 7, carbs_g: 67 },
];

export const foodsRouter = Router();

foodsRouter.get('/foods/search', requireAuth, (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 6), 20);

  if (!q) {
    return res.status(StatusCodes.OK).json({ q, candidates: FOOD_CATALOGUE.slice(0, limit) });
  }

  const candidates = FOOD_CATALOGUE.filter((item) => item.name.toLowerCase().includes(q)).slice(0, limit);
  res.status(StatusCodes.OK).json({ q, candidates });
});
