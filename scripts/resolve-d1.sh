#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${D1_DATABASE_NAME:-$(grep '^database_name' wrangler.toml | sed 's/.*= *"\(.*\)"/\1/')}"
if [ -z "$DB_NAME" ]; then
  echo "ERROR: D1_DATABASE_NAME is not set and could not be read from wrangler.toml" >&2
  exit 1
fi
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is not set}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"

DB_ID=$(curl -sf \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database?name=${DB_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  | jq -r '.result[0].uuid')

if [ -z "$DB_ID" ] || [ "$DB_ID" = "null" ]; then
  echo "ERROR: Could not resolve database_id for database_name=${DB_NAME}" >&2
  exit 1
fi

sed -i "s/^database_id = \".*\"/database_id = \"${DB_ID}\"/" wrangler.toml
echo "Resolved database_id=${DB_ID} for database_name=${DB_NAME}"
