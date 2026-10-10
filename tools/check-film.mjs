#!/usr/bin/env node
// Pre-publish check for the "From Ochre to KEIM" film.
//
//   node tools/check-film.mjs            # checks film-next (the preview)
//   node tools/check-film.mjs film       # checks the live folder
//   node tools/check-film.mjs --quick    # files only, no browser
//   node tools/check-film.mjs --lang=de,fa   # browser check for some languages only
//
// Exits 0 when everything passes, 1 when anything fails. Run it before
// copying film-next → film. Needs Node 18+ and Playwright with Chromium.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const FOLDER = args.find(a => !a.startsWith('--')) || 'film-next';
const DIR = path.join(ROOT, FOLDER);

const fails = [], warns = [];
const fail = m => { fails.push(m); console.log('  ✗ ' + m); };
const warn = m => { warns.push(m); console.log('  ! ' + m); };
const ok = m => console.log('  ✓ ' + m);
const section = m => console.log('\n' + m);

// ---------- 1. Read the page and pull out the facts the checks depend on ----------
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const grab = (re, what) => { const m = html.match(re); if (!m) throw new Error('Could not find ' + what + ' in index.html'); return m[1]; };
const SLUGS = JSON.parse(grab(/const SLUGS = (\[[^\]]*\]);/, 'SLUGS').replace(/'/g, '"'));
const LANGS = [...grab(/const LANG_NAMES = \{([^}]*)\}/, 'LANG_NAMES').matchAll(/(\w+):/g)].map(m => m[1]);
const IMG_KEYS = JSON.parse(grab(/const XIMG_KEYS = (\[[^\]]*\]);/, 'XIMG_KEYS'));
const HL = [...grab(/const HL_SET = \[([^\]]*)\]/, 'HL_SET').matchAll(/'([^']+)'/g)].map(m => m[1]);
const N = SLUGS.length;

section(`Film folder: ${FOLDER} · ${N} slides · ${LANGS.length} languages`);
const sizeMB = fs.statSync(path.join(DIR, 'index.html')).size / 1e6;
(sizeMB < 2.5 ? ok : warn)(`index.html is ${sizeMB.toFixed(2)} MB`);
if (FOLDER === 'film' && /noindex/.test(html)) fail('live film still has the preview "noindex" tag');

// ---------- 2. Files on disk ----------
section('Files');
let missingAudio = [];
for (const l of LANGS) for (let k = 0; k < N; k++) {
  const f = path.join(DIR, 'audio', l, 'n' + String(k).padStart(2, '0') + '.mp3');
  if (!fs.existsSync(f) || fs.statSync(f).size < 2000) missingAudio.push(l + '/n' + String(k).padStart(2, '0'));
}
missingAudio.length ? fail(`${missingAudio.length} narration files missing or empty: ${missingAudio.slice(0, 12).join(', ')}${missingAudio.length > 12 ? ' …' : ''}`)
  : ok(`narration: all ${N} × ${LANGS.length} = ${N * LANGS.length} files present`);

for (let e = 0; e < 5; e++) if (!fs.existsSync(path.join(DIR, 'audio/music/era' + e + '.mp3'))) fail('music era' + e + '.mp3 missing');

const dicts = {};
for (const l of LANGS) {
  if (l === 'en') continue;
  const f = path.join(DIR, 'i18n', l + '.json');
  try { dicts[l] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail(`i18n/${l}.json missing or not valid JSON (${e.message})`); }
}
ok(`translations: ${Object.keys(dicts).length} dictionaries parse`);

const missingImg = IMG_KEYS.filter(k => !fs.existsSync(path.join(DIR, 'img', k + '.jpg')));
missingImg.length ? fail('images missing: ' + missingImg.join(', ')) : ok(`images: all ${IMG_KEYS.length} present`);
if (!fs.existsSync(path.join(DIR, 'geo/land50.b64'))) warn('geo/land50.b64 missing — globe falls back to the coarse coastline');

// Slide names used in code must exist
const badHL = HL.filter(s => !SLUGS.includes(s));
badHL.length ? fail('highlights refer to unknown slides: ' + badHL.join(', ')) : ok(`highlights: ${HL.length - 2} key moments, all slide names valid`);
const moments = html.match(/the (\d+) key moments/g) || [];
for (const m of moments) if (+m.match(/\d+/)[0] !== HL.length - 2) fail(`text says "${m}" but highlights have ${HL.length - 2} moments`);

