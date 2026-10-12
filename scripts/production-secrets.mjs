import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
mkdirSync('.local', { recursive: true, mode: 0o700 });
if (existsSync('.local/production-owner-key')) throw new Error('Production credentials already exist. Move them safely before explicitly generating replacements.');
const owner = randomBytes(32).toString('hex');
for (const [name, value] of Object.entries({ 'owner-key': owner, 'owner-key-hash': createHash('sha256').update(owner).digest('hex'), 'session-secret': randomBytes(32).toString('hex') })) writeFileSync(`.local/production-${name}`, value + '\n', { mode: 0o600 });
console.log('Production credentials generated in .local/production-*. Keep private; nothing deployed.');
