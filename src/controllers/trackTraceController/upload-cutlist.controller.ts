
import { Request, Response } from "express"
import { uploadCutListMachineExcel } from "../../../src/services/trackTraceServices/upload-cutlist.service";
import ExcelJS from "exceljs";


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

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const sheet = workbook.worksheets[0];
    const headers: string[] = [];
    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => { headers.push(String(cell.value ?? "")); });
      } else {
        const obj: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          obj[headers[colNumber - 1]] = cell.value ?? null;
        });
        rows.push(obj);
      }
    });

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
