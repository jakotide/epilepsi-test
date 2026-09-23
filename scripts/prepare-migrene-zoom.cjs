// Run with: node scripts/prepare-migrene-zoom.cjs
// Preserve the original paintings; only create lightweight browser derivatives.
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const source = path.join(process.cwd(), "public/images/migrene-zoom");
  const output = path.join(source, "webp");
  await fs.mkdir(output, { recursive: true });
  for (const index of [1, 2, 4, 5, 6]) {
    const result = await sharp(path.join(source, `${index}.png`))
      .webp({ quality: 88, effort: 5 }).toFile(path.join(output, `${index}.webp`));
    console.log(`${index}.webp: ${Math.round(result.size / 1024)} KB`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
