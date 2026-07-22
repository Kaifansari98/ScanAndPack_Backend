// controllers/trackTrace/boxInfo.controller.ts

import {
  Request,
  Response,
} from "express";

import {
  getProjectBoxInfoFieldsService,
  saveBoxInfoValuesService,
  getBoxInfoValuesService,
} from "../../../src/services/trackTraceServices/boxInfo.service";

export const getProjectBoxInfoFieldsController = async (
  req: Request,
  res: Response
) => {
  const projectId =
    Number(
      req.params.project_id
    );

  const vendorId =
    Number(
      req.query.vendor_id ||
      req.body.vendor_id
    );

  const response =
    await getProjectBoxInfoFieldsService(
      projectId,
      vendorId
    );

  return res.json(
    response
  );
};

export const saveBoxInfoValuesController = async (
  req: Request,
  res: Response
) => {
  const response =
    await saveBoxInfoValuesService({
      box_id:
        Number(
          req.params.box_id
        ),

      project_id:
        Number(
          req.body.project_id
        ),

      vendor_id:
        Number(
          req.body.vendor_id
        ),

      user_id:
        req.body.user_id
          ? Number(
              req.body.user_id
            )
          : undefined,

      values:
        req.body.values ||
        [],
    });

  return res.json(
    response
  );
};

export const getBoxInfoValuesController = async (
  req: Request,
  res: Response
) => {
  const response =
    await getBoxInfoValuesService(
      Number(
        req.params.box_id
      ),

      Number(
        req.query.project_id
      ),

      Number(
        req.query.vendor_id
      )
    );

  return res.json(
    response
  );
};