/** The game's working title. Rename the game by changing this one constant. */
export const GAME_TITLE = 'Citybloom';
export const GAME_VERSION = '0.1.0';
/** True in dev and test builds: exposes window.__game and extra diagnostics. */
export const IS_TEST_BUILD = import.meta.env.DEV || import.meta.env.MODE === 'test';
