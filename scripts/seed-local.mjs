#!/usr/bin/env node
// scripts/seed-local.mjs
// Usage: node scripts/seed-local.mjs
// Reads API_KEY_SALT from apps/api/.dev.vars, prompts for password,
// then seeds the local D1 database with a tenant + admin user.

import { createInterface } from 'readline'
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'

// ─── Read .dev.vars ───────────────────────────────────────────────────────────
const devVarsPath = 'apps/api/.dev.vars'
if (!existsSync(devVarsPath)) {
  console.error(`\n❌  ${devVarsPath} not found.`)
  console.error(`   Copy apps/api/.dev.vars.example to apps/api/.dev.vars and fill in your values.\n`)
  process.exit(1)
}

const devVars = Object.fromEntries(
  readFileSync(devVarsPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
)

const salt = devVars['API_KEY_SALT']
if (!salt || salt.startsWith('REPLACE')) {
  console.error('\n❌  API_KEY_SALT not set in .dev.vars. Generate one with: openssl rand -hex 16\n')
  process.exit(1)
}

// ─── Prompt for credentials ───────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(res => rl.question(q, res))

console.log('\n🌱  BOSS Platform — Local Database Seeder\n')

const email    = await ask('Admin email    [vishal@bosshq.com]: ') || 'vishal@bosshq.com'
const slug     = await ask('Tenant slug    [boss-hq]:           ') || 'boss-hq'
const tenantName = await ask('Tenant name    [BOSS HQ]:           ') || 'BOSS HQ'
const password = await ask('Password:                             ')
rl.close()

if (!password || password.length < 8) {
  console.error('\n❌  Password must be at least 8 characters.\n')
  process.exit(1)
}

// ─── Hash password ────────────────────────────────────────────────────────────
const encoded = new TextEncoder().encode(`${salt}:${password}`)
const hashBuf = await crypto.subtle.digest('SHA-256', encoded)
const hash    = Array.from(new Uint8Array(hashBuf)).map(x => x.toString(16).padStart(2, '0')).join('')

const tenantId = randomUUID()
const userId   = randomUUID()
const now      = Date.now()

// ─── Insert into D1 ──────────────────────────────────────────────────────────
const sql = `
INSERT OR IGNORE INTO tenants (id, name, slug, plan, status, created_at, updated_at)
VALUES ('${tenantId}', '${tenantName}', '${slug}', 'enterprise', 'active', ${now}, ${now});

INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, role, status, created_at, updated_at)
VALUES ('${userId}', '${tenantId}', '${email.toLowerCase()}', '${hash}', 'owner', 'active', ${now}, ${now});
`.trim()

try {
  execSync(`wrangler d1 execute boss-platform --local --command="${sql.replace(/\n/g, ' ')}"`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  console.log(`
✅  Seeded successfully!

   Portal login:
   ┌─────────────────────────────────────────┐
   │  Account ID : ${slug.padEnd(25)} │
   │  Email      : ${email.toLowerCase().padEnd(25)} │
   │  Password   : ${'(as entered)'.padEnd(25)} │
   └─────────────────────────────────────────┘

   URL: http://localhost:3000
`)
} catch (e) {
  console.error('\n❌  Seed failed. Is wrangler installed? Run: npm install -g wrangler\n')
  process.exit(1)
}
