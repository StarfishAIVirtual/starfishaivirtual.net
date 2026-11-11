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

/* rel is already decoded; never decode twice. */
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

function load(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const vc = new VirtualConsole();
  vc.on('warn', m => problems.push(page + ': console warning: ' + m));
  vc.on('error', m => problems.push(page + ': console error: ' + m));
  vc.on('jsdomError', e => {
    const msg = String((e.detail && e.detail.message) || e.message || e);
    /* jsdom lacks scrolling; that's not a site problem. Any other "Not implemented"
       (form submission, navigation...) means the page did something unexpected: fail. */
    if (/Not implemented: window\.(scroll|scrollTo|scrollBy)\b/.test(msg)) notes.push(page + ': ' + msg);
    else problems.push(page + ': script error: ' + msg);
  });
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://starfishaivirtual.net/' + page, pretendToBeVisual: true });
  /* scrollIntoView is not in jsdom; the Diagnostic calls it after showing the result. */
  dom.window.Element.prototype.scrollIntoView = function () {};
  return dom;
}

/* Answer every radio group with its lowest-scoring option (smallest value) and press the
   submit button, so script-built results (e.g. every Diagnostic kit link) are in the DOM. */
function exercise(doc) {
  const radios = [...doc.querySelectorAll('input[type=radio]')];
  const groups = new Set(radios.map(i => i.name));
  if (!groups.size) return;
  groups.forEach(n => {
    const opts = radios.filter(i => i.name === n).sort((a, b) => Number(a.value) - Number(b.value));
    opts[0].checked = true;
    opts[0].dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  });
  const submits = [...doc.querySelectorAll('button')].filter(b => !/^(button|reset)$/i.test(b.getAttribute('type') || ''));
  const form = radios[0].form || radios[0].closest('form');
  const FOLLOWING = doc.defaultView.Node.DOCUMENT_POSITION_FOLLOWING;
  const btn = form ? (submits.find(b => form.contains(b)) || submits.find(b => form.compareDocumentPosition(b) & FOLLOWING)) : submits[0];
  if (!btn) return;
  if (btn.disabled) { problems.push(doc.defaultView.location.pathname.slice(1) + ': submit button still disabled after answering every question'); return; }
  btn.click();
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
    const hash = ref.indexOf('#');
    const anchor = hash >= 0 ? ref.slice(hash + 1) : '';
    const rawPath = (hash >= 0 ? ref.slice(0, hash) : ref).split('?')[0];
    let file;
    try { file = decodeURIComponent(rawPath); }
    catch (e) { problems.push(page + ': malformed link "' + ref + '"'); return; }
    /* A path starting with / is from the site root; "/" alone is the home page. */
    /* A non-empty path that resolves to the site folder ('/', './') is the home page. */
    const hadPath = file.length > 0;
    file = file.replace(/^(\.\/|\/)+/, '');
    if (!file && hadPath) file = 'index.html';
    const target = file || page;
    if (file && !exists(file)) { problems.push(page + ': missing file "' + file + '"'); return; }
    if (anchor && !doms[target]) { problems.push(page + ': anchor link to non-page "' + ref + '"'); return; }
    if (anchor && !doms[target].window.document.getElementById(anchor)) {
      problems.push(page + ': link to ' + target + '#' + anchor + ' has no matching element');
    }
  });
}

/* Font files named in fonts/fonts.css. */
const css = fs.readFileSync(path.join(ROOT, 'fonts/fonts.css'), 'utf8');
const decodeOr = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
const cssFonts = new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(m => decodeOr(m[1].trim().replace(/^['"]|['"]$/g, ''))));
for (const f of cssFonts) {
  if (!exists('fonts/' + f)) problems.push('fonts/fonts.css: missing font "' + f + '"');
}

/* Every Diagnostic kitId must have a catalog card, and every kit link must have rendered. */
const DIAG_PAGE = 'Starfish_Governance_Diagnostic.html', MEMBER_PAGE = 'governance-membership.html';
for (const p of [DIAG_PAGE, MEMBER_PAGE]) if (!doms[p]) problems.push('expected page "' + p + '" is missing (renamed?); update scripts/check-site.cjs');
const kitIds = doms[DIAG_PAGE] ? [...fs.readFileSync(path.join(ROOT, DIAG_PAGE), 'utf8').matchAll(/kitId:"([\w-]+)"/g)].map(m => m[1]) : [];
const memberDoc = doms[MEMBER_PAGE] && doms[MEMBER_PAGE].window.document;
const diagDoc = doms[DIAG_PAGE] && doms[DIAG_PAGE].window.document;
if (memberDoc && diagDoc) for (const id of kitIds) {
  if (!memberDoc.getElementById('kit-' + id)) problems.push('Diagnostic kitId "' + id + '" has no card id="kit-' + id + '" on governance-membership.html');
  if (!diagDoc.querySelector('a[href="governance-membership.html#kit-' + id + '"]')) problems.push('Diagnostic result did not show a link for kit "' + id + '" (the check answers every question with its weakest option)');
}

/* Font preloads must point at files fonts/fonts.css uses, so the two can't drift apart. */
for (const page of PAGES) {
  doms[page].window.document.querySelectorAll('link[rel=preload][as=font]').forEach(l => {
    const href = l.getAttribute('href');
    if (!href) { problems.push(page + ': font preload without href'); return; }
    if (!cssFonts.has(decodeOr(href).replace(/^(\.\/|\/)*fonts\//, ''))) problems.push(page + ': preloads "' + href + '", which fonts/fonts.css does not use');
  });
}

Object.values(doms).forEach(d => d.window.close());
if (notes.length) console.log('Notes (not failures):\n- ' + notes.join('\n- '));
if (problems.length) {
  console.error('Site check found ' + problems.length + ' problem(s):\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Site check passed: ' + PAGES.length + ' pages, prices in sync, all links and files present.');
