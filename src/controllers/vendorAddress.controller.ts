import { Request, Response } from 'express';
import * as addressService from '../services/vendorAddress.service';

export const createVendorAddress = async (req: Request, res: Response) => {
  try {
    const address = await addressService.createAddress(req.body);
    res.status(201).json(address);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Address creation failed' });
  }
};