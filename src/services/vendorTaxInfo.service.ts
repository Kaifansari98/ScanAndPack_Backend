// src/services/vendorTaxInfo.service.ts
import { prisma } from '../prisma/client';

export const createVendorTaxInfo = async (data: {
  tax_no: string;
  tax_status: string;
  vendor_id: number;
  tax_country: string;
}) => {
  return await prisma.vendorTaxInfo.create({
    data,
  });
};