import { Request, Response } from 'express';
import * as projectService from '../../services/projectServices/project.service';
import { getProjectsByVendorIdService, createOrUpdateFullProject, calculateProjectWeight, calculateProjectAndBoxWeight, getCompletedProjectsByVendorIdService, autoPackGroupedBoxesService } from '../../services/projectServices/project.service';
import { getProjectItemByFields as getProjectItemByFieldsService } from '../../services/projectServices/project.service';

export const createProject = async (req: Request, res: Response) => {
  try {
    const project = await projectService.createProject(req.body);
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project', details: err });
  }
};

export const createProjectDetails = async (req: Request, res: Response) => {
  try {
    const details = await projectService.createProjectDetails(req.body);
    res.status(201).json(details);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project details', details: err });
  }
};

export const createProjectItem = async (req: Request, res: Response) => {
  try {
    const item = await projectService.createProjectItem(req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project item', details: err });
  }
};

export const getAllProjects = async (_req: Request, res: Response) => {
  try {
    const projects = await projectService.getAllProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects', details: err });
  }
};
  
export const getAllProjectDetails = async (_req: Request, res: Response) => {
  try {
    const details = await projectService.getAllProjectDetails();
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project details', details: err });
  }
};
  
export const getAllProjectItems = async (_req: Request, res: Response) => {
  try {
    const items = await projectService.getAllProjectItems();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project items', details: err });
  }
};
  
export const getProjectById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const project = await projectService.getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Calculate totals
    const total_items = project.details.reduce((sum, d) => sum + d.total_items, 0);
    const total_packed = project.details.reduce((sum, d) => sum + d.total_packed, 0);
    const total_unpacked = project.details.reduce((sum, d) => sum + d.total_unpacked, 0);
    const total_items_count = project.items.length;

    // Send combined response
    res.json({
      ...project,
      totals: {
        total_items,
        total_packed,
        total_unpacked,
        total_items_count
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch project by ID',
      details: err
    });
  }
};
  
export const getProjectDetailsById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const details = await projectService.getProjectDetailsById(id);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project details by ID', details: err });
  }
};
  
export const getProjectItemById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const item = await projectService.getProjectItemById(id);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project item by ID', details: err });
  }
};

export const getProjectsByVendorId = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendorId);

    if (isNaN(vendorId)) {
      return res.status(400).json({ message: "Invalid vendor ID" });
    }

    const projects = await getProjectsByVendorIdService(vendorId);

    return res.status(200).json(projects);
  } catch (error) {
    console.error("Error fetching projects by vendorId:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getProjectItemByFields = async (req: Request, res: Response) => {
  try {
    const { project_id, vendor_id, client_id, unique_id } = req.body;

    if (
      typeof project_id !== 'number' ||
      typeof vendor_id !== 'number' ||
      typeof client_id !== 'number' ||
      typeof unique_id !== 'string'
    ) {
      return res.status(400).json({ error: 'Invalid input types' });
    }

    console.log({
      project_id,
      vendor_id,
      client_id,
      unique_id: unique_id.trim(),
    });

    const item = await getProjectItemByFieldsService({
      project_id,
      vendor_id,
      client_id,
      unique_id: unique_id.trim(),
    });

    if (!item) {
      return res.status(404).json({ message: 'No matching item found' });
    }

    res.status(200).json(item);
  } catch (err) {
    console.error('Error fetching project item by fields:', err);
    res.status(500).json({ error: 'Failed to fetch project item', details: err });
  }
};

export const getProjectItemCounts = async (req: Request, res: Response) => {
  try {
    console.log("Query params:", req.query); 
    const { project_id, vendor_id, client_id } = req.query;

    const projectId = Number(project_id);
    const vendorId = Number(vendor_id);
    const clientId = Number(client_id);

    if (
      isNaN(projectId) ||
      isNaN(vendorId) ||
      isNaN(clientId)
    ) {
      return res.status(400).json({ error: 'Invalid input types' });
    }

    const counts = await projectService.getProjectItemCounts({
      project_id: projectId,
      vendor_id: vendorId,
      client_id: clientId,
    });

    res.status(200).json(counts);
  } catch (err) {
    console.error('Error fetching item counts:', err);
    res.status(500).json({ error: 'Failed to fetch item counts', details: err });
  }
};

export const handleFullProjectCreate = async (req: Request, res: Response) => {
  try {
    const token = req.headers["authorization"]?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Token is required" });

    const result = await createOrUpdateFullProject(token, req.body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};

export const getProjectWeight = async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendor_id);
    const projectId = parseInt(req.params.project_id);

    const weight = await calculateProjectWeight(vendorId, projectId);

    return res.json({ project_id: projectId, project_weight: weight });
  } catch (err: any) {
    console.error('getProjectWeight error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

export const getProjectAndBoxWeight = async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendor_id);
    const projectId = parseInt(req.params.project_id);
    const boxId = parseInt(req.params.box_id);

    const result = await calculateProjectAndBoxWeight(vendorId, projectId, boxId);

    return res.json({
      project_id: projectId,
      box_id: boxId,
      project_weight: result.project_weight,
      box_weight: result.box_weight
    });
  } catch (err: any) {
    console.error('getProjectAndBoxWeight error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// ============================================
// UPDATED CONTROLLER FUNCTION
// ============================================

export const getCompletedProjects = async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    
    // Validate vendorId
    if (!vendorId || isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid vendor ID is required'
      });
    }

    const result = await getCompletedProjectsByVendorIdService(vendorId);
    
    res.status(200).json({
      success: true,
      data: result.completedProjects,
      count: result.completedProjects.length,
      boxUpdateSummary: result.boxUpdateSummary,
      message: `Found ${result.completedProjects.length} completed projects. Updated box status for ${result.boxUpdateSummary.length} completed projects.`
    });
  } catch (error: any) {
    console.error('Error fetching completed projects:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

export const autoPackGroupedBoxes = async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);

    // Validate vendorId
    if (!vendorId || isNaN(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid vendor ID is required',
      });
    }

    const result = await autoPackGroupedBoxesService(vendorId);

    res.status(200).json({
      success: true,
      data: result.updatedBoxes,
      summary: result.summary,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error in auto-pack grouped boxes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};