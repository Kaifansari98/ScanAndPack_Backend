import { Request, Response } from "express";
import { CutListRuleService } from "../../services/trackTraceServices/cutListRule.service";

export class CutListRuleController {
  /**
   * GET /machines/:machine_id/rules
   */
  static async getRulesByMachine(req: Request, res: Response) {
    try {
      const machineId = Number(req.params.machine_id);
      const vendorId = req.query.vendor_id ? Number(req.query.vendor_id) : undefined;

      if (!machineId || isNaN(machineId)) {
        return res.status(400).json({ success: false, message: "Invalid machine ID" });
      }

      const rules = await CutListRuleService.getRulesByMachine(machineId, vendorId);
      return res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (error: any) {
      console.error("Controller Error - getRulesByMachine:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch machine rules",
      });
    }
  }

  /**
   * GET /machines/:machine_id/rules/:rule_id
   */
  static async getRuleById(req: Request, res: Response) {
    try {
      const ruleId = Number(req.params.rule_id);
      if (!ruleId || isNaN(ruleId)) {
        return res.status(400).json({ success: false, message: "Invalid rule ID" });
      }

      const rule = await CutListRuleService.getRuleById(ruleId);
      return res.status(200).json({
        success: true,
        data: rule,
      });
    } catch (error: any) {
      console.error("Controller Error - getRuleById:", error);
      return res.status(404).json({
        success: false,
        message: error.message || "Rule not found",
      });
    }
  }

  /**
   * POST /machines/:machine_id/rules
   */
  static async createRule(req: Request, res: Response) {
    try {
      const machineId = Number(req.params.machine_id);
      const {
        vendor_id,
        rule_code,
        rule_name,
        rule_tag,
        priority,
        status,
        created_by,
        conditionGroups,
        actions,
      } = req.body;

      if (!machineId || isNaN(machineId)) {
        return res.status(400).json({ success: false, message: "Invalid machine ID" });
      }
      if (!vendor_id || !rule_code || !rule_name) {
        return res.status(400).json({
          success: false,
          message: "vendor_id, rule_code, and rule_name are required",
        });
      }
      if (!Array.isArray(conditionGroups) || conditionGroups.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one condition group is required",
        });
      }
      if (!Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one action is required",
        });
      }

      const rule = await CutListRuleService.createRule({
        vendor_id: Number(vendor_id),
        machine_id: machineId,
        rule_code,
        rule_name,
        rule_tag,
        priority: priority ? Number(priority) : 10,
        status,
        created_by: created_by ? Number(created_by) : undefined,
        conditionGroups,
        actions,
      });

      return res.status(201).json({
        success: true,
        message: "Rule created successfully",
        data: rule,
      });
    } catch (error: any) {
      console.error("Controller Error - createRule:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create rule",
      });
    }
  }

  /**
   * PUT /machines/:machine_id/rules/:rule_id
   */
  static async updateRule(req: Request, res: Response) {
    try {
      const ruleId = Number(req.params.rule_id);
      if (!ruleId || isNaN(ruleId)) {
        return res.status(400).json({ success: false, message: "Invalid rule ID" });
      }

      const updatedRule = await CutListRuleService.updateRule(ruleId, req.body);
      return res.status(200).json({
        success: true,
        message: "Rule updated successfully",
        data: updatedRule,
      });
    } catch (error: any) {
      console.error("Controller Error - updateRule:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update rule",
      });
    }
  }

  /**
   * DELETE /machines/:machine_id/rules/:rule_id
   */
  static async deleteRule(req: Request, res: Response) {
    try {
      const ruleId = Number(req.params.rule_id);
      if (!ruleId || isNaN(ruleId)) {
        return res.status(400).json({ success: false, message: "Invalid rule ID" });
      }

      await CutListRuleService.deleteRule(ruleId);
      return res.status(200).json({
        success: true,
        message: "Rule deleted successfully",
      });
    } catch (error: any) {
      console.error("Controller Error - deleteRule:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to delete rule",
      });
    }
  }

  /**
   * PATCH /machines/:machine_id/rules/:rule_id/status
   */
  static async toggleRuleStatus(req: Request, res: Response) {
    try {
      const ruleId = Number(req.params.rule_id);
      const { status } = req.body;

      if (!ruleId || isNaN(ruleId)) {
        return res.status(400).json({ success: false, message: "Invalid rule ID" });
      }
      if (!status || !["ACTIVE", "INACTIVE"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Valid status (ACTIVE or INACTIVE) is required",
        });
      }

      const updated = await CutListRuleService.toggleRuleStatus(ruleId, status);
      return res.status(200).json({
        success: true,
        message: `Rule status updated to ${status}`,
        data: updated,
      });
    } catch (error: any) {
      console.error("Controller Error - toggleRuleStatus:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to toggle rule status",
      });
    }
  }

  /**
   * GET /rule-masters/fields
   */
  static async getRuleFields(req: Request, res: Response) {
    try {
      const fields = await CutListRuleService.getRuleFields();
      return res.status(200).json({
        success: true,
        data: fields,
      });
    } catch (error: any) {
      console.error("Controller Error - getRuleFields:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch rule fields",
      });
    }
  }

  /**
   * GET /rule-masters/actions
   */
  static async getVendorRuleActions(req: Request, res: Response) {
    try {
      const vendorId = req.query.vendor_id ? Number(req.query.vendor_id) : undefined;
      if (!vendorId || isNaN(vendorId)) {
        return res.status(400).json({ success: false, message: "vendor_id is required" });
      }

      const actions = await CutListRuleService.getVendorRuleActions(vendorId);
      return res.status(200).json({
        success: true,
        data: actions,
      });
    } catch (error: any) {
      console.error("Controller Error - getVendorRuleActions:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch vendor rule actions",
      });
    }
  }
}
