import { prisma } from "../../prisma/client";

export interface CreateRuleConditionDto {
  condition_type: "COLUMN" | "CATEGORY";
  field_key?: string;
  operator:
    | "EQUALS"
    | "NOT_EQUALS"
    | "CONTAINS"
    | "NOT_CONTAINS"
    | "STARTS_WITH"
    | "ENDS_WITH"
    | "IS_BLANK"
    | "IS_NOT_BLANK"
    | "LESS_THAN"
    | "LESS_THAN_OR_EQUAL"
    | "GREATER_THAN"
    | "GREATER_THAN_OR_EQUAL"
    | "IN"
    | "NOT_IN"
    | "BETWEEN";
  value: any;
  logical_operator?: "AND" | "OR" | null;
  sequence_no: number;
}

export interface CreateRuleConditionGroupDto {
  logical_operator?: "AND" | "OR" | null;
  sequence_no: number;
  conditions: CreateRuleConditionDto[];
}

export interface CreateRuleActionDto {
  action_id: number;
  action_value?: any;
  sequence_no: number;
}

export interface CreateRuleDto {
  vendor_id: number;
  machine_id: number;
  rule_code: string;
  rule_name: string;
  rule_tag?: string;
  priority?: number;
  status?: "ACTIVE" | "INACTIVE";
  created_by?: number;
  conditionGroups: CreateRuleConditionGroupDto[];
  actions: CreateRuleActionDto[];
}

export interface UpdateRuleDto {
  rule_code?: string;
  rule_name?: string;
  rule_tag?: string;
  priority?: number;
  status?: "ACTIVE" | "INACTIVE";
  updated_by?: number;
  conditionGroups?: CreateRuleConditionGroupDto[];
  actions?: CreateRuleActionDto[];
}

export class CutListRuleService {
  /**
   * Get all rules for a given machine
   */
  static async getRulesByMachine(machineId: number, vendorId?: number) {
    const whereClause: any = { machine_id: machineId };
    if (vendorId) {
      whereClause.vendor_id = vendorId;
    }

    return prisma.cutListRuleMaster.findMany({
      where: whereClause,
      include: {
        conditionGroups: {
          orderBy: { sequence_no: "asc" },
          include: {
            conditions: {
              orderBy: { sequence_no: "asc" },
            },
          },
        },
        actions: {
          orderBy: { sequence_no: "asc" },
          include: {
            actionMaster: true,
          },
        },
        createdBy: {
          select: { id: true, user_name: true, user_email: true },
        },
        updatedBy: {
          select: { id: true, user_name: true, user_email: true },
        },
      },
      orderBy: [{ priority: "asc" }, { id: "desc" }],
    });
  }

  /**
   * Get single rule details by rule id
   */
  static async getRuleById(ruleId: number) {
    const rule = await prisma.cutListRuleMaster.findUnique({
      where: { id: ruleId },
      include: {
        conditionGroups: {
          orderBy: { sequence_no: "asc" },
          include: {
            conditions: {
              orderBy: { sequence_no: "asc" },
            },
          },
        },
        actions: {
          orderBy: { sequence_no: "asc" },
          include: {
            actionMaster: true,
          },
        },
        machine: {
          select: { id: true, machine_name: true, machine_code: true },
        },
        vendor: {
          select: { id: true, vendor_name: true, vendor_code: true },
        },
      },
    });

    if (!rule) {
      throw new Error(`Rule with ID ${ruleId} not found`);
    }

    return rule;
  }

