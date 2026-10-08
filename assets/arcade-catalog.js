import { getSafeGuideUrl } from './arcade-navigation.js';

export const PUBLISHED_SITE_ORIGIN = 'https://pazneria.github.io';

export function isLocalArcadeOrigin(location) {
  return ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(location?.hostname);
}

function localGameUrl(location, port) {
  const hostname = location?.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
  return `http://${hostname}:${port}/`;
}

/**
 * The catalog owns game identity and routes, never scene geometry or placement.
 * Preserve this order: existing session return state stores the cabinet index.
 * location and the existing Codex link API are injected to keep this CPU-testable.
 */
export function buildArcadeCatalog(location, codexLinks = null) {
  const publishedSiteOrigin = PUBLISHED_SITE_ORIGIN;
  const resolveGameUrl = (port, path) => isLocalArcadeOrigin(location)
    ? localGameUrl(location, port)
    : `${publishedSiteOrigin}${path}`;
  const codexContext = {
    baseUrl: publishedSiteOrigin,
    from: 'arcade',
    returnTo: location?.href || `${publishedSiteOrigin}/arcade/`,
  };
  const games = [
    {
      id: 'racegpt',
      name: 'RaceGPT',
      description: 'Run clean test-track time attacks, chase model ghosts, and try to beat the benchmark board.',
      url: resolveGameUrl(5178, '/racegpt/'),
      guideUrl: `${publishedSiteOrigin}/racegpt/wiki/`,
      thumbnail: './assets/cabinet-screens/racegpt-title.webp',
    },
    {
      id: 'osrs-clone',
      name: 'OSRS Clone',
      description: 'Step into a nostalgic low-poly grind with skilling, inventory flow, and classic MMO vibes.',
      url: `${publishedSiteOrigin}/osrs-clone/`,
      codexRepoName: 'osrs-clone-codex',
      guideUrl: codexLinks
        ? codexLinks.buildCodexHomeUrl({ basePath: '/osrs-clone-codex/wiki/', ...codexContext })
        : `${publishedSiteOrigin}/osrs-clone-codex/wiki/`,
      codexWorldUrl: codexLinks
        ? codexLinks.buildCodexEntityUrl('world', 'starter_town', {
            repoName: 'osrs-clone-codex',
            ...codexContext,
          })
        : `${publishedSiteOrigin}/osrs-clone-codex/world/starter_town`,
      thumbnail: './assets/cabinet-screens/osrs-clone-title.webp',
    },
    {
      id: 'sword-guys',
      name: 'Sword Guys',
      description: 'Team up with your blade-slinging crew to carve through waves of neon rivals and claim the arena.',
      url: resolveGameUrl(5179, '/sword-guys/'),
      guideUrl: `${publishedSiteOrigin}/sword-guys/wiki/`,
      thumbnail: './assets/cabinet-screens/sword-guys-title.webp',
    },
    {
      id: 'ghost-signal',
      name: 'Ghost Signal',
      description: 'Tune into other realities and banish glitches in a haunted synthwave control room.',
      comingSoon: true,
      thumbnail: './assets/cabinet-screens/ghost-signal-title.webp',
    },
    {
      id: 'night-courier',
      name: 'Night Courier',
      description: 'Slam through midnight streets delivering impossible payloads before dawn.',
      comingSoon: true,
      thumbnail: './assets/cabinet-screens/night-courier-title.webp',
    },
    {
      id: 'rebound-relay',
      name: 'Rebound Relay',
      description: 'Drive your hoverbug, knock the ball into the live gate, and chase clean shots in a 90-second run.',
      url: `${publishedSiteOrigin}/rebound-relay/`,
      guideUrl: `${publishedSiteOrigin}/rebound-relay/wiki/`,
      thumbnail: './assets/cabinet-screens/rebound-relay-title.webp',
    },
  ];
  return Object.freeze(games.map((game) => Object.freeze({
    ...game,
    ...(game.guideUrl ? { guideUrl: getSafeGuideUrl(game.guideUrl) } : {}),
  })));
}
