import { Request, Response } from 'express';
import { createVendorTokenService } from '../../services/vendorServices/vendorToken.service';

export const createVendorToken = async (req: Request, res: Response) => {
  try {
    const { vendor_id, expiry_date } = req.body;

    const tokenEntry = await createVendorTokenService(vendor_id, expiry_date);

    return res.status(201).json({ success: true, data: tokenEntry });
  } catch (error: any) {
    console.error('Error creating vendor token:', error);
    return res.status(400).json({ error: error.message || 'Internal server error' });
  }
};