import { prisma } from "../prisma/client";

interface VendorTaxInfoPayload {
  tax_no: string;
  tax_status: string;
  vendor_id: number;
  tax_country: string;
}

interface LeadsOverviewReportRow {
  lead_id: number;
  instance_id: number | null;
  lead_code: string;
  client_name: string;
  franchise_store: string;
  client_number: string;
  address: string;
  site_type: string;
  source: string;
  furniture_type: string;
  furniture_structure: string;
  instance: string;
  architect_name: string;
  carcass_selection: string;
  shutter_selection: string;
  handle_selection: string;
  designer_assigned: string;
  supervisor_assigned: string;
}

export const createVendor = async (data: any) => {
  const {
    vendor_name,
    vendor_code,
    primary_contact_name,
    primary_contact_number,
    primary_contact_email,
    country_code,
    head_office_id,
    status,
    logo,
    time_zone,
  } = data;

  return await prisma.vendorMaster.create({
    data: {
      vendor_name,
      vendor_code,
      primary_contact_name,
      primary_contact_number,
      primary_contact_email,
      country_code,
      head_office_id,
      status,
      logo,
      time_zone,
    },
  });
};

export const getAllVendors = async () => {
  return await prisma.vendorMaster.findMany({
    include: { addresses: true },
  });
};

export const getVendorUsers = async (vendorId: number) => {
  const users = await prisma.userMaster.findMany({
    where: {
      vendor_id: vendorId,

      // Exclude Admin and Super Admin
      NOT: {
        user_type_id: {
          in: [1],
        },
      },
    },

    select: {
      id: true,
      user_name: true,
    },
  });

  return users;
};

export const getVendorStatusTypes = async (vendorId: number) => {
  const statusTypes = await prisma.statusTypeMaster.findMany({
    where: {
      vendor_id: vendorId,
    },

    select: {
      id: true,
      type: true,
      tag: true,
    },

    orderBy: {
      id: "asc",
    },
  });
  return statusTypes;
};

const normalizeSelectionType = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const formatOverviewLeadCode = (
  leadCode: string,
  quantityIndex: number | null | undefined,
  hasMultipleInstances: boolean,
) =>
  hasMultipleInstances &&
  quantityIndex !== null &&
  quantityIndex !== undefined
    ? `${leadCode}.${quantityIndex}`
    : leadCode;

