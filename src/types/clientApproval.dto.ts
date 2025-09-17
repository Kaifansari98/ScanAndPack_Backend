export interface ClientApprovalDto {
    lead_id: number;
    vendor_id: number;
    account_id: number;
    client_id: number;
    created_by: number;
  
    // Step 1 - Approval Screenshot
    approvalScreenshots: Express.Multer.File[];
  
    // Step 2 - Advance Payment Date
    advance_payment_date: string; // ISO date
  
    // Step 3 - Amount Paid
    amount_paid: number;
  
    // Step 4 - Transaction ID / Remarks
    payment_text?: string; // remarks or transaction ID
    payment_files?: Express.Multer.File[];
  }
  