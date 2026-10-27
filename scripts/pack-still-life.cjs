// Extract the Eevee shadows onto transparent watercolor turntable frames.
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const variant = process.argv[2] || 'wide';
if (!['wide', 'mug-close', 'open-book'].includes(variant)) throw Error('Unknown still-life composition');
const asset = path.join(root, 'assets/still-life', variant === 'wide' ? '' : variant);
const input = path.join(asset, 'renders');
const output = path.join(root, 'public/models/still-life', variant === 'wide' ? 'orbit' : variant);
const linear = value => {
  value /= 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
};
(async () => {
  await fs.mkdir(output, { recursive: true });
  const baseline = await sharp(path.join(input, 'floor-baseline.png')).ensureAlpha().raw().toBuffer();
  let bytes = 0;
  const count = Number(process.env.FRAME_END || 72);
  for (let index = 0; index < count; index++) {
    const suffix = String(index).padStart(2, '0');
    const { data: floor, info } = await sharp(path.join(input, `floor-${suffix}.png`))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const object = await sharp(path.join(input, `object-${suffix}.png`)).ensureAlpha().raw().toBuffer();
    const shadow = Buffer.alloc(object.length);
    for (let i = 0; i < shadow.length; i += 4) {
      const lit = linear(floor[i]) + linear(floor[i+1]) + linear(floor[i+2]);
      const base = linear(baseline[i]) + linear(baseline[i+1]) + linear(baseline[i+2]);
      const density = base > .01 ? Math.max(0, 1 - lit / base - .012) : 0;
      const pixel = i / 4, x = pixel % info.width, y = Math.floor(pixel / info.width);
      const edge = Math.min(x / info.width, 1-x / info.width, y / info.height, 1-y / info.height);
      const fade = Math.min(1, Math.max(0, edge / .08));
      shadow[i] = 102; shadow[i+1] = 109; shadow[i+2] = 133;
      shadow[i+3] = Math.round(255 * Math.min(.38, density*.48) * fade*fade*(3-2*fade) * (1-object[i+3]/255));
    }
    const softenedShadow = await sharp(shadow, { raw: { width: info.width, height: info.height, channels: 4 } })
      .blur(2.4).png().toBuffer();
    const png = await sharp(softenedShadow)
      .composite([{ input: object, raw: { width: info.width, height: info.height, channels: 4 } }])
      .png().toBuffer();
    const result = await sharp(png).webp({ quality: 92, alphaQuality: 100, effort: 5 })
      .toFile(path.join(output, `view-${suffix}.webp`));
    bytes += result.size;
    if (index === 0) {
      await sharp(png).flatten({ background: '#f3f1f7' })
        .toFile(path.join(asset, 'preview.png'));
    }
  }
  console.log({ frames: count, bytes });
})().catch(error => { console.error(error); process.exitCode = 1; });
