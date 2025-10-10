export type ChatRole = 'user' | 'assistant' | 'system' | 'warning';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  card?: NutritionCardPayload;
  status?: 'sending' | 'delivered' | 'error';
}

export interface NutritionCardPayload {
  dish: string;
  confidence: number;
  totals: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  items: Array<{
    name: string;
    grams: number;
    protein_g?: number;
    fat_g?: number;
    carbs_g?: number;
  }>;
  warnings?: string[];
}
