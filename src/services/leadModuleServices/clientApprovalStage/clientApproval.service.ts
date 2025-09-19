import { prisma } from "../../../prisma/client";
import { ClientApprovalDto } from "../../../types/clientApproval.dto";
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
import { uploadToWasabClientApprovalDocumentation, uploadToWasabClientDocumentation } from "../../../utils/wasabiClient";

export class ClientApprovalService {
  public async submitClientApproval(data: ClientApprovalDto) {
    const response: any = { screenshots: [], paymentInfo: null, ledger: null };

    // Step 1. Get DocType for approval screenshots (Type 12)
    const approvalDocType = await prisma.documentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 12" },
    });
    if (!approvalDocType) throw new Error("Document type (Client Approval Documents) not found for this vendor");

    // Upload Approval Screenshots
    for (const doc of data.approvalScreenshots) {
      const sanitized = sanitizeFilename(doc.originalname);
      const sysName = await uploadToWasabClientDocumentation(
        doc.buffer,
        data.vendor_id,
        data.lead_id,
        sanitized
      );
      const docEntry = await prisma.leadDocuments.create({
        data: {
          doc_og_name: doc.originalname,
          doc_sys_name: sysName,
          created_by: data.created_by,
          doc_type_id: approvalDocType.id,
          account_id: data.account_id,
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        },
      });
      response.screenshots.push(docEntry);
    }

    // 1. Resolve the vendor's Booking status ID dynamically
    const bookingStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: data.vendor_id,
        tag: "Type 4", // ✅ booking status
      },
      select: { id: true },
    });

    if (!bookingStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${data.vendor_id}`);
    }

    // Step 2. Update lead with advance payment date
    await prisma.leadMaster.update({
      where: { id: data.lead_id },
      data: {
        advance_payment_date: new Date(data.advance_payment_date),
        status_id: bookingStatus.id, // Client Approval Stage
        updated_at: new Date(),
        updated_by: data.created_by,
      },
    });

    // Step 3. Amount Paid → paymentInfo + Ledger
    const paymentType = await prisma.paymentTypeMaster.findFirst({
      where: { vendor_id: data.vendor_id, tag: "Type 3" },
    });
    if (!paymentType) throw new Error("Payment Type (Type 3) not found for this vendor");

    let paymentFileId: number | null = null;

    // Step 4. Payment remarks + file upload
    if (data.payment_files && data.payment_files.length > 0) {
      const uploadedDocs = [];
      for (const doc of data.payment_files) {
        const sanitized = sanitizeFilename(doc.originalname);
        const sysName = await uploadToWasabClientApprovalDocumentation(
          doc.buffer,
          data.vendor_id,
          data.lead_id,
          sanitized
        );
        const docEntry = await prisma.leadDocuments.create({
          data: {
            doc_og_name: doc.originalname,
            doc_sys_name: sysName,
            created_by: data.created_by,
            doc_type_id: approvalDocType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          },
        });
        uploadedDocs.push(docEntry);
      }
      // take first uploaded file for mapping
      paymentFileId = uploadedDocs[0]?.id || null;
    }

    const paymentInfo = await prisma.paymentInfo.create({
      data: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        account_id: data.account_id,
        created_by: data.created_by,
        payment_type_id: paymentType.id,
        amount: data.amount_paid,
        payment_text: data.payment_text,
        payment_file_id: paymentFileId,
      },
    });

    // Add Ledger entry
    const ledger = await prisma.ledger.create({
      data: {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        account_id: data.account_id,
        client_id: data.client_id,
        created_by: data.created_by,
        amount: data.amount_paid,
        payment_date: new Date(data.advance_payment_date),
        type: "credit",
      },
    });

    response.paymentInfo = paymentInfo;
    response.ledger = ledger;

    return response;
  }
}
