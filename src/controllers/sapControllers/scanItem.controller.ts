import { Request, Response } from 'express';
import * as scanItemService from '../../services/boxServices/scanItem.service';

export const createScanItem = async (req: Request, res: Response) => {
  try {
    const item = await scanItemService.createScanItem(req.body);
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};