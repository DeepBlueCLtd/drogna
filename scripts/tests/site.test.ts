/**
 * The site build and the estate's tenancy.
 *
 * The gates in scripts/gates/ check the built site's content; these check the machinery
 * around it — the rules that cannot be expressed as a finding about a page. Two of them
 * exist because a promise made in a comment is not a check: `ESTATE_PATHS` says the
 * instances workflow writes those paths, and `check-site-links` lets a link to one
 * through on the strength of it, so something has to read the workflow and confirm.
 */
import { readFileSync } from 'node:fs';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../gates/lib.js';
import { buildSite, ESTATE_PATHS, relativeUrl, urlOf } from '../site/build.js';
import { ownedByAnotherTenant, pathsToReap, write } from '../publish-site.js';
import { readInstances, renderInstanceIndex } from '../estate-index.js';

const workflow = (name: string): string =>
  readFileSync(join(REPO_ROOT, '.github', 'workflows', name), 'utf8');

describe('the estate has two tenants and each stays on its own ground', () => {
  it('every path the site build treats as another tenant is one the instances workflow writes', () => {
    const instances = workflow('instances.yml');
    for (const path of ESTATE_PATHS) {
      expect(instances, `nothing writes '${path}', so a link to it would 404`).toContain(
        `estate/${path}`,
      );
    }
  });

  it('the site publisher will not write into another tenant, whatever it is handed', () => {
    const estate = mkdtempSync(join(tmpdir(), 'drogna-estate-'));
    expect(() => write(estate, [{ path: 'instances/main/index.html', contents: 'x' }])).toThrow(
      /belongs to another tenant/,
    );
    expect(ownedByAnotherTenant('instances/main/index.html')).toBe(true);
    expect(ownedByAnotherTenant('index.html')).toBe(false);
  });

  it('the publisher reaps only what it published, and never an instance', () => {
    const estate = mkdtempSync(join(tmpdir(), 'drogna-estate-'));
    mkdirSync(join(estate, 'instances', 'main'), { recursive: true });
    writeFileSync(join(estate, 'instances', 'main', 'index.html'), 'the app');
    mkdirSync(join(estate, 'blog'), { recursive: true });
    writeFileSync(join(estate, 'blog', 'index.html'), 'a page from the previous site');

    // No manifest: the one-time migration from V1's estate, which kept none.
    expect(pathsToReap(estate).sort()).toEqual(['blog/']);

    write(estate, [{ path: 'index.html', contents: 'the new landing page' }]);
    // A manifest, deliberately over-claiming, is still refused the other tenant.
    writeFileSync(
      join(estate, '.drogna-site-manifest.json'),
      JSON.stringify({ paths: ['index.html', 'instances/main/index.html'] }),
    );
    expect(pathsToReap(estate)).toEqual(['index.html']);
    expect(existsSync(join(estate, 'instances', 'main', 'index.html'))).toBe(true);
  });

  it('the workflow that publishes the site runs the gates before it touches the estate', () => {
    const site = workflow('site.yml');
    const gatesAt = site.indexOf('pnpm run gates');
    const publishAt = site.indexOf('pnpm run site:publish');
    expect(gatesAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(gatesAt);
  });
});

describe('the instance index reports what the estate holds', () => {
  it('lists an instance with its provenance, and one without it saying so', () => {
    const estate = mkdtempSync(join(tmpdir(), 'drogna-estate-'));
    mkdirSync(join(estate, 'instances', 'main'), { recursive: true });
    writeFileSync(
      join(estate, 'instances', 'main', 'instance.json'),
      JSON.stringify({ ref: 'main', sha: 'abcdef1234567890', built: '2026-08-29T00:00:00Z' }),
    );
    // An instance published before instance.json existed. It is still addressable, so
    // it is still listed: dropping it would lose exactly what NFR-04 retains.
    mkdirSync(join(estate, 'instances', 'claude-older-work'), { recursive: true });

    const instances = readInstances(estate);
    expect(instances.map((instance) => instance.slug)).toEqual(['claude-older-work', 'main']);

    const html = renderInstanceIndex(instances);
    expect(html).toContain('href="main/"');
    expect(html).toContain('abcdef12');
    expect(html).toContain('href="claude-older-work/"');
    expect(html).toMatch(/claude-older-work[\s\S]*?not recorded/);
    // The page is part of the site's look and loads the site's one stylesheet.
    expect(html).toContain('../assets/theme.css');
    expect(html).toMatch(/noindex/);
  });

  it('says so plainly when the estate holds none', () => {
    const estate = mkdtempSync(join(tmpdir(), 'drogna-estate-'));
    expect(readInstances(estate)).toEqual([]);
    expect(renderInstanceIndex([])).toContain('holds no instances yet');
  });
});

describe('the site build', () => {
  const built = buildSite(REPO_ROOT);
  const paths = new Set(built.files.map((file) => file.path));

  it('publishes without a link fault', () => {
    expect(built.faults).toEqual([]);
  });

  it('maps a source path to a directory URL', () => {
    expect(urlOf('index.md')).toBe('');
    expect(urlOf('glossary.md')).toBe('glossary/');
    expect(urlOf('blog/index.md')).toBe('blog/');
    expect(urlOf('blog/posts/a-post.md')).toBe('blog/posts/a-post/');
  });

  it('writes every URL relative, so the estate serves from any base path', () => {
    expect(relativeUrl('', 'glossary/')).toBe('glossary/');
    expect(relativeUrl('blog/posts/a-post/', 'glossary/')).toBe('../../../glossary/');
    expect(relativeUrl('glossary/', 'glossary/')).toBe('./');
    for (const file of built.files) {
      if (!file.path.endsWith('.html')) continue;
      const absolute = /\s(?:href|src)="\/[^"]*"/.exec(String(file.contents));
      expect(absolute, `${file.path} emits an absolute URL: ${absolute?.[0]}`).toBeNull();
    }
  });

  it('publishes every decision record from docs/adr, not a copy of one', () => {
    const records = readdirSync(join(REPO_ROOT, 'docs', 'adr')).filter((name) => /^\d{4}-/.test(name));
    for (const record of records) {
      expect(paths).toContain(`decisions/adr/${record.replace(/\.md$/, '')}/index.html`);
    }
    expect(records.length).toBeGreaterThan(0);
  });

  it('generates the component reference from the topology master rather than prose', () => {
    const topology = JSON.parse(
      readFileSync(join(REPO_ROOT, 'contracts', 'topology.json'), 'utf8'),
    ) as { components: { id: string }[]; topics: { topic: string }[] };
    const page = String(built.files.find((file) => file.path === 'components/index.html')?.contents);
    for (const component of topology.components) expect(page).toContain(`<code>${component.id}</code>`);
    for (const topic of topology.topics) expect(page).toContain(`<code>${topic.topic}</code>`);
  });

  it('banners every archived page, and only archived pages', () => {
    for (const file of built.files) {
      if (!file.path.endsWith('.html')) continue;
      const bannered = String(file.contents).includes('Version 1 record</p>');
      const archived = file.path.startsWith('archive/') && file.path !== 'archive/index.html';
      expect(bannered, `${file.path}: banner ${bannered ? 'present' : 'absent'}`).toBe(archived);
    }
  });

  it('keeps the V1 entries published rather than deleting them', () => {
    const archived = [...paths].filter((path) => path.startsWith('archive/blog/posts/'));
    expect(archived.length).toBe(17);
  });
});
