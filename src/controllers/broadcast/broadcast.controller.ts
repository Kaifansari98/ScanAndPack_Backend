import { Request, Response } from "express";
import { BroadcastService } from "../../services/broadcast/broadcast.service";
import {
  createBroadcastSchema,
  updateBroadcastSchema,
  listBroadcastsSchema,
} from "../../validations/broadcast.validation";

export class BroadcastController {
  private service: BroadcastService;

  constructor() {
    this.service = new BroadcastService();
  }

  // ─── Shared Helpers ────────────────────────────────────────────────────────

  private getUser(req: Request, res: Response): { id: number; user_type_id?: number; franchise_id?: number } | null {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return null;
    }
    return user;
  }

  private parseMultipartFiles(req: Request): { [fieldname: string]: Express.Multer.File[] } {
    const files: { [fieldname: string]: Express.Multer.File[] } = {};
    if (Array.isArray(req.files)) {
      for (const file of req.files) {
        if (!files[file.fieldname]) files[file.fieldname] = [];
        files[file.fieldname].push(file);
      }
    }
    return files;
  }

  private parseBody(req: Request): any {
    return req.body?.data ? JSON.parse(req.body.data) : req.body;
  }

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  async getBroadcastCategories(req: Request, res: Response) {
    try {
      const vendor_id = Number(req.params.vendorId);
      if (!vendor_id) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }
      const includeInactive = req.query.all === "true" || req.query.includeInactive === "true";
      const categories = await this.service.getBroadcastCategories(vendor_id, includeInactive);
      return res.status(200).json({ success: true, message: "Categories fetched successfully", data: categories });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  async createBroadcastCategory(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;
      const { vendor_id, category, type } = this.parseBody(req);
      if (!vendor_id || !category) {
        return res.status(400).json({ success: false, message: "vendor_id and category are required" });
      }
      const newCategory = await this.service.createBroadcastCategory({
        vendor_id: Number(vendor_id),
        category: String(category),
        type: type ? String(type) : "DOCUMENT",
        created_by: user.id,
      });
      return res.status(201).json({ success: true, message: "Category created successfully", data: newCategory });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  async updateBroadcastCategory(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;
      const id = Number(req.params.categoryId);
      const { category, type } = this.parseBody(req);
      if (!id || !category) {
        return res.status(400).json({ success: false, message: "Category ID and category name are required" });
      }
      const updatedCategory = await this.service.updateBroadcastCategory(id, {
        category: String(category),
        type: type ? String(type) : undefined,
      });
      return res.status(200).json({ success: true, message: "Category updated successfully", data: updatedCategory });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  async toggleBroadcastCategoryStatus(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;
      const id = Number(req.params.categoryId);
      if (!id) {
        return res.status(400).json({ success: false, message: "Category ID is required" });
      }
      const updatedCategory = await this.service.toggleBroadcastCategoryStatus(id);
      return res.status(200).json({ success: true, message: "Category status updated successfully", data: updatedCategory });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  // ─── POST /broadcasts ──────────────────────────────────────────────────────

  /**
   * Create a new broadcast.
   * Body: JSON or multipart `data` field.
   * FILE attachments: send as `attachment_file_0`, `attachment_file_1` …
   */
  async create(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;

      const parsed = createBroadcastSchema.safeParse(this.parseBody(req));
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? "Validation failed",
          errors: parsed.error.issues,
        });
      }

      const payloadData = {
        ...parsed.data,
        vendorId: parsed.data.vendorId ?? (user as any).vendor_id ?? (user as any).vendor?.id ?? null,
      };

      const data = await this.service.create(payloadData, user.id, this.parseMultipartFiles(req));
      return res.status(201).json({ success: true, message: "Broadcast created successfully", data });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  // ─── GET /broadcasts ───────────────────────────────────────────────────────

  /**
   * List broadcasts.
   * Query params: vendorId, status, type, page, limit, forMe (boolean)
   * When forMe=true → only shows broadcasts targeted at the current user
   */
  async list(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;

      const parsed = listBroadcastsSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? "Validation failed",
          errors: parsed.error.issues,
        });
      }

      const result = await this.service.list(parsed.data, user);
      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  // ─── GET /broadcasts/:id ───────────────────────────────────────────────────

  /**
   * Get a single broadcast by ID with all relations.
   */
  async getById(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;

      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid broadcast ID" });

      const data = await this.service.getById(id);
      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  // ─── PATCH /broadcasts/:id ─────────────────────────────────────────────────

  /**
   * Update a broadcast.
   * All fields optional. If `audiences` or `attachments` arrays are provided they
   * fully replace the existing ones (upsert-style replacement).
   */
  async update(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;

      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid broadcast ID" });

      const parsed = updateBroadcastSchema.safeParse(this.parseBody(req));
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? "Validation failed",
          errors: parsed.error.issues,
        });
      }

      const data = await this.service.update(id, parsed.data, user.id, this.parseMultipartFiles(req));
      return res.status(200).json({ success: true, message: "Broadcast updated successfully", data });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  // ─── DELETE /broadcasts/:id ────────────────────────────────────────────────

  /**
   * Soft-delete a broadcast (sets status = INACTIVE).
   */
  async delete(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;

      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid broadcast ID" });

      await this.service.delete(id, user.id);
      return res.status(200).json({ success: true, message: "Broadcast deleted successfully" });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  // ─── POST /broadcasts/:id/read ─────────────────────────────────────────────

  /**
   * Mark a broadcast as read by the current user.
   * Idempotent — safe to call multiple times.
   */
  async markRead(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;

      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid broadcast ID" });

      const data = await this.service.markRead(id, user.id);
      return res.status(200).json({ success: true, message: "Broadcast marked as read", data });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }

  // ─── GET /broadcasts/:id/readers ───────────────────────────────────────────

  /**
   * Get the list of users who have read this broadcast.
   */
  async getReaders(req: Request, res: Response) {
    try {
      const user = this.getUser(req, res);
      if (!user) return;

      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid broadcast ID" });

      const data = await this.service.getReaders(id);
      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Something went wrong" });
    }
  }
}
