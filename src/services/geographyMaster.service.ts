import { prisma } from "../prisma/client";

type GeoPayload = {
  countries?: Array<{ name: string }>;
  regions?: Array<{ name: string; country_id: number }>;
  states?: Array<{ name: string; region_id: number }>;
  cities?: Array<{ name: string; state_id: number }>;
  areas?: Array<{ name: string; city_id: number }>;
};

export const createGeographyMastersBulk = async (payload: GeoPayload) => {
  const {
    countries = [],
    regions = [],
    states = [],
    cities = [],
    areas = [],
  } = payload;

  const invalidArrays: string[] = [];
  if (!Array.isArray(countries)) invalidArrays.push("countries");
  if (!Array.isArray(regions)) invalidArrays.push("regions");
  if (!Array.isArray(states)) invalidArrays.push("states");
  if (!Array.isArray(cities)) invalidArrays.push("cities");
  if (!Array.isArray(areas)) invalidArrays.push("areas");

  if (invalidArrays.length > 0) {
    const error = new Error(
      `Expected arrays for: ${invalidArrays.join(", ")}`
    );
    (error as any).statusCode = 400;
    throw error;
  }

  const missingFields: string[] = [];

  countries.forEach((c, index) => {
    if (!c?.name) missingFields.push(`countries[${index}].name`);
  });
  regions.forEach((r, index) => {
    if (!r?.name) missingFields.push(`regions[${index}].name`);
    if (!r?.country_id) missingFields.push(`regions[${index}].country_id`);
  });
  states.forEach((s, index) => {
    if (!s?.name) missingFields.push(`states[${index}].name`);
    if (!s?.region_id) missingFields.push(`states[${index}].region_id`);
  });
  cities.forEach((c, index) => {
    if (!c?.name) missingFields.push(`cities[${index}].name`);
    if (!c?.state_id) missingFields.push(`cities[${index}].state_id`);
  });
  areas.forEach((a, index) => {
    if (!a?.name) missingFields.push(`areas[${index}].name`);
    if (!a?.city_id) missingFields.push(`areas[${index}].city_id`);
  });
 
  if (missingFields.length > 0) {
    const error = new Error(
      `Missing required field(s): ${missingFields.join(", ")}`
    );
    (error as any).statusCode = 400;
    throw error;
  }

  return await prisma.$transaction(async (tx) => {
    const result: Record<string, number> = {};

    if (countries.length > 0) {
      const created = await tx.countryMaster.createMany({
        data: countries.map((c) => ({ name: c.name })),
      });
      result.countries = created.count;
    }

    if (regions.length > 0) {
      const created = await tx.regionMaster.createMany({
        data: regions.map((r) => ({
          name: r.name,
          country_id: Number(r.country_id),
        })),
      });
      result.regions = created.count;
    }

    if (states.length > 0) {
      const created = await tx.stateMaster.createMany({
        data: states.map((s) => ({
          name: s.name,
          region_id: Number(s.region_id),
        })),
      });
      result.states = created.count;
    }

    if (cities.length > 0) {
      const created = await tx.cityMaster.createMany({
        data: cities.map((c) => ({
          name: c.name,
          state_id: Number(c.state_id),
        })),
      });
      result.cities = created.count;
    }

    if (areas.length > 0) {
      const created = await tx.areaMaster.createMany({
        data: areas.map((a) => ({
          name: a.name,
          city_id: Number(a.city_id),
        })),
      });
      result.areas = created.count;
    }

    return result;
  });
};
