import { Request, Response } from "express";
import { createGeographyMastersBulk } from "../../services/geographyMaster.service";

export const createGeographyMastersController = async (
  req: Request,
  res: Response
) => {
  try {
    const payload = req.body ?? {};
    const {
      countries = [],
      regions = [],
      states = [],
      cities = [],
      areas = [],
    } = payload;

    const total =
      (Array.isArray(countries) ? countries.length : 0) +
      (Array.isArray(regions) ? regions.length : 0) +
      (Array.isArray(states) ? states.length : 0) +
      (Array.isArray(cities) ? cities.length : 0) +
      (Array.isArray(areas) ? areas.length : 0);

    if (total === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one array with data: countries, regions, states, cities, or areas",
      });
    }

    const result = await createGeographyMastersBulk({
      countries,
      regions,
      states,
      cities,
      areas,
    });

    return res.status(201).json({
      success: true,
      message: "Geography masters created successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Error creating geography masters:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message || "Internal server error while creating geography masters",
    });
  }
};
