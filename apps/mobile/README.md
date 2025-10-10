# Meal Log Mobile

Expo + React Native client styled with Apple-esque glassmorphism.

## Scripts

- `npm run start` – launch Expo dev server
- `npm run ios` / `npm run android` – run on simulator
- `npm run lint` – lint TypeScript sources
- `npm run test` – run Jest (add suites as features grow)

## Features

- **Authentication** – email/password login, session cookie stored in SecureStore
- **Chat** – conversational logging with optional photo attachment, explicit error banner, nutrition cards
- **Dashboard** – today summary, 7-day trends, recent meals, logout action
- **Design system** – glass cards, SF Pro typography (fallback to platform fonts), accent palette

## Configuration

Set `EXPO_PUBLIC_API_BASE_URL` to your API host (defaults to `http://localhost:4000`). Use LAN IP when running on a device.

The Gemini response is rendered as:

- Macro summary bubble: `P/F/C` grams with confidence percentage
- Nutrition card: totals, macro pills, ingredient breakdown, guardrail warnings

Image picker requires photo permissions; fallback alerts guide the user when denied.