  /**
   * Create a new rule with nested condition groups and actions
   */
  static async createRule(payload: CreateRuleDto) {
    const {
      vendor_id,
      machine_id,
      rule_code,
      rule_name,
      rule_tag = "CUTLIST_MACHINE_ROUTING",
      priority = 10,
      status = "ACTIVE",
      created_by,
      conditionGroups,
      actions,
    } = payload;

    return prisma.$transaction(async (tx) => {
      const rule = await tx.cutListRuleMaster.create({
        data: {
          vendor_id,
          machine_id,
          rule_code,
          rule_name,
          rule_tag,
          priority,
          status,
          created_by,
          conditionGroups: {
            create: conditionGroups.map((group, groupIdx) => ({
              logical_operator: group.logical_operator || null,
              sequence_no: group.sequence_no || groupIdx + 1,
              conditions: {
                create: group.conditions.map((cond, condIdx) => ({
                  condition_type: cond.condition_type,
                  field_key: cond.field_key || null,
                  operator: cond.operator,
                  value: cond.value,
                  logical_operator: cond.logical_operator || null,
                  sequence_no: cond.sequence_no || condIdx + 1,
                })),
              },
            })),
          },
          actions: {
            create: actions.map((act, actIdx) => ({
              action_id: act.action_id,
              action_value: act.action_value ?? null,
              sequence_no: act.sequence_no || actIdx + 1,
            })),
          },
        },
        include: {
          conditionGroups: {
            include: { conditions: true },
          },
          actions: {
            include: { actionMaster: true },
          },
        },
      });

      return rule;
    });
  }

  /**
   * Update an existing rule
   */
  static async updateRule(ruleId: number, payload: UpdateRuleDto) {
    const existingRule = await prisma.cutListRuleMaster.findUnique({
      where: { id: ruleId },
    });

    if (!existingRule) {
      throw new Error(`Rule with ID ${ruleId} not found`);
    }

    return prisma.$transaction(async (tx) => {
      // 1. Update master rule fields
      await tx.cutListRuleMaster.update({
        where: { id: ruleId },
        data: {
          rule_code: payload.rule_code ?? existingRule.rule_code,
          rule_name: payload.rule_name ?? existingRule.rule_name,
          rule_tag: payload.rule_tag ?? existingRule.rule_tag,
          priority: payload.priority ?? existingRule.priority,
          status: payload.status ?? existingRule.status,
          updated_by: payload.updated_by,
        },
      });

      // 2. Replace condition groups if provided
      if (payload.conditionGroups) {
        await tx.cutListRuleConditionGroup.deleteMany({
          where: { rule_id: ruleId },
        });

        for (let gIdx = 0; gIdx < payload.conditionGroups.length; gIdx++) {
          const groupDto = payload.conditionGroups[gIdx];
          await tx.cutListRuleConditionGroup.create({
            data: {
              rule_id: ruleId,
              logical_operator: groupDto.logical_operator || null,
              sequence_no: groupDto.sequence_no || gIdx + 1,
              conditions: {
                create: groupDto.conditions.map((cond, cIdx) => ({
                  condition_type: cond.condition_type,
                  field_key: cond.field_key || null,
                  operator: cond.operator,
                  value: cond.value,
                  logical_operator: cond.logical_operator || null,
                  sequence_no: cond.sequence_no || cIdx + 1,
                })),
              },
            },
          });
        }
      }

      // 3. Replace actions if provided
      if (payload.actions) {
        await tx.cutListRuleAction.deleteMany({
          where: { rule_id: ruleId },
        });

        for (let aIdx = 0; aIdx < payload.actions.length; aIdx++) {
          const actDto = payload.actions[aIdx];
          await tx.cutListRuleAction.create({
            data: {
              rule_id: ruleId,
              action_id: actDto.action_id,
              action_value: actDto.action_value ?? null,
              sequence_no: actDto.sequence_no || aIdx + 1,
            },
          });
        }
      }

      return this.getRuleById(ruleId);
    });
  }

  /**
   * Delete a rule
   */
  static async deleteRule(ruleId: number) {
    const existingRule = await prisma.cutListRuleMaster.findUnique({
      where: { id: ruleId },
    });

    if (!existingRule) {
      throw new Error(`Rule with ID ${ruleId} not found`);
    }

    return prisma.cutListRuleMaster.delete({
      where: { id: ruleId },
    });
  }

  /**
   * Toggle rule active status
   */
  static async toggleRuleStatus(ruleId: number, status: "ACTIVE" | "INACTIVE") {
    return prisma.cutListRuleMaster.update({
      where: { id: ruleId },
      data: { status },
    });
  }

