-- CreateTable
CREATE TABLE "UserTypeMaster" (
    "id" SERIAL NOT NULL,
    "user_type" TEXT NOT NULL,

    CONSTRAINT "UserTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMaster" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_contact" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "user_timezone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "user_type_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDocument" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "document_name" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "filename" TEXT NOT NULL,

    CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserMaster" ADD CONSTRAINT "UserMaster_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMaster" ADD CONSTRAINT "UserMaster_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "UserTypeMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
