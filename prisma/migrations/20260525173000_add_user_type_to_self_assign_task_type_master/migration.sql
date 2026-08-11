ALTER TABLE "SelfAssignTaskTypeMaster"
ADD COLUMN "user_type_id" INTEGER;

UPDATE "SelfAssignTaskTypeMaster"
SET "user_type_id" = (
  SELECT utm."id"
  FROM "UserTypeMaster" utm
  ORDER BY utm."id"
  LIMIT 1
);

ALTER TABLE "SelfAssignTaskTypeMaster"
ALTER COLUMN "user_type_id" SET NOT NULL;

CREATE INDEX "SelfAssignTaskTypeMaster_user_type_id_idx"
ON "SelfAssignTaskTypeMaster"("user_type_id");

ALTER TABLE "SelfAssignTaskTypeMaster"
ADD CONSTRAINT "SelfAssignTaskTypeMaster_user_type_id_fkey"
FOREIGN KEY ("user_type_id") REFERENCES "UserTypeMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
