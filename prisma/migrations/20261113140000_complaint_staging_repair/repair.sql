-- Adds complaint-module safety checks and triggers missing on this database.
-- Safe to re-run: existing objects are skipped or replaced with the same definition.
-- Check constraints are added NOT VALID so existing rows can't block them;
-- they still apply to every new insert and update.
BEGIN;

-- Check constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintActivityLog_actor_identity_check') THEN
    ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_actor_identity_check" CHECK ((((actor_type = 'STAFF'::"ComplaintActorType") AND (actor_user_id IS NOT NULL)) OR ((actor_type = 'CLIENT'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (NULLIF(btrim((actor_client_reference)::text), ''::text) IS NOT NULL)) OR ((actor_type = 'SYSTEM'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (actor_client_reference IS NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintActivityLog_proxy_check') THEN
    ALTER TABLE "ComplaintActivityLog" ADD CONSTRAINT "ComplaintActivityLog_proxy_check" CHECK (((NOT acting_on_behalf_of_client) OR ((actor_type = 'STAFF'::"ComplaintActorType") AND (NULLIF(btrim((actor_client_reference)::text), ''::text) IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintAssignment_reason_check') THEN
    ALTER TABLE "ComplaintAssignment" ADD CONSTRAINT "ComplaintAssignment_reason_check" CHECK (((previous_user_id IS DISTINCT FROM new_user_id) AND ((previous_user_id IS NULL) OR (NULLIF(btrim((reason)::text), ''::text) IS NOT NULL)) AND (assigned_by_actor_type <> 'CLIENT'::"ComplaintActorType") AND ((assigned_by_actor_type = 'STAFF'::"ComplaintActorType") = (assigned_by IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintAttachment_actor_identity_check') THEN
    ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_actor_identity_check" CHECK ((((actor_type = 'STAFF'::"ComplaintActorType") AND (actor_user_id IS NOT NULL)) OR ((actor_type = 'CLIENT'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (NULLIF(btrim((actor_client_reference)::text), ''::text) IS NOT NULL)) OR ((actor_type = 'SYSTEM'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (actor_client_reference IS NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintAttachment_file_check') THEN
    ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_file_check" CHECK (((size_bytes > 0) AND (btrim(storage_key) <> ''::text) AND (btrim((original_name)::text) <> ''::text) AND ((media_type <> 'PHOTO'::"ComplaintMediaType") OR ((mime_type)::text ~~ 'image/%'::text)) AND ((media_type <> 'VIDEO'::"ComplaintMediaType") OR ((mime_type)::text ~~ 'video/%'::text)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintCategoryMaster_name_check') THEN
    ALTER TABLE "ComplaintCategoryMaster" ADD CONSTRAINT "ComplaintCategoryMaster_name_check" CHECK ((btrim((name)::text) <> ''::text)) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintCharge_source_amount_check') THEN
    ALTER TABLE "ComplaintCharge" ADD CONSTRAINT "ComplaintCharge_source_amount_check" CHECK (((amount >= (0)::numeric) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND (((charge_type = 'VISIT'::"ComplaintChargeType") AND (visit_id IS NOT NULL) AND (quotation_id IS NULL)) OR ((charge_type = 'REPAIR'::"ComplaintChargeType") AND (quotation_id IS NOT NULL) AND (visit_id IS NULL))) AND ((status <> 'WAIVED'::"ComplaintChargeStatus") OR (waiver_decision_id IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintClosure_verification_check') THEN
    ALTER TABLE "ComplaintClosure" ADD CONSTRAINT "ComplaintClosure_verification_check" CHECK ((((client_confirmation_status <> 'NO_RESPONSE_HO_AUTHORISED'::"ComplaintClientConfirmationStatus") OR (NULLIF(btrim((no_response_reason)::text), ''::text) IS NOT NULL)) AND ((client_confirmation_status <> ALL (ARRAY['SATISFIED'::"ComplaintClientConfirmationStatus", 'NOT_SATISFIED'::"ComplaintClientConfirmationStatus"])) OR (client_confirmation_decision_id IS NOT NULL)) AND ((status <> 'CLOSED'::"ComplaintClosureStatus") OR ((completion_verified_by IS NOT NULL) AND (completion_verified_at IS NOT NULL) AND (financial_verified_by IS NOT NULL) AND (financial_verified_at IS NOT NULL) AND (closed_by IS NOT NULL) AND (closed_at IS NOT NULL) AND (client_confirmation_status = ANY (ARRAY['SATISFIED'::"ComplaintClientConfirmationStatus", 'NO_RESPONSE_HO_AUTHORISED'::"ComplaintClientConfirmationStatus"])))))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintCycle_actor_check') THEN
    ALTER TABLE "ComplaintCycle" ADD CONSTRAINT "ComplaintCycle_actor_check" CHECK ((((opened_by_actor_type = 'STAFF'::"ComplaintActorType") AND (opened_by_user_id IS NOT NULL) AND (opened_by_client_reference IS NULL)) OR ((opened_by_actor_type = 'CLIENT'::"ComplaintActorType") AND (opened_by_user_id IS NULL) AND (NULLIF(btrim((opened_by_client_reference)::text), ''::text) IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintCycle_lifecycle_check') THEN
    ALTER TABLE "ComplaintCycle" ADD CONSTRAINT "ComplaintCycle_lifecycle_check" CHECK (((cycle_number > 0) AND ((cycle_number = 1) OR (NULLIF(btrim((reopened_reason)::text), ''::text) IS NOT NULL)) AND (((ended_at IS NULL) AND (end_reason IS NULL)) OR ((ended_at IS NOT NULL) AND (end_reason IS NOT NULL))) AND ((ended_at IS NULL) OR (ended_at >= opened_at)) AND ((closed_at IS NULL) OR ((end_reason = 'CLOSED'::"ComplaintCycleEndReason") AND (ended_at IS NOT NULL))))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintDecision_actor_identity_check') THEN
    ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_actor_identity_check" CHECK ((((actor_type = 'STAFF'::"ComplaintActorType") AND (actor_user_id IS NOT NULL)) OR ((actor_type = 'CLIENT'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (NULLIF(btrim((actor_client_reference)::text), ''::text) IS NOT NULL)) OR ((actor_type = 'SYSTEM'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (actor_client_reference IS NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintDecision_actor_scope_check') THEN
    ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_actor_scope_check" CHECK (((actor_type <> 'SYSTEM'::"ComplaintActorType") AND ((NOT acting_on_behalf_of_client) OR ((actor_type = 'STAFF'::"ComplaintActorType") AND (NULLIF(btrim((actor_client_reference)::text), ''::text) IS NOT NULL))) AND ((decision_type = ANY (ARRAY['VISIT_CHARGE_ACCEPTANCE'::"ComplaintDecisionType", 'CLIENT_QUOTATION_RESPONSE'::"ComplaintDecisionType", 'CLIENT_RESOLUTION_CONFIRMATION'::"ComplaintDecisionType"])) OR ((actor_type = 'STAFF'::"ComplaintActorType") AND (NOT acting_on_behalf_of_client))) AND ((decision_type <> ALL (ARRAY['VISIT_CHARGE_ACCEPTANCE'::"ComplaintDecisionType", 'CLIENT_QUOTATION_RESPONSE'::"ComplaintDecisionType", 'CLIENT_RESOLUTION_CONFIRMATION'::"ComplaintDecisionType"])) OR (actor_type = 'CLIENT'::"ComplaintActorType") OR acting_on_behalf_of_client))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintDecision_references_check') THEN
    ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_references_check" CHECK ((((outcome <> 'REMOTE_RESOLUTION'::"ComplaintDecisionOutcome") OR (NULLIF(btrim(remote_instructions), ''::text) IS NOT NULL)) AND ((decision_type <> ALL (ARRAY['FREE_REPEAT_VISIT'::"ComplaintDecisionType", 'VISIT_CHARGE_ACCEPTANCE'::"ComplaintDecisionType"])) OR (visit_id IS NOT NULL)) AND ((decision_type <> ALL (ARRAY['HSS_QUOTATION_APPROVAL'::"ComplaintDecisionType", 'CLIENT_QUOTATION_RESPONSE'::"ComplaintDecisionType"])) OR (quotation_id IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintDecision_remarks_check') THEN
    ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_remarks_check" CHECK (((NULLIF(btrim((remarks)::text), ''::text) IS NOT NULL) OR ((decision_type = ANY (ARRAY['VISIT_CHARGE_ACCEPTANCE'::"ComplaintDecisionType", 'CLIENT_QUOTATION_RESPONSE'::"ComplaintDecisionType", 'CLIENT_RESOLUTION_CONFIRMATION'::"ComplaintDecisionType"])) AND (outcome <> ALL (ARRAY['NOT_SATISFIED'::"ComplaintDecisionOutcome", 'MODIFICATION_REQUESTED'::"ComplaintDecisionOutcome", 'REJECTED'::"ComplaintDecisionOutcome", 'DECLINED'::"ComplaintDecisionOutcome"]))))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintDecision_type_outcome_check') THEN
    ALTER TABLE "ComplaintDecision" ADD CONSTRAINT "ComplaintDecision_type_outcome_check" CHECK ((((decision_type = 'HO_VERIFICATION'::"ComplaintDecisionType") AND (outcome = ANY (ARRAY['APPROVED_FOR_VISIT'::"ComplaintDecisionOutcome", 'MORE_INFORMATION_REQUIRED'::"ComplaintDecisionOutcome", 'REMOTE_RESOLUTION'::"ComplaintDecisionOutcome", 'REJECTED'::"ComplaintDecisionOutcome", 'ON_HOLD'::"ComplaintDecisionOutcome"]))) OR ((decision_type = 'WARRANTY_DECISION'::"ComplaintDecisionType") AND (outcome = ANY (ARRAY['COVERED'::"ComplaintDecisionOutcome", 'PARTIALLY_COVERED'::"ComplaintDecisionOutcome", 'NOT_COVERED'::"ComplaintDecisionOutcome"]))) OR ((decision_type = ANY (ARRAY['EXCEPTIONAL_APPROVAL'::"ComplaintDecisionType", 'FREE_REPEAT_VISIT'::"ComplaintDecisionType", 'REOPEN_REVIEW'::"ComplaintDecisionType"])) AND (outcome = ANY (ARRAY['APPROVED'::"ComplaintDecisionOutcome", 'DECLINED'::"ComplaintDecisionOutcome"]))) OR ((decision_type = ANY (ARRAY['EXTERNAL_LEAD_LINK'::"ComplaintDecisionType", 'CHARGE_WAIVER'::"ComplaintDecisionType"])) AND (outcome = 'APPROVED'::"ComplaintDecisionOutcome")) OR ((decision_type = ANY (ARRAY['INSPECTION_SKIP'::"ComplaintDecisionType", 'QUOTATION_SKIP'::"ComplaintDecisionType"])) AND (outcome = 'SKIPPED'::"ComplaintDecisionOutcome")) OR ((decision_type = 'HSS_QUOTATION_APPROVAL'::"ComplaintDecisionType") AND (outcome = ANY (ARRAY['APPROVED'::"ComplaintDecisionOutcome", 'SENT_FOR_REVISION'::"ComplaintDecisionOutcome"]))) OR ((decision_type = 'VISIT_CHARGE_ACCEPTANCE'::"ComplaintDecisionType") AND (outcome = ANY (ARRAY['ACCEPTED'::"ComplaintDecisionOutcome", 'DECLINED'::"ComplaintDecisionOutcome"]))) OR ((decision_type = 'CLIENT_QUOTATION_RESPONSE'::"ComplaintDecisionType") AND (outcome = ANY (ARRAY['ACCEPTED'::"ComplaintDecisionOutcome", 'REJECTED'::"ComplaintDecisionOutcome", 'MODIFICATION_REQUESTED'::"ComplaintDecisionOutcome"]))) OR ((decision_type = 'CLIENT_RESOLUTION_CONFIRMATION'::"ComplaintDecisionType") AND (outcome = ANY (ARRAY['SATISFIED'::"ComplaintDecisionOutcome", 'NOT_SATISFIED'::"ComplaintDecisionOutcome"]))))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintExecution_progress_check') THEN
    ALTER TABLE "ComplaintExecution" ADD CONSTRAINT "ComplaintExecution_progress_check" CHECK ((((status <> ALL (ARRAY['MATERIAL_APPROVAL_PENDING'::"ComplaintExecutionStatus", 'PROCUREMENT_PENDING'::"ComplaintExecutionStatus", 'MATERIAL_ORDERED'::"ComplaintExecutionStatus", 'MATERIAL_RECEIVED'::"ComplaintExecutionStatus", 'MATERIAL_READY'::"ComplaintExecutionStatus"])) OR material_required) AND ((status <> ALL (ARRAY['MATERIAL_RECEIVED'::"ComplaintExecutionStatus", 'MATERIAL_READY'::"ComplaintExecutionStatus"])) OR (material_received_date IS NOT NULL)) AND ((status <> ALL (ARRAY['REPAIR_SCHEDULED'::"ComplaintExecutionStatus", 'WORK_IN_PROGRESS'::"ComplaintExecutionStatus", 'WORK_COMPLETED'::"ComplaintExecutionStatus"])) OR (scheduled_for IS NOT NULL)) AND ((status <> 'WORK_COMPLETED'::"ComplaintExecutionStatus") OR ((completed_by IS NOT NULL) AND (completed_at IS NOT NULL) AND (NULLIF(btrim(completion_remarks), ''::text) IS NOT NULL))))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintExternalClient_details_check') THEN
    ALTER TABLE "ComplaintExternalClient" ADD CONSTRAINT "ComplaintExternalClient_details_check" CHECK (((btrim((external_client_code)::text) <> ''::text) AND (btrim((client_name)::text) <> ''::text) AND (btrim((mobile)::text) <> ''::text) AND (btrim((address)::text) <> ''::text) AND (btrim((city)::text) <> ''::text))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintInspectionMaterial_fields_check') THEN
    ALTER TABLE "ComplaintInspectionMaterial" ADD CONSTRAINT "ComplaintInspectionMaterial_fields_check" CHECK (((sequence > 0) AND (btrim((material_name)::text) <> ''::text) AND (quantity > (0)::numeric) AND ((estimated_cost IS NULL) OR (estimated_cost >= (0)::numeric)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintInspectionReport_fields_check') THEN
    ALTER TABLE "ComplaintInspectionReport" ADD CONSTRAINT "ComplaintInspectionReport_fields_check" CHECK (((btrim(issue_observed) <> ''::text) AND (btrim(root_cause) <> ''::text) AND (btrim((affected_product)::text) <> ''::text) AND (btrim((affected_unit_number)::text) <> ''::text) AND (cardinality(repair_actions) > 0) AND ((estimated_work_days IS NULL) OR (estimated_work_days >= 0)) AND ((responsibility <> 'OTHER'::"ComplaintResponsibility") OR (NULLIF(btrim((responsibility_remarks)::text), ''::text) IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintMaster_actor_check') THEN
    ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_actor_check" CHECK ((((raised_by_actor_type = 'STAFF'::"ComplaintActorType") AND (raised_by_user_id IS NOT NULL) AND (raised_by_client_reference IS NULL)) OR ((raised_by_actor_type = 'CLIENT'::"ComplaintActorType") AND (raised_by_user_id IS NULL) AND (NULLIF(btrim((raised_by_client_reference)::text), ''::text) IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintMaster_duplicate_review_check') THEN
    ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_duplicate_review_check" CHECK (((duplicate_reviewed_by IS NULL) = (duplicate_reviewed_at IS NULL))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintMaster_owner_check') THEN
    ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_owner_check" CHECK (((status = ANY (ARRAY['NEW'::"ComplaintStatus", 'UNDER_VERIFICATION'::"ComplaintStatus", 'MORE_INFORMATION_REQUIRED'::"ComplaintStatus", 'REJECTED'::"ComplaintStatus", 'ON_HOLD'::"ComplaintStatus", 'CANCELLED'::"ComplaintStatus"])) OR (assigned_ss_id IS NOT NULL))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintMaster_registration_context_check') THEN
    ALTER TABLE "ComplaintMaster" ADD CONSTRAINT "ComplaintMaster_registration_context_check" CHECK (((btrim((complaint_code)::text) <> ''::text) AND (sequence_no > 0) AND (version > 0) AND (btrim((client_name)::text) <> ''::text) AND (btrim((client_mobile)::text) <> ''::text) AND (btrim((site_address)::text) <> ''::text) AND (btrim(description) <> ''::text) AND ((client_type <> 'CRM_LEAD'::"ComplaintClientType") OR ((lead_id IS NOT NULL) AND (account_id IS NOT NULL))) AND ((client_type = 'CRM_LEAD'::"ComplaintClientType") OR (external_client_id IS NOT NULL)) AND ((registration_channel <> 'WEBSITE'::"ComplaintRegistrationChannel") OR (client_type <> 'CRM_LEAD'::"ComplaintClientType")) AND ((registration_channel <> 'STAFF'::"ComplaintRegistrationChannel") OR (raised_by_actor_type = 'STAFF'::"ComplaintActorType")) AND ((lead_id IS NULL) OR (account_id IS NOT NULL)) AND ((instance_id IS NULL) OR (lead_id IS NOT NULL)) AND ((client_type <> 'EXCEPTIONAL'::"ComplaintClientType") OR (NULLIF(btrim((exceptional_reason)::text), ''::text) IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintNotification_recipient_check') THEN
    ALTER TABLE "ComplaintNotification" ADD CONSTRAINT "ComplaintNotification_recipient_check" CHECK ((((recipient_type = 'STAFF'::"ComplaintNotificationRecipient") = (recipient_user_id IS NOT NULL)) AND ((delivery_status <> 'SENT'::"ComplaintNotificationDeliveryStatus") OR (sent_at IS NOT NULL)) AND ((delivery_status <> ALL (ARRAY['FAILED'::"ComplaintNotificationDeliveryStatus", 'CHANNEL_UNAVAILABLE'::"ComplaintNotificationDeliveryStatus"])) OR (NULLIF(btrim((failure_reason)::text), ''::text) IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintPayment_actor_identity_check') THEN
    ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_actor_identity_check" CHECK ((((actor_type = 'STAFF'::"ComplaintActorType") AND (actor_user_id IS NOT NULL)) OR ((actor_type = 'CLIENT'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (NULLIF(btrim((actor_client_reference)::text), ''::text) IS NOT NULL)) OR ((actor_type = 'SYSTEM'::"ComplaintActorType") AND (actor_user_id IS NULL) AND (actor_client_reference IS NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintPayment_human_actor_check') THEN
    ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_human_actor_check" CHECK ((actor_type <> 'SYSTEM'::"ComplaintActorType")) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintPayment_verification_check') THEN
    ALTER TABLE "ComplaintPayment" ADD CONSTRAINT "ComplaintPayment_verification_check" CHECK (((amount > (0)::numeric) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND (btrim((transaction_reference)::text) <> ''::text) AND ((status <> ALL (ARRAY['VERIFIED'::"ComplaintPaymentStatus", 'REFUNDED'::"ComplaintPaymentStatus"])) OR ((verified_by IS NOT NULL) AND (verified_at IS NOT NULL))) AND ((status <> 'REJECTED'::"ComplaintPaymentStatus") OR (NULLIF(btrim((rejection_remarks)::text), ''::text) IS NOT NULL)) AND ((status <> 'REFUNDED'::"ComplaintPaymentStatus") OR ((refunded_by IS NOT NULL) AND (refunded_at IS NOT NULL) AND (NULLIF(btrim((refund_remarks)::text), ''::text) IS NOT NULL))))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintPaymentAllocation_positive_check') THEN
    ALTER TABLE "ComplaintPaymentAllocation" ADD CONSTRAINT "ComplaintPaymentAllocation_positive_check" CHECK ((amount > (0)::numeric)) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintQuotation_amount_check') THEN
    ALTER TABLE "ComplaintQuotation" ADD CONSTRAINT "ComplaintQuotation_amount_check" CHECK (((quotation_number > 0) AND (revision > 0) AND (subtotal >= (0)::numeric) AND (tax_amount >= (0)::numeric) AND (total_amount = (subtotal + tax_amount)) AND (warranty_covered_amount >= (0)::numeric) AND (client_payable_amount >= (0)::numeric) AND ((warranty_covered_amount + client_payable_amount) = total_amount) AND ((currency)::text ~ '^[A-Z]{3}$'::text))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintQuotation_approval_presence_check') THEN
    ALTER TABLE "ComplaintQuotation" ADD CONSTRAINT "ComplaintQuotation_approval_presence_check" CHECK ((((status <> ALL (ARRAY['HSS_APPROVED'::"ComplaintQuotationStatus", 'SHARED'::"ComplaintQuotationStatus", 'CLIENT_ACCEPTED'::"ComplaintQuotationStatus", 'CLIENT_REJECTED'::"ComplaintQuotationStatus", 'MODIFICATION_REQUESTED'::"ComplaintQuotationStatus"])) OR (hss_approval_decision_id IS NOT NULL)) AND ((status <> ALL (ARRAY['SHARED'::"ComplaintQuotationStatus", 'CLIENT_ACCEPTED'::"ComplaintQuotationStatus", 'CLIENT_REJECTED'::"ComplaintQuotationStatus", 'MODIFICATION_REQUESTED'::"ComplaintQuotationStatus"])) OR (shared_at IS NOT NULL)) AND ((status <> ALL (ARRAY['CLIENT_ACCEPTED'::"ComplaintQuotationStatus", 'CLIENT_REJECTED'::"ComplaintQuotationStatus", 'MODIFICATION_REQUESTED'::"ComplaintQuotationStatus"])) OR (client_response_decision_id IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintQuotationItem_amount_check') THEN
    ALTER TABLE "ComplaintQuotationItem" ADD CONSTRAINT "ComplaintQuotationItem_amount_check" CHECK (((sequence > 0) AND (quantity > (0)::numeric) AND (unit_rate >= (0)::numeric) AND (line_total >= (0)::numeric) AND (warranty_covered_amount >= (0)::numeric) AND (client_payable_amount >= (0)::numeric) AND ((warranty_covered_amount + client_payable_amount) = line_total))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintSlaConfig_hours_check') THEN
    ALTER TABLE "ComplaintSlaConfig" ADD CONSTRAINT "ComplaintSlaConfig_hours_check" CHECK (((target_hours > 0) AND ((reminder_every_hours IS NULL) OR (reminder_every_hours > 0)) AND ((escalate_after_hours IS NULL) OR (escalate_after_hours > 0)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintVisit_charge_check') THEN
    ALTER TABLE "ComplaintVisit" ADD CONSTRAINT "ComplaintVisit_charge_check" CHECK (((visit_number > 0) AND (standard_fee >= (0)::numeric) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND (reschedule_count >= 0) AND (repeat_of_visit_id IS DISTINCT FROM id) AND ((charge_mode <> 'FREE_REPEAT'::"ComplaintVisitChargeMode") OR ((repeat_of_visit_id IS NOT NULL) AND (NULLIF(btrim((repeat_remarks)::text), ''::text) IS NOT NULL) AND (status <> ALL (ARRAY['AWAITING_CHARGE_ACCEPTANCE'::"ComplaintVisitStatus", 'AWAITING_PAYMENT'::"ComplaintVisitStatus"])) AND ((status = ANY (ARRAY['PENDING_FREE_APPROVAL'::"ComplaintVisitStatus", 'CANCELLED'::"ComplaintVisitStatus"])) OR (free_approval_decision_id IS NOT NULL)))) AND ((charge_mode <> 'CHARGEABLE'::"ComplaintVisitChargeMode") OR (status <> 'PENDING_FREE_APPROVAL'::"ComplaintVisitStatus")))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintVisit_outcome_check') THEN
    ALTER TABLE "ComplaintVisit" ADD CONSTRAINT "ComplaintVisit_outcome_check" CHECK ((((status <> ALL (ARRAY['SCHEDULED'::"ComplaintVisitStatus", 'CONFIRMED'::"ComplaintVisitStatus", 'COMPLETED'::"ComplaintVisitStatus", 'CLIENT_NOT_AVAILABLE'::"ComplaintVisitStatus", 'SITE_NOT_ACCESSIBLE'::"ComplaintVisitStatus"])) OR (scheduled_for IS NOT NULL)) AND ((status <> 'COMPLETED'::"ComplaintVisitStatus") OR (completed_at IS NOT NULL)) AND ((status <> ALL (ARRAY['CANCELLED'::"ComplaintVisitStatus", 'CLIENT_NOT_AVAILABLE'::"ComplaintVisitStatus", 'SITE_NOT_ACCESSIBLE'::"ComplaintVisitStatus"])) OR (NULLIF(btrim((remarks)::text), ''::text) IS NOT NULL)))) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VendorMaster_complaint_visit_fee_check') THEN
    ALTER TABLE "VendorMaster" ADD CONSTRAINT "VendorMaster_complaint_visit_fee_check" CHECK ((complaint_visit_fee >= (0)::numeric)) NOT VALID;
  END IF;
END $$;

-- Trigger functions
CREATE OR REPLACE FUNCTION public.complaint_keep_audit_history()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Complaint activity history is append-only' USING ERRCODE = '23514';
END $function$;

CREATE OR REPLACE FUNCTION public.complaint_keep_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Complaints cannot be deleted after registration' USING ERRCODE = '23514';
  END IF;
  IF NEW.complaint_code IS DISTINCT FROM OLD.complaint_code OR
     NEW.sequence_no IS DISTINCT FROM OLD.sequence_no OR
     NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    RAISE EXCEPTION 'Complaint ID and vendor cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.complaint_require_registration()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE target_id integer;
BEGIN
  IF TG_TABLE_NAME = 'ComplaintMaster' THEN
    target_id := NEW.id;
  ELSE
    target_id := OLD.complaint_id;
  END IF;
  IF EXISTS (SELECT 1 FROM "ComplaintMaster" WHERE id = target_id AND current_cycle_id IS NULL) THEN
    RAISE EXCEPTION 'A complaint requires an active cycle' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "ComplaintMaster" WHERE id = target_id) AND
     NOT EXISTS (SELECT 1 FROM "ComplaintAttachment" WHERE complaint_id = target_id AND category = 'REGISTRATION' AND media_type = 'PHOTO') THEN
    RAISE EXCEPTION 'A complaint requires at least one registration photo' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.complaint_require_visit_payment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  gated text[] := ARRAY['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CLIENT_NOT_AVAILABLE', 'SITE_NOT_ACCESSIBLE'];
  charge_status text;
  charge_amount numeric;
  paid numeric;
BEGIN
  IF NEW.charge_mode <> 'CHARGEABLE' OR NOT (NEW.status::text = ANY (gated)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = ANY (gated) THEN
    RETURN NEW;
  END IF;
  SELECT c.status::text, c.amount,
         COALESCE(SUM(a.amount) FILTER (WHERE p.status = 'VERIFIED'), 0)
    INTO charge_status, charge_amount, paid
    FROM "ComplaintCharge" c
    LEFT JOIN "ComplaintPaymentAllocation" a ON a.charge_id = c.id
    LEFT JOIN "ComplaintPayment" p ON p.id = a.payment_id
   WHERE c.visit_id = NEW.id
   GROUP BY c.id;
  IF charge_status IS NULL OR charge_status = 'VOIDED' OR
     (charge_status = 'OPEN' AND paid < charge_amount) THEN
    RAISE EXCEPTION 'Visit % cannot be scheduled before its visiting charge is paid and verified', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$;

-- Triggers
DROP TRIGGER IF EXISTS "ComplaintActivityLog_immutable_trigger" ON "ComplaintActivityLog";
CREATE TRIGGER "ComplaintActivityLog_immutable_trigger" BEFORE DELETE OR UPDATE ON public."ComplaintActivityLog" FOR EACH ROW EXECUTE FUNCTION complaint_keep_audit_history();
DROP TRIGGER IF EXISTS "ComplaintAttachment_registration_trigger" ON "ComplaintAttachment";
CREATE CONSTRAINT TRIGGER "ComplaintAttachment_registration_trigger" AFTER DELETE OR UPDATE ON public."ComplaintAttachment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION complaint_require_registration();
DROP TRIGGER IF EXISTS "ComplaintMaster_immutable_identity_trigger" ON "ComplaintMaster";
CREATE TRIGGER "ComplaintMaster_immutable_identity_trigger" BEFORE DELETE OR UPDATE ON public."ComplaintMaster" FOR EACH ROW EXECUTE FUNCTION complaint_keep_identity();
DROP TRIGGER IF EXISTS "ComplaintMaster_registration_trigger" ON "ComplaintMaster";
CREATE CONSTRAINT TRIGGER "ComplaintMaster_registration_trigger" AFTER INSERT OR UPDATE ON public."ComplaintMaster" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION complaint_require_registration();
DROP TRIGGER IF EXISTS "ComplaintVisit_payment_gate_trigger" ON "ComplaintVisit";
CREATE TRIGGER "ComplaintVisit_payment_gate_trigger" BEFORE INSERT OR UPDATE ON public."ComplaintVisit" FOR EACH ROW EXECUTE FUNCTION complaint_require_visit_payment();

COMMIT;
