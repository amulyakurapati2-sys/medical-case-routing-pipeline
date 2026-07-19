#!/bin/sh
set -eu

cd /app/backend

npx prisma migrate deploy
npx prisma db seed

exec node dist/index.js
