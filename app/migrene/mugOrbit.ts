import * as THREE from "three";
import type { StillLifeComposition } from "./experienceConfig";

/** Small, bounded working set of Eevee views; never upload a full turntable atlas. */
export function createMugOrbit(onLoad: () => void, onError: () => void) {
  return createPaintedOrbit(index=>`/models/mug/lit-orbit/mug-${String(index).padStart(2,"0")}.webp`,onLoad,onError,8);
}

export function createStillLifeOrbit(onLoad: () => void, onError: () => void, composition: StillLifeComposition = "orbit") {
  // A single sharp view avoids doubled book edges and translucent mug handles.
  return createPaintedOrbit(index=>`/models/still-life/${composition}/view-${String(index).padStart(2,"0")}.webp`,onLoad,onError,6,72,false);
}

export function createPaintedOrbit(url: (index:number)=>string, onLoad:()=>void, onError:()=>void, limit=6, count=72, interpolate=true) {
  const cache = new Map<number, THREE.Texture>();
  const pending = new Set<number>(), failed = new Set<number>();
  const loader = new THREE.TextureLoader();
  const waiters = new Map<number, Set<(ready: boolean) => void>>();
  let alive = true, wanted = 0, first = true;
  let protectedFrames: number[] = [];
  let resolveReady: () => void;
  const loaded = new Promise<void>(resolve=>{resolveReady=resolve;});
  const wrap = (index: number) => ((index % count) + count) % count;
  const distance = (index: number) => Math.min(wrap(index - wanted), wrap(wanted - index));
  function finish(index: number, ready: boolean) {
    waiters.get(index)?.forEach(resolve => resolve(ready));
    waiters.delete(index);
  }
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
        cache.set(index, texture); trim();finish(index,true);
        resolveReady();onLoad(); pump();
      }, undefined, () => {
        pending.delete(index); failed.add(index);finish(index,false);
        if (alive) { if (first) { first = false; onError();resolveReady(); } pump(); }
      });
    }
  }
  return {
    load(){pump();return loaded;},
    prepare(angle: number) {
      const index = wrap(Math.round(angle / (360 / count)));
      wanted = index;
      if (!alive || failed.has(index)) return Promise.resolve(false);
      if (cache.has(index)) return Promise.resolve(true);
      return new Promise<boolean>(resolve => {
        const waiting = waiters.get(index) ?? new Set<(ready: boolean) => void>();
        waiting.add(resolve);waiters.set(index,waiting);pump();
      });
    },
    get ready() { return cache.size > 0; },
    get size() { return cache.size; },
    sample(angle: number) {
      const view = angle / (360 / count);
      wanted = wrap(interpolate ? view : Math.round(view)); pump();
      const low = Math.floor(wanted), high = interpolate ? wrap(low + 1) : low;
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
    dispose() { alive = false;resolveReady();waiters.forEach(waiting=>waiting.forEach(resolve=>resolve(false)));waiters.clear();cache.forEach(texture => texture.dispose()); cache.clear(); },
  };
}
