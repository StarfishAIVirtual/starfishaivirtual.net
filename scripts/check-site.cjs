/* Site check, run by GitHub on every change (.github/workflows/check-site.yml).
   Run it yourself with:  npm install jsdom@24 && node scripts/check-site.cjs

   For each page it:
   - runs the page's own scripts (external scripts such as analytics are not loaded)
     and fails on any script error or console warning/error. On the membership page
     this catches every price whose HTML text no longer matches the PRICE list, and
     any invalid price-list value;
   - checks that every local link, stylesheet, script and font file exists, and that
     every #anchor link points at an element that exists. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const problems = [];

function exists(rel) { return fs.existsSync(path.join(ROOT, decodeURIComponent(rel))); }

const idsByPage = {};
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const vc = new VirtualConsole();
  vc.on('warn', m => problems.push(page + ': console warning: ' + m));
  vc.on('error', m => problems.push(page + ': console error: ' + m));
  vc.on('jsdomError', e => problems.push(page + ': script error: ' + (e.detail || e.message)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, url: 'https://starfishaivirtual.net/' + page, pretendToBeVisual: true });
  const doc = dom.window.document;
  idsByPage[page] = new Set([...doc.querySelectorAll('[id]')].map(e => e.id));

  /* Local files referenced by the page. */
  doc.querySelectorAll('link[href],script[src],a[href],img[src]').forEach(el => {
    const ref = el.getAttribute('href') || el.getAttribute('src');
    if (!ref || /^(https?:|mailto:|tel:|#|data:)/.test(ref)) return;
    const file = ref.split('#')[0].split('?')[0];
    if (file && !exists(file)) problems.push(page + ': missing file "' + file + '"');
  });
  dom.window.close();
}

/* Font files named in fonts/fonts.css. */
const css = fs.readFileSync(path.join(ROOT, 'fonts/fonts.css'), 'utf8');
for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
  if (!exists('fonts/' + m[1].replace(/['"]/g, ''))) problems.push('fonts/fonts.css: missing font "' + m[1] + '"');
}

/* #anchor links, including links written inside page scripts (e.g. Diagnostic kit links). */
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  for (const m of html.matchAll(/href=\\?"([\w.-]+\.html)?#([\w-]+)(?:'\+q\.kitId\+')?\\?"/g)) {
    const target = m[1] || page;
    if (m[0].includes("'+q.kitId+'")) continue; /* checked below */
    if (idsByPage[target] && !idsByPage[target].has(m[2])) problems.push(page + ': link to ' + target + '#' + m[2] + ' has no matching element');
  }
}
/* Diagnostic kit links: every kitId must have a catalog card id="kit-<kitId>". */
const diag = fs.readFileSync(path.join(ROOT, 'Starfish_Governance_Diagnostic.html'), 'utf8');
for (const m of diag.matchAll(/kitId:"([\w-]+)"/g)) {
  if (!idsByPage['governance-membership.html'].has('kit-' + m[1])) problems.push('Diagnostic kitId "' + m[1] + '" has no card id="kit-' + m[1] + '" on governance-membership.html');
}

if (problems.length) {
  console.error('Site check found ' + problems.length + ' problem(s):\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Site check passed: ' + PAGES.length + ' pages, prices in sync, all links and files present.');
