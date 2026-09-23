type Point = { x: number; y: number };
type Wash = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: string;
  opacity: number;
  seed: number;
};

// A repeatable painting: moving the pointer never regenerates the pigment.
function randomGenerator(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function subdivide(points: Point[], random: () => number, roughness: number) {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const offset = (random() - 0.5) * roughness;
    result.push(a, {
      x: (a.x + b.x) / 2 - dy * offset,
      y: (a.y + b.y) / 2 + dx * offset,
    });
  }
  return result;
}

function path(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
  context.closePath();
}

function paintWash(target: CanvasRenderingContext2D, wash: Wash) {
  // Composite each wash as a group. Very low per-stroke alpha directly on the
  // final canvas causes 8-bit rounding to turn delicate pigments gray.
  const layer = document.createElement('canvas');
  layer.width = target.canvas.width;
  layer.height = target.canvas.height;
  const context = layer.getContext('2d');
  if (!context) return;
  context.scale(1.25, 1.25);
  const random = randomGenerator(wash.seed);
  let base: Point[] = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 0.76 + random() * 0.36;
    return {
      x: wash.x + Math.cos(angle) * wash.rx * radius,
      y: wash.y + Math.sin(angle) * wash.ry * radius,
    };
  });
  for (let i = 0; i < 3; i++) base = subdivide(base, random, 0.65);

  context.save();
  context.fillStyle = wash.color;
  // Translucent, independently feathered deposits build up a broken wet edge.
  for (let layer = 0; layer < 30; layer++) {
    let points = base.map((point) => {
      const expansion = 0.9 + random() * 0.18;
      return {
        x: wash.x + (point.x - wash.x) * expansion,
        y: wash.y + (point.y - wash.y) * expansion,
      };
    });
    for (let i = 0; i < 3; i++) points = subdivide(points, random, 0.8);
    path(context, points);
    context.globalAlpha = 0.075;
    context.fill();
    // Occasional tide marks, rather than an outline around every wash.
    if (layer % 9 === 0) {
      context.strokeStyle = wash.color;
      context.lineWidth = 0.6;
      context.globalAlpha = 0.065;
      context.stroke();
    }
  }

  path(context, base);
  context.clip();
  // Fine, stationary granulation catches in the paper under the wash.
  for (let i = 0; i < 2400; i++) {
    const x = wash.x + (random() - 0.5) * wash.rx * 2.3;
    const y = wash.y + (random() - 0.5) * wash.ry * 2.3;
    context.globalAlpha = random() * 0.16;
    context.fillRect(x, y, 0.4 + random() * 1.8, 0.4 + random() * 1.2);
  }
  context.restore();
  target.save();
  target.globalAlpha = wash.opacity;
  target.drawImage(layer, 0, 0, layer.width / 1.25, layer.height / 1.25);
  target.restore();
}

const distantWashes: Wash[] = [
  { x: 1130, y: 465, rx: 420, ry: 345, color: '#9fa7bd', opacity: 0.2, seed: 13 },
  { x: 1050, y: 370, rx: 340, ry: 210, color: '#d5bca4', opacity: 0.25, seed: 29 },
  { x: 1230, y: 660, rx: 380, ry: 250, color: '#9caeb5', opacity: 0.26, seed: 73 },
  { x: 775, y: 600, rx: 265, ry: 225, color: '#b6b7c7', opacity: 0.18, seed: 93 },
  { x: 650, y: 340, rx: 210, ry: 130, color: '#d7c9b4', opacity: 0.13, seed: 41 },
  { x: 1430, y: 310, rx: 260, ry: 190, color: '#c7afa3', opacity: 0.18, seed: 17 },
];

