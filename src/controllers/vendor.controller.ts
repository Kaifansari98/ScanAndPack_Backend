import { Request, Response } from 'express';
import * as vendorService from '../services/vendor.service';

export const createVendor = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorService.createVendor(req.body);
    res.status(201).json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Vendor creation failed' });
  }
};

export const getAllVendors = async (_req: Request, res: Response) => {
  const vendors = await vendorService.getAllVendors();
  res.json(vendors);
};