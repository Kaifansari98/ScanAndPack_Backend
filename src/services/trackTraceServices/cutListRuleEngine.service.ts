import { prisma } from "../../prisma/client";

export interface CutListItemPayload {
  id?: number;
  item_name?: string | null;
  group_name?: string | null;
  procurement?: string | null;
  length?: number | string | null;
  width?: number | string | null;
  thickness?: number | string | null;
  qty?: number | null;
  weight?: number | null;
  unique_code?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  material_details?: string | null;
  elf?: string | null;
  elb?: string | null;
  esl?: string | null;
  esr?: string | null;
  [key: string]: any;
}

export interface RuleEvaluationOutcome {
  allowed: boolean;
  targetMachineId: number;
  appliedRuleId: number | null;
  matchingRuleCode: string | null;
  matchingRuleName: string | null;
  actionsApplied: Array<{ action_code: string; action_value: any }>;
}

export class CutListRuleEngineService {
  /**
   * Evaluate machine rules for a given CutList item and candidate machine
   */
  static async evaluateMachineRules(
    cutItem: CutListItemPayload,
    candidateMachineId: number,
    vendorId: number
  ): Promise<RuleEvaluationOutcome> {
    const outcome: RuleEvaluationOutcome = {
      allowed: true,
      targetMachineId: candidateMachineId,
      appliedRuleId: null,
      matchingRuleCode: null,
      matchingRuleName: null,
      actionsApplied: [],
    };

    // 1. Fetch active rules for the vendor and machine, ordered by priority
    const rules = await prisma.cutListRuleMaster.findMany({
      where: {
        vendor_id: vendorId,
        machine_id: candidateMachineId,
        status: "ACTIVE",
      },
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
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
    });

    if (!rules || rules.length === 0) {
      return outcome;
    }

    // 2. Evaluate rules sequentially (highest priority first)
    for (const rule of rules) {
      const isMatch = this.evaluateRuleConditions(rule.conditionGroups, cutItem);

      if (isMatch) {
        outcome.appliedRuleId = rule.id;
        outcome.matchingRuleCode = rule.rule_code;
        outcome.matchingRuleName = rule.rule_name;

        // Process actions associated with this rule
        for (const act of rule.actions) {
          const actionCode = act.actionMaster?.action_code;
          const actionVal = act.action_value;

          outcome.actionsApplied.push({
            action_code: actionCode,
            action_value: actionVal,
          });

          if (actionCode === "DO_NOT_SEND_TO_MACHINE") {
            outcome.allowed = false;
          } else if (actionCode === "SEND_TO_MACHINE") {
            outcome.allowed = true;
          } else if (actionCode === "REPLACE_MACHINE") {
            const replMachineId =
              typeof actionVal === "object" && actionVal !== null && !Array.isArray(actionVal)
                ? Number((actionVal as Record<string, any>).machine_id)
                : Number(actionVal);
            if (!isNaN(replMachineId) && replMachineId > 0) {
              outcome.targetMachineId = replMachineId;
            }
          }
        }

        // First matching rule wins (based on priority order)
        break;
      }
    }

    return outcome;
  }

  /**
   * Evaluate all condition groups for a rule against a cut item
   */
  private static evaluateRuleConditions(
    conditionGroups: any[],
    cutItem: CutListItemPayload
  ): boolean {
    if (!conditionGroups || conditionGroups.length === 0) {
      return true;
    }

    let overallResult = true;

    for (let i = 0; i < conditionGroups.length; i++) {
      const group = conditionGroups[i];
      const groupMatch = this.evaluateSingleGroup(group.conditions, cutItem);

      if (i === 0) {
        overallResult = groupMatch;
      } else {
        const prevLogicalOp = conditionGroups[i - 1].logical_operator || "AND";
        if (prevLogicalOp === "OR") {
          overallResult = overallResult || groupMatch;
        } else {
          overallResult = overallResult && groupMatch;
        }
      }
    }

    return overallResult;
  }

