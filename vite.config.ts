import { defineConfig } from 'vite';

/**
 * Where this build will live. Everything that must be an ABSOLUTE URL for
 * crawlers — canonical, Open Graph, Twitter cards, JSON-LD, the sitemap — is
 * derived from this single value, so moving to a custom domain (or a
 * subdomain, or a different repo path) is a one-variable change:
 *
 *   SITE_URL=https://castle.example.dev/ npm run build
 *
 * or set a `SITE_URL` repository variable for the Pages workflow.
 */
const SITE_URL = (process.env.SITE_URL || 'https://thre4dripper.github.io/Infinity-Castle-ThreeJs/')
  .replace(/\/+$/, '') + '/';
const SITE_HOST = new URL(SITE_URL).hostname;
const IS_CUSTOM_DOMAIN = !SITE_HOST.endsWith('.github.io');
const TODAY = new Date().toISOString().slice(0, 10);

/** Injects the site URL into index.html and emits the crawler files. */
function seo() {
  return {
    name: 'castle-seo',
    transformIndexHtml(html: string) {
      return html.replace(/%SITE_URL%/g, SITE_URL);
    },
    generateBundle(this: {
      emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void;
    }) {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `# 無限城 — Infinity Castle
# Everything here is public; crawl freely.
User-agent: *
Allow: /

# The dev galleries are the same geometry in an orbit viewer — no value in the
# index, and they would compete with the game page for the same keywords.
Disallow: /?dev=

Sitemap: ${SITE_URL}sitemap.xml
`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${SITE_URL}og.jpg</image:loc>
      <image:title>Infinity Castle 無限城 — an endless procedural Japanese castle</image:title>
    </image:image>
  </url>
</urlset>
`,
      });
      // GitHub Pages needs the domain in a CNAME file alongside the build, or
      // an Actions deploy can drop the custom-domain setting.
      if (IS_CUSTOM_DOMAIN) {
        this.emitFile({ type: 'asset', fileName: 'CNAME', source: SITE_HOST + '\n' });
      }
    },
  };
}

export default defineConfig({
  // relative asset paths — the build runs at a repo subpath or a domain root
  base: './',
  plugins: [seo()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
  },
});
