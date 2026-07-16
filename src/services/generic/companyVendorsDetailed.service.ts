import { prisma } from "../../prisma/client";
import { uploadToWasabiCompanyVendorDocument } from "../../utils/wasabiClient";
import { generateSignedUrl } from "../../utils/wasabiClient";

export class CompanyVendorsDetailedService {
  private async resolveOrCreateCity(tx: any, stateId: number, cityInput: any): Promise<number> {
    if (cityInput && typeof cityInput === "object") {
      const idVal = Number(cityInput.id || cityInput.city_id);
      if (!isNaN(idVal) && idVal > 0) {
        return idVal;
      }
      cityInput = cityInput.name || cityInput.city_name || cityInput.city;
    }

    const parsedId = Number(cityInput);
    if (!isNaN(parsedId) && parsedId > 0) {
      return parsedId;
    }

    if (typeof cityInput === "string" && cityInput.trim()) {
      const cityName = cityInput.trim();
      const existingCity = await tx.cityMaster.findFirst({
        where: {
          state_id: stateId,
          name: {
            equals: cityName,
            mode: "insensitive",
          },
        },
      });

      if (existingCity) {
        return existingCity.id;
      }

      const newCity = await tx.cityMaster.create({
        data: {
          name: cityName,
          state_id: stateId,
        },
      });

      return newCity.id;
    }

    throw new Error("A valid City is required");
  }
  /**
   * Fetch all meta-data dropdowns needed for the 5-tab form
   */
  async getCompanyVendorMetaData(vendorId: number) {
    const [vendorTypes, statuses, documentTypes, states, cities, paymentTerms] = await Promise.all([
      prisma.vendorTypeMaster.findMany({
        where: { is_deleted: false },
        select: { id: true, vendor_type_name: true },
      }),
      prisma.companyVendorStatusMaster.findMany({
        where: { is_deleted: false },
        select: { id: true, status_name: true },
      }),
      prisma.companyVendorDocumentMaster.findMany({
        where: { is_deleted: false },
        select: { id: true, document_name: true },
      }),
      prisma.stateMaster.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.cityMaster.findMany({
        select: { id: true, name: true, state_id: true },
        orderBy: { name: "asc" },
      }),
      prisma.paymentTermMaster.findMany({
        where: { vendor_id: vendorId, is_active: true },
        select: { id: true, term_name: true },
      }),
    ]);

    return {
      vendorTypes,
      statuses,
      documentTypes,
      states,
      cities,
      paymentTerms,
    };
  }

  /**
   * Get a detailed company vendor by ID (with all relations)
   */
  async getDetailedCompanyVendorById(id: number) {
    const vendor = await prisma.companyVendorsMaster.findUnique({
      where: { id, is_deleted: false },
      include: {
        vendorTypes: {
          where: { is_deleted: false },
          include: { vendorType: true },
        },
        contactPersons: {
          where: { is_deleted: false },
        },
        bankAccounts: {
          where: { is_deleted: false },
        },
        documents: {
          where: { is_deleted: false },
          include: { documentType: true },
        },
        addresses: {
          where: { is_deleted: false },
          include: { state: true, city: true },
        },
        status: true,
        defaultPaymentTerm: true,
      },
    });

    if (!vendor) {
      const error = new Error("Company vendor not found");
      (error as any).statusCode = 404;
      throw error;
    }

    // Generate pre-signed URLs for files
    const bankAccountsWithUrls = await Promise.all(
      vendor.bankAccounts.map(async (bank) => {
        if (bank.cancelled_cheque_path) {
          try {
            const url = await generateSignedUrl(bank.cancelled_cheque_path, 3600);
            return { ...bank, cancelled_cheque_url: url };
          } catch (e) {
            console.error("Error generating signed URL for bank cheque:", e);
          }
        }
        return bank;
      })
    );

    const documentsWithUrls = await Promise.all(
      vendor.documents.map(async (doc) => {
        if (doc.file_path) {
          try {
            const url = await generateSignedUrl(doc.file_path, 3600);
            return { ...doc, document_url: url };
          } catch (e) {
            console.error("Error generating signed URL for doc:", e);
          }
        }
        return doc;
      })
    );

    return {
      ...vendor,
      bankAccounts: bankAccountsWithUrls,
      documents: documentsWithUrls,
    };
  }

