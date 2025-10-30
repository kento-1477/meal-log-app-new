type Purchase = {
  productId?: string | null;
  transactionId?: string | null;
  originalTransactionIdentifier?: string | null;
  acknowledged?: boolean;
  quantity?: number;
  transactionReceipt?: string | null;
};

type PurchaseResponse = {
  responseCode: number;
  results?: Purchase[];
  errorCode?: string;
};

type Listener = (event: PurchaseResponse) => void;

const state: {
  listener: Listener | null;
  implementations: {
    connectAsync: () => Promise<void>;
    disconnectAsync: () => Promise<void>;
    getProductsAsync: () => Promise<unknown>;
    finishTransactionAsync: (purchase: Purchase, remove: boolean) => Promise<void>;
    purchaseItemAsync: (productId: string) => Promise<void>;
    restorePurchasesAsync: () => Promise<void>;
  };
} = {
  listener: null,
  implementations: {
    connectAsync: async () => undefined,
    disconnectAsync: async () => undefined,
    getProductsAsync: async () => [],
    finishTransactionAsync: async () => undefined,
    purchaseItemAsync: async () => undefined,
    restorePurchasesAsync: async () => undefined,
  },
};

export const IAPResponseCode = {
  OK: 0,
  USER_CANCELED: 1,
  ERROR: 2,
};

export async function connectAsync() {
  await state.implementations.connectAsync();
}

export async function disconnectAsync() {
  await state.implementations.disconnectAsync();
}

export async function getProductsAsync(productIds: readonly string[]) {
  return state.implementations.getProductsAsync(productIds);
}

export async function finishTransactionAsync(purchase: Purchase, remove: boolean) {
  await state.implementations.finishTransactionAsync(purchase, remove);
}

export async function purchaseItemAsync(productId: string) {
  await state.implementations.purchaseItemAsync(productId);
}

export async function restorePurchasesAsync() {
  await state.implementations.restorePurchasesAsync();
}

export function setPurchaseListener(listener: Listener) {
  state.listener = listener;
  return {
    remove() {
      state.listener = null;
    },
  };
}

export function __emit(event: PurchaseResponse) {
  state.listener?.(event);
}

export function __setImplementation(name: keyof typeof state.implementations, impl: any) {
  state.implementations[name] = impl;
}

export function __reset() {
  state.listener = null;
  state.implementations.connectAsync = async () => undefined;
  state.implementations.disconnectAsync = async () => undefined;
  state.implementations.getProductsAsync = async () => [];
  state.implementations.finishTransactionAsync = async () => undefined;
  state.implementations.purchaseItemAsync = async () => undefined;
  state.implementations.restorePurchasesAsync = async () => undefined;
}
