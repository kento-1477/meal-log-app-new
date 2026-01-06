# Notifications Implementation Plan (iOS-only MVP)

## Phase 0 - Decisions (Assumptions Locked)
- [x] Push provider: Expo Push Notifications
- [x] Platforms: iOS only
- [x] MVP categories: Meal reminders + Important alerts
- [x] Default policy: 1 notification/day cap, quiet hours 22:00-07:00 (local)
- [x] Priority: Important > Reminder

## Phase 1 - Data Model (Prisma + Migration)
- [x] Add `PushDevice` table (device/token storage)
- [x] Add `NotificationSettings` table (user preferences)
- [x] Add `NotificationLog` table (delivery history + dedupe)
- [x] Create SQL migration file (idempotent)

## Phase 2 - Server API
- [x] `POST /api/notifications/token` register/update device token
- [x] `DELETE /api/notifications/token` disable device token
- [x] `GET /api/notifications/settings` fetch user settings
- [x] `PUT /api/notifications/settings` update user settings

## Phase 3 - Notification Engine + Scheduler
- [x] Meal reminder candidate builder (typical meal time + window)
- [x] Important alert candidates (AI usage low / premium expiring / retention)
- [x] Quiet hours + daily cap enforcement
- [x] Priority selection (one notification/day)
- [x] Expo push sender + invalid token handling
- [x] Scheduler job wired into server bootstrap

## Phase 4 - Mobile (iOS)
- [x] Add `expo-notifications` dependency + config
- [x] Permission request flow (when toggling on)
- [x] Token registration/unregistration with server
- [x] Settings UI wired to server preferences
- [x] Notification tap deep link handling

## Phase 5 - Instrumentation & Testing
- [ ] Add analytics events for sent/open
- [ ] Add unit tests for reminder time inference
- [ ] Add integration tests for API endpoints
