DO $$ BEGIN
  CREATE TYPE "WhatsAppOperationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Chat"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "unreadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ephemeralExpiration" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WhatsAppGroup" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "remoteJid" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT,
  "ownerJid" TEXT,
  "size" INTEGER,
  "announce" BOOLEAN,
  "restrict" BOOLEAN,
  "inviteCode" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsAppGroupParticipant" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "jid" TEXT NOT NULL,
  "name" TEXT,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppGroupParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsAppOperation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "chatId" TEXT,
  "groupId" TEXT,
  "type" TEXT NOT NULL,
  "status" "WhatsAppOperationStatus" NOT NULL DEFAULT 'QUEUED',
  "input" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppGroup_instanceId_remoteJid_key" ON "WhatsAppGroup"("instanceId", "remoteJid");
CREATE INDEX IF NOT EXISTS "WhatsAppGroup_instanceId_updatedAt_idx" ON "WhatsAppGroup"("instanceId", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppGroupParticipant_groupId_jid_key" ON "WhatsAppGroupParticipant"("groupId", "jid");
CREATE INDEX IF NOT EXISTS "WhatsAppGroupParticipant_jid_idx" ON "WhatsAppGroupParticipant"("jid");
CREATE INDEX IF NOT EXISTS "WhatsAppOperation_organizationId_createdAt_idx" ON "WhatsAppOperation"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppOperation_instanceId_status_idx" ON "WhatsAppOperation"("instanceId", "status");
CREATE INDEX IF NOT EXISTS "WhatsAppOperation_chatId_idx" ON "WhatsAppOperation"("chatId");
CREATE INDEX IF NOT EXISTS "WhatsAppOperation_groupId_idx" ON "WhatsAppOperation"("groupId");
CREATE INDEX IF NOT EXISTS "Chat_instanceId_deletedAt_idx" ON "Chat"("instanceId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Chat_instanceId_archivedAt_idx" ON "Chat"("instanceId", "archivedAt");
CREATE INDEX IF NOT EXISTS "Chat_instanceId_pinnedAt_idx" ON "Chat"("instanceId", "pinnedAt");

DO $$ BEGIN
  ALTER TABLE "WhatsAppGroup" ADD CONSTRAINT "WhatsAppGroup_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppGroupParticipant" ADD CONSTRAINT "WhatsAppGroupParticipant_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppOperation" ADD CONSTRAINT "WhatsAppOperation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppOperation" ADD CONSTRAINT "WhatsAppOperation_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppOperation" ADD CONSTRAINT "WhatsAppOperation_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppOperation" ADD CONSTRAINT "WhatsAppOperation_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
