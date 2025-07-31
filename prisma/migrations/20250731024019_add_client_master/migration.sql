-- CreateTable
CREATE TABLE "public"."ClientMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "alt_contact" TEXT,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,

    CONSTRAINT "ClientMaster_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."ProjectMaster" ADD CONSTRAINT "ProjectMaster_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectDetails" ADD CONSTRAINT "ProjectDetails_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectItemsMaster" ADD CONSTRAINT "ProjectItemsMaster_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BoxMaster" ADD CONSTRAINT "BoxMaster_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScanAndPackItem" ADD CONSTRAINT "ScanAndPackItem_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."ClientMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
