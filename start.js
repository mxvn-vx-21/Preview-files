// Entry point for the Pterodactyl "Node.js Generic" egg.
//
// That egg only knows how to run `npm install`, but this repo is a pnpm
// workspace — plain npm can't resolve the `workspace:*` dependencies, so
// the egg's own install step is expected to fail with "Use pnpm instead"
// (see the root package.json's `preinstall` script). That failure is
// harmless and safe to ignore; everything real happens below instead.
//
// Set MAIN_FILE to "start.js" in the egg's startup variables so this file
// runs instead of a plain index.js.

const { execSync } = require("child_process");

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: __dirname });
}

// `corepack enable` is avoided on purpose: Pterodactyl's container has a
// read-only filesystem everywhere except /home/container, and corepack
// tries to write a global symlink into /usr/local/bin, which fails with
// EROFS. Running pnpm through npx instead caches and executes it entirely
// inside the writable home directory.
run("npx -y pnpm@9.15.9 install --no-frozen-lockfile");

// Load BOT_TOKEN / DATABASE_URL / etc. from a .env file now, before the
// steps below that need DATABASE_URL (db push) — this egg has no field for
// arbitrary secrets, so create /home/container/.env by hand in the panel's
// File Manager (it's gitignored, so `git pull` on auto-update never
// touches or overwrites it). execSync below inherits process.env, so
// anything loaded here reaches the child commands too.
require("dotenv").config();

// Pterodactyl injects SERVER_PORT into every container (whatever port the
// panel allocated — see "Address" on the server overview), regardless of
// egg. The app itself just wants PORT, so map it unless .env already set
// one explicitly.
if (!process.env.PORT && process.env.SERVER_PORT) {
  process.env.PORT = process.env.SERVER_PORT;
}

// Scoped on purpose: the root `pnpm run build` typechecks and builds every
// package in the monorepo, including mockup-sandbox (the old React
// dashboard, not needed to run the bot) — on a memory-capped container
// that got OOM-killed (exit 137) partway through. @workspace/api-server's
// own build is just an esbuild bundle and resolves @workspace/db /
// @workspace/api-zod straight from their TypeScript source, so nothing
// else needs building first.
run("npx -y pnpm@9.15.9 --filter @workspace/api-server run build");

// Push the Drizzle schema (profiles.kills/deaths/ign/tier etc.) to the
// real database on every boot, so a schema change in the code never
// silently drifts from what's actually in Postgres. --force skips the
// interactive "is this intentional?" prompt, which would otherwise hang
// forever with no terminal attached to answer it.
run("npx -y pnpm@9.15.9 --filter @workspace/db run push-force");

import("./artifacts/api-server/dist/index.mjs");
