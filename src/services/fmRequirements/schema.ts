// Stable keys, conditional option children and repeatable observations form the FM field schema.
export type FMFieldType =
  "text" | "yes_no" | "choice" | "group" | "upload" | "observations";
export interface FMField {
  key: string;
  label: string;
  type: FMFieldType;
  required: boolean;
  fields?: FMField[];
  options?: { key: string; label: string; fields: FMField[] }[];
  upload_kind?: "photo" | "media" | "document";
  purpose?: "site_photos" | "measurement_document";
}
export type FMValue = string | string[] | { title: string; remark: string }[];
export type FMAnswers = Record<string, FMValue>;
export interface FMQuestionnaire {
  product_type_id: number;
  product_type: string;
  revision: string;
  origin: "empty" | "vendor";
  fields: FMField[];
}
export interface FMAnswerGroup {
  product_type_id: number;
  revision: string;
  answers: FMAnswers;
}
export class FMError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export const PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];
export const MEDIA_TYPES = [
  ...PHOTO_TYPES,
  "video/mp4",
  "video/quicktime",
  "video/webm",
];
export const DOCUMENT_TYPES = [
  ...MEDIA_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const FM_MAX_FILE_SIZE = 25 * 1024 * 1024;
export const acceptedTypes = (field: FMField) =>
  field.upload_kind === "photo"
    ? PHOTO_TYPES
    : field.upload_kind === "media"
      ? MEDIA_TYPES
      : DOCUMENT_TYPES;
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
export function allFields(fields: FMField[]): FMField[] {
  return fields.flatMap((field) => [
    field,
    ...allFields(field.fields ?? []),
    ...(field.options ?? []).flatMap((option) => allFields(option.fields)),
  ]);
}
export function validateFields(input: unknown): FMField[] {
  const keys = new Set<string>();
  let count = 0;
  const parse = (value: unknown, depth: number): FMField[] => {
    if (!Array.isArray(value) || depth > 5)
      throw new FMError(
        "Fields must be a list with no more than five nesting levels.",
      );
    return value.map((raw) => {
      if (
        !isObject(raw) ||
        ++count > 250 ||
        !text(raw.key, 100) ||
        !/^[a-z][a-z0-9_]*$/.test(raw.key as string) ||
        keys.has(raw.key as string) ||
        ["constructor", "prototype"].includes(raw.key as string)
      )
        throw new FMError(
          "Every field needs a unique stable key; use lowercase letters, numbers and underscores (maximum 250 fields).",
        );
      keys.add(raw.key as string);
      if (
        !text(raw.label, 200) ||
        ![
          "text",
          "yes_no",
          "choice",
          "group",
          "upload",
          "observations",
        ].includes(String(raw.type)) ||
        typeof raw.required !== "boolean"
      )
        throw new FMError(
          "Each field needs a label, supported type and required setting.",
        );
      const field: FMField = {
        key: raw.key as string,
        label: (raw.label as string).trim(),
        type: raw.type as FMFieldType,
        required: raw.required,
      };
      if (field.type === "group")
        field.fields = parse(raw.fields ?? [], depth + 1);
      if (field.type === "choice") {
        if (
          !Array.isArray(raw.options) ||
          raw.options.length < 2 ||
          raw.options.length > 30
        )
          throw new FMError(`${field.label}: add between 2 and 30 options.`);
        const optionKeys = new Set<string>();
        field.options = raw.options.map((option) => {
          if (
            !isObject(option) ||
            !text(option.key, 100) ||
            !/^[a-z][a-z0-9_]*$/.test(String(option.key)) ||
            optionKeys.has(String(option.key)) ||
            !text(option.label, 200)
          )
            throw new FMError(
              `${field.label}: options need unique keys and labels.`,
            );
          optionKeys.add(option.key as string);
          return {
            key: option.key as string,
            label: (option.label as string).trim(),
            fields: parse(option.fields ?? [], depth + 1),
          };
        });
        if (
          new Set(field.options.map((o) => o.label.toLowerCase())).size !==
          field.options.length
        )
          throw new FMError(`${field.label}: option labels must be different.`);
      }
      if (field.type === "upload") {
        if (!["photo", "media", "document"].includes(String(raw.upload_kind)))
          throw new FMError(`${field.label}: choose a file format.`);
        field.upload_kind = raw.upload_kind as FMField["upload_kind"];
        if (raw.purpose !== undefined) {
          if (
            depth !== 0 ||
            !["site_photos", "measurement_document"].includes(
              String(raw.purpose),
            )
          )
            throw new FMError(
              "Standard FM uploads must remain at the top level.",
            );
          field.purpose = raw.purpose as FMField["purpose"];
        }
      }
      return field;
    });
  };
  const fields = parse(input, 0);
  for (const purpose of ["site_photos", "measurement_document"] as const) {
    const matches = fields.filter((field) => field.purpose === purpose);
    if (matches.length > 1)
      throw new FMError("Each standard upload role can be used only once.");
    if (
      matches.length &&
      matches[0].upload_kind !==
        (purpose === "site_photos" ? "media" : "document")
    )
      throw new FMError(
        "Standard FM upload roles must use the matching accepted file formats.",
      );
  }
  return fields;
}
export function visibleFields(
  fields: FMField[],
  answers: FMAnswers,
): FMField[] {
  return fields.flatMap((field) => [
    field,
    ...visibleFields(field.fields ?? [], answers),
    ...visibleFields(
      field.options?.find((option) => option.key === answers[field.key])
        ?.fields ?? [],
      answers,
    ),
  ]);
}
export function validateAnswers(
  fields: FMField[],
  input: unknown,
  draft = false,
): FMAnswers {
  if (
    !isObject(input) ||
    Object.keys(input).some(
      (key) => !allFields(fields).some((field) => field.key === key),
    )
  )
    throw new FMError("Answers contain unknown fields.");
  const answers: FMAnswers = {};
  for (const field of visibleFields(fields, input as FMAnswers)) {
    if (field.type === "group") continue;
    const value = input[field.key];
    const empty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required && !draft)
        throw new FMError(`${field.label} is required.`);
      continue;
    }
    if (field.type === "text") {
      if (typeof value !== "string" || value.length > 5000)
        throw new FMError(`${field.label}: enter text up to 5,000 characters.`);
      if (!value.trim()) {
        if (field.required && !draft)
          throw new FMError(`${field.label} is required.`);
        continue;
      }
      answers[field.key] = value.trim();
    } else if (field.type === "choice" || field.type === "yes_no") {
      const options =
        field.type === "yes_no"
          ? ["yes", "no"]
          : field.options!.map((o) => o.key);
      if (typeof value !== "string" || !options.includes(value))
        throw new FMError(`${field.label}: select an available option.`);
      answers[field.key] = value;
    } else if (field.type === "upload") {
      if (
        !Array.isArray(value) ||
        value.length > 20 ||
        new Set(value).size !== value.length ||
        value.some(
          (id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id),
        )
      )
        throw new FMError(`${field.label}: select up to 20 uploaded files.`);
      answers[field.key] = value as string[];
    } else if (field.type === "observations") {
      if (
        !Array.isArray(value) ||
        value.length > 50 ||
        value.some(
          (row) =>
            !isObject(row) || !text(row.title, 200) || !text(row.remark, 5000),
        )
      )
        throw new FMError(
          `${field.label}: each observation needs a title and remark (up to 50 entries).`,
        );
      answers[field.key] = value.map((row) => ({
        title: (row as { title: string }).title.trim(),
        remark: (row as { remark: string }).remark.trim(),
      }));
    }
  }
  return answers;
}
export function parseGroups(input: unknown): FMAnswerGroup[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50)
    throw new FMError(
      "Provide FM requirements for the selected product types.",
    );
  const ids = new Set<number>();
  return input.map((raw) => {
    if (
      !isObject(raw) ||
      !Number.isSafeInteger(raw.product_type_id) ||
      Number(raw.product_type_id) <= 0 ||
      ids.has(Number(raw.product_type_id)) ||
      !text(raw.revision, 100) ||
      !isObject(raw.answers)
    )
      throw new FMError("Invalid or duplicate FM product type response.");
    ids.add(Number(raw.product_type_id));
    return {
      product_type_id: Number(raw.product_type_id),
      revision: raw.revision as string,
      answers: raw.answers as FMAnswers,
    };
  });
}