export const getLeadsOverviewReportData = async (
  vendorId: number,
  franchiseId: number | null,
  fromDate: string | null,
  toDate: string | null,
): Promise<LeadsOverviewReportRow[]> => {
  const where: any = {
    vendor_id: vendorId,
    is_deleted: false,
  };

  if (franchiseId !== null) {
    where.franchise_id = franchiseId;
  }

  if (fromDate && toDate) {
    where.created_at = {
      gte: new Date(fromDate),
      lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)),
    };
  }

  const leads = await prisma.leadMaster.findMany({
    where,
    select: {
      id: true,
      lead_code: true,
      firstname: true,
      lastname: true,
      contact_no: true,
      site_address: true,
      archetech_name: true,
      franchise: {
        select: {
          franchise_name: true,
        },
      },
      siteType: {
        select: {
          type: true,
        },
      },
      source: {
        select: {
          type: true,
        },
      },
      productMappings: {
        select: {
          productType: {
            select: {
              type: true,
            },
          },
        },
      },
      leadProductStructureMapping: {
        select: {
          productStructure: {
            select: {
              type: true,
            },
          },
        },
      },
      productStructureInstances: {
        select: {
          id: true,
          title: true,
          quantity_index: true,
          productType: {
            select: {
              type: true,
            },
          },
          productStructure: {
            select: {
              type: true,
            },
          },
          designSelections: {
            select: {
              type: true,
              desc: true,
              created_at: true,
              updated_at: true,
            },
            orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
          },
        },
        orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
      },
      userMappings: {
        where: {
          status: "active",
        },
        select: {
          type: true,
          created_at: true,
          user: {
            select: {
              user_name: true,
              user_type: {
                select: {
                  user_type: true,
                },
              },
            },
          },
        },
        orderBy: {
          created_at: "asc",
        },
      },
    },
    orderBy: {
      created_at: "asc",
    },
  });

  return leads.flatMap<LeadsOverviewReportRow>((lead) => {
    const defaultFurnitureTypes = [
      ...new Set(
        lead.productMappings
          .map((mapping) => mapping.productType.type)
          .filter(Boolean),
      ),
    ];
    const defaultFurnitureStructures = [
      ...new Set(
        lead.leadProductStructureMapping
          .map((mapping) => mapping.productStructure.type)
          .filter(Boolean),
      ),
    ];

    const designerAssigned =
      lead.userMappings.find((mapping) => {
        const role = mapping.user.user_type.user_type.trim().toLowerCase();
        return role === "sales-executive";
      })?.user.user_name ?? "-";
    const supervisorAssigned =
      lead.userMappings.find((mapping) => {
        const role = mapping.user.user_type.user_type.trim().toLowerCase();
        return role === "site-supervisor";
      })
        ?.user.user_name ?? "-";

    if (!lead.productStructureInstances.length) {
      return [
        {
          lead_id: lead.id,
          instance_id: null,
          lead_code: lead.lead_code,
          client_name: `${lead.firstname} ${lead.lastname}`.trim(),
          franchise_store: lead.franchise?.franchise_name ?? "-",
          client_number: lead.contact_no ?? "-",
          address: lead.site_address ?? "-",
          site_type: lead.siteType?.type ?? "-",
          source: lead.source?.type ?? "-",
          furniture_type: defaultFurnitureTypes.join(", ") || "-",
          furniture_structure: defaultFurnitureStructures.join(", ") || "-",
          instance: "-",
          architect_name: lead.archetech_name ?? "-",
          carcass_selection: "-",
          shutter_selection: "-",
          handle_selection: "-",
          designer_assigned: designerAssigned,
          supervisor_assigned: supervisorAssigned,
        },
      ];
    }

    const hasMultipleInstances = lead.productStructureInstances.length > 1;

    return lead.productStructureInstances.map((instance) => {
      const carcassSelection =
        instance.designSelections.find((selection) => {
          const type = normalizeSelectionType(selection.type);
          return type === "carcas" || type === "carcass";
        })?.desc ?? "-";
      const shutterSelection =
        instance.designSelections.find(
          (selection) => normalizeSelectionType(selection.type) === "shutter",
        )?.desc ?? "-";
      const handleSelection =
        instance.designSelections.find((selection) => {
          const type = normalizeSelectionType(selection.type);
          return type === "handles" || type === "handle";
        })?.desc ?? "-";

      return {
        lead_id: lead.id,
        instance_id: instance.id,
        lead_code: formatOverviewLeadCode(
          lead.lead_code,
          instance.quantity_index,
          hasMultipleInstances,
        ),
        client_name: `${lead.firstname} ${lead.lastname}`.trim(),
        franchise_store: lead.franchise?.franchise_name ?? "-",
        client_number: lead.contact_no ?? "-",
        address: lead.site_address ?? "-",
        site_type: lead.siteType?.type ?? "-",
        source: lead.source?.type ?? "-",
        furniture_type: instance.productType?.type ?? "-",
        furniture_structure: instance.productStructure?.type ?? "-",
        instance:
          instance.title?.trim() ||
          `Instance ${instance.quantity_index ?? instance.id}`,
        architect_name: lead.archetech_name ?? "-",
        carcass_selection: carcassSelection,
        shutter_selection: shutterSelection,
        handle_selection: handleSelection,
        designer_assigned: designerAssigned,
        supervisor_assigned: supervisorAssigned,
      };
    });
  });
};

export const getVendorById = async (vendorId: number) => {
  return prisma.vendorMaster.findUnique({ where: { id: vendorId } });
};

