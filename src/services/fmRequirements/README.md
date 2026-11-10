# FM Requirements

Vendor-scoped final-measurement checklists are available only when
`VendorMaster.handlesLargeScaleProjects` is `false`. Admins and super-admins
configure their own vendor's product type templates. Existing lead-access checks
apply to supervisors reading, uploading, saving drafts and submitting responses.
Auditors have no write access.

Requirements come only from `FMRequirementMaster` for the selected vendor and
product type. An unconfigured product has an empty checklist. There are no
runtime defaults or automatic seed imports. Standard FM document/site upload
controls continue to work independently when a checklist does not define them.

The image checklist is explicit test data in
`scripts/data/modular-kitchen-fm-test-fields.json`. Import it only for an explicit
vendor using `node scripts/seed-fm-requirements-test.cjs --vendor-id 1 --apply`.
The script targets that vendor's active **Modular Kitchen** product, refuses to
overwrite a different saved checklist and is idempotent for identical data.
Clearing a checklist preserves existing saved response snapshots.

The general checklist for the other product types (everything except Modular and
Semi-Modular Kitchen) is `scripts/data/general-fm-test-fields.json`:
`node scripts/seed-fm-requirements-test.cjs --vendor-id 1 --data general-fm-test-fields.json --products "Wardrobe,Other Furniture,Office Furniture,Consoles,Small Order" --apply`.
All listed products are checked before anything is inserted.

## API

All endpoints are authenticated, under `/api/leads/fm-requirements/vendor/:vendorId`.

- `GET /questions?product_type_ids=1,2`: current templates and revision tokens.
- `PUT /product-type/:productTypeId/questions`: `{ fields, revision }`, admin only.
- `DELETE /product-type/:productTypeId/questions`: clear requirements, admin only.
- `GET /lead/:leadId`: current templates, saved response snapshots and signed file URLs.
- `POST /lead/:leadId/uploads`: multipart `file`; lead-scoped photo/video/document upload.
- `PUT /lead/:leadId/draft`: `{ groups }`; saves without changing the lead stage.
- `POST /lead/:leadId/submit`: `{ groups, critical_discussion_notes? }`; validates
  every selected product type, saves snapshots and completes the existing FM
  stage transaction. Standard uploads become existing Type 9/Type 10 lead documents.

Each group contains `product_type_id`, `revision` and `answers`. A field's stable
key identifies its answer. `choice.options[].fields` defines conditional branches;
`group.fields` defines sections; `observations` stores repeatable `{ title, remark }`
entries. `upload` values contain server-issued UUIDs, scoped to the same vendor
and lead. Hidden branch answers are excluded on save. Modified templates return
409 for stale submissions. Optional Site Photos/FM Document roles can route checklist uploads into the
existing document workflow. Ordinary stage upload IDs can also be supplied via
`primary_uploads` when the checklist does not contain these roles.

Uploads: 20 per field, 25 MB each, accepted MIME types and file signatures checked.
Keys remain private; short-lived signed download URLs are generated when reading.
Large-scale project workflows continue using their existing instance uploads.

## Tab sections

A template may use ordered, top-level `type: "tab"` containers with a stable
`key`, editable `label`, `required: false`, and a `fields` array. All top-level
fields must be inside tabs once a template uses tabs. Up to 20 tabs are supported;
empty tabs can be configured but are omitted from capture navigation. Flat
checklists remain supported. Tabs use the existing JSON fields and require no
database migration. Tab containers do not consume a question nesting level.

The modal displays tabs in the saved order and keeps answers keyed by the
original field keys across tab changes. Validation covers all tabs and reports
the first invalid field key so the UI can reveal its tab. The saved response
snapshot includes the captured tab layout. Primary FM upload roles can be moved
between tabs, and their vendor/lead ownership checks continue to apply.
