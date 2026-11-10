// Explicit, vendor-scoped test data import. Never runs during application startup.
// node scripts/seed-fm-requirements-test.cjs --vendor-id 1 [--apply]
// node scripts/seed-fm-requirements-test.cjs --vendor-id 1 --data general-fm-test-fields.json \
//   --products "Wardrobe,Other Furniture,Office Furniture,Consoles,Small Order" [--apply]
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { Client } = createRequire(require.resolve("@prisma/adapter-pg"))("pg");
require("dotenv-expand").expand(require("dotenv").config({ quiet: true }));
const arg = (name) =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : undefined;
const vendorId = Number(arg("--vendor-id"));
if (!Number.isSafeInteger(vendorId) || vendorId <= 0)
  throw new Error("Provide an explicit --vendor-id.");
const dataFile = arg("--data") ?? "modular-kitchen-fm-test-fields.json";
const productNames = (arg("--products") ?? "Modular Kitchen")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
if (!productNames.length) throw new Error("Provide at least one product type.");
const fields = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", path.basename(dataFile)), "utf8"),
);
async function main() {
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    await db.query("BEGIN");
    const { rows: actors } = await db.query(
      'SELECT u.id FROM "UserMaster" u JOIN "UserTypeMaster" t ON t.id=u.user_type_id WHERE u.vendor_id=$1 AND u.status=$2 AND lower(t.user_type) IN ($3,$4) ORDER BY CASE WHEN lower(t.user_type)=$3 THEN 0 ELSE 1 END,u.id LIMIT 1',
      [vendorId, "active", "super-admin", "admin"],
    );
    if (!actors.length)
      throw new Error("No active admin found for the selected vendor.");
    const inserts = [];
    // Every product is checked before anything is written, so one bad product aborts the whole import.
    for (const name of productNames) {
      const { rows: products } = await db.query(
        'SELECT p.id, p.type, p.vendor_id, v.vendor_name FROM "ProductTypeMaster" p JOIN "VendorMaster" v ON v.id=p.vendor_id WHERE p.vendor_id=$1 AND lower(trim(p.type))=lower($2) AND p.status=$3 AND v."handlesLargeScaleProjects"=false FOR UPDATE OF p',
        [vendorId, name, "active"],
      );
      if (products.length !== 1)
        throw new Error(
          `Expected exactly one active ${name} product for the selected non-large-scale vendor.`,
        );
      const product = products[0];
      const { rows: existing } = await db.query(
        'SELECT id FROM "FMRequirementMaster" WHERE vendor_id=$1 AND product_type_id=$2 FOR UPDATE',
        [vendorId, product.id],
      );
      // PostgreSQL JSONB can reorder object keys, so compare recursively via JSONB equality.
      const equal = existing.length
        ? (
            await db.query(
              'SELECT fields=$1::jsonb AS same FROM "FMRequirementMaster" WHERE id=$2',
              [JSON.stringify(fields), existing[0].id],
            )
          ).rows[0].same
        : false;
      if (existing.length && !equal)
        throw new Error(
          `${product.type} already has a different saved checklist. No data was overwritten.`,
        );
      console.log(
        JSON.stringify({
          vendor_id: vendorId,
          vendor_name: product.vendor_name,
          product_type_id: product.id,
          product_type: product.type,
          top_level_fields: fields.length,
          action: equal
            ? "already_saved"
            : process.argv.includes("--apply")
              ? "insert"
              : "dry_run",
        }),
      );
      if (!equal) inserts.push(product);
    }
    if (process.argv.includes("--apply") && inserts.length) {
      for (const product of inserts) {
        const { rows } = await db.query(
          'INSERT INTO "FMRequirementMaster" (vendor_id,product_type_id,fields,version,created_by,updated_by,created_at,updated_at) VALUES ($1,$2,$3::jsonb,1,$4,$4,NOW(),NOW()) RETURNING id,vendor_id,product_type_id,version',
          [vendorId, product.id, JSON.stringify(fields), actors[0].id],
        );
        console.log(JSON.stringify({ saved: rows[0] }));
      }
      await db.query("COMMIT");
    } else await db.query("ROLLBACK");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("FM test import failed:", error.code || error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
void main();
