-- CreateTable
CREATE TABLE "EmailNotificationMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNotificationMaster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailNotificationMaster_vendor_id_idx" ON "EmailNotificationMaster"("vendor_id");

-- AddForeignKey
ALTER TABLE "EmailNotificationMaster" ADD CONSTRAINT "EmailNotificationMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
