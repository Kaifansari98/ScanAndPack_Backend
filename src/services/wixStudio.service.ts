import { Request } from "express";
import { prisma } from "../prisma/client";
import { LeadEntryType } from "../../generated/prisma_client/client";
import logger from "../utils/logger";
import {
  createOrUpdateOnlineLead,
  resolveTargetOnlineLeadVendor,
} from "./leadModuleServices/onlineLead.service";

export interface ExtractedWixLead {
  name: string | null;
  phone: string | null;
  city: string | null;
  requirement: string | string[] | null;
  email: string | null;
}

export interface ProcessWixLeadResult {
  found?: boolean;
  leadCreated: boolean;
  lead?: any;
  isNew?: boolean;
  reason?: string;
  missingFields?: string[];
}

export class WixStudioService {
  /**
   * 1. Saves the raw Wix Studio payload into wix_studio_data_capture table,
   * associating the specified vendor_id if provided.
   */
  captureData = async (payload: any, vendorId?: number) => {
    return prisma.wixStudioDataCapture.create({
      data: {
        vendor_id: vendorId ? Number(vendorId) : null,
        payload: payload ?? {},
      },
    });
  };

  /**
   * 2. Dynamically extracts the required fields (name, phone, city, requirement)
   * and optional email from various Wix Studio form and automation payload structures.
   */
  extractWixStudioLeadData = (rawPayload: any): ExtractedWixLead => {
    if (!rawPayload || typeof rawPayload !== "object") {
      return { name: null, phone: null, city: null, requirement: null, email: null };
    }

    const root = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
    if (!root || typeof root !== "object") {
      return { name: null, phone: null, city: null, requirement: null, email: null };
    }

    // Collect candidate sub-objects where form fields may reside
    const objectsToSearch: Record<string, any>[] = [
      root,
      root.data,
      root.submissionData,
      root.submission,
      root.form,
      root.contact,
      root.contact?.name,
      root.contact?.address,
      root.customer,
      root.customer?.name,
      root.customer?.address,
      root.data?.contact,
      root.data?.contact?.name,
      root.data?.contact?.address,
      root.data?.submissionData,
      root.data?.customer,
      root.submission?.contact,
      root.submission?.contact?.name,
      root.submission?.contact?.address,
      root.metadata,
    ].filter((o): o is Record<string, any> => o && typeof o === "object" && !Array.isArray(o));

    // Handle Wix submissions and fields array: [{ label/key/name/id: '...', value: '...' }]
    const fieldsMap: Record<string, any> = {};
    const possibleFieldArrays: any[] = [
      root.submissions,
      root.fields,
      root.fieldValues,
      root.form?.submissions,
      root.form?.fields,
      root.data?.submissions,
      root.data?.fields,
      root.data?.fieldValues,
      root.submissionData?.submissions,
      root.submissionData?.fields,
      root.submission?.submissions,
      root.submission?.fields,
    ];

    // Scan any other array property in containers for submissions/fields arrays
    for (const container of [root, root.data, root.submissionData, root.submission, root.form]) {
      if (!container || typeof container !== "object") continue;
      for (const k of Object.keys(container)) {
        const val = container[k];
        if (Array.isArray(val) && !possibleFieldArrays.includes(val)) {
          possibleFieldArrays.push(val);
        }
      }
    }

    for (const arr of possibleFieldArrays) {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item || typeof item !== "object") continue;
          const key = item.label || item.name || item.key || item.id || item.title || item.tag;
          const val = item.value ?? item.val ?? item.text ?? item.values;
          if (key && val !== undefined && val !== null) {
            const rawKeyStr = String(key).trim();
            fieldsMap[rawKeyStr] = val;
            fieldsMap[rawKeyStr.toLowerCase()] = val;
          }
        }
      }
    }

    if (Object.keys(fieldsMap).length > 0) {
      objectsToSearch.unshift(fieldsMap);
    }

    const norm = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const stripFieldPrefix = (raw: string) => {
      return String(raw || "").toLowerCase().trim().replace(/^field[:_]/, "");
    };

    // Value finder across candidate objects
    const findValue = (matchFn: (normKey: string, rawKey: string, val: any) => boolean) => {
      // Pass 1: Prioritize scalar / primitive / string array values
      for (const obj of objectsToSearch) {
        for (const key of Object.keys(obj)) {
          const v = obj[key];
          if (v === undefined || v === null || v === "") continue;
          if (matchFn(norm(key), key, v)) {
            if (
              typeof v === "string" ||
              typeof v === "number" ||
              (Array.isArray(v) && (v.length === 0 || typeof v[0] !== "object"))
            ) {
              return v;
            }
          }
        }
      }

      // Pass 2: Complex nested objects (e.g. contact.name: { first, last })
      for (const obj of objectsToSearch) {
        for (const key of Object.keys(obj)) {
          const v = obj[key];
          if (v === undefined || v === null || v === "") continue;
          if (matchFn(norm(key), key, v)) {
            return v;
          }
        }
      }
      return null;
    };

    // --- 1. NAME EXTRACTION ---
    let name: string | null = null;
    const isNameKey = (k: string, raw: string) => {
      const lowerRaw = raw.toLowerCase().trim();
      if (
        [
          "campaignname",
          "formname",
          "adsetname",
          "companyname",
          "brandname",
          "cityname",
          "storename",
          "projectname",
        ].includes(k)
      ) {
        return false;
      }

      // 1. Explicit matching for submissions[] label "Full name"
      if (
        lowerRaw === "full name" ||
        lowerRaw === "fullname" ||
        lowerRaw === "name" ||
        lowerRaw === "your name" ||
        lowerRaw === "customer name" ||
        lowerRaw === "client name"
      ) {
        return true;
      }

      // 2. field:* dynamic keys: field:first_name_*, field:name_*, field:full_name_*
      if (lowerRaw.startsWith("field:") || lowerRaw.startsWith("field_")) {
        const stripped = stripFieldPrefix(raw);
        if (
          stripped.startsWith("first_name") ||
          stripped.startsWith("firstname") ||
          stripped.startsWith("full_name") ||
          stripped.startsWith("fullname") ||
          stripped.startsWith("name")
        ) {
          return true;
        }
      }

      // 3. Normalized key matches
      return (
        k === "name" ||
        k === "fullname" ||
        k === "yourname" ||
        k === "customername" ||
        k === "clientname" ||
        k === "leadsname" ||
        k === "leadname" ||
        k === "contactname" ||
        k.endsWith("fullname") ||
        k.endsWith("customername") ||
        k.endsWith("clientname")
      );
    };

    const rawName = findValue(isNameKey);
    if (rawName) {
      if (typeof rawName === "string" && rawName.trim()) {
        name = rawName.trim();
      } else if (typeof rawName === "number") {
        name = String(rawName).trim();
      } else if (typeof rawName === "object") {
        if (rawName.formatted) name = String(rawName.formatted).trim();
        else if (rawName.first || rawName.last) {
          const f = String(rawName.first || "").trim();
          const l = String(rawName.last || "").trim();
          if (f && l) {
            if (f.toLowerCase().includes(l.toLowerCase()) || l.toLowerCase().includes(f.toLowerCase())) {
              name = f.length >= l.length ? f : l;
            } else {
              name = `${f} ${l}`.trim();
            }
          } else {
            name = (f || l).trim();
          }
        } else if (rawName.name) {
          name = String(rawName.name).trim();
        }
      }
    }

    // First + Last name fallback (including contact.name.first or field:first_name_* / field:last_name_*)
    if (!name) {
      const firstName = findValue((k, raw) => {
        const lowerRaw = raw.toLowerCase().trim();
        const stripped = stripFieldPrefix(raw);
        return (
          lowerRaw === "first name" ||
          lowerRaw === "firstname" ||
          stripped.startsWith("first_name") ||
          stripped.startsWith("firstname") ||
          ["firstname", "first", "fname"].includes(k)
        );
      });
      const lastName = findValue((k, raw) => {
        const lowerRaw = raw.toLowerCase().trim();
        const stripped = stripFieldPrefix(raw);
        return (
          lowerRaw === "last name" ||
          lowerRaw === "lastname" ||
          stripped.startsWith("last_name") ||
          stripped.startsWith("lastname") ||
          ["lastname", "last", "lname"].includes(k)
        );
      });
      if (firstName || lastName) {
        name = `${firstName ? String(firstName).trim() : ""} ${lastName ? String(lastName).trim() : ""}`.trim();
      }
    }

    // Direct check for contact.name.first / contact.name.last if still not found
    if (!name) {
      const cName =
        root.contact?.name ||
        root.data?.contact?.name ||
        root.submission?.contact?.name;
      if (cName && typeof cName === "object") {
        if (cName.first || cName.last) {
          const f = String(cName.first || "").trim();
          const l = String(cName.last || "").trim();
          if (f && l) {
            if (f.toLowerCase().includes(l.toLowerCase()) || l.toLowerCase().includes(f.toLowerCase())) {
              name = f.length >= l.length ? f : l;
            } else {
              name = `${f} ${l}`.trim();
            }
          } else {
            name = (f || l).trim();
          }
        } else if (cName.formatted || cName.name) {
          name = String(cName.formatted || cName.name).trim();
        }
      } else if (typeof cName === "string" && cName.trim()) {
        name = cName.trim();
      }
    }

    // --- 2. PHONE EXTRACTION ---
    let phone: string | null = null;
    const isPhoneKey = (k: string, raw: string) => {
      const lowerRaw = raw.toLowerCase().trim();

      // 1. Explicit matching for submissions[] label "Phone"
      if (
        lowerRaw === "phone" ||
        lowerRaw === "phone number" ||
        lowerRaw === "your phone" ||
        lowerRaw === "mobile" ||
        lowerRaw === "mobile number" ||
        lowerRaw === "contact" ||
        lowerRaw === "contact number"
      ) {
        return true;
      }

      // 2. field:* dynamic keys: field:phone_4c77, field:phone_*, field:phone
      if (lowerRaw.startsWith("field:") || lowerRaw.startsWith("field_")) {
        const stripped = stripFieldPrefix(raw);
        if (
          stripped.startsWith("phone") ||
          stripped.startsWith("contact") ||
          stripped.startsWith("mobile") ||
          stripped.startsWith("cell")
        ) {
          return true;
        }
      }

      // 3. Normalized key matches
      return (
        k === "phone" ||
        k === "phones" ||
        k === "phonenumber" ||
        k === "yourphone" ||
        k === "yourphonenumber" ||
        k === "contact" ||
        k === "contactno" ||
        k === "contactnumber" ||
        k === "yourcontact" ||
        k === "mobile" ||
        k === "mobileno" ||
        k === "mobilenumber" ||
        k === "primaryphone" ||
        k === "cellphone" ||
        k.endsWith("phonenumber") ||
        k.endsWith("phone")
      );
    };

    const cleanPhone = (val: any): string | null => {
      if (!val) return null;
      let str = "";
      if (Array.isArray(val)) {
        const first = val[0];
        str =
          typeof first === "object"
            ? first?.phone || first?.number || first?.value || ""
            : String(first || "");
      } else if (typeof val === "object") {
        if (Array.isArray(val.phones) && val.phones.length > 0) {
          return cleanPhone(val.phones);
        }
        str = val.phone || val.number || val.value || val.mobile || val.contact || "";
      } else {
        str = String(val);
      }
      const digits = str.replace(/\D/g, "");
      if (digits.length >= 10) {
        return digits.slice(-10);
      }
      return null;
    };

    const rawPhone = findValue(isPhoneKey);
    phone = cleanPhone(rawPhone);

    // Direct check for contact.phone if still not found
    if (!phone) {
      const cPhone =
        root.contact?.phone ||
        root.data?.contact?.phone ||
        root.submission?.contact?.phone ||
        root.contact?.phones ||
        root.data?.contact?.phones;
      if (cPhone) {
        phone = cleanPhone(cPhone);
      }
    }

    // --- 3. CITY EXTRACTION ---
    let city: string | null = null;
    const isCityKey = (k: string, raw: string) => {
      const lowerRaw = raw.toLowerCase().trim();

      // 1. Explicit matching for submissions[] label "City"
      if (
        lowerRaw === "city" ||
        lowerRaw === "your city" ||
        lowerRaw === "location" ||
        lowerRaw === "project location"
      ) {
        return true;
      }

      // 2. field:* dynamic keys: field:city, field:city_*
      if (lowerRaw.startsWith("field:") || lowerRaw.startsWith("field_")) {
        const stripped = stripFieldPrefix(raw);
        if (
          stripped === "city" ||
          stripped.startsWith("city") ||
          stripped.startsWith("location") ||
          stripped.startsWith("address")
        ) {
          return true;
        }
      }

      // 3. Normalized key matches
      return (
        k === "city" ||
        k === "cityname" ||
        k === "yourcity" ||
        k === "location" ||
        k === "projectlocation" ||
        k === "sitelocation" ||
        k === "addressline" ||
        k === "addressline1" ||
        k === "address"
      );
    };

    const rawCity = findValue(isCityKey);
    if (typeof rawCity === "string" && rawCity.trim()) {
      city = rawCity.trim();
    } else if (typeof rawCity === "object" && rawCity !== null) {
      if (typeof rawCity.addressLine === "string" && rawCity.addressLine.trim()) city = rawCity.addressLine.trim();
      else if (typeof rawCity.city === "string" && rawCity.city.trim()) city = rawCity.city.trim();
      else if (typeof rawCity.name === "string" && rawCity.name.trim()) city = rawCity.name.trim();
      else if (typeof rawCity.value === "string") city = rawCity.value.trim();
    }

    // Direct check for contact.address.addressLine / contact.address.city
    if (!city) {
      const cAddr =
        root.contact?.address ||
        root.data?.contact?.address ||
        root.submission?.contact?.address;
      if (cAddr && typeof cAddr === "object") {
        city =
          cAddr.addressLine?.trim() ||
          cAddr.addressLine1?.trim() ||
          cAddr.city?.trim() ||
          cAddr.line1?.trim() ||
          null;
      }
    }

    // --- 4. REQUIREMENT EXTRACTION (handles string or array) ---
    let requirement: string | string[] | null = null;
    const isReqKey = (k: string, raw: string) => {
      const lowerRaw = raw.toLowerCase().trim();

      // 1. Explicit matching for submissions[] label "Requirement"
      if (
        lowerRaw === "requirement" ||
        lowerRaw === "requirements" ||
        lowerRaw === "your requirement" ||
        lowerRaw === "product" ||
        lowerRaw === "products"
      ) {
        return true;
      }

      // 2. field:* dynamic keys: field:requirement, field:requirement_*
      if (lowerRaw.startsWith("field:") || lowerRaw.startsWith("field_")) {
        const stripped = stripFieldPrefix(raw);
        if (
          stripped === "requirement" ||
          stripped.startsWith("requirement") ||
          stripped.startsWith("product") ||
          stripped.startsWith("modular") ||
          stripped.startsWith("service")
        ) {
          return true;
        }
      }

      // 3. Normalized key matches
      return (
        k === "requirement" ||
        k === "requirements" ||
        k === "yourrequirement" ||
        k === "product" ||
        k === "products" ||
        k === "modularsolution" ||
        k === "modularsolutions" ||
        k === "service" ||
        k === "services" ||
        k === "leadrequirement" ||
        k === "requirementtype" ||
        k === "lookingfor"
      );
    };

    const rawReq = findValue(isReqKey);
    if (rawReq) {
      if (Array.isArray(rawReq)) {
        const cleaned = rawReq
          .map((item) => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object") {
              return item.name || item.title || item.value || item.label || "";
            }
            return String(item || "").trim();
          })
          .filter(Boolean);
        if (cleaned.length === 1) {
          requirement = cleaned[0];
        } else if (cleaned.length > 1) {
          requirement = cleaned;
        }
      } else if (typeof rawReq === "string" && rawReq.trim()) {
        requirement = rawReq.trim();
      }
    }

    // --- 5. EMAIL (optional) ---
    let email: string | null = null;
    const isEmailKey = (k: string, raw: string) => {
      const lowerRaw = raw.toLowerCase().trim();
      if (lowerRaw === "email" || lowerRaw === "email address") return true;
      if (lowerRaw.startsWith("field:") || lowerRaw.startsWith("field_")) {
        const stripped = stripFieldPrefix(raw);
        if (stripped.startsWith("email") || stripped.startsWith("mail")) return true;
      }
      return ["email", "emailid", "emailaddress", "mail", "youremail"].includes(k);
    };

    const rawEmail = findValue(isEmailKey);
    if (typeof rawEmail === "string" && rawEmail.includes("@")) {
      email = rawEmail.trim();
    } else if (Array.isArray(rawEmail) && rawEmail[0] && String(rawEmail[0]).includes("@")) {
      email = String(rawEmail[0]).trim();
    } else if (typeof rawEmail === "object" && rawEmail?.email) {
      email = String(rawEmail.email).trim();
    }

    if (!email) {
      const cEmail =
        root.contact?.email ||
        root.data?.contact?.email ||
        root.submission?.contact?.email;
      if (typeof cEmail === "string" && cEmail.includes("@")) {
        email = cEmail.trim();
      }
    }

    return { name, phone, city, requirement, email };
  };

  /**
   * Validates a vendor for online lead creation:
   * - Must exist in VendorMaster
   * - status must be 'active'
   * - is_online_lead_feature_enabled must be true
   */
  validateVendor = async (
    vendorId: number
  ): Promise<{ valid: boolean; statusCode?: number; error?: string; vendor?: any }> => {
    if (!vendorId || isNaN(vendorId) || vendorId <= 0) {
      return {
        valid: false,
        statusCode: 400,
        error: "Valid vendor ID is required.",
      };
    }

    const vendor = await prisma.vendorMaster.findUnique({
      where: { id: Number(vendorId) },
      select: {
        id: true,
        vendor_name: true,
        vendor_code: true,
        status: true,
        is_online_lead_feature_enabled: true,
      },
    });

    if (!vendor) {
      return {
        valid: false,
        statusCode: 404,
        error: `Vendor with ID ${vendorId} does not exist.`,
      };
    }

    if (vendor.status !== "active") {
      return {
        valid: false,
        statusCode: 403,
        error: `Vendor '${vendor.vendor_name}' (ID: ${vendor.id}) is inactive.`,
      };
    }

    if (!vendor.is_online_lead_feature_enabled) {
      return {
        valid: false,
        statusCode: 403,
        error: `Online lead feature is disabled for vendor '${vendor.vendor_name}' (ID: ${vendor.id}). 'is_online_lead_feature_enabled' must be true.`,
      };
    }

    return { valid: true, vendor };
  };

  /**
   * Validates a vendor using their vendor_token:
   * - Must exist in vendorTokens table
   * - Must not be expired
   * - Associated VendorMaster must exist
   * - Vendor status must be 'active'
   * - is_online_lead_feature_enabled must be true
   */
  validateVendorToken = async (
    token: string
  ): Promise<{ valid: boolean; statusCode?: number; error?: string; vendor?: any; tokenRecord?: any }> => {
    if (!token || typeof token !== "string" || !token.trim()) {
      return {
        valid: false,
        statusCode: 400,
        error: "vendor_token query parameter is required (e.g. ?vendor_token=<VENDOR_TOKEN>)",
      };
    }

    const tokenEntry = await prisma.vendorTokens.findFirst({
      where: {
        token: token.trim(),
      },
      include: {
        vendor: {
          select: {
            id: true,
            vendor_name: true,
            vendor_code: true,
            status: true,
            is_online_lead_feature_enabled: true,
          },
        },
      },
    });

    if (!tokenEntry || !tokenEntry.vendor) {
      return {
        valid: false,
        statusCode: 401,
        error: "Invalid vendor_token. No matching vendor found for this token.",
      };
    }

    if (tokenEntry.expiry_date && new Date(tokenEntry.expiry_date) <= new Date()) {
      return {
        valid: false,
        statusCode: 401,
        error: "vendor_token has expired or been revoked.",
      };
    }

    if (tokenEntry.vendor.status !== "active") {
      return {
        valid: false,
        statusCode: 403,
        error: `Vendor '${tokenEntry.vendor.vendor_name}' (ID: ${tokenEntry.vendor.id}) is inactive.`,
      };
    }

    if (!tokenEntry.vendor.is_online_lead_feature_enabled) {
      return {
        valid: false,
        statusCode: 403,
        error: `Online lead feature is disabled for vendor '${tokenEntry.vendor.vendor_name}' (ID: ${tokenEntry.vendor.id}). 'is_online_lead_feature_enabled' must be true.`,
      };
    }

    return { valid: true, vendor: tokenEntry.vendor, tokenRecord: tokenEntry };
  };

  /**
   * Flow B: Processes an existing record in wix_studio_data_capture table by its ID.
   * Reuses the ONE common processWixPayload service method.
   */
  processCapturedRecordById = async (
    recordId: number,
    req?: Request,
    explicitVendorId?: number
  ): Promise<ProcessWixLeadResult> => {
    const record = await prisma.wixStudioDataCapture.findUnique({
      where: { id: recordId },
    });

    if (!record) {
      logger.warn(`[WIX STUDIO] Capture record with ID ${recordId} not found in database.`);
      return {
        found: false,
        leadCreated: false,
        reason: `Record with ID ${recordId} not found in wix_studio_data_capture`,
      };
    }

    // Resolve target vendor from explicit override or the dedicated vendor_id column
    const targetVendorId = explicitVendorId || record.vendor_id;

    // Delegate to the single common processing service with this record's payload
    const result = await this.processWixPayload(record.payload, {
      req,
      captureRecordId: record.id,
      explicitVendorId: targetVendorId ? Number(targetVendorId) : undefined,
    });

    return { ...result, found: true };
  };

  /**
   * Flow C: Finds the oldest unprocessed record in wix_studio_data_capture
   * and processes it into Lead Pool for the specified vendor.
   * - Evaluates records in ascending order (oldest first: id ASC).
   * - Checks that the record has valid required fields (name, phone, city, requirement).
   * - Checks that no lead with this contact already exists in online_leads for this vendor.
   * - Creates the lead in Lead Pool for this vendor.
   */
  processOldestUnprocessedRecord = async (
    vendorId: number,
    req?: Request
  ): Promise<{
    processed: boolean;
    recordId?: number;
    leadCreated?: boolean;
    lead?: any;
    leadId?: number;
    leadCode?: string;
    isNew?: boolean;
    reason?: string;
    missingFields?: string[];
  }> => {
    // 1. Fetch only records belonging to this vendor ordered by oldest first (id ASC)
    // Filter ONLY by the dedicated vendor_id column in wix_studio_data_capture
    const records = await prisma.wixStudioDataCapture.findMany({
      where: {
        vendor_id: vendorId,
      },
      orderBy: { id: "asc" },
    });

    for (const record of records) {
      // 2. Extract lead fields directly from the original Wix payload
      const extracted = this.extractWixStudioLeadData(record.payload);
      const { name, phone, city, requirement } = extracted;

      // 3. Check if required fields are present (name, phone, city)
      const missingFields: string[] = [];
      if (!name || !name.trim()) missingFields.push("name");
      if (!phone || phone.length < 10) missingFields.push("phone");
      if (!city || !city.trim()) missingFields.push("city");

      if (missingFields.length > 0 || !phone) {
        // Skip invalid records
        continue;
      }

      // 4. Duplicate Check: Check if lead already exists in online_leads for this vendor
      const cleanDigits = String(phone).replace(/\D/g, "");
      const normalizedPhone = cleanDigits.slice(-10);

      const existingLead = await prisma.online_leads.findFirst({
        where: {
          vendor_id: vendorId,
          OR: [
            { contact: normalizedPhone },
            { contact: cleanDigits },
            { contact: String(phone).trim() },
            { contact: `+91${normalizedPhone}` },
            { contact: `91${normalizedPhone}` },
          ],
        },
        select: { id: true, lead_code: true },
      });

      if (existingLead) {
        // Already exists for this vendor -> already processed, move to next oldest
        continue;
      }

      // 5. Found the oldest valid unprocessed record! Process it now into Lead Pool:
      const result = await this.processWixPayload(record.payload, {
        req,
        captureRecordId: record.id,
        explicitVendorId: vendorId,
      });

      return {
        processed: true,
        recordId: record.id,
        leadCreated: result.leadCreated,
        lead: result.lead,
        leadId: result.lead?.id,
        leadCode: result.lead?.lead_code,
        isNew: result.isNew,
        reason: result.reason,
        missingFields: result.missingFields,
      };
    }

    // If all records have been evaluated and none are pending
    return {
      processed: false,
      reason: `No pending unprocessed Wix Studio records found for vendor ID ${vendorId}`,
    };
  };

  /**
   * Batch processes all new/unprocessed records in wix_studio_data_capture.
   * - Automatically finds newly added/unprocessed records.
   * - Uses each record's stored/resolved vendor_id (or filters by filterVendorId if provided).
   * - Prevents duplicate leads: if an online_lead with the same phone already exists for the vendor, it is skipped.
   * - Creates new leads only for valid, un-created records.
   */
  processAllUnprocessedRecords = async (options?: {
    filterVendorId?: number;
    req?: Request;
  }) => {
    const filterVendorId = options?.filterVendorId;
    const records = await prisma.wixStudioDataCapture.findMany({
      where: filterVendorId
        ? { vendor_id: filterVendorId }
        : { vendor_id: { not: null } },
      orderBy: { id: "asc" },
    });

    const results: Array<{
      capture_id: number;
      status: "created" | "already_processed" | "skipped";
      vendor_id?: number;
      lead_id?: number;
      lead_code?: string;
      reason?: string;
      missing_fields?: string[];
    }> = [];

    let createdCount = 0;
    let alreadyProcessedCount = 0;
    let skippedCount = 0;

    for (const record of records) {
      const vendorId = record.vendor_id;

      if (!vendorId) {
        skippedCount++;
        results.push({
          capture_id: record.id,
          status: "skipped",
          reason: "No vendor_id assigned to this capture record",
        });
        continue;
      }

      if (filterVendorId && vendorId !== filterVendorId) {
        continue;
      }

      // 2. Validate vendor
      const vendorCheck = await this.validateVendor(vendorId);
      if (!vendorCheck.valid) {
        skippedCount++;
        results.push({
          capture_id: record.id,
          vendor_id: vendorId,
          status: "skipped",
          reason: vendorCheck.error,
        });
        continue;
      }

      // 3. Extract fields (name, phone, city are required; requirement is optional)
      const extracted = this.extractWixStudioLeadData(record.payload);
      const { name, phone, city, requirement } = extracted;
      const missingFields: string[] = [];
      if (!name || !name.trim()) missingFields.push("name");
      if (!phone || phone.length < 10) missingFields.push("phone");
      if (!city || !city.trim()) missingFields.push("city");

      if (missingFields.length > 0 || !phone) {
        skippedCount++;
        results.push({
          capture_id: record.id,
          vendor_id: vendorId,
          status: "skipped",
          missing_fields: missingFields,
          reason: `Missing required field(s): ${missingFields.join(", ")}`,
        });
        continue;
      }

      // 4. Duplicate Check: Check if lead already exists in online_leads for this vendor
      const cleanDigits = String(phone).replace(/\D/g, "");
      const normalizedPhone = cleanDigits.slice(-10);

      const existingLead = await prisma.online_leads.findFirst({
        where: {
          vendor_id: vendorId,
          OR: [
            { contact: normalizedPhone },
            { contact: cleanDigits },
            { contact: String(phone).trim() },
            { contact: `+91${normalizedPhone}` },
            { contact: `91${normalizedPhone}` },
          ],
        },
        select: { id: true, lead_code: true },
      });

      if (existingLead) {
        alreadyProcessedCount++;
        results.push({
          capture_id: record.id,
          vendor_id: vendorId,
          status: "already_processed",
          lead_id: existingLead.id,
          lead_code: existingLead.lead_code || undefined,
          reason: `Lead already exists in Lead Pool (ID: ${existingLead.id}, Code: ${existingLead.lead_code})`,
        });
        continue;
      }

      // 5. Create new lead in Lead Pool
      const leadResult = await this.processWixPayload(record.payload, {
        captureRecordId: record.id,
        explicitVendorId: vendorId,
      });

      if (leadResult.leadCreated) {
        createdCount++;
        results.push({
          capture_id: record.id,
          vendor_id: vendorId,
          status: "created",
          lead_id: leadResult.lead?.id,
          lead_code: leadResult.lead?.lead_code,
        });
      } else {
        skippedCount++;
        results.push({
          capture_id: record.id,
          vendor_id: vendorId,
          status: "skipped",
          reason: leadResult.reason,
          missing_fields: leadResult.missingFields,
        });
      }
    }

    return {
      total_records_evaluated: records.length,
      leads_created: createdCount,
      already_processed: alreadyProcessedCount,
      skipped: skippedCount,
      results,
    };
  };

  /**
   * The ONE COMMON processing service used for both:
   * 1. New incoming Wix API requests (Flow A)
   * 2. Existing / manual wix_studio_data_capture DB rows (Flow B)
   * 3. Batch auto-process of unprocessed records (Flow C)
   *
   * Validates required fields, checks vendor online lead feature flag,
   * and creates or updates a lead into the Lead Pool idempotently.
   */
  processWixPayload = async (
    rawPayload: any,
    options?: { req?: Request; captureRecordId?: number; explicitVendorId?: number }
  ): Promise<ProcessWixLeadResult> => {
    const captureRecordId = options?.captureRecordId;

    // 1. Resolve vendor_id (Priority: explicitVendorId -> query/header vendor_token -> dynamic fallback)
    let vendorId: number | null = options?.explicitVendorId || null;

    if (!vendorId && options?.req) {
      const qVendorToken =
        options.req.query?.vendor_token ||
        options.req.query?.vendorToken ||
        options.req.headers?.["x-vendor-token"] ||
        options.req.headers?.["vendor_token"] ||
        options.req.headers?.["vendor-token"];
      if (qVendorToken && typeof qVendorToken === "string" && qVendorToken.trim()) {
        const tokenCheck = await this.validateVendorToken(qVendorToken.trim());
        if (tokenCheck.valid && tokenCheck.vendor?.id) {
          vendorId = tokenCheck.vendor.id;
        }
      }
    }

    if (!vendorId) {
      const req = this.buildVendorResolutionRequest(rawPayload, options?.req);
      const vendorResolution = await resolveTargetOnlineLeadVendor(req);
      if (vendorResolution.error || !vendorResolution.vendorId) {
        logger.warn(
          `[WIX STUDIO] Lead creation skipped${captureRecordId ? ` for capture ID ${captureRecordId}` : ""}: ${vendorResolution.error}`
        );
        return {
          leadCreated: false,
          reason: vendorResolution.error || "Unable to resolve target vendor",
        };
      }
      vendorId = vendorResolution.vendorId;
    }

    // 2. Validate VendorMaster.is_online_lead_feature_enabled === true
    const vendorCheck = await this.validateVendor(vendorId);
    if (!vendorCheck.valid) {
      logger.warn(
        `[WIX STUDIO] Lead creation skipped${captureRecordId ? ` for capture ID ${captureRecordId}` : ""}: ${vendorCheck.error}`
      );
      return {
        leadCreated: false,
        reason: vendorCheck.error,
      };
    }

    // 3. Extract fields (name, phone, city are required; requirement is optional)
    const extracted = this.extractWixStudioLeadData(rawPayload);

    // 4. Validate required fields (city, name, phone)
    const { name, phone, city, requirement, email } = extracted;
    const missingFields: string[] = [];
    if (!name || !name.trim()) missingFields.push("name");
    if (!phone || phone.length < 10) missingFields.push("phone");
    if (!city || !city.trim()) missingFields.push("city");

    if (missingFields.length > 0 || !name || !phone || !city) {
      logger.warn(
        `[WIX STUDIO] Missing required field(s) for Lead Pool lead creation: [${missingFields.join(", ")}]${captureRecordId ? ` (Capture Record ID: ${captureRecordId})` : ""}`
      );
      return {
        leadCreated: false,
        missingFields,
        reason: `Missing required field(s): ${missingFields.join(", ")}`,
      };
    }

    // Format optional requirement and product types
    let productTypes: string[] = [];
    let formattedRemark = "-";

    if (
      requirement &&
      !(Array.isArray(requirement) && requirement.length === 0) &&
      !(typeof requirement === "string" && !requirement.trim())
    ) {
      const reqVal: string | string[] = requirement;
      const requirementStr = Array.isArray(reqVal)
        ? reqVal.join(", ")
        : String(reqVal).trim();

      productTypes = Array.isArray(reqVal)
        ? reqVal
        : reqVal.includes(",")
        ? reqVal.split(",").map((s) => s.trim()).filter(Boolean)
        : [reqVal.trim()];

      formattedRemark = `Requirement: ${requirementStr}`;
    }

    // 5. Reuse existing Lead Pool lead creation flow (createOrUpdateOnlineLead)
    // assign_to: null sends the lead directly into the unassigned Lead Pool
    // Idempotent: If contact exists for this vendor, it updates the existing lead without duplicating
    const leadResult = await createOrUpdateOnlineLead({
      vendor_id: vendorId,
      leads_name: name.trim(),
      contact: phone,
      city: city.trim(),
      source: "Wix Studio",
      email: email || null,
      remark: formattedRemark,
      product_types: productTypes,
      assign_to: null,
      lead_entry_type: LeadEntryType.ONLINE,
      priority: "Medium",
    });

    logger.info(
      `[WIX STUDIO] Successfully ${leadResult.isNew ? "created" : "updated"} lead in Lead Pool. ID: ${leadResult.lead.id}, Code: ${leadResult.lead.lead_code}${captureRecordId ? ` (Capture Record ID: ${captureRecordId})` : ""}`
    );

    return {
      leadCreated: true,
      lead: leadResult.lead,
      isNew: leadResult.isNew,
    };
  };

  /**
   * Helper to merge vendor indicators from payload into request for resolveTargetOnlineLeadVendor
   */
  private buildVendorResolutionRequest = (rawPayload: any, req?: Request): Request => {
    const root = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
    const payloadVendorToken =
      root?.vendor_token || root?.vendorToken || root?.metadata?.vendor_token;
    const payloadVendorCode =
      root?.vendor_code || root?.vendorCode || root?.metadata?.vendor_code;

    if (req) {
      // If request exists, enrich req.body with payload vendor fields if not already present
      const currentBody = typeof req.body === "object" && req.body !== null ? req.body : {};
      const enrichedBody = { ...currentBody };

      if (payloadVendorToken && !req.query?.vendor_token && !enrichedBody.vendor_token) {
        enrichedBody.vendor_token = payloadVendorToken;
      }
      if (payloadVendorCode && !req.query?.vendor_code && !enrichedBody.vendor_code) {
        enrichedBody.vendor_code = payloadVendorCode;
      }
      req.body = enrichedBody;
      return req;
    }

    // If no request provided, construct a minimal Request-like object
    return {
      query: {},
      headers: {},
      body: {
        vendor_token: payloadVendorToken,
        vendor_code: payloadVendorCode,
      },
    } as unknown as Request;
  };
}

export const wixStudioService = new WixStudioService();
