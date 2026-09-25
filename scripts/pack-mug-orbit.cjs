const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs/promises');
const root = path.resolve(__dirname, '..');
(async () => {
  const output = path.join(root, 'public/models/mug/orbit');
  await fs.mkdir(output, { recursive: true });
  let bytes = 0;
  for (let index = 0; index < 72; index++) {
    const name = `mug-${String(index).padStart(2, '0')}`;
    const result = await sharp(path.join(root, 'assets/mug/orbit', `${name}.png`))
      .webp({ quality: 91, alphaQuality: 100, effort: 6 }).toFile(path.join(output, `${name}.webp`));
    bytes += result.size;
  }
  console.log({ frames: 72, bytes });
})().catch(error => { console.error(error); process.exitCode = 1; });
