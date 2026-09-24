// Pack Blender views into one compact, transparent texture for the website.
const sharp = require('sharp');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const tile = 832;
sharp({ create: { width: tile * 4, height: tile * 4, channels: 4, background: '#00000000' } })
  .composite(Array.from({ length: 13 }, (_, index) => ({
    input: path.join(root, 'assets/mug/turn', `mug-${String(index).padStart(2, '0')}.png`),
    left: (index % 4) * tile,
    top: Math.floor(index / 4) * tile,
  })))
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(path.join(root, 'public/models/mug/watercolor-mug-turn.webp'))
  .then(info => console.log(info))
  .catch(error => { console.error(error); process.exitCode = 1; });
