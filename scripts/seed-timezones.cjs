// ─────────────────────────────────────────────────────────────────────────────
// Usage:
//   node scripts/seed-timezones.cjs --file time_zone_master.csv          (dry-run preview)
//   node scripts/seed-timezones.cjs --file time_zone_master.csv --apply  (commit changes)
//
// Target Schema columns in PostgreSQL:
//   id             SERIAL PRIMARY KEY
//   country        TEXT (was name)
//   time_zone_name TEXT UNIQUE (was time_zone_code)
//   active         BOOLEAN (was is_active)
//   time_zone      TEXT (was created_at)
//   mins           INTEGER (was updated_at)
// ─────────────────────────────────────────────────────────────────────────────
require("dotenv").config({ quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

// Resolve pg Client safely (works with standalone pg or @prisma/adapter-pg)
let Client;
try {
  Client = require("pg").Client;
} catch {
  try {
    Client = createRequire(require.resolve("@prisma/adapter-pg"))("pg").Client;
  } catch (err) {
    console.error("Failed to load PostgreSQL client:", err.message);
    process.exit(1);
  }
}

// ── Parse CLI args ──────────────────────────────────────────────────────────
const fileIdx = process.argv.indexOf("--file");
const csvPath =
  fileIdx !== -1 && process.argv[fileIdx + 1]
    ? path.resolve(process.argv[fileIdx + 1])
    : null;

if (!csvPath) {
  console.error("Error: --file <path> is required.\n");
  console.error(
    "Usage: node scripts/seed-timezones.cjs --file time_zone_master.csv [--apply]"
  );
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`Error: CSV file not found — ${csvPath}`);
  process.exit(1);
}

const apply = process.argv.includes("--apply");

// ── CSV parser (handles quoted strings, commas inside quotes, CRLF) ─────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const result = [];
  let headers = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const fields = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());

    if (!headers) {
      headers = fields.map((h) => h.toLowerCase().trim());
      continue;
    }

    const row = {};
    headers.forEach((h, i) => {
      row[h] = fields[i] ?? "";
    });
    result.push(row);
  }

  return { headers, rows: result };
}

// ── Main Execution ──────────────────────────────────────────────────────────
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

