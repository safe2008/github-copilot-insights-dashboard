#!/usr/bin/env bash
set -e

corepack enable
cd app
corepack prepare --activate
pnpm install
pnpm exec drizzle-kit migrate
