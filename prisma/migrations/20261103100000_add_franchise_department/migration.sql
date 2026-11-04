CREATE TYPE "FranchiseDepartment" AS ENUM ('BRANCH', 'FRANCHISE', 'FACTORY');

ALTER TABLE "FranchiseMaster"
ADD COLUMN "Department" "FranchiseDepartment" NOT NULL DEFAULT 'FRANCHISE';
