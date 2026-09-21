CREATE TABLE "CutlistHeadersMapping" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "source_header" VARCHAR(255) NOT NULL,
    "normalized_header" VARCHAR(255) NOT NULL,
    "cutlist_field" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CutlistHeadersMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CutlistHeadersMapping_vendor_id_normalized_header_key"
ON "CutlistHeadersMapping"("vendor_id", "normalized_header");
CREATE UNIQUE INDEX "CutlistHeadersMapping_vendor_id_cutlist_field_key"
ON "CutlistHeadersMapping"("vendor_id", "cutlist_field");
ALTER TABLE "CutlistHeadersMapping" ADD CONSTRAINT "CutlistHeadersMapping_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "VendorMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
