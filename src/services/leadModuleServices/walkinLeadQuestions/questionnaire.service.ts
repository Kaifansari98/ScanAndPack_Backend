import { Prisma, prisma } from "../../../prisma/client";
import { walkinLeadDefaults } from "../../../data/walkinLeadDefaults";
import { defaultCategory, isWalkinSource, validateQuestions, WalkinValidationError } from "./validation";

type Db = Prisma.TransactionClient;
export async function requireProduct(db: Db, vendorId: number, productTypeId: number) {
  const product = await db.productTypeMaster.findFirst({ where: { id: productTypeId, vendor_id: vendorId, status: "active" } });
  if (!product) throw new WalkinValidationError("Active furniture type not found for this vendor", 404);
  return product;
}
export async function requireWalkinSource(db: Db, vendorId: number, sourceId: number | null) {
  const source = sourceId ? await db.sourceMaster.findFirst({ where: { id: sourceId, vendor_id: vendorId } }) : null;
  if (!source || !isWalkinSource(source.type)) throw new WalkinValidationError("Questionnaire answers apply only to Walk-in leads");
}
export async function getQuestionnaire(vendorId: number, productTypeId: number, db: Db = prisma) {
  const product = await requireProduct(db, vendorId, productTypeId);
  const custom = await db.walkinLeadQuestionnaire.findUnique({ where: { vendor_id_product_type_id: { vendor_id: vendorId, product_type_id: productTypeId } } });
  const category = defaultCategory(product.type);
  return {
    product_type_id: product.id,
    product_type: product.type,
    title: product.type,
    origin: custom ? "vendor" : "default",
    default_category: custom ? null : category,
    questionnaire_key: custom ? `vendor:${custom.id}` : `default:${category}`,
    questionnaire_version: custom?.version ?? 1,
    questions: validateQuestions(custom?.questions ?? walkinLeadDefaults[category].questions),
  };
}
export async function saveQuestionnaire(vendorId: number, productTypeId: number, actorId: number, input: unknown) {
  const questions = validateQuestions(input);
  await requireProduct(prisma, vendorId, productTypeId);
  await prisma.walkinLeadQuestionnaire.upsert({
    where: { vendor_id_product_type_id: { vendor_id: vendorId, product_type_id: productTypeId } },
    create: { vendor_id: vendorId, product_type_id: productTypeId, questions: questions as Prisma.InputJsonValue, created_by: actorId, updated_by: actorId },
    update: { questions: questions as Prisma.InputJsonValue, version: { increment: 1 }, updated_by: actorId },
  });
  return getQuestionnaire(vendorId, productTypeId);
}
export async function resetQuestionnaire(vendorId: number, productTypeId: number) {
  await requireProduct(prisma, vendorId, productTypeId);
  await prisma.walkinLeadQuestionnaire.deleteMany({ where: { vendor_id: vendorId, product_type_id: productTypeId } });
  return getQuestionnaire(vendorId, productTypeId);
}
