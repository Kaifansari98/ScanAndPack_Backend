
import { Request, Response } from "express"
import { uploadCutListMachineExcel } from "../../../src/services/trackTraceServices/upload-cutlist.service";
import * as XLSX from "xlsx";


export const uploadMachineExcel = async (req: Request, res: Response) => {
  try {
    const vendorId = Number(req.params.vendor_id);
    const projectToken = String(req.params.project_token);
    const userId = Number(req.body.user_id);

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
      });
    }

    const workbook = XLSX.read(file.buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet); // ✅ unknown instead of ExcelRow

    const result = await uploadCutListMachineExcel(
      vendorId,
      projectToken,
      rows, // ✅ raw pass karo, service normalize kar legi
      userId,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    // ✅ Validation errors — 422
    if (error?.message === "VALIDATION_ERROR") {
      return res.status(422).json({
        success: false,
        message: error.userMessage,
      });
    }

    // ✅ Normal errors — 500
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Excel processing failed",
    });
  }
};
