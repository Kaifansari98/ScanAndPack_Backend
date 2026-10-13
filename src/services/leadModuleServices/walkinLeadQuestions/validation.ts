import Joi from "joi";
import { walkinLeadDefaults } from "../../../data/walkinLeadDefaults";

export type Question = {
  key: string;
  label: string;
  type: "text" | "number" | "single_select" | "multi_select" | "file";
  required: boolean;
  options: string[];
  sort_order: number;
  // Single choice only: adds an "Others" option answered with free text.
  allow_other?: boolean;
  min?: number;
  integer?: boolean;
  accepted_mime_types?: string[];
  max_files?: number;
  max_file_size_bytes?: number;
};
export type AnswerValue = string | number | string[];
export type AnswerGroup = {
  product_type_id: number;
  questionnaire_key: string;
  questionnaire_version: number;
  answers: Record<string, AnswerValue>;
};
export const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
export const maxFileSize = 10 * 1024 * 1024;
export const maxOtherAnswerLength = 500;
export class WalkinValidationError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

const questionSchema = Joi.object({
  key: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).max(100).required(),
  label: Joi.string().trim().max(1000).required(),
  type: Joi.string().valid("text", "number", "single_select", "multi_select", "file").required(),
  required: Joi.boolean().required(),
  options: Joi.array().items(Joi.string().trim().max(300)).unique().max(100).default([]),
  sort_order: Joi.number().integer().min(0).required(),
  allow_other: Joi.boolean().optional(),
  min: Joi.number().optional(),
  integer: Joi.boolean().optional(),
  accepted_mime_types: Joi.array().items(Joi.string().valid(...allowedMimeTypes)).unique().min(1),
  max_files: Joi.number().integer().min(1).max(5),
  max_file_size_bytes: Joi.number().integer().min(1).max(maxFileSize),
}).custom((q: Question, helpers) => {
  const select = q.type === "single_select" || q.type === "multi_select";
  if (select !== (q.options.length > 0)) return helpers.message({ custom: "Only select questions must have options" });
  if (q.allow_other && q.type !== "single_select") return helpers.message({ custom: "Only single choice questions can allow a custom Others answer" });
  if (q.allow_other && q.options.some(option => /^others?$/i.test(option))) return helpers.message({ custom: "Remove the Others option; it is added automatically" });
  if (q.type !== "number" && (q.min !== undefined || q.integer !== undefined)) return helpers.message({ custom: "Numeric constraints require a number question" });
  if (q.type !== "file" && (q.accepted_mime_types || q.max_files || q.max_file_size_bytes)) return helpers.message({ custom: "File constraints require a file question" });
  return q;
});
export function validateQuestions(input: unknown): Question[] {
  const { error, value } = Joi.array().items(questionSchema).unique("key").min(1).max(100).required().validate(input, { convert: false });
  if (error) throw new WalkinValidationError(error.message);
  return value.sort((a: Question, b: Question) => a.sort_order - b.sort_order);
}
const answerValueSchema = Joi.alternatives().try(
  Joi.string().max(5000).allow(""), Joi.number(), Joi.array().items(Joi.string().max(300)).max(100),
);
export const answerGroupsSchema = Joi.array().items(Joi.object({
  product_type_id: Joi.number().integer().positive().required(),
  questionnaire_key: Joi.string().max(150).required(),
  questionnaire_version: Joi.number().integer().positive().required(),
  answers: Joi.object().pattern(Joi.string().max(100), answerValueSchema).max(100).required(),
})).unique("product_type_id").max(50);

export function parseAnswerGroups(input: unknown): AnswerGroup[] {
  let parsed = input;
  if (typeof input === "string") {
    try { parsed = JSON.parse(input); }
    catch { throw new WalkinValidationError("walkin_answers must contain valid JSON"); }
  }
  const { error, value } = answerGroupsSchema.required().validate(parsed, { convert: false });
  if (error) throw new WalkinValidationError(error.message);
  return value;
}

// A single edited answer; null or an empty value clears it.
export function parseAnswerValue(input: unknown): AnswerValue | undefined {
  if (input === undefined || input === null) return undefined;
  const { error, value } = answerValueSchema.validate(input, { convert: false });
  if (error) throw new WalkinValidationError("Answer must be text, a number or a list of values");
  return value;
}

export const isWalkinSource = (name: string) => name.toLowerCase().replace(/[\s_-]/g, "") === "walkin";
export function defaultCategory(productType: string): keyof typeof walkinLeadDefaults {
  const name = productType.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\bkitchens?\b/.test(name)) return "kitchen";
  if (/\bwardrobes?\b/.test(name)) return "wardrobe";
  if (/\boffice\b/.test(name)) return "office_furniture";
  if (/\btv\b|\bconsoles?\b|\bentertainment\b/.test(name)) return "tv_unit_console";
  return "other_furniture";
}

export function validateAnswers(questions: Question[], input: Record<string, AnswerValue>, draft: boolean) {
  const answers: Record<string, AnswerValue> = {};
  const missing: string[] = [];
  const keys = new Set(questions.map(q => q.key));
  for (const key of Object.keys(input)) if (!keys.has(key)) throw new WalkinValidationError(`Unknown question: ${key}`);
  for (const q of questions) {
    const raw = input[q.key];
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      if (q.required) missing.push(q.key);
      continue;
    }
    let valid = false;
    switch (q.type) {
      case "text": valid = typeof value === "string" && value.length <= 5000; break;
      case "number": valid = typeof value === "number" && Number.isFinite(value) && (!q.integer || Number.isInteger(value)) && (q.min === undefined || value >= q.min); break;
      case "single_select": valid = typeof value === "string" && (q.options.includes(value) || (!!q.allow_other && value.length <= maxOtherAnswerLength)); break;
      case "multi_select": valid = Array.isArray(value) && new Set(value).size === value.length && value.every(v => q.options.includes(v)); break;
      case "file": valid = Array.isArray(value) && value.length <= (q.max_files ?? 5) && new Set(value).size === value.length && value.every(v => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)); break;
    }
    if (!valid) throw new WalkinValidationError(`Invalid answer for ${q.key} (${q.label})`);
    answers[q.key] = value;
  }
  if (!draft && missing.length) throw new WalkinValidationError(`Required walk-in answers missing: ${missing.join(", ")}`);
  return { answers, is_complete: missing.length === 0 };
}
