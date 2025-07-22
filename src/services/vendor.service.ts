import { prisma } from '../prisma/client';

interface VendorTaxInfoPayload {
  tax_no: string;
  tax_status: string;
  vendor_id: number;
  tax_country: string;
}

export const createVendor = async (data: any) => {
  const {
    vendor_name,
    vendor_code,
    primary_contact_name,
    primary_contact_number,
    primary_contact_email,
    country_code,
    head_office_id,
    status,
    logo,
    time_zone
  } = data;

  return await prisma.vendorMaster.create({
    data: {
      vendor_name,
      vendor_code,
      primary_contact_name,
      primary_contact_number,
      primary_contact_email,
      country_code,
      head_office_id,
      status,
      logo,
      time_zone,
    },
  });
};

export const getAllVendors = async () => {
  return await prisma.vendorMaster.findMany({
    include: { addresses: true },
  });
};