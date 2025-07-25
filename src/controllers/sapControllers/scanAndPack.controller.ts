import { Request, Response } from 'express';
import { getProjectItemAndInsertScanPack, getScanItemsByFields, deleteScanAndPackItemById } from '../../services/sapServices/scanAndPack.service';

export const addScanAndPackItem = async (req: Request, res: Response) => {
  try {
    const result = await getProjectItemAndInsertScanPack(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('[Add ScanPack Item]', error);
    res.status(400).json({ error: error.message || 'Failed to insert scan and pack item' });
  }
};

export const getScanAndPackItemsByFields = async (req: Request, res: Response) => {
  try {
    const { project_id, vendor_id, client_id, box_id } = req.body;

    if (!project_id || !vendor_id || !client_id || !box_id) {
      return res.status(400).json({
        error: 'All fields are required: project_id, vendor_id, client_id, box_id',
      });
    }

    const items = await getScanItemsByFields({ project_id, vendor_id, client_id, box_id });

    return res.status(200).json({
      message: 'Scan and Pack items fetched successfully',
      data: items,
    });
  } catch (error) {
    console.error('Error fetching scan and pack items:', error);
    return res.status(500).json({ error: 'Internal server error', details: error });
  }
};

export const deleteScanAndPackItem = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: 'Invalid or missing ID' });
  }

  try {
    const result = await deleteScanAndPackItemById(Number(id));
    res.status(200).json({
      message: 'Scan item deleted successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('[Delete ScanPack Item]', error);
    res.status(500).json({ error: error.message || 'Failed to delete scan item' });
  }
};