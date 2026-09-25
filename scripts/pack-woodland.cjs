const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const output = path.join(root, 'public/models/grove/woodland');
  await fs.mkdir(output, { recursive: true });
  const results = await Promise.all(['birch-ink', 'birch-blue', 'birch-gold'].map(async name => {
    const info = await sharp(path.join(root, 'assets/grove/woodland', `${name}.png`))
      .webp({ quality: 93, alphaQuality: 100, effort: 6 })
      .toFile(path.join(output, `${name}.webp`));
    return { name, bytes: info.size };
  }));
  console.log(results);
})().catch(error => { console.error(error); process.exitCode = 1; });
