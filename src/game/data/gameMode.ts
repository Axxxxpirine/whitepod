/**
 * How a world is played.
 *
 * - `sandbox`: everything unlocked, building is free. Used by dev scenarios,
 *   scenario generators, bots and most tests.
 * - `campaign`: the progression mode (hub, construction costs, milestones,
 *   unlocks). Campaign rules are added on top of this flag by later systems.
 *
 * The mode is chosen when a world is created and never changes afterwards.
 */
export const GameMode = {
  Campaign: 'campaign',
  Sandbox: 'sandbox',
} as const;

export type GameMode = (typeof GameMode)[keyof typeof GameMode];

/** Mode of new worlds and of saves written before game modes existed. */
export const DEFAULT_GAME_MODE: GameMode = GameMode.Sandbox;

const GAME_MODES: ReadonlySet<string> = new Set(Object.values(GameMode));

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && GAME_MODES.has(value);
}

/** Resolves a persisted or untrusted value to a valid mode, falling back to the default. */
export function resolveGameMode(value: unknown): GameMode {
  return isGameMode(value) ? value : DEFAULT_GAME_MODE;
}