export const seedVendorMasters = async (vendorId: number) => {
  // Fetch all existing entries for this vendor in parallel
  const [
    existingSiteTypes,
    existingSources,
    existingProductTypes,
    existingProductStructures,
    existingDocTypes,
    existingStatusTypes,
    existingPaymentTypes,
    existingMiscTypes,
    existingMiscTeams,
    existingIssueLogTypes,
  ] = await Promise.all([
    prisma.siteTypeMaster.findMany({
      where: { vendor_id: vendorId },
      select: { type: true },
    }),
    prisma.sourceMaster.findMany({
      where: { vendor_id: vendorId },
      select: { type: true },
    }),
    prisma.productTypeMaster.findMany({
      where: { vendor_id: vendorId },
      select: { type: true },
    }),
    prisma.productStructure.findMany({
      where: { vendor_id: vendorId },
      select: { type: true, parent: true },
    }),
    prisma.documentTypeMaster.findMany({
      where: { vendor_id: vendorId },
      select: { type: true },
    }),
    prisma.statusTypeMaster.findMany({
      where: { vendor_id: vendorId },
      select: { type: true },
    }),
    prisma.paymentTypeMaster.findMany({
      where: { vendor_id: vendorId },
      select: { type: true },
    }),
    prisma.miscellaneousTypeMaster.findMany({
      where: { vendor_id: vendorId },
      select: { name: true },
    }),
    prisma.miscellaneousTeamMaster.findMany({
      where: { vendor_id: vendorId },
      select: { name: true },
    }),
    prisma.issueLogTypeMaster.findMany({
      where: { vendor_id: vendorId },
      select: { name: true },
    }),
  ]);

  const existingSiteTypeSet = new Set(existingSiteTypes.map((r) => r.type));
  const existingSourceSet = new Set(existingSources.map((r) => r.type));
  const existingProductTypeSet = new Set(
    existingProductTypes.map((r) => r.type),
  );
  const existingProductStructureSet = new Set(
    existingProductStructures.map((r) => `${r.type}||${r.parent}`),
  );
  const existingDocTypeSet = new Set(existingDocTypes.map((r) => r.type));
  const existingStatusTypeSet = new Set(existingStatusTypes.map((r) => r.type));
  const existingPaymentTypeSet = new Set(
    existingPaymentTypes.map((r) => r.type),
  );
  const existingMiscTypeSet = new Set(existingMiscTypes.map((r) => r.name));
  const existingMiscTeamSet = new Set(existingMiscTeams.map((r) => r.name));
  const existingIssueLogTypeSet = new Set(
    existingIssueLogTypes.map((r) => r.name),
  );

  const siteTypesToAdd = [
    "Bungalow",
    "Flat",
    "Farm House",
    "Sample Flat",
    "Office",
    "Project Order",
  ]
    .filter((type) => !existingSiteTypeSet.has(type))
    .map((type) => ({ vendor_id: vendorId, type }));
  if (siteTypesToAdd.length)
    await prisma.siteTypeMaster.createMany({ data: siteTypesToAdd });

  const sourcesToAdd = [
    "Client Referral",
    "Family Referral",
    "Online",
    "Walk-in",
    "Architect",
    "Social Media",
    "Old Client",
    "Staff Referral",
  ]
    .filter((type) => !existingSourceSet.has(type))
    .map((type) => ({ vendor_id: vendorId, type }));
  if (sourcesToAdd.length)
    await prisma.sourceMaster.createMany({ data: sourcesToAdd });

  const productTypesToAdd = [
    { type: "Semi-Modular Kitchen", tag: "Type 1" },
    { type: "Modular Kitchen", tag: "Type 2" },
    { type: "Wardrobe", tag: "Type 3" },
    { type: "Other Furniture", tag: "Type 4" },
    { type: "Office Furniture", tag: "Type 5" },
    { type: "Consoles", tag: "Type 6" },
    { type: "Small Order", tag: "Type 7" },
  ]
    .filter((item) => !existingProductTypeSet.has(item.type))
    .map((item) => ({ vendor_id: vendorId, ...item }));
  if (productTypesToAdd.length)
    await prisma.productTypeMaster.createMany({ data: productTypesToAdd });

  const productStructuresToAdd = [
    { type: "L kitchen", parent: "Kitchen" },
    { type: "Island Kitchen", parent: "Kitchen" },
    { type: "Straight Kitchen", parent: "Kitchen" },
    { type: "C kitchen", parent: "Kitchen" },
    { type: "U kitchen", parent: "Kitchen" },
    { type: "parallel kitchen", parent: "Kitchen" },
    { type: "walk-in wardrobe", parent: "wardrobe" },
    { type: "sliding wardrobe", parent: "wardrobe" },
    { type: "openable wardrobe", parent: "wardrobe" },
    { type: "Others", parent: "wardrobe" },
    { type: "Others", parent: "Others" },
  ]
    .filter(
      (item) =>
        !existingProductStructureSet.has(`${item.type}||${item.parent}`),
    )
    .map((item) => ({ vendor_id: vendorId, ...item }));
  if (productStructuresToAdd.length)
    await prisma.productStructure.createMany({ data: productStructuresToAdd });

  const docTypesToAdd = [
    {
      type: "site_photos",
      tag: "Type 1",
      doc_title: "Site Photos",
      stage: "Leads",
    },
    {
      type: "current_site_photos",
      tag: "Type 2",
      doc_title: "Current Site Photos",
      stage: "Initial Site Measurement",
    },
    {
      type: "initial_site_measurement_document",
      tag: "Type 3",
      doc_title: "Initial Site Measurement Document",
      stage: "Initial Site Measurement",
    },
    {
      type: "initial_site_measurement_payment_details",
      tag: "Type 4",
      doc_title: "Initial Site Measurement Payment Details",
      stage: "Initial Site Measurement",
    },
    {
      type: "design-quotation",
      tag: "Type 5",
      doc_title: "Design Quotation",
      stage: "Designing",
    },
    {
      type: "stage-1-design",
      tag: "Type 6",
      doc_title: "Stage 1 Design",
      stage: "Designing",
    },
    {
      type: "meeting-documents",
      tag: "Type 7",
      doc_title: "Meeting Documents",
      stage: "Designing",
    },
    {
      type: "booking-final-documents",
      tag: "Type 8",
      doc_title: "Booking Final Documents",
      stage: "Booking",
    },
    {
      type: "final_site_measurement_document",
      tag: "Type 9",
      doc_title: "Final Site Measurement Document",
      stage: "Final Measurement",
    },
    {
      type: "final_current_site_photos",
      tag: "Type 10",
      doc_title: "Final Current Site Photos",
      stage: "Final Measurement",
    },
    {
      type: "client_documentations_ppt",
      tag: "Type 11",
      doc_title: "Client Documentations PPT - Project Files",
      stage: "Client Documentation",
    },
    {
      type: "client_documentations_pytha",
      tag: "Type 12",
      doc_title: "Client Documentations Pytha - Pytha Design Files",
      stage: "Client Documentation",
    },
    {
      type: "client-approval-documents",
      tag: "Type 13",
      doc_title: "Client Approval Documents",
      stage: "Client Approval",
    },
    {
      type: "production-files",
      tag: "Type 14",
      doc_title: "Production Files",
      stage: "Production",
    },
    {
      type: "production-files-qc-photos",
      tag: "Type 15",
      doc_title: "Production Files QC Photos",
      stage: "Production",
    },
    {
      type: "production-files-hardware-packing-details-docs",
      tag: "Type 16",
      doc_title: "Production Files Hardware Packing Details Docs",
      stage: "Production",
    },
    {
      type: "production-files-woodwork-packing-details-docs",
      tag: "Type 17",
      doc_title: "Production Files Woodwork Packing Details Docs",
      stage: "Production",
    },
    {
      type: "current-site-photos-ready-to-dispatch",
      tag: "Type 18",
      doc_title: "Current Site Photos Ready To Dispatch",
      stage: "Site Readiness",
    },
    {
      type: "current-site-photos-site-readiness",
      tag: "Type 19",
      doc_title: "Current Site Photos Site Readiness",
      stage: "Site Readiness",
    },
    {
      type: "payment-proof-dispatch-planning",
      tag: "Type 20",
      doc_title: "Payment Proof Dispatch Planning",
      stage: "Dispatch Stage",
    },
    {
      type: "dispatch-documents",
      tag: "Type 21",
      doc_title: "Dispatch Documents",
      stage: "Dispatch Stage",
    },
    {
      type: "post_dispatch-documents",
      tag: "Type 22",
      doc_title: "Post Dispatch Documents",
      stage: "Dispatch Stage",
    },
    {
      type: "under-installation-day-wise-documents",
      tag: "Type 23",
      doc_title: "Under Installation Day Wise Documents",
      stage: "Under Installation",
    },
    {
      type: "under-installation-miscellaneous-documents",
      tag: "Type 24",
      doc_title: "Under Installation Miscellaneous Documents",
      stage: "Under Installation",
    },
    {
      type: "under-installation-final-site-photos-documents",
      tag: "Type 25",
      doc_title: "Under Installation Final Site Photos Documents",
      stage: "Under Installation",
    },
    {
      type: "under-installation-useable-handover-documents",
      tag: "Type 26",
      doc_title: "Under Installation Useable Handover Documents",
      stage: "Under Installation",
    },
    {
      type: "final-handover-final-site-photos",
      tag: "Type 27",
      doc_title: "Final Handover Final Site Photos",
      stage: "Final Handover",
    },
    {
      type: "final-handover-warranty-card-photos",
      tag: "Type 28",
      doc_title: "Final Handover Warranty Card Photos",
      stage: "Final Handover",
    },
    {
      type: "final-handover-booklet-photos",
      tag: "Type 29",
      doc_title: "Final Handover Booklet Photos",
      stage: "Final Handover",
    },
    {
      type: "final-handover-form-photos",
      tag: "Type 30",
      doc_title: "Final Handover Form Photos",
      stage: "Final Handover",
    },
    {
      type: "final-handover-qc-documents",
      tag: "Type 31",
      doc_title: "Final Handover QC Documents",
      stage: "Final Handover",
    },
    {
      type: "current-site-photos-at-booking-stage",
      tag: "Type 32",
      doc_title: "Current Site Photos At Booking Stage",
      stage: "Booking",
    },
    {
      type: "bd-ism-current-site-photos",
      tag: "Type 33",
      doc_title: "Bd Ism Current Site Photos",
      stage: "Booking",
    },
    {
      type: "bd-ism-documents",
      tag: "Type 34",
      doc_title: "Bd Ism Documents",
      stage: "Booking",
    },
    {
      type: "bd_initial-site-measurement-payment-images",
      tag: "Type 35",
      doc_title: "Bd Initial Site Measurement Payment Images",
      stage: "Booking",
    },
    {
      type: "PO-files",
      tag: "Type 36",
      doc_title: "PO Files",
      stage: "Order Login",
    },
    {
      type: "Miscellaneous Completion Documents",
      tag: "Type 37",
      doc_title: "Miscellaneous Completion Documents",
      stage: "Under Installation",
    },
    {
      type: "Final-Production-Documents",
      tag: "Type 38",
      doc_title: "Final Production Documents",
      stage: "Production",
    },
  ]
    .filter((item) => !existingDocTypeSet.has(item.type))
    .map((item) => ({ vendor_id: vendorId, ...item }));
  if (docTypesToAdd.length)
    await prisma.documentTypeMaster.createMany({ data: docTypesToAdd });

  const statusTypesToAdd = [
    { type: "open", tag: "Type 1" },
    { type: "initial-site-measurement", tag: "Type 2" },
    { type: "designing-stage", tag: "Type 3" },
    { type: "booking-stage", tag: "Type 4" },
    { type: "final-site-measurement-stage", tag: "Type 5" },
    { type: "client-documentation-stage", tag: "Type 6" },
    { type: "client-approval-stage", tag: "Type 7" },
    { type: "tech-check-stage", tag: "Type 8" },
    { type: "order-login-stage", tag: "Type 9" },
    { type: "production-stage", tag: "Type 10" },
    { type: "ready-to-dispatch-stage", tag: "Type 11" },
    { type: "site-readiness-stage", tag: "Type 12" },
    { type: "dispatch-planning-stage", tag: "Type 13" },
    { type: "dispatch-stage", tag: "Type 14" },
    { type: "under-installation-stage", tag: "Type 15" },
    { type: "final-handover-stage", tag: "Type 16" },
    { type: "project-completed", tag: "Type 17" },
  ]
    .filter((item) => !existingStatusTypeSet.has(item.type))
    .map((item) => ({ vendor_id: vendorId, ...item }));
  if (statusTypesToAdd.length)
    await prisma.statusTypeMaster.createMany({ data: statusTypesToAdd });

  const paymentTypesToAdd = [
    { type: "initial_site_measurement_payment", tag: "Type 1" },
    { type: "booking_amount", tag: "Type 2" },
    { type: "client_approval_payment", tag: "Type 3" },
    { type: "additional_payment", tag: "Type 4" },
    { type: "dispatch-planning-additional_payment", tag: "Type 5" },
  ]
    .filter((item) => !existingPaymentTypeSet.has(item.type))
    .map((item) => ({ vendor_id: vendorId, ...item }));
  if (paymentTypesToAdd.length)
    await prisma.paymentTypeMaster.createMany({ data: paymentTypesToAdd });

  const miscTypesToAdd = [
    "Short Dispatch",
    "Short/Wrong Order",
    "Product Damage",
    "Wrong Manufactured",
    "Product Faulty",
    "Product not Compatible",
    "R&D Issue",
    "Client Onsite Changes",
    "Additional Order",
    "Misplaced Onsite",
    "Internal Team Mistake",
    "Dealer's Mistake",
    "Others",
  ]
    .filter((name) => !existingMiscTypeSet.has(name))
    .map((name) => ({ vendor_id: vendorId, name, created_by: 1 }));
  if (miscTypesToAdd.length)
    await prisma.miscellaneousTypeMaster.createMany({ data: miscTypesToAdd });

  const miscTeamsToAdd = [
    "Installation team",
    "Supervisor Team",
    "Backend team",
    "Technical team",
    "Sales Executive Team",
    "Production Team",
    "Logistics Team",
    "Dealer",
    "Client",
  ]
    .filter((name) => !existingMiscTeamSet.has(name))
    .map((name) => ({ vendor_id: vendorId, name, created_by: 1 }));
  if (miscTeamsToAdd.length)
    await prisma.miscellaneousTeamMaster.createMany({ data: miscTeamsToAdd });

  const issueLogTypesToAdd = [
    "Short Dispatch",
    "Short/Wrong Order",
    "Product Damage",
    "Wrong Manufactured",
    "Product Faulty",
    "Product not Compatible",
    "R&D Issue",
    "Client Onsite Changes",
    "Additional Order",
    "Misplaced Onsite",
    "Internal Team Mistake",
    "Dealer's Mistake",
    "Onsite team Mistake",
    "Site Civil issue",
    "Payment Pending",
    "Site Readiness",
    "CEPT issue",
    "QC issue",
    "Others",
  ]
    .filter((name) => !existingIssueLogTypeSet.has(name))
    .map((name) => ({ vendor_id: vendorId, name, created_by: 1 }));
  if (issueLogTypesToAdd.length)
    await prisma.issueLogTypeMaster.createMany({ data: issueLogTypesToAdd });
};

