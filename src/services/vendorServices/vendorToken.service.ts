import { prisma } from '../../prisma/client';

export const ensureVendorToken = async (
  vendor_id: number,
  expiry_date?: string | Date
) => {
  if (!vendor_id) {
    throw new Error('vendor_id is required');
  }

  const existingToken = await prisma.vendorTokens.findFirst({
    where: { vendor_id },
  });

  if (existingToken) {
    return existingToken;
  }

  const defaultExpiry = expiry_date
    ? new Date(expiry_date)
    : (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 5);
        return d;
      })();

  const tokenEntry = await prisma.vendorTokens.create({
    data: {
      vendor_id,
      expiry_date: defaultExpiry,
    },
  });

  return tokenEntry;
};

export const createVendorTokenService = ensureVendorToken;