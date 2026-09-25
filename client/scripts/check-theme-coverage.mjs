#!/usr/bin/env node
/**
 * Theme coverage guard.
 *
 * The app is written with Tailwind's static palette (bg-white, text-ink-800,
 * border-cream-200…). Wallpapers and dark mode work by remapping those
 * utilities onto `--c-*` variables in src/index.css, and the remap is keyed on
 * TWO selectors that must always appear as a pair:
 *
 *   html[data-theme]        a Pro wallpaper is active
 *   html[data-mode='dark']  dark mode is active (Linen sets no data-theme, so
 *                           without this twin dark mode does nothing at all)
 *
 * Every palette utility actually used in src/** must be remapped under both, or
 * it stays light-on-dark. This script fails the build when one is missed.
 *
 *   npm run theme:check
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS = readFileSync(join(ROOT, 'src/index.css'), 'utf8');

/* ------------------------------------------------------------------ helpers */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Utilities whose colour must follow the palette. */
const PALETTE_UTILITY = /^(bg|text|border)-(ink|cream)-\d+$|^bg-white$|^bg-cream-\d+$/;

/**
 * Deliberate exceptions — each one is a colour that must NOT follow the theme.
 * Keep the reason next to the entry; an unexplained exception is a bug.
 */
const ALLOW = new Map([
  ['border-cream-50', 'spinner ring on the dark avatar-upload button (ProfilePage) — must stay light'],
  ['bg-ink-800', 'stat panels inside the ExchangeWorkspace dark hero; stays dark in both modes'],
  ['border-ink-700', 'border of those same dark hero panels'],
  ['text-cream-100', 'copy on permanently-dark hero sections and gradient cards'],
  ['text-cream-200', 'copy on permanently-dark hero sections and gradient cards'],
  ['text-cream-300', 'copy on permanently-dark hero sections and gradient cards'],
]);

/* ------------------------------------------------- collect utilities in use */

const used = new Map(); // utility -> Set<file>
for (const file of walk(join(ROOT, 'src'))) {
  const src = readFileSync(file, 'utf8');
  for (const literal of src.matchAll(/["'`]([^"'`]*)["'`]/g)) {
    for (const cls of literal[1].split(/\s+/)) {
      const base = cls.replace(/^(hover|focus|active|group-hover|sm|md|lg):/, '');
      if (!PALETTE_UTILITY.test(base)) continue;
      // A class inside a `dark ? '…' : '…'` ternary is already theme-aware; the
      // remap is for classes used unconditionally. We cannot tell from here, so
      // the remap must exist regardless — being remapped is harmless when a
      // component also branches on `dark`.
      if (!used.has(base)) used.set(base, new Set());
      used.get(base).add(relative(ROOT, file));
    }
  }
}

/* --------------------------------------------- collect remapped utilities */

function remapped(selectorPrefix) {
  const found = new Set();
  const re = new RegExp(
    selectorPrefix.replace(/[[\]]/g, '\\$&') + '\\s*\\.([A-Za-z0-9_\\-]+)',
    'g',
  );
  for (const m of CSS.matchAll(re)) found.add(m[1]);
  return found;
}

const byTheme = remapped("html[data-theme]");
const byDark = remapped("html[data-mode='dark']");

/* -------------------------------------------------------------- assertions */

const problems = [];

for (const [utility, files] of [...used].sort()) {
  if (ALLOW.has(utility)) continue;
  const inTheme = byTheme.has(utility);
  const inDark = byDark.has(utility);
  if (inTheme && inDark) continue;
  problems.push(
    `${utility}\n` +
      `    used in: ${[...files].slice(0, 4).join(', ')}${files.size > 4 ? ` (+${files.size - 4})` : ''}\n` +
      `    remapped under html[data-theme]: ${inTheme ? 'yes' : 'NO'}\n` +
      `    remapped under html[data-mode='dark']: ${inDark ? 'yes' : 'NO'}`,
  );
}

// Every wallpaper needs a dark palette, or must be declared dark-only.
const wallpapers = [...CSS.matchAll(/--wp-([a-z]+)-image:/g)].map((m) => m[1]);
const darkPalettes = new Set([
  ...[...CSS.matchAll(/html\[data-theme='([a-z]+)'\]\[data-mode='dark'\]/g)].map((m) => m[1]),
]);
const themeIds = new Set([
  ...[...CSS.matchAll(/^html\[data-theme='([a-z]+)'\] \{/gm)].map((m) => m[1]),
]);
// Graphite ('dark') and Midnight are dark-only wallpapers: their base palette is
// already dark, so they need no [data-mode='dark'] variant.
const DARK_ONLY = new Set(['dark', 'midnight']);
const linenHasDark = /html:not\(\[data-theme\]\)\[data-mode='dark'\]/.test(CSS);

for (const id of themeIds) {
  if (DARK_ONLY.has(id)) continue;
  if (!darkPalettes.has(id)) {
    problems.push(`wallpaper '${id}' has a light palette but no [data-mode='dark'] variant`);
  }
}
if (!linenHasDark) {
  problems.push("the free Linen wallpaper has no html:not([data-theme])[data-mode='dark'] palette");
}

/* ------------------------------------------------------------------- report */

const checked = [...used.keys()].filter((u) => !ALLOW.has(u)).length;
if (problems.length) {
  console.error(`\n✗ theme coverage: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  • ${p}\n`);
  console.error(
    'Fix: add the utility to the shared remap block in src/index.css under BOTH\n' +
      "html[data-theme] and html[data-mode='dark'] (see the comment above that block).\n",
  );
  process.exit(1);
}

console.log(
  `✓ theme coverage: ${checked} palette utilities remapped under both selectors, ` +
    `${wallpapers.length} wallpapers, ${darkPalettes.size + (linenHasDark ? 1 : 0)} dark palettes ` +
    `(+${DARK_ONLY.size} dark-only)`,
);
