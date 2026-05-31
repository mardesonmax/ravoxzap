-- CreateEnum
CREATE TYPE "BillingPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "BillingPurchaseType" AS ENUM ('INITIAL_SUBSCRIPTION', 'INSTANCE_SLOT_UPGRADE');

-- CreateTable
CREATE TABLE "BillingPurchase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "type" "BillingPurchaseType" NOT NULL,
    "status" "BillingPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "BillingProvider" NOT NULL DEFAULT 'MERCADO_PAGO',
    "currentMaxInstances" INTEGER NOT NULL,
    "requestedMaxInstances" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "providerReference" TEXT,
    "checkoutUrl" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPurchase_providerReference_key" ON "BillingPurchase"("providerReference");

-- CreateIndex
CREATE INDEX "BillingPurchase_organizationId_status_idx" ON "BillingPurchase"("organizationId", "status");

-- CreateIndex
CREATE INDEX "BillingPurchase_subscriptionId_idx" ON "BillingPurchase"("subscriptionId");

-- CreateIndex
CREATE INDEX "BillingPurchase_type_status_idx" ON "BillingPurchase"("type", "status");

-- AddForeignKey
ALTER TABLE "BillingPurchase" ADD CONSTRAINT "BillingPurchase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPurchase" ADD CONSTRAINT "BillingPurchase_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
