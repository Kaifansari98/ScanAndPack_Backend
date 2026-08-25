import { Request, Response } from 'express';
import * as projectService from '../../services/projectServices/project.service';
import { ApiResponse } from '../../../src/utils/apiResponse';

export const getAllProjectsTrackTrace = async (
  req: Request,
  res: Response
) => {
  try {
    const vendor_id = Number(req.params.vendor_id);

    if (!vendor_id || Number.isNaN(vendor_id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid vendor ID",
      });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 10, 1),
      100
    );

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const track_trace_status =
      typeof req.query.track_trace_status === "string"
        ? req.query.track_trace_status
        : undefined;

    const project_status =
      typeof req.query.project_status === "string"
        ? req.query.project_status
        : undefined;

    const deletedValue =
      typeof req.query.deleted === "string"
        ? req.query.deleted
        : "active";

    const deleted: "active" | "deleted" | "all" =
      deletedValue === "deleted" || deletedValue === "all"
        ? deletedValue
        : "active";

    const date_from =
      typeof req.query.date_from === "string"
        ? req.query.date_from
        : undefined;

    const date_to =
      typeof req.query.date_to === "string"
        ? req.query.date_to
        : undefined;

    const sort_by =
      typeof req.query.sort_by === "string"
        ? req.query.sort_by
        : "created_at";

    const sort_order: "asc" | "desc" =
      req.query.sort_order === "asc" ? "asc" : "desc";

    const result =
      await projectService.getAllProjectsTrackTrace(
        vendor_id,
        {
          page,
          limit,
          search,
          track_trace_status,
          project_status,
          deleted,
          date_from,
          date_to,
          sort_by,
          sort_order,
        }
      );

    return res.status(200).json(
      ApiResponse.success(
        result,
        "Projects fetched successfully",
        200
      )
    );
  } catch (err) {
    console.error(
      "getAllProjectsTrackTrace error:",
      err
    );

    return res.status(500).json({
      success: false,
      error: "Failed to fetch projects",
    });
  }
};

export const deleteTrackTraceProject = async (
  req: Request,
  res: Response
) => {
  try {
    const vendor_id = Number(req.params.vendor_id);
    const project_id = Number(req.params.project_id);
    const user_id = Number(req.body.user_id);

    if (!vendor_id || Number.isNaN(vendor_id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid vendor ID",
      });
    }

    if (!project_id || Number.isNaN(project_id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid project ID",
      });
    }

    if (!user_id || Number.isNaN(user_id)) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const deletedProject =
      await projectService.deleteTrackTraceProject(
        vendor_id,
        project_id,
        user_id
      );

    if (!deletedProject) {
      return res.status(404).json({
        success: false,
        error:
          "Project not found or project is already deleted",
      });
    }

    return res.status(200).json(
      ApiResponse.success(
        deletedProject,
        "Project deleted successfully",
        200
      )
    );
  } catch (err) {
    console.error(
      "deleteTrackTraceProject error:",
      err
    );

    return res.status(500).json({
      success: false,
      error: "Failed to delete project",
    });
  }
};