export const onboardVendor = async (data: any) => {
  const {
    vendor_name,
    vendor_code,
    primary_contact_name,
    primary_contact_number,
    primary_contact_email,
    country_code,
    head_office_id,
    status,
    logo,
    time_zone,
  } = data;

  const vendor = await prisma.vendorMaster.create({
    data: {
      vendor_name,
      vendor_code,
      primary_contact_name,
      primary_contact_number,
      primary_contact_email,
      country_code,
      head_office_id,
      status,
      logo,
      time_zone,
    },
  });

  const vendorId = vendor.id;
  await seedVendorMasters(vendorId);

  await prisma.franchiseMaster.create({
    data: {
      vendor_id: vendorId,
      franchise_name: vendor_name,
      franchise_code: vendor_code,
      contact_number: primary_contact_number,
      contact_email: primary_contact_email,
      contact_person: primary_contact_name,
      is_head_office: true,
      zone_id: 1,
      area_id: 1,
      address: "Some Address",
      pincode: "400001",
      status: "active",
    },
  });

  return vendor;
};

export const getVendorSettingValue = async (vendorId: number, key: string) => {
  const setting = await prisma.vendorSettingKey.findFirst({
    where: { key },

    select: {
      default_value: true,

      vendorSettings: {
        where: { vendor_id: vendorId },
        select: { value: true },
        take: 1,
      },
    },
  });

  return setting?.vendorSettings?.[0]?.value ?? setting?.default_value ?? null;
};
