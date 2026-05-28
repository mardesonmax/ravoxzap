-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ddi" TEXT NOT NULL,
    "ddd" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_phoneE164_key" ON "Contact"("organizationId", "phoneE164");

-- CreateIndex
CREATE INDEX "Contact_organizationId_name_idx" ON "Contact"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