// Every dictionary should cover the phrases the others cover. Names, dates and
// single words (Pause, Janus, KEIM · 1878 …) may legitimately stay as they are,
// so only phrases (3+ words, 2+ of them lower-case) that the page still uses count.
const allKeys = new Set(Object.values(dicts).flatMap(d => Object.keys(d)));
const isPhrase = s => (s.match(/[A-Za-z]{2,}/g) || []).length >= 3 && (s.match(/(^|[\s(])[a-z]{2,}/g) || []).length >= 2;
const used = new Set([...allKeys].filter(k => isPhrase(k) && html.includes(k)));
const thin = Object.entries(dicts).map(([l, d]) => [l, [...used].filter(k => !(k in d))]).filter(([, m]) => m.length);
thin.length ? thin.forEach(([l, m]) => fail(`${l}.json is missing ${m.length} phrase(s), e.g. "${m[0].slice(0, 60)}"`))
  : ok(`translations: every language has all ${used.size} phrases`);

if (QUICK) finish();

// ---------- 3. In the browser: every language, every slide ----------
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); } catch (e2) { fail('Playwright is not installed (npm i -g playwright), browser checks skipped'); finish(); }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.b64': 'text/plain', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const PORT = server.address().port;

section('Browser (each language plays through every slide)');
const ONLY = (args.find(a => a.startsWith('--lang=')) || '').slice(7).split(',').filter(Boolean);
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const browser = await chromium.launch(exe);
const TIMES = [1, 3.5, 6, 8.5];       // seconds into each slide
const untranslated = {};
for (const l of (ONLY.length ? ONLY : LANGS)) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|net::|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url().replace('http://localhost:' + PORT, '')); });
  await page.goto(`http://localhost:${PORT}/${FOLDER}/?lang=${l}`);
  await page.waitForFunction(lang => lang === 'en' || !!I18N[lang], l, { timeout: 15000 }).catch(() => errs.push('dictionary did not load'));
  await page.evaluate(() => {
    window.__seen = new Set(); const orig = tr;
    window.tr = s => { const r = orig(s); if (typeof s === 'string' && r === s) window.__seen.add(s); return r; };
  });
  for (let k = 0; k < N; k++) for (const t of TIMES) {
    await page.evaluate(([k, t]) => new Promise(res => { T = startOf(k) + t; dirty = true; requestAnimationFrame(() => requestAnimationFrame(res)); }), [k, t]);
  }
  // also open every "More info" card text through tr
  await page.evaluate(() => { for (const k in SPOTS) SPOTS[k].forEach(sp => { tr(sp.k); tr(sp.t); (sp.p || []).forEach(([a, b]) => { tr(a); tr(b); }); }); PL.forEach(q => ['lab', 'kick', 'ttl', 'loc', 'txt', 'story', 'fact'].forEach(f => tr(q[f]))); });
  const seen = await page.evaluate(() => [...window.__seen]);
  await page.close();
  if (l !== 'en') {
    const d = dicts[l] || {};
    // A string counts as untranslated if some other language translates it but this one doesn't.
    untranslated[l] = seen.filter(s => allKeys.has(s) && isPhrase(s) && !(s in d));
  }
  errs.length ? fail(`${l}: ${errs.length} error(s) — ${[...new Set(errs)].slice(0, 3).join(' | ')}`) : ok(`${l}: ${N} slides, no errors`);
}
await browser.close(); server.close();

section('Untranslated text on screen');
const bad = Object.entries(untranslated).filter(([, m]) => m.length);
bad.length ? bad.forEach(([l, m]) => fail(`${l}: ${m.length} untranslated, e.g. "${m[0].slice(0, 70)}"`)) : ok('none — every language shows translated text');

finish();

function finish() {
  console.log('\n' + (fails.length ? `FAILED: ${fails.length} problem(s)` : 'PASSED') + (warns.length ? ` · ${warns.length} warning(s)` : '') + '\n');
  process.exit(fails.length ? 1 : 0);
}