  /**
   * Get valid rule fields from RuleFieldMaster
   */
  static async getRuleFields() {
    return prisma.ruleFieldMaster.findMany({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
    });
  }

  /**
   * Get vendor actions from RuleActionMaster
   */
  static async getVendorRuleActions(vendorId: number) {
    return prisma.ruleActionMaster.findMany({
      where: { vendor_id: vendorId, status: "ACTIVE" },
      orderBy: { id: "asc" },
    });
  }

  /**
   * Ensure default vendor actions exist for a vendor
   */
  static async ensureVendorActions(vendorId: number) {
    const defaultActions = [
      { action_code: "SEND_TO_MACHINE", action_name: "Send To Machine" },
      { action_code: "DO_NOT_SEND_TO_MACHINE", action_name: "Do Not Send To Machine" },
      { action_code: "REQUIRE_APPROVAL", action_name: "Require Manual Approval" },
    ];

    for (const def of defaultActions) {
      const existing = await prisma.ruleActionMaster.findFirst({
        where: { vendor_id: vendorId, action_code: def.action_code },
      });
      if (!existing) {
        await prisma.ruleActionMaster.create({
          data: {
            vendor_id: vendorId,
            action_code: def.action_code,
            action_name: def.action_name,
            status: "ACTIVE",
          },
        });
      }
    }
  }

