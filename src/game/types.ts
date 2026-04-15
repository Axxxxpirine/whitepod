// Using const objects instead of enums for compatibility with erasableSyntaxOnly

export const TileType = {
  Empty: 0,
  Ground: 1,
  Rock: 2,
  Water: 3,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}
