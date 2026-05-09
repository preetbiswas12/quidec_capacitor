const fs = require('fs');
const path = require('path');
const dir = '.github/workflows';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml'));
let changed = 0;
for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  
  const search = 'run: pnpm install --frozen-lockfile || (echo "⚠️ Frozen lockfile failed, installing with updates" && pnpm install)';
  const replace = 'run: NODE_ENV=development pnpm install --frozen-lockfile || (echo "⚠️ Frozen lockfile failed, installing with updates" && NODE_ENV=development pnpm install)';
  
  if (content.includes(search)) {
    content = content.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
    fs.writeFileSync(p, content);
    console.log('Fixed ' + file);
    changed++;
  }
}
console.log('Total fixed: ' + changed);
