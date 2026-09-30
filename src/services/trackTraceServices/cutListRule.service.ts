import { prisma } from "../../prisma/client";

export interface CreateRuleConditionDto {
  condition_type: "COLUMN" | "CATEGORY";
  field_key?: string;
  operator:
    | "EQUALS"
    | "NOT_EQUALS"
    | "CONTAINS"
    | "NOT_CONTAINS"
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
}
