ALTER TABLE "WebhookEndpoint" ADD COLUMN "instanceId" TEXT;

CREATE INDEX "WebhookEndpoint_instanceId_idx" ON "WebhookEndpoint"("instanceId");

ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
