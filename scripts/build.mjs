import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
mkdirSync('dist/public', { recursive: true });
for (const name of ['index.html', 'app.css']) copyFileSync(`public/${name}`, `dist/public/${name}`);
const results = await Promise.all([
  build({ entryPoints: ['src/browser.ts'], outfile: 'dist/public/app.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true }),
  build({ entryPoints: ['src/worker.ts'], outfile: 'dist/worker.mjs', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true }),
  build({ entryPoints: ['src/mcp.ts'], outfile: 'dist/mcp.mjs', bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'node22' }),
  build({ entryPoints: ['src/mcp.ts'], outfile: 'dist/docsync-mcp.cjs', bundle: true, format: 'cjs', platform: 'node', target: 'node22', minify: true, legalComments: 'linked', metafile: true }),
]);
const packageRoots = new Set();
for (const input of Object.keys(results[3].metafile.inputs)) {
  if (!input.startsWith('node_modules/')) continue;
  let directory = dirname(resolve(input));
  while (directory !== dirname(directory)) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name) { packageRoots.add(directory); break; }
    directory = dirname(directory);
  }
}
const notices = [];
for (const directory of packageRoots) {
  const name = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name;
  for (const file of readdirSync(directory).filter(file => /^licen[cs]e(?:\..*)?$/i.test(file))) notices.push(`${name}\n${readFileSync(join(directory, file), 'utf8')}`);
}
writeFileSync('dist/MCP-LICENSES.txt', notices.join('\n\n---\n\n'));
const mcpPath = resolve('dist/docsync-mcp.cjs');
writeFileSync('dist/mcp-config.json', JSON.stringify({ mcpServers: { docsync: { command: 'node', args: [mcpPath] } } }, null, 2) + '\n');
writeFileSync('dist/codex-mcp.toml', `[mcp_servers.docsync]\ncommand = "node"\nargs = [${JSON.stringify(mcpPath)}]\nstartup_timeout_sec = 20\n`);
console.log('Built editor, Worker, standalone MCP server, and client configuration examples.');
