import { Request, Response } from 'express';
import * as projectService from '../../services/projectServices/project.service';

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
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch project by ID', details: err });
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
  