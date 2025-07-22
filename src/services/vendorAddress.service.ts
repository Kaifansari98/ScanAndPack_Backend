import { prisma } from '../prisma/client';

export const createAddress = async (data: any) => {
  const {
    vendor_id,
    address,
    state,
    city,
    country,
    pincode,
    landmark,
  } = data;

  return await prisma.vendorAddress.create({
    data: {
      vendor_id,
      address,
      state,
      city,
      country,
      pincode,
      landmark,
    },
  });
};