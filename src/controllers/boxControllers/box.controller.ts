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

export const getAllBoxes = async (req: Request, res: Response) => {
  try {
    const boxes = await boxService.getAllBoxes();
    res.status(200).json(boxes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getBoxesByVendorAndProject = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const projectId = Number(req.params.projectId);

    if (isNaN(vendorId) || isNaN(projectId)) {
      return res.status(400).json({ error: "Invalid vendorId or projectId" });
    }

    const boxes = await boxService.getBoxesByVendorAndProject(vendorId, projectId);

    const transformed = boxes.map((box) => ({
      ...box,
      items_count: box._count.items,
      _count: undefined, // Optional: remove raw _count
    }));

    res.status(200).json(transformed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};