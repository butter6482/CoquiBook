#!/bin/sh
set -e

# Replace run-time NEXT_PUBLIC_WEBAPP_URL placeholder if it changed from build-time value
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"

# Run Prisma migrations
npx prisma migrate deploy --schema /calcom/packages/prisma/schema.prisma

# Start the app
yarn start
