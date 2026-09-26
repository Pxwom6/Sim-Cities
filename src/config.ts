/** The game's working title. Rename the game by changing this one constant. */
export const GAME_TITLE = 'Citybloom';
export const GAME_VERSION = '0.1.0';
const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
/** True in dev and test builds: exposes window.__game and extra diagnostics (false under plain Node). */
export const IS_TEST_BUILD = !!env && (env.DEV === true || env.MODE === 'test');
