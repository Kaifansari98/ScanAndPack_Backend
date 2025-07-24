import { Request, Response } from 'express';
import { getProjectItemAndInsertScanPack, getScanItemsByFields } from '../../services/sapServices/scanAndPack.service';

export const addScanAndPackItem = async (req: Request, res: Response) => {
  try {
    const result = await getProjectItemAndInsertScanPack(req.body);
    res.status(201).json(result);
  } catch (error) {
    console.error('[Add ScanPack Item]', error);
    res.status(500).json({ error: 'Failed to insert scan and pack item' });
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