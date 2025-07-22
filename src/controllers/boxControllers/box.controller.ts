import { Request, Response } from 'express';
import * as boxService from '../../services/boxServices/box.service';

export const createBox = async (req: Request, res: Response) => {
  try {
    const box = await boxService.createBox(req.body);
    res.status(201).json(box);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};