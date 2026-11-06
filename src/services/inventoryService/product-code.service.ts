import { prisma } from '../../prisma/client';

/**
 * Derives an uppercase prefix based on the category name (up to 4 letters, or exact 2-3 letters if short).
 * Examples:
 *   - Accessories -> ACCE
 *   - Hardware -> HARD
 *   - Plywood -> PLYW
 *   - Profile Handle -> PRHA
 *   - Wardrobe Shutter Finish -> WASF
 *   - MDF -> MDF
 *   - LC -> LC
 */
export function deriveCategoryPrefix(categoryName: string): string {
  const upperName = categoryName.trim().toUpperCase();

  // Remove any non-alphabetic, non-space characters
  const clean = upperName.replace(/[^A-Z\s]/g, "");
  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length >= 4) {
    return (words[0][0] + words[1][0] + words[2][0] + words[3][0]).slice(0, 4);
  }

  if (words.length === 3) {
    const part1 = words[0].slice(0, 2);
    const part2 = words[1].slice(0, 1);
    const part3 = words[2].slice(0, 1);
    return (part1 + part2 + part3).slice(0, 4);
  }

  if (words.length === 2) {
    const part1 = words[0].slice(0, 2);
    const part2 = words[1].slice(0, 2);
    return (part1 + part2).slice(0, 4);
  }

  const word = words[0] || "";
  if (word.length >= 4) {
    return word.slice(0, 4);
  }

  if (word.length > 0) {
    return word;
  }

  return "PROD";
}

/**
 * Generates the next unique article_code for the specified category and vendor.
 * Respects existing category prefix patterns (including delimiters like "-").
 */
export async function getNextItemCodeService(
  vendorId: number,
  categoryId: number
): Promise<string> {
  const category = await prisma.projectCategoriesMaster.findUnique({
    where: { id: categoryId },
    select: { category_name: true, prefix: true },
  });

  if (!category) {
    throw new Error("Category not found");
  }

  // Check recent products under this category to detect existing delimiter pattern (e.g. "-")
  const recentProducts = await prisma.productMaster.findMany({
    where: {
      vendor_id: vendorId,
      category_id: categoryId,
    },
    select: { article_code: true, item_code: true },
    orderBy: { id: "desc" },
    take: 20,
  });

  let delimiter = "-";

  for (const p of recentProducts) {
    for (const code of [p.article_code, p.item_code]) {
      if (!code) continue;
      const match = code.trim().match(/^([A-Za-z0-9]+)([-_])(\d+)$/);
      if (match) {
        delimiter = match[2];
        break;
      }
    }
  }

  let prefix = category.prefix?.trim()
    ? category.prefix.trim().toUpperCase().replace(/[-_]+$/, "")
    : deriveCategoryPrefix(category.category_name);

  if (!prefix || prefix.length < 2) {
    prefix = "PROD";
  }

  // If category in DB had no prefix set, save the derived prefix so future lookups are consistent
  if (!category.prefix?.trim()) {
    await prisma.projectCategoriesMaster.update({
      where: { id: categoryId },
      data: { prefix },
    }).catch(() => {});
  }

  // Fetch all existing product codes starting with this prefix for this vendor
  const existingProducts = await prisma.productMaster.findMany({
    where: {
      vendor_id: vendorId,
      OR: [
        { article_code: { startsWith: prefix } },
        { item_code: { startsWith: prefix } },
      ],
    },
    select: {
      article_code: true,
      item_code: true,
    },
  });

  let maxNum = 0;
  // Match prefix followed by optional delimiter and digits (e.g. ACCE-001, MDF-001, LC-001)
  const regex = new RegExp(`^${prefix}[-_]?(\\d+)$`, "i");

  for (const product of existingProducts) {
    for (const code of [product.article_code, product.item_code]) {
      if (!code) continue;
      const match = code.trim().match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  const formattedNum = String(nextNum).padStart(3, "0");
  return `${prefix}${delimiter}${formattedNum}`;
}
