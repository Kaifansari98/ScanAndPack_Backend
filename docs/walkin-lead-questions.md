# Walkin Lead Questions — implementation and verification

The standard Create New Lead modal now loads questionnaires when Source is Walk-in and a furniture type is selected. It renders question cards, answer progress, inline validation and reference uploads, and includes answers in lead creation and draft saves. The separate online lead-pool creation flow keeps its existing behavior.

## Database setup

The migration `prisma/migrations/20261013120000_add_walkin_lead_questions/migration.sql` adds three tables:

- `WalkinLeadQuestionnaire`: a complete vendor override for a `ProductTypeMaster` furniture type, with a version number.
- `WalkinLeadResponse`: one response per lead/furniture type, including the original question snapshot, answers, completion flag and audit fields.
- `WalkinLeadUpload`: reference image/PDF metadata. File bytes use the existing Wasabi storage.

Apply the migration through the project's usual migration deployment process, then regenerate the Prisma client (`pnpm prisma:generate`). No default-data seed is needed: workbook defaults ship in `src/data/walkinLeadDefaults.ts`. This change does not apply migrations to the configured database automatically.

## Selection and fallback

Questions are selected separately for each furniture type. A vendor override replaces that type's entire default set. Other furniture types continue using defaults. Deleting the override restores the default and does not delete saved answers.

Defaults preserve all 41 workbook questions, their wording, choices and required flags:

| Furniture name contains | Workbook category | Questions |
| --- | --- | --- |
| Kitchen / Kitchens | Kitchen | 9 |
| Wardrobe / Wardrobes | Wardrobe | 8 |
| Office | Office Furniture | 8 |
| TV / Console / Consoles / Entertainment | TV Unit - Console | 8 |
| Any other name | Other Furniture | 8 |

Matching is case-insensitive and ignores punctuation. Matching order is the table order. No numeric product IDs or vendor IDs are hard-coded. Each requested product must be active and belong to the vendor.

All workbook fields, including file uploads, are required on complete submissions. `N/A` is accepted as text. The office headcount must be a positive integer. Uploads support JPEG, PNG, WebP, GIF and PDF, up to five files per question and 10 MB per file. These upload limits and numeric constraints are implementation defaults; the spreadsheet only specifies Image/PDF and Number.

## Vendor feature flag

`VendorMaster.is_walkin_questions_feature_enabled` (default `true`, migration `20261013170000_add_vendor_walkin_questions_feature_flag`) switches the feature per vendor. When `false`, every `/api/leads/walkin-questions` endpoint returns 403 and the frontend hides the Field Masters tab, the questions in the Create Lead form, and the saved answers on lead screens. The flag reaches the frontend in the login response's `vendor` object.

## Authentication

All new endpoints require `Authorization: Bearer <session token>`. The path vendor must match the signed-in user's vendor. Only `admin` and `super-admin` can configure/reset questionnaires. Lead answers require the lead creator, assignee, active mapped user, or a vendor admin.

Creation requests that include `walkin_answers` also require a session token matching `vendor_id` and `created_by`. Existing creation requests without that field keep their current behavior.

## Endpoints