  /**
   * Evaluate a single condition group (joined by inner logical operators)
   */
  private static evaluateSingleGroup(
    conditions: any[],
    cutItem: CutListItemPayload
  ): boolean {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    let groupResult = true;

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      const condMatch = this.evaluateSingleCondition(cond, cutItem);

      if (i === 0) {
        groupResult = condMatch;
      } else {
        const prevLogicalOp = conditions[i - 1].logical_operator || "AND";
        if (prevLogicalOp === "OR") {
          groupResult = groupResult || condMatch;
        } else {
          groupResult = groupResult && condMatch;
        }
      }
    }

    return groupResult;
  }

  /**
   * Evaluate a single condition against item data
   */
  private static evaluateSingleCondition(
    cond: any,
    cutItem: CutListItemPayload
  ): boolean {
    let itemValue: any = null;

    if (cond.condition_type === "COLUMN") {
      const key = cond.field_key;
      if (!key) return false;
      itemValue = cutItem[key];
    } else if (cond.condition_type === "CATEGORY") {
      itemValue = cutItem.category_id ?? cutItem.category_name;
    }

    return this.compareValues(itemValue, cond.operator, cond.value);
  }

  /**
   * Comparison helper for operators
   */
  private static compareValues(itemValue: any, operator: string, ruleValue: any): boolean {
    if (itemValue === undefined || itemValue === null) {
      if (operator === "NOT_EQUALS" || operator === "NOT_IN") return true;
      return false;
    }

    const itemStr = String(itemValue).trim().toLowerCase();
    const itemNum = Number(itemValue);
    const isItemNumeric = !isNaN(itemNum);

    switch (operator) {
      case "EQUALS": {
        if (isItemNumeric && !isNaN(Number(ruleValue))) {
          return itemNum === Number(ruleValue);
        }
        return itemStr === String(ruleValue).trim().toLowerCase();
      }

      case "NOT_EQUALS": {
        if (isItemNumeric && !isNaN(Number(ruleValue))) {
          return itemNum !== Number(ruleValue);
        }
        return itemStr !== String(ruleValue).trim().toLowerCase();
      }

      case "CONTAINS": {
        return itemStr.includes(String(ruleValue).trim().toLowerCase());
      }

      case "NOT_CONTAINS": {
        return !itemStr.includes(String(ruleValue).trim().toLowerCase());
      }

      case "LESS_THAN": {
        return isItemNumeric && itemNum < Number(ruleValue);
      }

      case "LESS_THAN_OR_EQUAL": {
        return isItemNumeric && itemNum <= Number(ruleValue);
      }

      case "GREATER_THAN": {
        return isItemNumeric && itemNum > Number(ruleValue);
      }

      case "GREATER_THAN_OR_EQUAL": {
        return isItemNumeric && itemNum >= Number(ruleValue);
      }

      case "IN": {
        const arr = Array.isArray(ruleValue)
          ? ruleValue
          : typeof ruleValue === "string"
          ? ruleValue.split(",").map((v) => v.trim())
          : [ruleValue];

        return arr.some((val) => {
          if (isItemNumeric && !isNaN(Number(val))) {
            return itemNum === Number(val);
          }
          return itemStr === String(val).trim().toLowerCase();
        });
      }

      case "NOT_IN": {
        const arr = Array.isArray(ruleValue)
          ? ruleValue
          : typeof ruleValue === "string"
          ? ruleValue.split(",").map((v) => v.trim())
          : [ruleValue];

        return !arr.some((val) => {
          if (isItemNumeric && !isNaN(Number(val))) {
            return itemNum === Number(val);
          }
          return itemStr === String(val).trim().toLowerCase();
        });
      }

      case "BETWEEN": {
        if (!Array.isArray(ruleValue) || ruleValue.length < 2) return false;
        const [min, max] = ruleValue;
        return isItemNumeric && itemNum >= Number(min) && itemNum <= Number(max);
      }

      default:
        return false;
    }
  }
}
