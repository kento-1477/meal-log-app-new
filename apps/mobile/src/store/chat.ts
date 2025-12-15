import { nanoid } from 'nanoid/non-secure';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, NutritionCardPayload } from '@/types/chat';

export type PendingIngest = {
  requestKey: string;
  userMessageId: string;
  assistantMessageId: string;
  createdAt: number;
};

export interface ChatState {
  messages: ChatMessage[];
  composingImageUri?: string | null;
  pendingIngests: PendingIngest[];
  addUserMessage: (text: string) => ChatMessage;
  addAssistantMessage: (text: string, options?: { card?: NutritionCardPayload; status?: ChatMessage['status'] }) => ChatMessage;
  setMessageText: (id: string, text: string) => void;
  updateMessageStatus: (id: string, status: ChatMessage['status']) => void;
  attachCardToMessage: (id: string, card: NutritionCardPayload) => void;
  updateCardForLog: (logId: string, updates: Partial<NutritionCardPayload>) => void;
  setComposingImage: (uri: string | null) => void;
  addPendingIngest: (ingest: PendingIngest) => void;
  removePendingIngest: (requestKey: string) => void;
  reset: () => void;
}

function buildInitialMessages(): ChatMessage[] {
  return [
    {
      id: nanoid(),
      role: 'assistant',
      text: 'こんにちは！食事内容を送っていただければ、栄養情報をお返しします🍽️',
      createdAt: Date.now(),
    },
  ];
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: buildInitialMessages(),
      composingImageUri: null,
      pendingIngests: [],
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
      updateCardForLog: (logId, updates) => {
        set({
          messages: get().messages.map((message) => {
            if (!message.card || message.card.logId !== logId) {
              return message;
            }
            const nextCard: NutritionCardPayload = {
              ...message.card,
              ...updates,
            };
            if (updates.totals) {
              nextCard.totals = {
                ...message.card.totals,
                ...updates.totals,
              };
            }
            if (updates.items) {
              nextCard.items = updates.items;
            }
            return { ...message, card: nextCard };
          }),
        });
      },
      setComposingImage: (uri) => set({ composingImageUri: uri }),
      addPendingIngest: (ingest) => set({ pendingIngests: [...get().pendingIngests, ingest] }),
      removePendingIngest: (requestKey) =>
        set({ pendingIngests: get().pendingIngests.filter((ingest) => ingest.requestKey !== requestKey) }),
      reset: () => set({ messages: buildInitialMessages(), composingImageUri: null, pendingIngests: [] }),
    }),
    {
      name: 'meal-log.chat',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({
        messages: state.messages.slice(-200),
        composingImageUri: state.composingImageUri,
        pendingIngests: state.pendingIngests,
      }),
    },
  ),
);
