// services/trackTraceServices/boxInfo.service.ts

import { prisma } from '../../prisma/client';
import { validationResponse } from '../../../src/utils/validationResponse';

export const getProjectBoxInfoFieldsService = async (
  project_id: number,
  vendor_id: number
) => {
  const fields =
    await prisma.projectBoxInfoField.findMany({
      where: {
        project_id,
        vendor_id,
        active: true,
      },

      orderBy: [
        {
          sort_order:
            "asc",
        },

        {
          id:
            "asc",
        },
      ],
    });

  return validationResponse(
    1,
    "Box info fields fetched successfully",
    fields
  );
};

export const saveBoxInfoValuesService = async ({
  box_id,
  project_id,
  vendor_id,
  values,
  user_id,
}: {
  box_id: number;
  project_id: number;
  vendor_id: number;
  user_id?: number;
  values: {
    field_id: number;
    field_value?: string | null;
  }[];
}) => {
  const box =
    await prisma.boxMaster.findFirst({
      where: {
        id:
          box_id,

        project_id,

        vendor_id,

        is_deleted:
          false,
      },

      select: {
        id:
          true,
      },
    });

  if (!box) {
    return validationResponse(
      0,
      "Box not found"
    );
  }

  const fields =
    await prisma.projectBoxInfoField.findMany({
      where: {
        project_id,
        vendor_id,
        active: true,
      },

      select: {
        id:
          true,

        field_label:
          true,

        is_required:
          true,
      },
    });

  const fieldMap =
    new Map(
      fields.map(
        (
          field
        ) => [
          field.id,
          field,
        ]
      )
    );

  const valueMap =
    new Map(
      values.map(
        (
          item
        ) => [
          Number(
            item.field_id
          ),
          item.field_value
            ?.trim() ||
            "",
        ]
      )
    );

  for (
    const field
    of fields
  ) {
    if (
      field.is_required &&
      !valueMap.get(
        field.id
      )
    ) {
      return validationResponse(
        0,
        `${field.field_label} is required`
      );
    }
  }

  for (
    const item
    of values
  ) {
    const fieldId =
      Number(
        item.field_id
      );

    if (
      !fieldMap.has(
        fieldId
      )
    ) {
      return validationResponse(
        0,
        "Invalid box info field"
      );
    }
  }

  await prisma.$transaction(
    async (
      tx
    ) => {
      for (
        const item
        of values
      ) {
        await tx.boxInfoFieldValue.upsert({
          where: {
            box_id_field_id: {
              box_id,

              field_id:
                Number(
                  item.field_id
                ),
            },
          },

          create: {
            box_id,

            project_id,

            vendor_id,

            field_id:
              Number(
                item.field_id
              ),

            field_value:
              item.field_value
                ?.trim() ||
              null,

            created_by:
              user_id || null,
          },

          update: {
            field_value:
              item.field_value
                ?.trim() ||
              null,

            updated_by:
              user_id || null,
          },
        });
      }
    }
  );

  return validationResponse(
    1,
    "Box info saved successfully"
  );
};

export const getBoxInfoValuesService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  const fields =
    await prisma.projectBoxInfoField.findMany({
      where: {
        project_id,
        vendor_id,
        active: true,
      },

      orderBy: [
        {
          sort_order:
            "asc",
        },

        {
          id:
            "asc",
        },
      ],

      include: {
        values: {
          where: {
            box_id,
          },

          select: {
            field_value:
              true,
          },
        },
      },
    });

  const data =
    fields.map(
      (
        field
      ) => ({
        id:
          field.id,

        field_label:
          field.field_label,

        field_key:
          field.field_key,

        field_type:
          field.field_type,

        is_required:
          field.is_required,

        sort_order:
          field.sort_order,

        field_value:
          field.values?.[0]
            ?.field_value ||
          "",
      })
    );

  return validationResponse(
    1,
    "Box info values fetched successfully",
    data
  );
};