(async () => {
  try {
    const raw = fs.readFileSync(csvPath, "utf8");
    const { headers, rows } = parseCSV(raw);

    const requiredHeaders = ["country", "time_zone_name"];
    const missing = requiredHeaders.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new Error(
        `CSV missing required columns: ${missing.join(", ")}. Found: ${headers.join(", ")}`
      );
    }

    console.log(`\n======================================================`);
    console.log(`🕐  TIME ZONE MASTER SEED & MIGRATION SCRIPT`);
    console.log(`======================================================`);
    console.log(`📄  CSV file    : ${csvPath}`);
    console.log(`📊  Total rows  : ${rows.length}`);
    console.log(`🔧  Mode        : ${apply ? "APPLY (committing changes to DB)" : "DRY-RUN (read-only preview, will rollback)"}`);
    console.log(`📋  Columns in CSV: ${headers.join(", ")}\n`);

    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout = '5s'");

    // 1. Check existing columns in time_zone_master
    const colRes = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'time_zone_master'
    `);
    const currentCols = new Set(colRes.rows.map((r) => r.column_name));

    // 2. Perform schema migration if old columns exist
    if (currentCols.has("name") && !currentCols.has("country")) {
      console.log(`🔄 Migrating columns to match CSV structure:`);
      console.log(`   - name → country`);
      console.log(`   - time_zone_code → time_zone_name`);
      console.log(`   - is_active → active`);
      console.log(`   - created_at → time_zone (TEXT)`);
      console.log(`   - updated_at → mins (INTEGER)`);

      await db.query(`ALTER TABLE "time_zone_master" RENAME COLUMN "name" TO "country";`);
      await db.query(`ALTER TABLE "time_zone_master" RENAME COLUMN "time_zone_code" TO "time_zone_name";`);
      await db.query(`ALTER TABLE "time_zone_master" RENAME COLUMN "is_active" TO "active";`);
      
      if (currentCols.has("created_at")) {
        await db.query(`ALTER TABLE "time_zone_master" ALTER COLUMN "created_at" DROP NOT NULL;`);
        await db.query(`ALTER TABLE "time_zone_master" ALTER COLUMN "created_at" DROP DEFAULT;`);
        await db.query(`ALTER TABLE "time_zone_master" ALTER COLUMN "created_at" TYPE TEXT USING NULL;`);
        await db.query(`ALTER TABLE "time_zone_master" RENAME COLUMN "created_at" TO "time_zone";`);
      }
      
      if (currentCols.has("updated_at")) {
        await db.query(`ALTER TABLE "time_zone_master" ALTER COLUMN "updated_at" DROP NOT NULL;`);
        await db.query(`ALTER TABLE "time_zone_master" ALTER COLUMN "updated_at" DROP DEFAULT;`);
        await db.query(`ALTER TABLE "time_zone_master" ALTER COLUMN "updated_at" TYPE INTEGER USING NULL;`);
        await db.query(`ALTER TABLE "time_zone_master" RENAME COLUMN "updated_at" TO "mins";`);
      }

      await db.query(`ALTER INDEX IF EXISTS "time_zone_master_time_zone_code_key" RENAME TO "time_zone_master_time_zone_name_key";`);

      // Seed offsets for standard existing rows
      await db.query(`UPDATE "time_zone_master" SET "time_zone" = '+05:30' WHERE "id" = 1 AND "time_zone" IS NULL;`);
      await db.query(`UPDATE "time_zone_master" SET "time_zone" = '+00:00' WHERE "id" = 2 AND "time_zone" IS NULL;`);
      console.log(`✅ Table schema migration applied successfully!\n`);
    } else {
      console.log(`✅ Table columns already match target structure.\n`);
    }

    // 3. Query existing time_zone_names
    const existingRes = await db.query(
      `SELECT LOWER(time_zone_name) AS tz FROM "time_zone_master"`
    );
    const existingNames = new Set(existingRes.rows.map((r) => r.tz));
    console.log(`🗃️  Existing timezone records in DB: ${existingNames.size}\n`);

    // 4. Process CSV rows
    const plan = [];
    let insertCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const country = (row.country || "").trim();
      const time_zone_name = (row.time_zone_name || "").trim();
      const time_zone = (row.time_zone || "").trim() || null;
      const activeRaw = (row.active || "").trim().toUpperCase();
      const active = activeRaw === "YES" || activeRaw === "TRUE" || activeRaw === "1" || activeRaw === "T";

      let mins = null;
      if (row.mins !== undefined && row.mins !== "" && row.mins.trim().toUpperCase() !== "NULL") {
        const parsedMins = parseInt(row.mins, 10);
        if (!isNaN(parsedMins)) mins = parsedMins;
      }

      if (!country || !time_zone_name) {
        plan.push({
          row: i + 2,
          country: country || "(empty)",
          time_zone_name: time_zone_name || "(empty)",
          action: "ERROR",
          reason: "Missing country or time_zone_name",
        });
        errorCount++;
        continue;
      }

      if (existingNames.has(time_zone_name.toLowerCase())) {
        if (apply && time_zone) {
          await db.query(
            `UPDATE "time_zone_master" SET "time_zone" = $1 WHERE LOWER("time_zone_name") = LOWER($2) AND ("time_zone" IS NULL OR "time_zone" = '')`,
            [time_zone, time_zone_name]
          );
        }
        plan.push({
          row: i + 2,
          country,
          time_zone_name,
          action: "SKIP",
          reason: "Already exists in DB",
        });
        skipCount++;
        continue;
      }

      // Insert new record
      if (apply) {
        await db.query(
          `INSERT INTO "time_zone_master" ("country", "time_zone_name", "time_zone", "active", "mins")
           VALUES ($1, $2, $3, $4, $5)`,
          [country, time_zone_name, time_zone, active, mins]
        );
      }

      existingNames.add(time_zone_name.toLowerCase());
      plan.push({
        row: i + 2,
        country,
        time_zone_name,
        time_zone,
        active,
        mins,
        action: "INSERT",
      });
      insertCount++;
    }

    // 5. Commit or rollback
    await db.query(apply ? "COMMIT" : "ROLLBACK");

    // 6. Summary output
    console.log(`======================================================`);
    console.log(`📊  EXECUTION SUMMARY`);
    console.log(`======================================================`);
    console.log(`Total CSV rows:  ${rows.length}`);
    console.log(`Rows to insert:  ${insertCount}`);
    console.log(`Rows to skip:    ${skipCount} (duplicate time_zone_name)`);
    console.log(`Rows with error: ${errorCount}`);
    console.log(`Database state:  ${apply ? "COMMITTED PERMANENTLY" : "ROLLED BACK (dry-run mode)"}`);
    console.log(`======================================================\n`);

    if (insertCount > 0) {
      console.log(`Sample inserts (first 5):`);
      console.table(
        plan
          .filter((p) => p.action === "INSERT")
          .slice(0, 5)
          .map((p) => ({
            Row: p.row,
            Country: p.country,
            TimeZoneName: p.time_zone_name,
            TimeZone: p.time_zone,
            Active: p.active,
            Mins: p.mins,
          }))
      );
    }

    if (skipCount > 0) {
      console.log(`Sample skips (first 5 duplicates):`);
      console.table(
        plan
          .filter((p) => p.action === "SKIP")
          .slice(0, 5)
          .map((p) => ({
            Row: p.row,
            Country: p.country,
            TimeZoneName: p.time_zone_name,
            Reason: p.reason,
          }))
      );
    }

    if (!apply) {
      console.log(
        `💡 Preview complete. To execute permanently on the database, run:\n` +
          `   node scripts/seed-timezones.cjs --file "${path.basename(csvPath)}" --apply\n`
      );
    }
  } catch (err) {
    try {
      await db.query("ROLLBACK");
    } catch (_) {}
    console.error("\n❌ Execution error:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
