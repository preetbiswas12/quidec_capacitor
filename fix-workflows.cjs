const fs = require('fs');
const path = require('path');
const dir = '.github/workflows';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml'));
let changed = 0;
for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  
  const regex = /([ \t]*)- name: Install dependencies\r?\n\s+run: pnpm install --frozen-lockfile\r?\n\s+continue-on-error: true\r?\n\s+- name: Install dependencies \(fallback\)\r?\n\s+if: (?:failure\(\)|\$\{\{\s*failure\(\)\s*\}\})\r?\n\s+run: \|\r?\n\s+echo "[^"]+"\r?\n\s+pnpm install/g;
  
  const newContent = content.replace(regex, '$1- name: Install dependencies\n$1  run: pnpm install --frozen-lockfile || (echo "⚠️ Frozen lockfile failed, installing with updates" && pnpm install)');
  
  if (content !== newContent) {
    fs.writeFileSync(p, newContent);
    console.log('Fixed ' + file);
    changed++;
  }
}
console.log('Total fixed: ' + changed);
