import { Request, Response } from 'express';
// import { getProjectItemAndInsertScanPack, getScanItemsByFields, deleteScanAndPackItemById } from '../../services/sapServices/scanAndPack.service';
import {  getScanItemsByFields, deleteScanAndPackItemById } from '../../services/sapServices/scanAndPack.service';

// export const addScanAndPackItem = async (req: Request, res: Response) => {
//   try {
//     const result = await getProjectItemAndInsertScanPack(req.body);
//     res.status(201).json(result);
//   } catch (error: any) {
//     console.error('[Add ScanPack Item]', error);
//     res.status(400).json({ error: error.message || 'Failed to insert scan and pack item' });
//   }
// };

export const getScanAndPackItemsByFields = async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    const { project_id, vendor_id, box_id } = req.body;

    if (!project_id || !vendor_id || !box_id) {
      return res.status(400).json({
        error: 'All fields are required: project_id, vendor_id, client_id, box_id',
      });
    }

    const client_id = 0;
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
  try {
    
    const id = Number(req.params.id);
    const vendor_id = Number(req.body.vendor_id);
    const project_id = Number(req.body.project_id);
    const box_id = Number(req.body.box_id);
    const deleted_by = req.body.deleted_by ? Number(req.body.deleted_by) : (req.body.user_id ? Number(req.body.user_id) : null);

    if (!id || !vendor_id || !project_id || !box_id) {
      return res.status(400).json({
        success: false,
        message: "id, vendor_id, project_id and box_id are required",
      });
    }

    const result = await deleteScanAndPackItemById(
      id,
      vendor_id,
      project_id,
      box_id,
      deleted_by
    );

    return res.status(200).json({
      success: true,
      message: "Item removed from box successfully",
      data: result,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to remove item from box",
    });
  }
};