import { prisma } from '../../prisma/client';

export const createVendorTokenService = async (
  vendor_id: number,
  expiry_date: string
) => {
  if (!vendor_id || !expiry_date) {
    throw new Error('vendor_id and expiry_date are required');
  }

  const tokenEntry = await prisma.vendorTokens.create({
    data: {
      vendor_id,
      expiry_date: new Date(expiry_date), // Ensures it's UTC format
    },
  });

  return tokenEntry;
};