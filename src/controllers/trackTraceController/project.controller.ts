import { Request, Response } from 'express';
import * as projectService from '../../services/projectServices/project.service';
import { ApiResponse } from 'src/utils/apiResponse';

export const getAllProjectsTrackTrace = async (_req: Request, res: Response) => {
    console.log("Query params:", _req.query); 
    // res.json(_req.params.vendor_id);
    
  try {
    const vendor_id = Number(_req.params.vendor_id);

    const projects = await projectService.getAllProjectsTrackTrace(vendor_id);

     return res
              .status(200)
              .json(
                ApiResponse.success(
                  projects,
                  "",
                  200
                )
              );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects', details: err });
  }
};