  /**
   * Build default rule payload for a machine based on hardcoded system logic
   */
  static buildDefaultRulePayload(
    machine: {
      id: number;
      machine_name: string;
      machine_code?: string | null;
      machine_type_id?: number | null;
      machineType?: { id: number; machine_type: string } | null;
    },
    actionId: number,
    vendorId: number,
    userId?: number,
    categories: any[] = [],
    doNotSendActionId?: number
  ): CreateRuleDto {
    const typeId = Number(machine.machine_type_id);
    const typeName = (
      machine.machineType?.machine_type ||
      machine.machine_name ||
      ""
    ).toLowerCase();

    const isEdgeBander =
      typeId === 11 ||
      typeName.includes("edge");

    const isCncOrDrill =
      typeId === 6 ||
      typeId === 7 ||
      typeId === 8 ||
      typeName.includes("cnc") ||
      typeName.includes("router") ||
      typeName.includes("drill");

    const isQc =
      typeId === 17 ||
      typeName.includes("qc") ||
      typeName.includes("quality");

    const isPackaging =
      typeId === 18 ||
      typeName.includes("pack");

    const isCuttingSaw =
      typeId === 3 ||
      typeName.includes("saw") ||
      typeName.includes("cutting") ||
      typeName.includes("nesting") ||
      typeName.includes("beam") ||
      typeName.includes("panel");

    let ruleName = `${machine.machine_name} - Standard Cutlist Routing`;
    let ruleCode = `${(machine.machine_code || machine.machine_name)
      .trim()
      .replace(/[\s\W]+/g, "_")
      .toUpperCase()}_DEFAULT`;

    let conditionGroups: CreateRuleConditionGroupDto[] = [];
    const finalActionId = (isCncOrDrill && doNotSendActionId) ? doNotSendActionId : actionId;

    if (isEdgeBander) {
      ruleName = `${machine.machine_name} - Edgebanding Required`;
      conditionGroups = [
        {
          sequence_no: 1,
          logical_operator: null,
          conditions: [
            {
              sequence_no: 1,
              condition_type: "COLUMN",
              field_key: "elf",
              operator: "IS_NOT_BLANK",
              value: "",
              logical_operator: "OR",
            },
            {
              sequence_no: 2,
              condition_type: "COLUMN",
              field_key: "elb",
              operator: "IS_NOT_BLANK",
              value: "",
              logical_operator: "OR",
            },
            {
              sequence_no: 3,
              condition_type: "COLUMN",
              field_key: "esl",
              operator: "IS_NOT_BLANK",
              value: "",
              logical_operator: "OR",
            },
            {
              sequence_no: 4,
              condition_type: "COLUMN",
              field_key: "esr",
              operator: "IS_NOT_BLANK",
              value: "",
              logical_operator: null,
            },
          ],
        },
      ];
    } else if (isCncOrDrill) {
      // Horizontal CNC & CNC Drilling operations:
      // Factory standard: Do Not Send back panels (contains "back") or thin panels (< 8mm) to Horizontal CNC.
      ruleName = machine.machine_name || "Horizontal CNC";
      ruleCode = machine.machine_code || machine.machine_name || "Horizontal CNC";
      conditionGroups = [
        {
          sequence_no: 1,
          logical_operator: null,
          conditions: [
            {
              sequence_no: 1,
              condition_type: "COLUMN",
              field_key: "thickness",
              operator: "LESS_THAN",
              value: 8,
              logical_operator: "OR",
            },
            {
              sequence_no: 2,
              condition_type: "COLUMN",
              field_key: "item_name",
              operator: "CONTAINS",
              value: "back",
              logical_operator: null,
            },
          ],
        },
      ];
    } else if (isQc) {
      ruleName = `${machine.machine_name} - Quality Check Scan`;
      conditionGroups = [
        {
          sequence_no: 1,
          logical_operator: null,
          conditions: [
            {
              sequence_no: 1,
              condition_type: "CATEGORY",
              operator: "IN",
              value: "ALL",
              logical_operator: null,
            },
          ],
        },
      ];
    } else if (isPackaging) {
      ruleName = `${machine.machine_name} - Packaging Station Flow`;
      conditionGroups = [
        {
          sequence_no: 1,
          logical_operator: null,
          conditions: [
            {
              sequence_no: 1,
              condition_type: "CATEGORY",
              operator: "IN",
              value: "ALL",
              logical_operator: null,
            },
          ],
        },
      ];
    } else if (isCuttingSaw) {
      ruleName = `${machine.machine_name} - Standard Cutting Flow`;

      const validCategoryIds = (categories || [])
        .filter((cat: any) => {
          const mappings = cat.projectCategoriesMasterVendorMapping || [];
          const typeIds: number[] = mappings
            .map((m: any) =>
              Number(
                m.project_categories_type_master_id ??
                  m.projectCategoriesTypeMaster?.id
              )
            )
            .filter((id: number) => !isNaN(id) && id > 0);

          const hasType4 = typeIds.includes(4);
          const hasType3 = typeIds.includes(3);
          const hasType1Or2 = typeIds.some((t) => t === 1 || t === 2);
          const isNormalFlow = hasType1Or2 || typeIds.length === 0;

          // Exclude Type 4 (Hardware / Non-Production Outsource)
          if (hasType4) return false;
          // Exclude Type 3-only (Non-Production / Scan & Pack only)
          if (hasType3 && !isNormalFlow) return false;

          return true;
        })
        .map((cat: any) => Number(cat.id));

      conditionGroups = [
        {
          sequence_no: 1,
          logical_operator: null,
          conditions: [
            {
              sequence_no: 1,
              condition_type: "CATEGORY",
              operator: "IN",
              value: validCategoryIds.length > 0 ? validCategoryIds : "ALL",
              logical_operator: null,
            },
          ],
        },
      ];
    } else {
      // Presses & General Machines
      ruleName = `${machine.machine_name} - Standard Cutlist Routing`;
      conditionGroups = [
        {
          sequence_no: 1,
          logical_operator: null,
          conditions: [
            {
              sequence_no: 1,
              condition_type: "CATEGORY",
              operator: "IN",
              value: "ALL",
              logical_operator: null,
            },
          ],
        },
      ];
    }

    return {
      vendor_id: vendorId,
      machine_id: machine.id,
      rule_name: ruleName,
      rule_code: ruleCode,
      rule_tag: "CUTLIST_MACHINE_ROUTING",
      priority: 1,
      status: "ACTIVE",
      created_by: userId,
      conditionGroups,
      actions: [
        {
          action_id: finalActionId,
          action_value: null,
          sequence_no: 1,
        },
      ],
    };
  }

