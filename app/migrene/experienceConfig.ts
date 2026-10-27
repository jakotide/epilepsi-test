// Keep the original rose/woodland scenes and assets available for future use.
// False presents all four visual effects on the mug, plate, and book instead.
export const SHOW_BOTANICAL_SCENES = false;

// Each Blender composition has its own camera height, framing, and arrangement.
// Manual rotation is relative to the starting heading; Home resets that view.
export const STILL_LIFE_SCENES = [
  { orbit: "mug-close", angle: 0 },
  { orbit: "orbit", angle: 0 },
  { orbit: "open-book", angle: 0 },
  { orbit: "cupcake", angle: 75 },
] as const;
export type StillLifeComposition = (typeof STILL_LIFE_SCENES)[number]["orbit"];
