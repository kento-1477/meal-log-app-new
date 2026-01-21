-- Notification tables for iOS push MVP.

create table if not exists "PushDevice" (
  "id" serial primary key,
  "userId" integer not null references "User"("id") on delete cascade,
  "deviceId" text not null,
  "expoToken" text not null,
  "platform" text not null,
  "locale" text,
  "timezone" text,
  "lastSeenAt" timestamptz not null default now(),
  "disabledAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create unique index if not exists "PushDevice_userId_deviceId_key"
  on "PushDevice" ("userId", "deviceId");

create index if not exists "PushDevice_expoToken_idx"
  on "PushDevice" ("expoToken");

create index if not exists "PushDevice_userId_disabledAt_idx"
  on "PushDevice" ("userId", "disabledAt");

create table if not exists "NotificationSettings" (
  "id" serial primary key,
  "userId" integer not null unique references "User"("id") on delete cascade,
  "reminderEnabled" boolean not null default false,
  "importantEnabled" boolean not null default false,
  "quietHoursStart" integer not null default 1320,
  "quietHoursEnd" integer not null default 420,
  "dailyCap" integer not null default 1,
  "timezone" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "NotificationLog" (
  "id" serial primary key,
  "userId" integer not null references "User"("id") on delete cascade,
  "type" text not null,
  "status" text not null,
  "scheduledFor" timestamptz,
  "sentAt" timestamptz,
  "error" text,
  "metadata" jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "NotificationLog_userId_sentAt_idx"
  on "NotificationLog" ("userId", "sentAt");

create index if not exists "NotificationLog_type_sentAt_idx"
  on "NotificationLog" ("type", "sentAt");