  /**
   * Get default rule template for a machine (used by frontend to preview/populate)
   */
  static async getDefaultRuleTemplate(machineId: number, vendorId: number) {
    await this.ensureVendorActions(vendorId);

    const machine = await prisma.machineMaster.findFirst({
      where: { id: machineId, vendor_id: vendorId },
      include: { machineType: true },
    });

    if (!machine) {
      throw new Error(`Machine with ID ${machineId} not found for vendor`);
    }

    const sendAction = await prisma.ruleActionMaster.findFirst({
      where: { vendor_id: vendorId, action_code: "SEND_TO_MACHINE", status: "ACTIVE" },
    });

    const doNotSendAction = await prisma.ruleActionMaster.findFirst({
      where: { vendor_id: vendorId, action_code: "DO_NOT_SEND_TO_MACHINE", status: "ACTIVE" },
    });

    if (!sendAction) {
      throw new Error("SEND_TO_MACHINE action could not be found or created for this vendor");
    }

    const categories = await prisma.projectCategoriesMaster.findMany({
      where: { vendor_id: vendorId, status: "Yes" },
      include: {
        projectCategoriesMasterVendorMapping: true,
      },
    });

    return this.buildDefaultRulePayload(
      machine,
      sendAction.id,
      vendorId,
      undefined,
      categories,
      doNotSendAction?.id
    );
  }

  /**
   * Automatically generate default rules for all vendor machines
   */
  static async generateDefaultRules(
    vendorId: number,
    options: { overwrite?: boolean; created_by?: number; machine_id?: number } = {}
  ) {
    await this.ensureVendorActions(vendorId);

    const sendAction = await prisma.ruleActionMaster.findFirst({
      where: { vendor_id: vendorId, action_code: "SEND_TO_MACHINE", status: "ACTIVE" },
    });

    const doNotSendAction = await prisma.ruleActionMaster.findFirst({
      where: { vendor_id: vendorId, action_code: "DO_NOT_SEND_TO_MACHINE", status: "ACTIVE" },
    });

    if (!sendAction) {
      throw new Error("SEND_TO_MACHINE action could not be found or created for this vendor");
    }

    const machineWhere: any = { vendor_id: vendorId, status: "ACTIVE", is_deleted: false };
    if (options.machine_id) {
      machineWhere.id = options.machine_id;
    }

    const machines = await prisma.machineMaster.findMany({
      where: machineWhere,
      include: { machineType: true },
      orderBy: { sequence_no: "asc" },
    });

    if (machines.length === 0) {
      return {
        success: true,
        message: "No active machines found for vendor",
        createdCount: 0,
        skippedCount: 0,
        updatedCount: 0,
        totalMachines: 0,
        rules: [],
      };
    }

    const categories = await prisma.projectCategoriesMaster.findMany({
      where: { vendor_id: vendorId, status: "Yes" },
      include: {
        projectCategoriesMasterVendorMapping: true,
      },
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const rulesCreatedOrUpdated: any[] = [];

    for (const machine of machines) {
      const existingRules = await prisma.cutListRuleMaster.findMany({
        where: { vendor_id: vendorId, machine_id: machine.id },
      });

      if (existingRules.length > 0 && !options.overwrite) {
        skippedCount++;
        continue;
      }

      if (existingRules.length > 0 && options.overwrite) {
        for (const oldRule of existingRules) {
          await this.deleteRule(oldRule.id);
        }
        updatedCount++;
      } else {
        createdCount++;
      }

      const defaultRulePayload = this.buildDefaultRulePayload(
        machine,
        sendAction.id,
        vendorId,
        options.created_by,
        categories,
        doNotSendAction?.id
      );

      const created = await this.createRule(defaultRulePayload);
      rulesCreatedOrUpdated.push(created);
    }

    return {
      success: true,
      message: `Default rules processed: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped.`,
      createdCount,
      updatedCount,
      skippedCount,
      totalMachines: machines.length,
      rules: rulesCreatedOrUpdated,
    };
  }
}
