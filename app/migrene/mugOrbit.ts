import * as THREE from "three";

/** Small, bounded working set of Eevee views; never upload a full turntable atlas. */
export function createMugOrbit(onLoad: () => void, onError: () => void) {
  return createPaintedOrbit(index=>`/models/mug/lit-orbit/mug-${String(index).padStart(2,"0")}.webp`,onLoad,onError,8);
}

export function createPaintedOrbit(url: (index:number)=>string, onLoad:()=>void, onError:()=>void, limit=6) {
  const count = 72;
  const cache = new Map<number, THREE.Texture>();
  const pending = new Set<number>(), failed = new Set<number>();
  const loader = new THREE.TextureLoader();
  let alive = true, wanted = 0, first = true;
  let protectedFrames: number[] = [];
  let resolveReady: () => void;
  const loaded = new Promise<void>(resolve=>{resolveReady=resolve;});
  const wrap = (index: number) => ((index % count) + count) % count;
  const distance = (index: number) => Math.min(wrap(index - wanted), wrap(wanted - index));
  function trim() {
    while (cache.size > limit) {
      const oldest = [...cache.keys()].find(index => !protectedFrames.includes(index));
      if (oldest === undefined) break;
      cache.get(oldest)!.dispose(); cache.delete(oldest);
    }
  }
  function pump() {
    if (!alive) return;
    const base = Math.floor(wanted);
    for (const offset of [0, 1, -1, 2]) {
      const index = wrap(base + offset);
      if (pending.size >= 3) break;
      if (cache.has(index) || pending.has(index) || failed.has(index)) continue;
      pending.add(index);
      loader.load(url(index), texture => {
        pending.delete(index);
        if (!alive) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        cache.set(index, texture); trim();
        resolveReady();onLoad(); pump();
      }, undefined, () => {
        pending.delete(index); failed.add(index);
        if (alive) { if (first) { first = false; onError();resolveReady(); } pump(); }
      });
    }
  }
  return {
    load(){pump();return loaded;},
    get ready() { return cache.size > 0; },
    get size() { return cache.size; },
    sample(angle: number) {
      wanted = wrap(angle / 5); pump();
      const low = Math.floor(wanted), high = wrap(low + 1);
      let a = low, b = high, blend = wanted - low;
      if (!cache.has(a) || !cache.has(b)) {
        const nearest = [...cache.keys()].sort((x, y) => distance(x) - distance(y))[0];
        if (nearest === undefined) return null;
        a = b = nearest; blend = 0;
      }
      protectedFrames = [a, b];
      const textureA = cache.get(a)!, textureB = cache.get(b)!;
      for (const index of protectedFrames) {
        const texture = cache.get(index)!; cache.delete(index); cache.set(index, texture);
      }
      trim();
      return { textureA, textureB, blend };
    },
    dispose() { alive = false;resolveReady();cache.forEach(texture => texture.dispose()); cache.clear(); },
  };
}
