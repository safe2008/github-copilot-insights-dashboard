#!/usr/bin/env bash
set -e

npm install --global --no-audit --no-fund pnpm@11.5.1
cd app
pnpm install
pnpm exec drizzle-kit migrate
