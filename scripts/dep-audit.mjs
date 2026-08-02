import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const root = process.cwd();
const srcDir = join(root, 'src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(srcDir);
const isTest = (f) => f.includes(`${sep}__tests__${sep}`) || f.includes(`.test.ts`);

const prodFiles = files.filter((f) => !isTest(f));

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const fromDir = fromFile.slice(0, fromFile.lastIndexOf(sep));
  let base = join(fromDir, spec);
  const candidates = [];
  candidates.push(base);
  if (base.endsWith('.js')) candidates.push(base.slice(0, -3) + '.ts');
  candidates.push(base + '.ts');
  candidates.push(base + '.js');
  candidates.push(join(base, 'index.ts'));
  candidates.push(join(base, 'index.js'));
  for (const cand of candidates) {
    const norm = normalize(cand);
    if (norm && prodFiles.includes(norm)) return norm;
  }
  return null;
}

function normalize(p) {
  const parts = [];
  for (const part of p.split(sep)) {
    if (part === '.' || part === '') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join(sep);
}

const importedBy = new Map();
const imports = new Map();

for (const f of prodFiles) {
  const content = readFileSync(f, 'utf8');
  const imported = [];
  const re = /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(content))) {
    const spec = m[1] || m[2];
    if (!spec) continue;
    const resolved = resolveImport(f, spec);
    if (resolved) imported.push(resolved);
  }
  imports.set(f, imported);
  for (const target of imported) {
    if (!importedBy.has(target)) importedBy.set(target, []);
    importedBy.get(target).push(f);
  }
}

console.log('=== FILES NEVER IMPORTED BY ANY PRODUCTION FILE (candidates for dead code) ===');
for (const f of prodFiles) {
  const refs = importedBy.get(f) || [];
  if (refs.length === 0) {
    console.log(`NO-REF: ${relative(root, f).replace(/\\/g, '/')}`);
  }
}

console.log('\n=== FILES IMPORTED ONLY FROM TESTS/CLI (weak integration) ===');
for (const f of prodFiles) {
  const refs = (importedBy.get(f) || []).filter((r) => !r.includes(`${sep}cli${sep}`));
  const cliRefs = (importedBy.get(f) || []).filter((r) => r.includes(`${sep}cli${sep}`));
  if (refs.length === 0 && cliRefs.length > 0) {
    console.log(`CLI-ONLY: ${relative(root, f).replace(/\\/g, '/')} <- ${cliRefs.length}`);
  }
}

console.log('\n=== ALL PRODUCTION FILES WITH IMPORT COUNTS (sorted) ===');
const rows = prodFiles.map((f) => ({ f, n: (importedBy.get(f) || []).length }));
rows.sort((a, b) => a.n - b.n);
for (const r of rows) {
  console.log(`${String(r.n).padStart(3)} ${relative(root, r.f).replace(/\\/g, '/')}`);
}
