// services/trackTraceServices/boxInfoField.service.ts

import { prisma } from "../../../src/prisma/client";

type BoxInfoFieldInput = {
  id?: number;
  field_label: string;
  field_type?: "TEXT" | "NUMBER" | "DATE" | "TEXTAREA";
  is_required?: boolean;
  sort_order?: number;
  active?: boolean;
};

const makeFieldKey = (
  label: string
) => {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

export const syncProjectBoxInfoFields = async ({
  tx,
  projectId,
  vendorId,
  fields,
  userId,
}: {
  tx: any;
  projectId: number;
  vendorId: number;
  fields: BoxInfoFieldInput[];
  userId?: number | null;
}) => {
  const normalizedFields =
    fields
      .map(
        (
          field,
          index
        ) => ({
          id:
            field.id,

          field_label:
            field.field_label
              ?.trim(),

          field_type:
            field.field_type ||
            "TEXT",

          is_required:
            Boolean(
              field.is_required
            ),

          sort_order:
            field.sort_order ??
            index + 1,

          active:
            field.active ??
            true,
        })
      )
      .filter(
        (
          field
        ) =>
          field.field_label
      );

  const keySet =
    new Set<string>();

  for (
    const field
    of normalizedFields
  ) {
    const key =
      makeFieldKey(
        field.field_label
      );

    if (
      keySet.has(
        key
      )
    ) {
      throw new Error(
        `Duplicate box field "${field.field_label}"`
      );
    }

    keySet.add(
      key
    );
  }

  const incomingIds =
    normalizedFields
      .map(
        (
          field
        ) =>
          field.id
      )
      .filter(
        (
          id
        ): id is number =>
          Boolean(
            id
          )
      );

  await tx.projectBoxInfoField.updateMany({
    where: {
      project_id:
        projectId,

      vendor_id:
        vendorId,

      ...(incomingIds.length
        ? {
            id: {
              notIn:
                incomingIds,
            },
          }
        : {}),
    },

    data: {
      active:
        false,

      updated_by:
        userId || null,
    },
  });

  for (
    const field
    of normalizedFields
  ) {
    const fieldKey =
      makeFieldKey(
        field.field_label
      );

    if (
      field.id
    ) {
      await tx.projectBoxInfoField.updateMany({
        where: {
          id:
            field.id,

          project_id:
            projectId,

          vendor_id:
            vendorId,
        },

        data: {
          field_label:
            field.field_label,

          field_key:
            fieldKey,

          field_type:
            field.field_type as any,

          is_required:
            field.is_required,

          sort_order:
            field.sort_order,

          active:
            field.active,

          updated_by:
            userId || null,
        },
      });
    } else {
      await tx.projectBoxInfoField.create({
        data: {
          project_id:
            projectId,

          vendor_id:
            vendorId,

          field_label:
            field.field_label,

          field_key:
            fieldKey,

          field_type:
            field.field_type as any,

          is_required:
            field.is_required,

          sort_order:
            field.sort_order,

          active:
            field.active,

          created_by:
            userId || null,
        },
      });
    }
  }
};