Base: `/api/leads/walkin-questions`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/vendor/:vendorId/questions?product_type_ids=1,2&source_id=7` | Effective questionnaires for the selected furniture types |
| PUT | `/vendor/:vendorId/product-type/:productTypeId/questions` | Create/replace a vendor override |
| DELETE | `/vendor/:vendorId/product-type/:productTypeId/questions` | Restore workbook defaults |
| POST | `/vendor/:vendorId/uploads` | Upload one reference file, multipart field `file` |
| GET | `/vendor/:vendorId/lead/:leadId/answers` | Saved question snapshots, answers, and attachment download URLs |
| PUT | `/vendor/:vendorId/lead/:leadId/answers` | Validate/save answer groups for an existing lead |
| PATCH | `/vendor/:vendorId/lead/:leadId/product-type/:productTypeId/answers/:questionKey` | Edit one saved answer; body `{ "value": ... }`, `null` clears it. Validated against the saved question snapshot, so it works after the questionnaire changes. Required answers cannot be cleared on non-draft leads. |

`source_id` is optional when fetching questions (so masters can preview a questionnaire). When supplied, it must identify this vendor's Walk-in source. Saving always checks the persisted/submitted lead source; `Walk-in`, `Walk in`, and `Walkin` are recognized.

Responses use `{ "success": true, "data": ... }`. Invalid input returns 400, denied access 403, missing lead/product 404, changed questionnaire 409. Missing/invalid session tokens use the existing auth middleware's 401/403 responses.

### Fetch questions

Example response item (the complete result contains every question):

```json
{
  "product_type_id": 1,
  "product_type": "Kitchen",
  "title": "Kitchen",
  "origin": "default",
  "default_category": "kitchen",
  "questionnaire_key": "default:kitchen",
  "questionnaire_version": 1,
  "questions": [{
    "key": "kitchen_1",
    "label": "How often do you cook or entertain at home?",
    "type": "single_select",
    "required": true,
    "options": ["Daily", "Often", "Rarely"],
    "sort_order": 1
  }]
}
```

The modal renders groups using `title`, and fields using `type`, `label`, `required`, `options`, `sort_order` and file/number constraints. Keep the returned questionnaire key/version with the answers; a 409 means refetch and reconcile the user's answers.

### Vendor override

PUT body:

```json
{
  "questions": [
    { "key": "usage", "label": "Who will use this furniture?", "type": "text", "required": true, "options": [], "sort_order": 1 },
    { "key": "style", "label": "Preferred style", "type": "single_select", "required": true, "options": ["Modern", "Classic"], "sort_order": 2 }
  ]
}
```

Supported types: `text`, `number`, `single_select`, `multi_select`, `file`. Keys must be unique and stable within the questionnaire. Select types require options; other types use an empty options array. `required` and `sort_order` are mandatory. Single choice questions may set `allow_other: true`: the form then shows an extra "Others" option with a text box, and the typed text (up to 500 characters) is stored as the answer in place of an option. Number constraints: `min`, `integer`. File constraints: `accepted_mime_types`, `max_files`, `max_file_size_bytes`; these cannot exceed the global upload limits. Empty overrides are rejected; use DELETE to restore defaults.

### Save answers with a new lead

The existing `/api/leads/create` accepts an optional `walkin_answers` array. For multipart requests, send it as a JSON-encoded string. Existing lead fields are still required. Use actual furniture IDs from the vendor's masters:

```json
{
  "walkin_answers": [{
    "product_type_id": 1,
    "questionnaire_key": "default:kitchen",
    "questionnaire_version": 1,
    "answers": {
      "kitchen_1": "Daily",
      "kitchen_2": "Both",
      "kitchen_3": "N/A",
      "kitchen_4": "Modern",
      "kitchen_5": "Insufficient storage",
      "kitchen_6": "Require Changes",
      "kitchen_7": "Quality",
      "kitchen_8": "Premium",
      "kitchen_9": "₹8L+"
    }
  }]
}
```

For multiple selected furniture types, supply one group per type. For an existing lead, PUT the same body to its answers endpoint. Unknown questions, invalid options, duplicate groups, furniture not selected on the lead, stale versions and cross-vendor IDs are rejected.

Lead creation and answers are persisted in the same transaction. Draft leads may omit required answers or entire groups, but any supplied answer still must be valid. Existing-lead updates derive draft status from the database, never from a client override. Each supplied group replaces that group's answers; complete leads must submit every currently selected type.

For backend-first rollout, omitting `walkin_answers` keeps existing creation working. The frontend supplies answers for the standard Walk-in flow; other API clients remain backward-compatible when the field is omitted. Existing lead edit/source/product-change flows do not automatically revalidate questionnaire completeness; use the answers endpoint when editing questionnaire responses.

### File questions

Upload first, then place the returned upload IDs in the answer array:

```json
{ "other_furniture_6": ["12345678-1234-1234-1234-123456789012"] }
```

The API checks MIME headers and file signatures. Saving verifies upload IDs, vendor ownership, size and MIME limits. Arbitrary URLs/storage keys are not accepted as answers. Reading saved answers returns attachment URLs valid for one hour; persisted data retains storage keys rather than expiring URLs. Abandoned pre-creation uploads are retained; automated cleanup is not included in this phase.

## Verification

```sh
pnpm exec prisma validate
pnpm exec tsc --noEmit --incremental false
node --test tests/walkin-lead-questions.test.cjs
```

After migrating a development database:

1. Fetch Kitchen and Wardrobe questions for a vendor without overrides; expect 9 and 8 fields.
2. Add a Kitchen override as admin; Kitchen should show `origin: vendor` while Wardrobe remains `default`.
3. Create a Walk-in lead with complete answers; GET its answers and verify snapshots.
4. Try incomplete answers, another vendor's furniture ID, an invalid option, and a non-Walk-in source; expect rejection with no partial lead/answer writes.
5. Edit the override after fetching it; submitting the old version must return 409.
6. Upload an image/PDF and submit a file-question answer using its returned ID.
7. Delete the override; defaults return and previously saved response snapshots remain readable.

Implementation checks: Prisma schema validation and TypeScript checking pass. All 16 new feature tests pass. The full existing test run reports 32/35 passing, with three failures in the unchanged `tests/cutlist-headers.test.cjs` suite (missing mapping input and an endpoint returning 500). The vendor 1 database seed was subsequently applied and verified as described below. Live lead creation and Wasabi storage integration have not been exercised.


## Vendor 1 seed

`node scripts/seed-walkin-questions.cjs --vendor-id 1` previews the changes. Add `--apply` to persist in one transaction. Repeating the seed does not change identical questions or increment their versions. Existing different overrides are listed as `replace` in the preview.

The configured local database (`localhost:5432/scanandpack`) was seeded for vendor 1:

| Product ID | Furniture type | Workbook category | Questions |
| --- | --- | --- | --- |
| 1 | Semi-Modular Kitchen | Kitchen | 9 |
| 2 | Modular Kitchen | Kitchen | 9 |
| 3 | Wardrobe | Wardrobe | 8 |
| 4 | Other Furniture | Other Furniture | 8 |
| 5 | Office Furniture | Office Furniture | 8 |
| 6 | Consoles | TV Unit - Console | 8 |
| 7 | Small Order | Other Furniture | 8 |

All seven sets (58 question entries) were inserted and then verified against the workbook defaults. The three questionnaire tables already existed in this database, so no schema migration was needed for the seed. No existing questionnaire override was overwritten.

Frontend checks: TypeScript passes; the feature tests cover validation, source matching, selected furniture/version scoping, and multipart answer serialization. Chrome checks using mocked API responses exercised desktop/mobile rendering, incomplete drafts, required-answer errors, complete submissions, source/type switching, multi-select and file upload/removal. Real lead creation and Wasabi uploads were not performed by these browser tests.
