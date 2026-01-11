import { nanoid } from 'nanoid/non-secure';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, NutritionCardPayload } from '@/types/chat';
import { translateKey } from '@/i18n';

export interface ChatState {
  messages: ChatMessage[];
  composingImageUri?: string | null;
  addUserMessage: (text: string, options?: { imageUri?: string | null }) => ChatMessage;
  addAssistantMessage: (
    text: string,
    options?: {
      card?: NutritionCardPayload;
      status?: ChatMessage['status'];
      ingest?: ChatMessage['ingest'];
    },
  ) => ChatMessage;
  setMessageText: (id: string, text: string) => void;
  updateMessageStatus: (id: string, status: ChatMessage['status']) => void;
  attachCardToMessage: (id: string, card: NutritionCardPayload) => void;
  updateCardForLog: (logId: string, updates: Partial<NutritionCardPayload>) => void;
  setComposingImage: (uri: string | null) => void;
  reset: () => void;
}

function buildInitialMessages(): ChatMessage[] {
  return [
    {
      id: nanoid(),
      role: 'assistant',
      text: translateKey('chat.welcome'),
      createdAt: Date.now(),
    },
  ];
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: buildInitialMessages(),
      composingImageUri: null,
      addUserMessage: (text, options) => {
        const message: ChatMessage = {
          id: nanoid(),
          role: 'user',
          text,
          imageUri: options?.imageUri ?? undefined,
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
          ingest: options?.ingest,
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
          messages: get().messages.map((message) =>
            message.id === id ? { ...message, status } : message,
          ),
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
      reset: () => set({ messages: buildInitialMessages(), composingImageUri: null }),
    }),
    {
      name: 'meal-log.chat',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') {
          return persisted as unknown as ChatState;
        }

        // v1 stored pending ingests separately; attach them to the assistant placeholder message.
        if (version < 2) {
          const state = persisted as any;
          const messages = Array.isArray(state.messages) ? (state.messages as ChatMessage[]) : [];
          const pending = Array.isArray(state.pendingIngests) ? state.pendingIngests : [];
          if (pending.length && messages.length) {
            const ingestByAssistantId = new Map<
              string,
              { requestKey: string; userMessageId: string }
            >();
            for (const entry of pending) {
              if (!entry) continue;
              if (typeof entry.assistantMessageId !== 'string') continue;
              if (typeof entry.requestKey !== 'string') continue;
              if (typeof entry.userMessageId !== 'string') continue;
              ingestByAssistantId.set(entry.assistantMessageId, {
                requestKey: entry.requestKey,
                userMessageId: entry.userMessageId,
              });
            }
            const migratedMessages = messages.map((message) => {
              if (!message || typeof message !== 'object') return message;
              const ingest = ingestByAssistantId.get((message as ChatMessage).id);
              if (!ingest) return message;
              return {
                ...(message as ChatMessage),
                ingest: (message as ChatMessage).ingest ?? ingest,
              };
            });
            state.messages = migratedMessages;
          }
          delete state.pendingIngests;
          return state as ChatState;
        }

        return persisted as unknown as ChatState;
      },
      partialize: (state) => ({
        messages: state.messages.slice(-200),
        composingImageUri: state.composingImageUri,
      }),
    },
  ),
);