  /**
   * Create a detailed company vendor
   */
  async createDetailedCompanyVendor(
    vendorId: number,
    payload: any,
    uploadedFiles: { [fieldname: string]: Express.Multer.File[] },
    userId: number
  ) {
    const data = typeof payload.data === "string" ? JSON.parse(payload.data) : payload;

    const {
      vendor_code,
      company_name,
      vendor_name,
      vendor_types, // Array of number IDs
      in_house,
      alternate_mobile_no,
      alternate_email,
      gst_no,
      pan_no,
      payment_term_id,
      status_id,
      addresses, // Array of address objects
      contacts, // Array of contact objects
      bank_accounts, // Array of bank details
      documents, // Array of document types mapping objects { document_type_id }
    } = data;

    // Validate mandatory fields
    if (!vendor_code) throw this.badRequest("vendor_code is mandatory");
    if (!company_name) throw this.badRequest("company_name is mandatory");
    if (!vendor_types || !Array.isArray(vendor_types) || vendor_types.length === 0) {
      throw this.badRequest("At least one vendor type must be selected");
    }

    // Check duplicate code
    const existingCode = await prisma.companyVendorsMaster.findFirst({
      where: { vendor_code, is_deleted: false },
    });
    if (existingCode) {
      throw this.conflict(`vendor_code "${vendor_code}" is already in use`);
    }

    // Check duplicate GST
    if (gst_no) {
      const existingGST = await prisma.companyVendorsMaster.findFirst({
        where: { gst_no, is_deleted: false },
      });
      if (existingGST) {
        throw this.conflict(`gst_no "${gst_no}" is already in use`);
      }
    }

    // Check duplicate PAN
    if (pan_no) {
      const existingPAN = await prisma.companyVendorsMaster.findFirst({
        where: { pan_no, is_deleted: false },
      });
      if (existingPAN) {
        throw this.conflict(`pan_no "${pan_no}" is already in use`);
      }
    }

    // Validate address rule if provided
    if (addresses && Array.isArray(addresses) && addresses.length > 0) {
      const primaryAddresses = addresses.filter((a: any) => a.is_primary === true);
      if (primaryAddresses.length > 1) {
        throw this.badRequest("Only one primary address can be specified");
      }
    }

    // Validate bank rules if provided
    if (bank_accounts && Array.isArray(bank_accounts) && bank_accounts.length > 0) {
      const defaultBanks = bank_accounts.filter((b: any) => b.is_default === true);
      if (defaultBanks.length > 1) {
        throw this.badRequest("Only one bank account can be marked as default");
      }
      
      // Enforce IFSC code format
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      for (const account of bank_accounts) {
        if (account.account_no && !/^\d{9,18}$/.test(account.account_no)) {
          throw this.badRequest(`Account number "${account.account_no}" must be numeric and between 9 to 18 digits`);
        }
        if (account.ifsc && !ifscRegex.test(account.ifsc)) {
          throw this.badRequest(`IFSC code "${account.ifsc}" is invalid. Must match format (e.g., SBIN0001234)`);
        }
      }
    }

    // Validate contacts rule if provided
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      const primaryContacts = contacts.filter((c: any) => c.is_primary === true);
      if (primaryContacts.length > 1) {
        throw this.badRequest("Only one primary contact person can be specified");
      }
    }

    // Handle File Uploads
    // 1. Bank Account Cheques
    const bankChequeKeys: (string | null)[] = [];
    if (bank_accounts && Array.isArray(bank_accounts)) {
      for (let i = 0; i < bank_accounts.length; i++) {
        const fieldname = `cancelled_cheque_${i}`;
        const file = uploadedFiles[fieldname]?.[0];
        if (file) {
          const key = await uploadToWasabiCompanyVendorDocument(file.buffer, vendorId, file.originalname, file.mimetype);
          bankChequeKeys.push(key);
        } else {
          bankChequeKeys.push(null);
        }
      }
    }

