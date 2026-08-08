/**
 * GitHub-related domains that EasyProxy accelerates.
 *
 * `domains` supports two forms:
 *   - exact host:   "github.com"
 *   - wildcard:     "*.githubusercontent.com"  (matches single-label subdomain)
 *
 * `curated` is a FALLBACK IP list used only when DoH resolution fails.
 * These values should be refreshed periodically (GitHub/Fastly rotate IP ranges).
 * The plugin prefers live DoH resolution at runtime.
 */
module.exports = {
  domains: [
    'github.com',
    'api.github.com',
    'gist.github.com',
    'raw.githubusercontent.com',
    'gist.githubusercontent.com',
    'cloud.githubusercontent.com',
    'camo.githubusercontent.com',
    'avatars.githubusercontent.com',
    'avatars0.githubusercontent.com',
    'avatars1.githubusercontent.com',
    'avatars2.githubusercontent.com',
    'avatars3.githubusercontent.com',
    'user-images.githubusercontent.com',
    'media.githubusercontent.com',
    'objects.githubusercontent.com',
    'codeload.github.com',
    'github.githubassets.com',
    'assets-cdn.github.com',
    'collector.github.com',
    'desktop.githubusercontent.com',
    'vignette.githubusercontent.com',
    'pipelines.actions.githubusercontent.com',
    '*.github.io',
  ],

  curated: {
    'github.com': ['20.205.243.166', '140.82.121.4'],
    'api.github.com': ['20.205.243.166', '140.82.121.5'],
    'raw.githubusercontent.com': ['185.199.108.133', '185.199.109.133'],
    'objects.githubusercontent.com': ['185.199.108.133', '185.199.109.133'],
    'avatars.githubusercontent.com': ['185.199.108.133', '185.199.109.133'],
    'github.githubassets.com': ['185.199.108.153', '185.199.109.153'],
    'codeload.github.com': ['20.205.243.166', '140.82.121.10'],
  },
};
