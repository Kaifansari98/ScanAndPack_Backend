-- CreateTable
CREATE TABLE "VendorTokens" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorTokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorTokens_token_key" ON "VendorTokens"("token");

-- AddForeignKey
ALTER TABLE "VendorTokens" ADD CONSTRAINT "VendorTokens_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
