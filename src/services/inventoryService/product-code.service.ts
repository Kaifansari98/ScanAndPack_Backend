import { prisma } from '../../prisma/client';

/**
 * Derives a 3-character uppercase prefix based on the category name.
 * Uses consonants or custom overrides for commonly known words.
 */
export function deriveCategoryPrefix(categoryName: string): string {
  const upperName = categoryName.trim().toUpperCase();

  // Remove any non-alphabetic, non-space characters
  const clean = upperName.replace(/[^A-Z\s]/g, "");
  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length >= 3) {
    return (words[0][0] + words[1][0] + words[2][0]).slice(0, 3);
  }

  if (words.length === 2) {
    const part1 = words[0].slice(0, 2);
    const part2 = words[1].slice(0, 1);
    return (part1 + part2).slice(0, 3);
  }

  const word = words[0] || "";
  // Get all consonants
  const consonants = word.replace(/[AEIOU]/g, "");
  if (consonants.length >= 3) {
    return consonants.slice(0, 3);
  }

  // Fallback to first 3 letters of the word
  return (word + "XXX").slice(0, 3);
}

/**
 * Generates the next unique article_code for the specified category and vendor.
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

  const prefix = category.prefix?.trim()
    ? category.prefix.trim().toUpperCase()
    : deriveCategoryPrefix(category.category_name);

  // Fetch all existing product codes starting with this prefix for this vendor
  const existingProducts = await prisma.productMaster.findMany({
    where: {
      vendor_id: vendorId,
      article_code: {
        startsWith: prefix,
      },
    },
    select: {
      article_code: true,
    },
  });

  let maxNum = 0;
  // Match prefix followed by digits (e.g. PNT001, PNT02, PNT3)
  const regex = new RegExp(`^${prefix}(\\d+)$`, 'i');

  for (const product of existingProducts) {
    if (!product.article_code) continue;
    const code = product.article_code.trim();
    const match = code.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  // Pad with zeroes (e.g. PNT001)
  const formattedNum = String(nextNum).padStart(3, "0");
  return `${prefix}${formattedNum}`;
}
