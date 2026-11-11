/* Site check, run by GitHub on every change (.github/workflows/check-site.yml).
   Run it yourself with:  npm install jsdom@24.1.3 && node scripts/check-site.cjs

   For each page it:
   - runs the page's own scripts (external scripts such as analytics are not loaded)
     and fails on any script error or console warning/error. On the membership page
     this catches every price whose HTML text no longer matches the PRICE list, and
     any invalid price-list value;
   - fills in any form with a "See where you stand" style submit button (the
     Diagnostic) so links its result adds are checked too;
   - checks every link, stylesheet, script and image in the rendered page: local files
     must exist, and every #anchor must point at an element that exists. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const problems = [];
const notes = [];

function exists(rel) { return fs.existsSync(path.join(ROOT, decodeURIComponent(rel))); }

function load(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const vc = new VirtualConsole();
  vc.on('warn', m => problems.push(page + ': console warning: ' + m));
  vc.on('error', m => problems.push(page + ': console error: ' + m));
  vc.on('jsdomError', e => {
    const msg = String((e.detail && e.detail.message) || e.message || e);
    /* jsdom lacks some browser features (scrolling, layout); that's not a site problem. */
    if (/Not implemented/i.test(msg)) notes.push(page + ': ' + msg);
    else problems.push(page + ': script error: ' + msg);
  });
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://starfishaivirtual.net/' + page, pretendToBeVisual: true });
  /* scrollIntoView is not in jsdom; the Diagnostic calls it after showing the result. */
  dom.window.Element.prototype.scrollIntoView = function () {};
  return dom;
}

/* Answer every radio group with its first option and press the submit button, so
   script-built results (e.g. the Diagnostic's kit links) are in the DOM to check. */
function exercise(doc) {
  const groups = new Set([...doc.querySelectorAll('input[type=radio]')].map(i => i.name));
  if (!groups.size) return;
  groups.forEach(n => { const i = doc.querySelector('input[type=radio][name="' + n + '"]'); i.checked = true; });
  const form = doc.querySelector('form');
  if (form) form.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  const btn = doc.querySelector('button#go, button[type=submit]');
  if (btn && !btn.disabled) btn.click();
}

const doms = {};
for (const page of PAGES) {
  doms[page] = load(page);
  exercise(doms[page].window.document);
}

for (const page of PAGES) {
  const doc = doms[page].window.document;
  doc.querySelectorAll('link[href],script[src],a[href],img[src]').forEach(el => {
    const ref = el.getAttribute('href') || el.getAttribute('src');
    if (!ref || /^(https?:|mailto:|tel:|data:|javascript:)/.test(ref) || ref === '#') return;
    const [file, anchor] = ref.split('?')[0].split('#');
    const target = file || page;
    if (file && !exists(file)) { problems.push(page + ': missing file "' + file + '"'); return; }
    if (anchor && doms[target] && !doms[target].window.document.getElementById(anchor)) {
      problems.push(page + ': link to ' + target + '#' + anchor + ' has no matching element');
    }
  });
}

/* Font files named in fonts/fonts.css. */
const css = fs.readFileSync(path.join(ROOT, 'fonts/fonts.css'), 'utf8');
for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
  if (!exists('fonts/' + m[1].replace(/['"]/g, ''))) problems.push('fonts/fonts.css: missing font "' + m[1] + '"');
}

Object.values(doms).forEach(d => d.window.close());
if (notes.length) console.log('Notes (not failures):\n- ' + notes.join('\n- '));
if (problems.length) {
  console.error('Site check found ' + problems.length + ' problem(s):\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Site check passed: ' + PAGES.length + ' pages, prices in sync, all links and files present.');
