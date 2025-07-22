// src/controllers/vendorTaxInfo.controller.ts
import { Request, Response } from 'express';
import { createVendorTaxInfo } from '../services/vendorTaxInfo.service';

export const addVendorTaxInfo = async (req: Request, res: Response) => {
  try {
    const { tax_no, tax_status, vendor_id, tax_country } = req.body;

    if (!tax_no || !tax_status || !vendor_id || !tax_country) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const taxInfo = await createVendorTaxInfo({
      tax_no,
      tax_status,
      vendor_id,
      tax_country,
    });

    return res.status(201).json(taxInfo);
  } catch (error) {
    console.error('Error creating vendor tax info:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};