import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import logger from "../../utils/logger";
import {
  ClientVisitService,
  CreateClientVisitInput,
} from "../../services/client-visit/clientVisit.service";
import { ClientVisitType } from "../../prisma/generated";

const clientVisitService = new ClientVisitService();

const getSingleValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export class ClientVisitController {
  public async getByLead(req: Request, res: Response) {
    try {
      const leadId = Number(req.params.leadId);

      if (!leadId) {
        return res
          .status(400)
          .json(ApiResponse.error("leadId is required", 400));
      }

      const result = await clientVisitService.getClientVisits(leadId);

      return res
        .status(200)
        .json(ApiResponse.success(result, "Client visits fetched successfully", 200));
    } catch (error: any) {
      logger.error("[ClientVisitController] getByLead:", error);
      return res
        .status(500)
        .json(
          ApiResponse.error(
            error.message || "Failed to fetch client visits",
            500,
          ),
        );
    }
  }

  public async create(req: Request, res: Response) {
    try {
      const leadId = Number(req.params.leadId);
      const visitType = getSingleValue(req.body.visit_type);
      const date = getSingleValue(req.body.date);
      const meetingTypeId = getSingleValue(req.body.meeting_type_id);
      const remark = getSingleValue(req.body.remark);
      const location = getSingleValue(req.body.location);
      const expenseIncurred = getSingleValue(req.body.expense_incurred);
      const createdBy = getSingleValue(req.body.created_by);
      const files = (req.files as Record<string, Express.Multer.File[]>) ?? {};
      const documents = files.documents ?? [];
      const paymentProofDocuments = files.payment_proof_documents ?? [];

      if (!leadId || !visitType || !date || !meetingTypeId || !remark) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [
            !leadId && { field: "leadId", message: "leadId is required" },
            !visitType && {
              field: "visit_type",
              message: "visit_type is required",
            },
            !date && { field: "date", message: "date is required" },
            !meetingTypeId && {
              field: "meeting_type_id",
              message: "meeting_type_id is required",
            },
            !remark && { field: "remark", message: "remark is required" },
          ].filter(Boolean),
        });
      }

      const payload: CreateClientVisitInput = {
        lead_id: leadId,
        visit_type: visitType as ClientVisitType,
        date,
        meeting_type_id: Number(meetingTypeId),
        remark,
        location,
        expense_incurred:
          expenseIncurred == null || expenseIncurred === ""
            ? null
            : Number(expenseIncurred),
        created_by: Number(createdBy ?? (req as any).user?.id),
        documents,
        payment_proof_documents: paymentProofDocuments,
      };

      const result = await clientVisitService.createClientVisit(payload);

      return res
        .status(201)
        .json(ApiResponse.success(result, "Client visit created successfully", 201));
    } catch (error: any) {
      logger.error("[ClientVisitController] create:", error);
      return res
        .status(500)
        .json(
          ApiResponse.error(error.message || "Failed to create client visit", 500),
        );
    }
  }
}
