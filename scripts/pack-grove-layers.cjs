const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/models/grove');
fs.mkdirSync(output, { recursive: true });
Promise.all(['tree-sage', 'tree-gold', 'tree-blue', 'grass-tufts'].map(async name => {
  const info = await sharp(path.join(root, 'assets/grove', name + '.png'))
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toFile(path.join(output, name + '.webp'));
  return { name, bytes: info.size };
})).then(results => console.log(JSON.stringify(results)))
  .catch(error => { console.error(error); process.exitCode = 1; });
