ALTER TABLE "Message" ADD COLUMN "mediaExpiresAt" TIMESTAMP(3);

CREATE TABLE "BaileysAuthSession" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "creds" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaileysAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BaileysAuthKey" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaileysAuthKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BaileysAuthSession_instanceId_key" ON "BaileysAuthSession"("instanceId");
CREATE UNIQUE INDEX "BaileysAuthKey_instanceId_type_keyId_key" ON "BaileysAuthKey"("instanceId", "type", "keyId");
CREATE INDEX "BaileysAuthKey_instanceId_type_idx" ON "BaileysAuthKey"("instanceId", "type");

ALTER TABLE "BaileysAuthSession" ADD CONSTRAINT "BaileysAuthSession_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BaileysAuthKey" ADD CONSTRAINT "BaileysAuthKey_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
