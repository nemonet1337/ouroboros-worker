#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${D1_DATABASE_NAME:-$(grep '^database_name' wrangler.toml | sed 's/.*= *"\(.*\)"/\1/')}"
if [ -z "$DB_NAME" ]; then
  echo "ERROR: D1_DATABASE_NAME is not set and could not be read from wrangler.toml" >&2
  exit 1
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "WARNING: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not set. Skipping D1 database_id resolution."
  exit 0
fi

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"

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