const nearWashes: Wash[] = [
  { x: 1110, y: 585, rx: 295, ry: 245, color: '#849bae', opacity: 0.24, seed: 122 },
  { x: 935, y: 690, rx: 245, ry: 140, color: '#8999b4', opacity: 0.29, seed: 113 },
  { x: 1280, y: 530, rx: 190, ry: 190, color: '#ac9bb0', opacity: 0.22, seed: 226 },
  { x: 780, y: 580, rx: 150, ry: 125, color: '#d8ac9b', opacity: 0.18, seed: 187 },
  { x: 1250, y: 750, rx: 250, ry: 105, color: '#a8afb7', opacity: 0.16, seed: 267 },
];

export function paintWatercolor(canvas: HTMLCanvasElement, foreground: boolean) {
  const context = canvas.getContext('2d');
  if (!context) return;
  // Fixed-size source art stays stable on resize and is cached for hover tinting.
  canvas.width = 1800;
  canvas.height = 1250;
  context.scale(1.25, 1.25);
  const washes = foreground ? nearWashes : distantWashes;
  for (const wash of washes) {
    paintWash(context, { ...wash, x: wash.x - 400, y: wash.y - 30 });
  }
}

export function paintForegroundWatercolor(canvas: HTMLCanvasElement, coat = 0, paperColor = '#f8f5ef') {
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = 1800;
  // Padding above and below prevents the organic edge clipping to a rectangle.
  canvas.height = 1750;
  context.scale(1.25, 1.25);
  // Each coat adds pigment higher on the portrait without moving earlier paint.
  const coats: Wash[][] = [
    [
      { x: 720, y: 835, rx: 660, ry: 115, color: paperColor, opacity: 0.32, seed: 321 },
      { x: 380, y: 895, rx: 435, ry: 100, color: paperColor, opacity: 0.56, seed: 327 },
      { x: 1060, y: 915, rx: 435, ry: 100, color: paperColor, opacity: 0.56, seed: 343 },
      { x: 730, y: 885, rx: 480, ry: 100, color: paperColor, opacity: 0.48, seed: 371 },
    ],
    [
      { x: 390, y: 780, rx: 510, ry: 185, color: paperColor, opacity: 0.9, seed: 411 },
      { x: 1050, y: 770, rx: 510, ry: 190, color: paperColor, opacity: 0.9, seed: 427 },
      { x: 710, y: 850, rx: 590, ry: 165, color: paperColor, opacity: 0.9, seed: 433 },
    ],
    [
      { x: 390, y: 650, rx: 545, ry: 230, color: paperColor, opacity: 0.92, seed: 451 },
      { x: 1040, y: 630, rx: 535, ry: 225, color: paperColor, opacity: 0.92, seed: 467 },
      { x: 720, y: 725, rx: 660, ry: 200, color: paperColor, opacity: 0.94, seed: 479 },
    ],
    [
      { x: 390, y: 490, rx: 555, ry: 245, color: paperColor, opacity: 0.94, seed: 491 },
      { x: 1040, y: 470, rx: 535, ry: 220, color: paperColor, opacity: 0.94, seed: 503 },
      { x: 740, y: 600, rx: 680, ry: 230, color: paperColor, opacity: 0.94, seed: 521 },
    ],
  ];
  for (const wash of coats[coat] ?? coats[0]) {
    paintWash(context, {
      ...wash,
      y: wash.y + 200,
      opacity: wash.opacity * (coat === 0 ? 1 : 0.72),
    });
  }
  // Preserve the watercolor alpha, but use exactly the surrounding paper color.
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = paperColor;
  context.fillRect(0, 0, 1440, 1400);
  context.globalCompositeOperation = 'destination-in';
  const edges = context.createLinearGradient(0, 0, 1440, 0);
  edges.addColorStop(0, 'transparent');
  edges.addColorStop(0.055, '#000');
  edges.addColorStop(0.945, '#000');
  edges.addColorStop(1, 'transparent');
  context.fillStyle = edges;
  context.fillRect(0, 0, 1440, 1400);
  context.globalCompositeOperation = 'source-over';
}
