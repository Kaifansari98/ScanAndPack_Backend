import { prisma } from "../prisma/client";

interface DummyPIData {
  intent_no: string;
  category_id: number;
  status: "Draft" | "PendingApproval" | "Approved" | "Rejected" | "ConvertedToPO" | "Cancelled";
  priority: "Low" | "Medium" | "High" | "Urgent";
  remarks: string;
  createdDaysAgo: number;
  items: {
    product_id: number;
    uom: string;
    remarks?: string;
    vendors: {
      company_vendor_id: number;
      payment_term_id: number;
      required_qty: number;
      mrp: number;
      discount_pct: number;
      tax_pct: number;
    }[];
  }[];
}

const dummyRecords: DummyPIData[] = [
  {
    intent_no: "PI-000003",
    category_id: 5,
    status: "PendingApproval",
    priority: "High",
    remarks: "Urgent replenishment for ongoing modular kitchen project in Mumbai.",
    createdDaysAgo: 1,
    items: [
      {
        product_id: 2004, // G-Sec Handle Aluminium
        uom: "Meter",
        remarks: "Need standard 3-meter bars",
        vendors: [
          {
            company_vendor_id: 55, // CREATIVE INNOVATIONS
            payment_term_id: 2, // 50 Advance 50 Delivery
            required_qty: 45,
            mrp: 650,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
      {
        product_id: 2005, // G-Sec Handle Black
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 55, // CREATIVE INNOVATIONS
            payment_term_id: 2,
            required_qty: 30,
            mrp: 720,
            discount_pct: 8,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000004",
    category_id: 28,
    status: "Approved",
    priority: "Medium",
    remarks: "Edgebanding rolls for wardrobe carcass fabrication.",
    createdDaysAgo: 2,
    items: [
      {
        product_id: 6046, // 048P
        uom: "Meter",
        remarks: "Batch matching shade code Sapelli",
        vendors: [
          {
            company_vendor_id: 91, // ALANKAR ENTERPRISE
            payment_term_id: 1, // Advance 100%
            required_qty: 80,
            mrp: 450,
            discount_pct: 12,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000005",
    category_id: 5,
    status: "ConvertedToPO",
    priority: "High",
    remarks: "Premium gold handles for luxury villa penthouse fitout.",
    createdDaysAgo: 3,
    items: [
      {
        product_id: 2002, // L-Sec Handle Gold CP
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56, // SUN TRADELINK
            payment_term_id: 7, // 25 Advance 75 After GRN
            required_qty: 60,
            mrp: 1250,
            discount_pct: 15,
            tax_pct: 18,
          },
        ],
      },
      {
        product_id: 2006, // G-Sec Handle Gold CP
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56,
            payment_term_id: 7,
            required_qty: 40,
            mrp: 1350,
            discount_pct: 15,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000006",
    category_id: 5,
    status: "Draft",
    priority: "Low",
    remarks: "Internal estimate for prospective client quotation.",
    createdDaysAgo: 4,
    items: [
      {
        product_id: 2008, // J-Sec Handle Aluminium
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 57, // KBR
            payment_term_id: 6, // 30 Days Credit
            required_qty: 25,
            mrp: 580,
            discount_pct: 5,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000007",
    category_id: 5,
    status: "Approved",
    priority: "Urgent",
    remarks: "Shortage identified on factory assembly line 2.",
    createdDaysAgo: 5,
    items: [
      {
        product_id: 2001, // L-Sec Handle Black
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 55, // CREATIVE INNOVATIONS
            payment_term_id: 1, // Advance 100%
            required_qty: 120,
            mrp: 680,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
      {
        product_id: 2009, // J-Sec Handle Black
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 57, // KBR
            payment_term_id: 2,
            required_qty: 75,
            mrp: 610,
            discount_pct: 8,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000008",
    category_id: 28,
    status: "PendingApproval",
    priority: "Medium",
    remarks: "Quarterly stock replenishment for edge tapes.",
    createdDaysAgo: 6,
    items: [
      {
        product_id: 6046,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 91,
            payment_term_id: 6, // 30 Days Credit
            required_qty: 150,
            mrp: 420,
            discount_pct: 15,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000009",
    category_id: 5,
    status: "Rejected",
    priority: "Low",
    remarks: "Disapproved due to quote exceeding pre-budget cap.",
    createdDaysAgo: 7,
    items: [
      {
        product_id: 2003, // L-Sec Handle Ceramic Champagne
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56,
            payment_term_id: 1,
            required_qty: 35,
            mrp: 1450,
            discount_pct: 0,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000010",
    category_id: 5,
    status: "ConvertedToPO",
    priority: "High",
    remarks: "Material for commercial office pantry credenzas.",
    createdDaysAgo: 8,
    items: [
      {
        product_id: 2010, // J-Sec Handle Rose Gold CP
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 61, // BLUM
            payment_term_id: 3, // 90 Days Credit
            required_qty: 55,
            mrp: 1100,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000011",
    category_id: 5,
    status: "Draft",
    priority: "Medium",
    remarks: "Drafting requirement for Phase 2 tower deliverables.",
    createdDaysAgo: 9,
    items: [
      {
        product_id: 2007, // G-Sec Handle Ceramic Champagne
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 58, // ARIHANT APPLIANCES LLP
            payment_term_id: 2,
            required_qty: 40,
            mrp: 950,
            discount_pct: 5,
            tax_pct: 18,
          },
        ],
      },
      {
        product_id: 2004, // G-Sec Handle Aluminium
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 55,
            payment_term_id: 2,
            required_qty: 60,
            mrp: 650,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000012",
    category_id: 5,
    status: "Cancelled",
    priority: "Low",
    remarks: "Client altered shutter design; aluminium handles no longer required.",
    createdDaysAgo: 10,
    items: [
      {
        product_id: 2008, // J-Sec Handle Aluminium
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 57,
            payment_term_id: 4, // Cheque On Delivery
            required_qty: 20,
            mrp: 590,
            discount_pct: 5,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000013",
    category_id: 5,
    status: "Approved",
    priority: "Urgent",
    remarks: "Immediate procurement needed for Pune showroom sample mockups.",
    createdDaysAgo: 11,
    items: [
      {
        product_id: 2001,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 55,
            payment_term_id: 1,
            required_qty: 50,
            mrp: 680,
            discount_pct: 12,
            tax_pct: 18,
          },
        ],
      },
      {
        product_id: 2002,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56,
            payment_term_id: 1,
            required_qty: 35,
            mrp: 1250,
            discount_pct: 12,
            tax_pct: 18,
          },
        ],
      },
      {
        product_id: 2006,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56,
            payment_term_id: 1,
            required_qty: 30,
            mrp: 1350,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000014",
    category_id: 28,
    status: "ConvertedToPO",
    priority: "Medium",
    remarks: "Scheduled bulk purchase of edge banding.",
    createdDaysAgo: 12,
    items: [
      {
        product_id: 6046,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 91,
            payment_term_id: 7,
            required_qty: 200,
            mrp: 410,
            discount_pct: 18,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000015",
    category_id: 5,
    status: "PendingApproval",
    priority: "High",
    remarks: "Anodized black profile sections for luxury display units.",
    createdDaysAgo: 13,
    items: [
      {
        product_id: 2005,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 59, // UTTURKARS WOOD CULTURE
            payment_term_id: 2,
            required_qty: 90,
            mrp: 740,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000016",
    category_id: 5,
    status: "Approved",
    priority: "Medium",
    remarks: "Hospitality suite wardrobing project requirements.",
    createdDaysAgo: 14,
    items: [
      {
        product_id: 2003,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56,
            payment_term_id: 6,
            required_qty: 65,
            mrp: 1420,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
      {
        product_id: 2007,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56,
            payment_term_id: 6,
            required_qty: 45,
            mrp: 960,
            discount_pct: 8,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000017",
    category_id: 5,
    status: "Draft",
    priority: "Low",
    remarks: "Buffer reserve stock for factory maintenance.",
    createdDaysAgo: 15,
    items: [
      {
        product_id: 2004,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 60, // F.K. ENTERPRISES
            payment_term_id: 4,
            required_qty: 30,
            mrp: 640,
            discount_pct: 5,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000018",
    category_id: 5,
    status: "ConvertedToPO",
    priority: "Urgent",
    remarks: "Critical handles requisition for residential project deadline.",
    createdDaysAgo: 16,
    items: [
      {
        product_id: 2009,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 57,
            payment_term_id: 1,
            required_qty: 110,
            mrp: 620,
            discount_pct: 12,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000019",
    category_id: 5,
    status: "Rejected",
    priority: "Medium",
    remarks: "Vendor delivery timeframe does not align with site installation date.",
    createdDaysAgo: 17,
    items: [
      {
        product_id: 2010,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 61,
            payment_term_id: 3,
            required_qty: 85,
            mrp: 1120,
            discount_pct: 5,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000020",
    category_id: 28,
    status: "Approved",
    priority: "High",
    remarks: "Wood grain edge tape reels for retail chain display units.",
    createdDaysAgo: 18,
    items: [
      {
        product_id: 6046,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 91,
            payment_term_id: 2,
            required_qty: 180,
            mrp: 430,
            discount_pct: 15,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000021",
    category_id: 5,
    status: "PendingApproval",
    priority: "Medium",
    remarks: "L-section handles for Bangalore villa modular kitchens.",
    createdDaysAgo: 19,
    items: [
      {
        product_id: 2001,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 55,
            payment_term_id: 7,
            required_qty: 70,
            mrp: 680,
            discount_pct: 10,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
  {
    intent_no: "PI-000022",
    category_id: 5,
    status: "Draft",
    priority: "Low",
    remarks: "Preliminary estimate for upcoming architect presentation.",
    createdDaysAgo: 20,
    items: [
      {
        product_id: 2002,
        uom: "Meter",
        vendors: [
          {
            company_vendor_id: 56,
            payment_term_id: 1,
            required_qty: 25,
            mrp: 1250,
            discount_pct: 8,
            tax_pct: 18,
          },
        ],
      },
    ],
  },
];

async function seed() {
  console.log("Seeding 20 dummy Purchase Intent records...");

  const vendor_id = 1;
  const user_id = 11; // Super Admin

  for (const record of dummyRecords) {
    // Check if intent_no already exists
    const existing = await prisma.purchaseIntentMaster.findUnique({
      where: { intent_no: record.intent_no },
    });

    if (existing) {
      console.log(`Skipping existing intent: ${record.intent_no}`);
      continue;
    }

    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - record.createdDaysAgo);
    createdDate.setMinutes(createdDate.getMinutes() + Math.floor(Math.random() * 300));

    // Calculate totals across items and vendor mappings
    let intentAmount = 0;
    let intentTaxAmount = 0;
    let intentTotalAmount = 0;

    const itemCreateData = record.items.map((item) => {
      const vendorMappingsCreateData = item.vendors.map((v) => {
        const rate = Math.round(v.mrp * (1 - v.discount_pct / 100));
        const amount = Math.round(rate * v.required_qty);
        const tax_amount = Math.round((amount * v.tax_pct) / 100);
        const total_amount = amount + tax_amount;

        intentAmount += amount;
        intentTaxAmount += tax_amount;
        intentTotalAmount += total_amount;

        const reqDate = new Date(createdDate);
        reqDate.setDate(reqDate.getDate() + 7);

        return {
          company_vendor_id: v.company_vendor_id,
          payment_term_id: v.payment_term_id,
          required_qty: v.required_qty,
          required_by_date: reqDate,
          estimated_price: rate,
          mrp: v.mrp,
          discount_pct: v.discount_pct,
          rate: rate,
          tax_pct: v.tax_pct,
          cgst_pct: v.tax_pct / 2,
          sgst_pct: v.tax_pct / 2,
          igst_pct: 0,
          tax_amount: tax_amount,
          amount: amount,
          total_amount: total_amount,
          is_selected: record.status === "ConvertedToPO",
        };
      });

      return {
        product_id: item.product_id,
        uom: item.uom,
        remarks: item.remarks || null,
        created_at: createdDate,
        updated_at: createdDate,
        vendorMappings: {
          create: vendorMappingsCreateData,
        },
      };
    });

    const isApproved = record.status === "Approved" || record.status === "ConvertedToPO";
    const isRejected = record.status === "Rejected";

    const pi = await prisma.purchaseIntentMaster.create({
      data: {
        vendor_id,
        intent_no: record.intent_no,
        category_id: record.category_id,
        status: record.status,
        priority: record.priority,
        remarks: record.remarks,
        created_by: user_id,
        updated_by: user_id,
        approved_by: isApproved ? user_id : null,
        approved_at: isApproved ? createdDate : null,
        rejected_by: isRejected ? user_id : null,
        rejected_at: isRejected ? createdDate : null,
        rejection_reason: isRejected ? "Price quote exceeded acceptable tolerance." : null,
        amount: intentAmount,
        tax_amount: intentTaxAmount,
        total_amount: intentTotalAmount,
        created_at: createdDate,
        updated_at: createdDate,
        items: {
          create: itemCreateData,
        },
        statusLogs: {
          create: [
            {
              from_status: null,
              to_status: record.status,
              changed_by: user_id,
              remarks: `Intent created with status ${record.status}`,
              created_at: createdDate,
            },
          ],
        },
      },
    });

    console.log(`Created Purchase Intent: ${pi.intent_no} (ID: ${pi.id}, Total: ₹${intentTotalAmount})`);
  }

  const count = await prisma.purchaseIntentMaster.count({
    where: { vendor_id: 1, is_deleted: false },
  });
  console.log(`Seeding complete! Total Purchase Intents in DB: ${count}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error during seeding:", err);
    process.exit(1);
  });
