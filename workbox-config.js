// Generated for InnVision's PWA build. Run via `npm run build:web`, which
// does `expo export -p web` (builds the site into dist/) and then feeds
// this config to Workbox to produce dist/sw.js — a service worker that
// precaches everything the export produced, so repeat visits (and the
// installed/standalone app) load instantly from cache instead of the
// network.
//
// skipWaiting + clientsClaim: without these, a newly deployed version's
// service worker installs but sits "waiting" until every open tab of the
// app is fully closed, so staff could keep seeing a stale cached build
// for a long time after a deploy. These two settings make a new deploy
// take over as soon as it's installed, at the small cost of a page
// occasionally needing one reload right after a fresh deploy to pick up
// the new version cleanly.
module.exports = {
  globDirectory: 'dist/',
  globPatterns: [
    '**/*.{html,js,css,png,jpg,jpeg,svg,json,ico,woff,woff2,ttf}',
  ],
  // Source maps are large and never need to be cached for the app to run.
  globIgnores: ['**/*.map'],
  swDest: 'dist/sw.js',
  skipWaiting: true,
  clientsClaim: true,
};
