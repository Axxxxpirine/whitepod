export const GRID_WIDTH = 256;
export const GRID_HEIGHT = 256;
export const GRID_SIZE = GRID_WIDTH * GRID_HEIGHT;
export const TILE_SIZE = 32;
// Visual iso 2:1 diamond projection. Gameplay still uses rectangular (tx, ty)
// coords; only renderers and screen-to-world transforms project through these.
export const ISO_TILE_W = 64;
export const ISO_TILE_H = 32;
export const DEFAULT_MAP_SEED = 42;
export const RESOURCE_DEPOSIT_AMOUNT = 100;
export const INITIAL_FOG_REVEAL_RADIUS = 20;
export const WATCHTOWER_REVEAL_RADIUS = 15;
export const REVEALED_FLAG = 0x01;