    // 2. Tab 5 Documents
    const documentKeys: string[] = [];
    if (documents && Array.isArray(documents)) {
      for (let i = 0; i < documents.length; i++) {
        const fieldname = `document_file_${i}`;
        const file = uploadedFiles[fieldname]?.[0];
        if (file) {
          const key = await uploadToWasabiCompanyVendorDocument(file.buffer, vendorId, file.originalname, file.mimetype);
          documentKeys.push(key);
        } else if (documents[i].file_path) {
          documentKeys.push(documents[i].file_path);
        } else {
          documentKeys.push("");
        }
      }
    }

    // Run Transaction to insert in database
    const newVendor = await prisma.$transaction(async (tx) => {
      // Sync legacy POC fields
      let legacyPOC = "";
      let legacyPhone = "";
      let legacyEmail = "";
      if (contacts && Array.isArray(contacts) && contacts.length > 0) {
        const prim = contacts.find((c: any) => c.is_primary === true);
        if (prim) {
          legacyPOC = prim.name;
          legacyPhone = prim.phone;
          legacyEmail = prim.email || "";
        }
      }

      // Create primary vendor record with legacy fields populated for backward compatibility
      const vendorRecord = await tx.companyVendorsMaster.create({
        data: {
          vendor_id: vendorId,
          vendor_code,
          company_name,
          vendor_name: vendor_name ? vendor_name.trim() : company_name.trim(),
          point_of_contact: legacyPOC,
          contact_no: legacyPhone,
          email: legacyEmail,
          address: (addresses && addresses.length > 0) ? addresses[0].address_line_1 : "",
          alternate_mobile_no: alternate_mobile_no || null,
          alternate_email: alternate_email || null,
          gst_no: gst_no || null,
          pan_no: pan_no || null,
          in_house: in_house === true || in_house === "true",
          status_id: status_id ? Number(status_id) : 1,
          default_payment_term_id: payment_term_id ? Number(payment_term_id) : null,
          created_by: userId,
          updated_by: userId,
        },
      });

      const companyVendorId = vendorRecord.id;

      // 1. Create Addresses
      if (addresses && Array.isArray(addresses)) {
        await Promise.all(
          addresses.map(async (addr: any) => {
            const stateId = Number(addr.state_id);
            const cityId = await this.resolveOrCreateCity(tx, stateId, addr.city_id);
            return tx.companyVendorAddress.create({
              data: {
                company_vendor_id: companyVendorId,
                address_line_1: addr.address_line_1,
                address_line_2: addr.address_line_2 || null,
                landmark: addr.landmark || null,
                pincode: addr.pincode,
                state_id: stateId,
                city_id: cityId,
                is_primary: addr.is_primary === true || addr.is_primary === "true",
                created_by: userId,
                updated_by: userId,
              },
            });
          })
        );
      }

      // 2. Create Contacts
      if (contacts && Array.isArray(contacts)) {
        const contactRecords = await Promise.all(
          contacts.map((contact: any) =>
            tx.companyVendorContactPerson.create({
              data: {
                company_vendor_id: companyVendorId,
                name: contact.name,
                department: contact.department || null,
                phone: contact.phone,
                designation: contact.designation || null,
                email: contact.email || null,
                is_primary: contact.is_primary === true || contact.is_primary === "true",
                created_by: userId,
                updated_by: userId,
              },
            })
          )
        );

        // Link primary_contact_id back to CompanyVendorsMaster
        const primaryContactRecord = contactRecords.find((c) => c.is_primary === true);
        if (primaryContactRecord) {
          await tx.companyVendorsMaster.update({
            where: { id: companyVendorId },
            data: { primary_contact_id: primaryContactRecord.id },
          });
        }
      }

      // 3. Create Bank Accounts
      if (bank_accounts && Array.isArray(bank_accounts)) {
        await Promise.all(
          bank_accounts.map((bank: any, idx: number) =>
            tx.companyVendorBankAccount.create({
              data: {
                company_vendor_id: companyVendorId,
                holder_name: bank.holder_name,
                account_no: bank.account_no,
                ifsc: bank.ifsc,
                swift: bank.swift || null,
                branch: bank.branch,
                cancelled_cheque_path: bankChequeKeys[idx] || null,
                is_default: bank.is_default === true || bank.is_default === "true",
                created_by: userId,
                updated_by: userId,
              },
            })
          )
        );
      }

      // 4. Create Vendor Types Mapping
      await Promise.all(
        vendor_types.map((typeId: any) =>
          tx.companyVendorTypeMapping.create({
            data: {
              company_vendor_id: companyVendorId,
              vendor_type_id: Number(typeId),
              created_by: userId,
              updated_by: userId,
            },
          })
        )
      );

      // 5. Create Document Mapping
      if (documents && Array.isArray(documents)) {
        await Promise.all(
          documents.map((doc: any, idx: number) => {
            if (documentKeys[idx]) {
              return tx.companyVendorDocumentMapping.create({
                data: {
                  company_vendor_id: companyVendorId,
                  document_type_id: Number(doc.document_type_id),
                  file_path: documentKeys[idx],
                  created_by: userId,
                  updated_by: userId,
                },
              });
            }
            return Promise.resolve();
          })
        );
      }

      return vendorRecord;
    });

