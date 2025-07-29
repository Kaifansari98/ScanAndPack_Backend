import { Request, Response } from 'express';
import * as boxService from '../../services/boxServices/box.service';
import { 
  getAllBoxesWithItemCountService,
  updateBoxStatus,
 } from '../../services/boxServices/box.service';
import { BoxStatus } from '@prisma/client';

export const createBox = async (req: Request, res: Response) => {
  try {
    const box = await boxService.createBox(req.body);
    res.status(201).json(box);
  } catch (err: any) {
    if (err.message === 'Box already exists') {
      return res.status(409).json({ message: err.message });
    }
    res.status(400).json({ error: err.message });
  }
};

export const updateBoxName = async (req: Request, res: Response) => {
  const { id, vendor_id, project_id, client_id, box_name } = req.body;

  try {
    const updatedBox = await boxService.updateBoxName(
      id,
      vendor_id,
      project_id,
      client_id,
      box_name
    );
    res.status(200).json(updatedBox);
  } catch (err: any) {
    if (err.message === 'Box not found') {
      return res.status(404).json({ message: err.message });
    }
    if (err.message === 'Another box with the same name already exists') {
      return res.status(409).json({ message: err.message });
    }
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

export const getBoxDetailsWithItems = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const projectId = Number(req.params.projectId);
    const clientId = Number(req.params.clientId);
    const boxId = Number(req.params.boxId);

    if ([vendorId, projectId, clientId, boxId].some(isNaN)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const data = await boxService.getBoxDetailsWithItems(vendorId, projectId, clientId, boxId);
    res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getAllBoxesWithItemCount = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const projectId = Number(req.params.projectId);
    const clientId = Number(req.params.clientId);

    if ([vendorId, projectId, clientId].some(isNaN)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const data = await getAllBoxesWithItemCountService(vendorId, projectId, clientId);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

export const markBoxAsPacked = async (req: Request, res: Response) => {
  try {
    const boxId = Number(req.params.boxId);
    if (isNaN(boxId)) return res.status(400).json({ error: 'Invalid boxId' });

    const updatedBox = await updateBoxStatus(boxId, BoxStatus.packed);
    res.status(200).json(updatedBox);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const markBoxAsUnpacked = async (req: Request, res: Response) => {
  try {
    const boxId = Number(req.params.boxId);
    if (isNaN(boxId)) return res.status(400).json({ error: 'Invalid boxId' });

    const updatedBox = await updateBoxStatus(boxId, BoxStatus.unpacked);
    res.status(200).json(updatedBox);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};