// Check file signatures instead of trusting the MIME type sent by the browser.
export function validFMFileSignature(
  buffer: Buffer,
  mimeType: string,
): boolean {
  const ascii = (start: number, end: number) =>
    buffer.subarray(start, end).toString("ascii");
  if (mimeType === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (mimeType === "image/jpeg")
    return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mimeType === "image/png")
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/gif")
    return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  if (mimeType === "image/webp")
    return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mimeType === "video/webm")
    return buffer.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (mimeType === "application/msword")
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]));
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return (
      ascii(0, 2) === "PK" &&
      buffer.includes(Buffer.from("word/")) &&
      buffer.includes(Buffer.from("[Content_Types].xml"))
    );
  if (
    ["image/heic", "image/heif", "video/mp4", "video/quicktime"].includes(
      mimeType,
    )
  ) {
    if (ascii(4, 8) !== "ftyp")
      return (
        mimeType === "video/quicktime" &&
        ["moov", "mdat", "wide"].includes(ascii(4, 8))
      );
    const brand = ascii(8, 12);
    const imageBrands = ["heic", "heix", "hevc", "hevx", "mif1", "msf1"];
    if (mimeType.startsWith("image/")) return imageBrands.includes(brand);
    return (
      !imageBrands.includes(brand) &&
      (mimeType !== "video/quicktime" || brand === "qt  ")
    );
  }
  return false;
}

export function canEditFMValues(role: unknown): boolean {
  return (
    typeof role === "string" &&
    ["site-supervisor", "super-admin", "head-site-supervisor"].includes(
      role.trim().toLowerCase(),
    )
  );
}
