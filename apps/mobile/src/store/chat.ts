import { nanoid } from 'nanoid/non-secure';
import { create } from 'zustand';
import type { ChatMessage, NutritionCardPayload } from '@/types/chat';

export interface ChatState {
  messages: ChatMessage[];
  composingImageUri?: string | null;
  addUserMessage: (text: string) => ChatMessage;
  addAssistantMessage: (text: string, options?: { card?: NutritionCardPayload; status?: ChatMessage['status'] }) => ChatMessage;
  setMessageText: (id: string, text: string) => void;
  updateMessageStatus: (id: string, status: ChatMessage['status']) => void;
  attachCardToMessage: (id: string, card: NutritionCardPayload) => void;
  setComposingImage: (uri: string | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [
    {
      id: nanoid(),
      role: 'assistant',
      text: 'こんにちは！食事内容を送っていただければ、栄養情報をお返しします🍽️',
      createdAt: Date.now(),
    },
  ],
  composingImageUri: null,
  addUserMessage: (text) => {
    const message: ChatMessage = {
      id: nanoid(),
      role: 'user',
      text,
      createdAt: Date.now(),
      status: 'sending',
    };
    set({ messages: [...get().messages, message] });
    return message;
  },
  addAssistantMessage: (text, options) => {
    const message: ChatMessage = {
      id: nanoid(),
      role: 'assistant',
      text,
      createdAt: Date.now(),
      status: options?.status,
      card: options?.card,
    };
    set({ messages: [...get().messages, message] });
    return message;
  },
  setMessageText: (id: string, textVal: string) => {
    set({
      messages: get().messages.map((message) =>
        message.id === id ? { ...message, text: textVal } : message,
      ),
    });
  },
  updateMessageStatus: (id, status) => {
    set({
      messages: get().messages.map((message) => (message.id === id ? { ...message, status } : message)),
    });
  },
  attachCardToMessage: (id, card) => {
    set({
      messages: get().messages.map((message) =>
        message.id === id ? { ...message, card, status: 'delivered' } : message,
      ),
    });
  },
  setComposingImage: (uri) => set({ composingImageUri: uri }),
  reset: () => set({ messages: [], composingImageUri: null }),
}));
