import * as THREE from 'three';
import { brushed, paintedSteel } from './textures';

// One shared instance per look, so dozens of meshes cost one shader program each and the renderer can
// adjust them all at once (light estimation changes envMapIntensity on every material in `all`).

const all: THREE.MeshStandardMaterial[] = [];
const keep = <T extends THREE.MeshStandardMaterial>(m: T) => (all.push(m), m);
export const allMaterials = () => all;

let made: ReturnType<typeof build> | null = null;
export const mats = () => (made ??= build());

function paint(hex: number, opts: { grime?: number; seed?: number; roughness?: number; metalness?: number } = {}) {
  const { map, roughnessMap } = paintedSteel(hex, { grime: opts.grime ?? 0.5, seed: opts.seed ?? 1 });
  return keep(new THREE.MeshStandardMaterial({ map, roughnessMap, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0.25 }));
}

function build() {
  const brush = brushed();
  return {
    /** RAL 7035 light grey: the colour of almost every Indian LT panel. */
    panelGrey: paint(0xc8cbc4, { grime: 0.6, seed: 2 }),
    panelInside: paint(0x9ea29a, { grime: 0.9, seed: 4, roughness: 0.95 }),
    safetyYellow: paint(0xd9a516, { grime: 0.8, seed: 6 }),
    machineGreen: paint(0x3f6e4f, { grime: 0.7, seed: 8 }),
    darkGrey: paint(0x3b3f44, { grime: 0.5, seed: 10 }),
    signalRed: keep(new THREE.MeshPhysicalMaterial({ color: 0xb3120f, roughness: 0.32, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.25 })),
    steel: keep(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.42, roughnessMap: brush, metalness: 0.9 })),
    chrome: keep(new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.12, metalness: 1 })),
    brass: keep(new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 1 })),
    copper: keep(new THREE.MeshStandardMaterial({ color: 0xc46e3c, roughness: 0.35, metalness: 1 })),
    galvanised: keep(new THREE.MeshStandardMaterial({ color: 0xb4b8b8, roughness: 0.55, roughnessMap: brush, metalness: 0.8 })),
    rubber: keep(new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 })),
    plasticWhite: keep(new THREE.MeshStandardMaterial({ color: 0xece9e1, roughness: 0.45, metalness: 0 })),
    plasticBlack: keep(new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.5, metalness: 0 })),
    plasticRed: keep(new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.45, metalness: 0 })),
    plasticYellow: keep(new THREE.MeshStandardMaterial({ color: 0xf2c300, roughness: 0.5, metalness: 0 })),
    plasticGreen: keep(new THREE.MeshStandardMaterial({ color: 0x1f8a3b, roughness: 0.5, metalness: 0 })),
    cableRed: keep(new THREE.MeshStandardMaterial({ color: 0xa31612, roughness: 0.55 })),
    cableYellow: keep(new THREE.MeshStandardMaterial({ color: 0xc9a400, roughness: 0.55 })),
    cableBlue: keep(new THREE.MeshStandardMaterial({ color: 0x173f8f, roughness: 0.55 })),
    cableBlack: keep(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55 })),
    soot: keep(new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 1 })),
    ore: keep(new THREE.MeshStandardMaterial({ color: 0x6e4b36, roughness: 0.95, flatShading: true })),
    oreDark: keep(new THREE.MeshStandardMaterial({ color: 0x4d3a2e, roughness: 1, flatShading: true })),
  };
}

/** Emissive "LED" whose brightness the props animate. Not shared: each indicator owns its colour. */
export function lamp(hex: number, intensity = 1.5) {
  return keep(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: intensity, roughness: 0.3 }));
}

/** Flat printed decal (label, sign, tag) on top of a surface. */
export function decal(map: THREE.Texture, opts: { roughness?: number; transparent?: boolean } = {}) {
  return keep(new THREE.MeshStandardMaterial({ map, roughness: opts.roughness ?? 0.6, metalness: 0, transparent: opts.transparent ?? false, polygonOffset: true, polygonOffsetFactor: -2 }));
}
