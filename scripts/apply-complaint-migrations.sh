#!/usr/bin/env bash
# Applies the complaint-module migrations of 18–20 Nov 2026 to the database in
# DATABASE_URL (read from .env by Prisma). Every migration is safe to re-run,
# so if one fails, fix the cause and run the script again.
#
#   cd ScanAndPack_Backend
#   bash scripts/apply-complaint-migrations.sh            # apply SQL only
#   bash scripts/apply-complaint-migrations.sh --record   # also mark them applied in Prisma's migration history
set -euo pipefail
cd "$(dirname "$0")/.."

MIGRATIONS=(
  20261118120000_complaint_component_optional
  20261118130000_complaint_visit_pay_at_visit
  20261118140000_complaint_installation_team_visit
  20261119120000_complaint_quotation_file
  20261119130000_complaint_client_rating
  20261120120000_complaint_store_city_misc
)

for name in "${MIGRATIONS[@]}"; do
  echo "→ $name"
  npx prisma db execute --file "prisma/migrations/$name/migration.sql"
  if [[ "${1:-}" == "--record" ]]; then
    # Already recorded is fine; anything else stops the script.
    output=$(npx prisma migrate resolve --applied "$name" 2>&1) || true
    echo "$output"
    grep -q "already recorded\|marked as applied" <<<"$output" \
      || { echo "Could not record $name in migration history."; exit 1; }
  fi
done

echo "Regenerating the Prisma client…"
npx prisma generate
echo "Done: ${#MIGRATIONS[@]} complaint migrations applied."