    return newVendor;
  }

  /**
   * Update detailed company vendor
   */
  async updateDetailedCompanyVendor(
    vendorId: number,
    companyVendorId: number,
    payload: any,
    uploadedFiles: { [fieldname: string]: Express.Multer.File[] },
    userId: number
  ) {
    const data = typeof payload.data === "string" ? JSON.parse(payload.data) : payload;

    const existingVendor = await prisma.companyVendorsMaster.findUnique({
      where: { id: companyVendorId, vendor_id: vendorId, is_deleted: false },
      include: {
        addresses: { where: { is_deleted: false } },
        contactPersons: { where: { is_deleted: false } },
        bankAccounts: { where: { is_deleted: false } },
        documents: { where: { is_deleted: false } },
        vendorTypes: { where: { is_deleted: false } },
      },
    });

    if (!existingVendor) {
      const error = new Error("Company vendor not found");
      (error as any).statusCode = 404;
      throw error;
    }

    const {
      vendor_code,
      company_name,
      vendor_name,
      vendor_types, // Array of number IDs
      in_house,
      alternate_mobile_no,
      alternate_email,
      gst_no,
      pan_no,
      payment_term_id,
      status_id,
      addresses,
      contacts,
      bank_accounts,
      documents,
    } = data;

    // Validate duplicate code if changed
    if (vendor_code && vendor_code !== existingVendor.vendor_code) {
      const duplicateCode = await prisma.companyVendorsMaster.findFirst({
        where: { vendor_code, is_deleted: false, NOT: { id: companyVendorId } },
      });
      if (duplicateCode) throw this.conflict(`vendor_code "${vendor_code}" is already in use`);
    }

    // Validate duplicate GST if changed
    if (gst_no && gst_no !== existingVendor.gst_no) {
      const duplicateGST = await prisma.companyVendorsMaster.findFirst({
        where: { gst_no, is_deleted: false, NOT: { id: companyVendorId } },
      });
      if (duplicateGST) throw this.conflict(`gst_no "${gst_no}" is already in use`);
    }

    // Validate duplicate PAN if changed
    if (pan_no && pan_no !== existingVendor.pan_no) {
      const duplicatePAN = await prisma.companyVendorsMaster.findFirst({
        where: { pan_no, is_deleted: false, NOT: { id: companyVendorId } },
      });
      if (duplicatePAN) throw this.conflict(`pan_no "${pan_no}" is already in use`);
    }

    // Validations on relationships if provided
    if (addresses && Array.isArray(addresses) && addresses.length > 0) {
      const primaryAddresses = addresses.filter((a: any) => a.is_primary === true || a.is_primary === "true");
      if (primaryAddresses.length > 1) throw this.badRequest("Only one primary address can be specified");
    }

    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      const primaryContacts = contacts.filter((c: any) => c.is_primary === true || c.is_primary === "true");
      if (primaryContacts.length > 1) throw this.badRequest("Only one primary contact person can be specified");
    }

    if (bank_accounts && Array.isArray(bank_accounts) && bank_accounts.length > 0) {
      const defaultBanks = bank_accounts.filter((b: any) => b.is_default === true || b.is_default === "true");
      if (defaultBanks.length > 1) throw this.badRequest("Only one bank account can be marked as default");

      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      for (const account of bank_accounts) {
        if (account.account_no && !/^\d{9,18}$/.test(account.account_no)) {
          throw this.badRequest(`Account number "${account.account_no}" must be numeric and between 9 to 18 digits`);
        }
        if (account.ifsc && !ifscRegex.test(account.ifsc)) {
          throw this.badRequest(`IFSC code "${account.ifsc}" is invalid. Must match format (e.g., SBIN0001234)`);
        }
      }
    }

    // Handle Uploading files
    // 1. Bank Cheques
    const bankChequePaths: { [key: number]: string | null } = {};
    if (bank_accounts && Array.isArray(bank_accounts)) {
      for (let i = 0; i < bank_accounts.length; i++) {
        const account = bank_accounts[i];
        const fieldname = `cancelled_cheque_${i}`;
        const file = uploadedFiles[fieldname]?.[0];
        if (file) {
          const key = await uploadToWasabiCompanyVendorDocument(file.buffer, vendorId, file.originalname, file.mimetype);
          bankChequePaths[i] = key;
        } else {
          // Keep existing path if present
          bankChequePaths[i] = account.cancelled_cheque_path || null;
        }
      }
    }

    // 2. Documents
    const documentPaths: { [key: number]: string } = {};
    if (documents && Array.isArray(documents)) {
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const fieldname = `document_file_${i}`;
        const file = uploadedFiles[fieldname]?.[0];
        if (file) {
          const key = await uploadToWasabiCompanyVendorDocument(file.buffer, vendorId, file.originalname, file.mimetype);
          documentPaths[i] = key;
        } else if (doc.file_path) {
          documentPaths[i] = doc.file_path;
        } else {
          documentPaths[i] = "";
        }
      }
    }

    // Transaction execution
    const updatedVendor = await prisma.$transaction(async (tx) => {
      // 1. Sync legacy fields using primary contact
      let legacyPOC = existingVendor.point_of_contact;
      let legacyPhone = existingVendor.contact_no;
      let legacyEmail = existingVendor.email;

      if (contacts && Array.isArray(contacts)) {
        const prim = contacts.find((c: any) => c.is_primary === true || c.is_primary === "true");
        if (prim) {
          legacyPOC = prim.name;
          legacyPhone = prim.phone;
          legacyEmail = prim.email || "";
        }
      }

      let firstAddressLine = existingVendor.address;
      if (addresses && Array.isArray(addresses) && addresses.length > 0) {
        firstAddressLine = addresses[0].address_line_1;
      }

      // Update Vendor record
      const vendorRecord = await tx.companyVendorsMaster.update({
        where: { id: companyVendorId },
        data: {
          vendor_code: vendor_code ?? existingVendor.vendor_code,
          company_name: company_name ?? existingVendor.company_name,
          vendor_name: vendor_name !== undefined ? (vendor_name ? vendor_name.trim() : (company_name || existingVendor.company_name).trim()) : existingVendor.vendor_name,
          point_of_contact: legacyPOC,
          contact_no: legacyPhone,
          email: legacyEmail,
          address: firstAddressLine,
          alternate_mobile_no: alternate_mobile_no !== undefined ? alternate_mobile_no : existingVendor.alternate_mobile_no,
          alternate_email: alternate_email !== undefined ? alternate_email : existingVendor.alternate_email,
          gst_no: gst_no !== undefined ? gst_no : existingVendor.gst_no,
          pan_no: pan_no !== undefined ? pan_no : existingVendor.pan_no,
          in_house: in_house !== undefined ? (in_house === true || in_house === "true") : existingVendor.in_house,
          status_id: status_id ? Number(status_id) : existingVendor.status_id,
          default_payment_term_id: payment_term_id !== undefined ? (payment_term_id ? Number(payment_term_id) : null) : existingVendor.default_payment_term_id,
          updated_by: userId,
          updated_at: new Date(),
        },
      });

      // 2. Addresses updates
      if (addresses && Array.isArray(addresses)) {
        const inputAddrIds = addresses.map((a: any) => a.id).filter(Boolean);
        // Soft delete removed ones
        await tx.companyVendorAddress.updateMany({
          where: {
            company_vendor_id: companyVendorId,
            id: { notIn: inputAddrIds },
            is_deleted: false,
          },
          data: { is_deleted: true, deleted_by: userId, deleted_at: new Date() },
        });

        // Insert or update remaining ones
        for (const addr of addresses) {
          const stateId = Number(addr.state_id);
          const cityId = await this.resolveOrCreateCity(tx, stateId, addr.city_id);
          if (addr.id) {
            await tx.companyVendorAddress.update({
              where: { id: addr.id },
              data: {
                address_line_1: addr.address_line_1,
                address_line_2: addr.address_line_2 || null,
                landmark: addr.landmark || null,
                pincode: addr.pincode,
                state_id: stateId,
                city_id: cityId,
                is_primary: addr.is_primary === true || addr.is_primary === "true",
                updated_by: userId,
                updated_at: new Date(),
              },
            });
          } else {
            await tx.companyVendorAddress.create({
              data: {
                company_vendor_id: companyVendorId,
                address_line_1: addr.address_line_1,
                address_line_2: addr.address_line_2 || null,
                landmark: addr.landmark || null,
                pincode: addr.pincode,
                state_id: stateId,
                city_id: cityId,
                is_primary: addr.is_primary === true || addr.is_primary === "true",
                created_by: userId,
                updated_by: userId,
              },
            });
          }
        }
      }

      // 3. Contacts updates
      if (contacts && Array.isArray(contacts)) {
        const inputContactIds = contacts.map((c: any) => c.id).filter(Boolean);
        // Soft delete removed ones
        await tx.companyVendorContactPerson.updateMany({
          where: {
            company_vendor_id: companyVendorId,
            id: { notIn: inputContactIds },
            is_deleted: false,
          },
          data: { is_deleted: true, deleted_by: userId, deleted_at: new Date() },
        });

        const updatedContacts = [];
        for (const contact of contacts) {
          if (contact.id) {
            const rec = await tx.companyVendorContactPerson.update({
              where: { id: contact.id },
              data: {
                name: contact.name,
                department: contact.department || null,
                phone: contact.phone,
                designation: contact.designation || null,
                email: contact.email || null,
                is_primary: contact.is_primary === true || contact.is_primary === "true",
                updated_by: userId,
                updated_at: new Date(),
              },
            });
            updatedContacts.push(rec);
          } else {
            const rec = await tx.companyVendorContactPerson.create({
              data: {
                company_vendor_id: companyVendorId,
                name: contact.name,
                department: contact.department || null,
                phone: contact.phone,
                designation: contact.designation || null,
                email: contact.email || null,
                is_primary: contact.is_primary === true || contact.is_primary === "true",
                created_by: userId,
                updated_by: userId,
              },
            });
            updatedContacts.push(rec);
          }
        }

        // Link primary contact back to CompanyVendorsMaster
        const primContact = updatedContacts.find((c) => c.is_primary === true);
        if (primContact) {
          await tx.companyVendorsMaster.update({
            where: { id: companyVendorId },
            data: { primary_contact_id: primContact.id },
          });
        }
      }

      // 4. Bank Accounts updates
      if (bank_accounts && Array.isArray(bank_accounts)) {
        const inputBankIds = bank_accounts.map((b: any) => b.id).filter(Boolean);
        // Soft delete removed ones
        await tx.companyVendorBankAccount.updateMany({
          where: {
            company_vendor_id: companyVendorId,
            id: { notIn: inputBankIds },
            is_deleted: false,
          },
          data: { is_deleted: true, deleted_by: userId, deleted_at: new Date() },
        });

        // Insert or update remaining ones
        for (let i = 0; i < bank_accounts.length; i++) {
          const bank = bank_accounts[i];
          if (bank.id) {
            await tx.companyVendorBankAccount.update({
              where: { id: bank.id },
              data: {
                holder_name: bank.holder_name,
                account_no: bank.account_no,
                ifsc: bank.ifsc,
                swift: bank.swift || null,
                branch: bank.branch,
                cancelled_cheque_path: bankChequePaths[i],
                is_default: bank.is_default === true || bank.is_default === "true",
                updated_by: userId,
                updated_at: new Date(),
              },
            });
          } else {
            await tx.companyVendorBankAccount.create({
              data: {
                company_vendor_id: companyVendorId,
                holder_name: bank.holder_name,
                account_no: bank.account_no,
                ifsc: bank.ifsc,
                swift: bank.swift || null,
                branch: bank.branch,
                cancelled_cheque_path: bankChequePaths[i],
                is_default: bank.is_default === true || bank.is_default === "true",
                created_by: userId,
                updated_by: userId,
              },
            });
          }
        }
      }

      // 5. Vendor Types Mapping updates
      if (vendor_types && Array.isArray(vendor_types)) {
        // Drop existing mapping and recreate
        await tx.companyVendorTypeMapping.deleteMany({
          where: { company_vendor_id: companyVendorId },
        });

        await Promise.all(
          vendor_types.map((typeId: any) =>
            tx.companyVendorTypeMapping.create({
              data: {
                company_vendor_id: companyVendorId,
                vendor_type_id: Number(typeId),
                created_by: userId,
                updated_by: userId,
              },
            })
          )
        );
      }

      // 6. Documents updates
      if (documents && Array.isArray(documents)) {
        const inputDocIds = documents.map((d: any) => d.id).filter(Boolean);
        // Soft delete removed ones
        await tx.companyVendorDocumentMapping.updateMany({
          where: {
            company_vendor_id: companyVendorId,
            id: { notIn: inputDocIds },
            is_deleted: false,
          },
          data: { is_deleted: true, deleted_by: userId, deleted_at: new Date() },
        });

        // Insert or update remaining ones
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          if (doc.id) {
            if (documentPaths[i]) {
              await tx.companyVendorDocumentMapping.update({
                where: { id: doc.id },
                data: {
                  document_type_id: Number(doc.document_type_id),
                  file_path: documentPaths[i],
                  updated_by: userId,
                  updated_at: new Date(),
                },
              });
            }
          } else {
            if (documentPaths[i]) {
              await tx.companyVendorDocumentMapping.create({
                data: {
                  company_vendor_id: companyVendorId,
                  document_type_id: Number(doc.document_type_id),
                  file_path: documentPaths[i],
                  created_by: userId,
                  updated_by: userId,
                },
              });
            }
          }
        }
      }

      return vendorRecord;
    });

    return updatedVendor;
  }

  /**
   * Soft Delete Company Vendor
   */
  async deleteDetailedCompanyVendor(vendorId: number, companyVendorId: number, userId: number) {
    const existing = await prisma.companyVendorsMaster.findFirst({
      where: { id: companyVendorId, vendor_id: vendorId, is_deleted: false },
    });

    if (!existing) {
      const error = new Error("Company vendor not found");
      (error as any).statusCode = 404;
      throw error;
    }

    return prisma.companyVendorsMaster.update({
      where: { id: companyVendorId },
      data: {
        is_deleted: true,
        deleted_by: userId,
        deleted_at: new Date(),
      },
    });
  }

  // Helpers to generate standardized errors
  private badRequest(message: string) {
    const error = new Error(message);
    (error as any).statusCode = 400;
    return error;
  }

  private conflict(message: string) {
    const error = new Error(message);
    (error as any).statusCode = 409;
    return error;
  }
}
