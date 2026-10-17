#!/bin/sh
# Container start: migrate → seed an empty database → build once → serve.
set -e

echo "› Applying database migrations"
npx drizzle-kit migrate

echo "› Seeding the sky (skipped when the database already has objects)"
# Live catalogs first; any object a catalog fails on comes from the saved responses.
npx tsx scripts/seed.ts --if-empty --fallback-fixtures || echo "! Seeding finished with errors; starting anyway"

# The build prerenders pages from the database and inlines NEXT_PUBLIC_SITE_URL, so it runs
# here, once per container. Changed the site URL? Recreate the container: docker compose up -d --force-recreate
if [ ! -f .next/BUILD_ID ]; then
  echo "› Building (first start of this container, takes a minute or two)"
  npx next build
fi

echo "› Serving on port ${PORT:-3000}"
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
