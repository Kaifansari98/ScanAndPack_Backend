import { Request, Response } from 'express';
import * as boxService from '../../services/boxServices/box.service';
import { 
  getAllBoxesWithItemCountService,
  updateBoxStatus,
  softDeleteBoxWithScanItems,
  getGroupedItemInfoByBoxId
 } from '../../services/boxServices/box.service';
import { BoxStatus } from '../../prisma/generated';

export const createBox = async (req: Request, res: Response) => {
  try {
    const newBox = await boxService.createBox(req.body);
    res.status(201).json({
      message: 'Box created successfully',
      box: newBox, // includes id and other selected fields
    });
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

    const transformed = boxes.map((box: any) => ({
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

export const deleteBoxAndItsScanItems = async (req: Request, res: Response) => {
  const boxId = Number(req.params.boxId);
  const deletedBy = Number(req.body.deleted_by);

  if (isNaN(boxId) || isNaN(deletedBy)) {
    return res.status(400).json({ error: 'Invalid boxId or deleted_by' });
  }

  try {
    const result = await softDeleteBoxWithScanItems(boxId, deletedBy);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('[Delete Box]', error);
    res.status(500).json({ error: error.message || 'Failed to delete box' });
  }
};

export const getGroupedItemInfo = async (req: Request, res: Response) => {
  try {
    const boxId = parseInt(req.params.boxId);
    if (isNaN(boxId)) {
      return res.status(400).json({ error: 'Invalid box ID' });
    }

    const result = await getGroupedItemInfoByBoxId(boxId);
    if (!result) {
      return res.status(404).json({ message: 'No grouped items found in this box' });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching grouped item info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
