import { prisma } from "../../../prisma/client";

export type ReadinessQuestion = { key: string; label: string; sort_order: number };
export const defaultReadinessQuestions: ReadinessQuestion[] = [
  ["1st_layer_paint", "1st Layer of Paint"],
  ["dust_free_area", "Dust free working area"],
  ["cept_completion", "CEPT Completion Status"],
  ["appliances_on_site", "Appliances on site"],
  ["client_scope_material", "Client's scope material"],
  ["counter_top_material", "Counter Top Material"],
].map(([key, label], index) => ({ key, label, sort_order: index + 1 }));

export function validateReadinessQuestions(value: unknown): ReadinessQuestion[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("Provide between 1 and 100 questions.");
  const keys = new Set<string>();
  const labels = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item.key !== "string" || !/^[a-z0-9_-]{1,100}$/.test(item.key) || keys.has(item.key)) throw new Error("Question keys must be valid and unique.");
    if (typeof item.label !== "string" || !item.label.trim() || item.label.trim().length > 1000) throw new Error("Enter a question of 1–1000 characters.");
    const label = item.label.trim();
    if (labels.has(label.toLowerCase())) throw new Error("Questions must be different from each other.");
    keys.add(item.key);
    labels.add(label.toLowerCase());
    return { key: item.key, label, sort_order: index + 1 };
  });
}

export async function getReadinessQuestionMaster(vendorId: number) {
  const vendor = await prisma.vendorMaster.findUnique({ where: { id: vendorId }, select: { site_readiness_questions: true } });
  if (!vendor) throw new Error("Vendor not found.");
  return {
    origin: vendor.site_readiness_questions === null ? "default" : "vendor",
    questions: vendor.site_readiness_questions === null ? defaultReadinessQuestions : validateReadinessQuestions(vendor.site_readiness_questions),
  };
}

// Rows are supplied newest first. Removed questions and duplicate historic answers do not affect completion.
export function readinessAnswersComplete(questions: ReadinessQuestion[], rows: { type: string; value: boolean | null }[]) {
  const answers = new Map<string, boolean | null>();
  for (const row of rows) if (!answers.has(row.type)) answers.set(row.type, row.value);
  return questions.length > 0 && questions.every(({ key }) => typeof answers.get(key) === "boolean");
}
