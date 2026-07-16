// Performance configuration — full quality by default, `?lite` for weak GPUs
const q = new URLSearchParams(window.location.search);
export const LITE = q.has('lite');

export const GRASS_COUNT = LITE ? 6000 : 52000;
export const TREE_PER_VARIANT = LITE ? 90 : 420;
export const SHRUB_COUNT = LITE ? 90 : 520;
export const ROCK_PER_VARIANT = LITE ? 45 : 170;
export const TERRAIN_SEG = LITE ? 160 : 340;
export const PEAK_COUNT = LITE ? 8 : 14;
export const SHADOWS = !LITE;
export const WATER_TEX_SIZE = LITE ? 128 : 512;
export const PIXEL_RATIO_CAP = LITE ? 1 : 2;
