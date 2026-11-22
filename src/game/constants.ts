export const GRID_WIDTH = 256;
export const GRID_HEIGHT = 256;
export const GRID_SIZE = GRID_WIDTH * GRID_HEIGHT;
/** Center of the map: initial fog reveal and campaign hub anchor. */
export const MAP_CENTER = { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) } as const;
export const TILE_SIZE = 32;
export const DEFAULT_MAP_SEED = 42;
/** Default amount of a deposit tile (placed by hand or by campaign start); generated maps vary it, see data/depositAmounts.ts. */
export const RESOURCE_DEPOSIT_AMOUNT = 1500;
export const INITIAL_FOG_REVEAL_RADIUS = 20;
export const WATCHTOWER_REVEAL_RADIUS = 15;
export const REVEALED_FLAG = 0x01;
