import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = mkdtempSync(join(tmpdir(), 'orbit9-test-'));
execFileSync('node_modules/.bin/tsc', ['--rootDir', 'src', '--noEmit', 'false', '--allowImportingTsExtensions', 'false', '--outDir', output]);

// Exercise actual TS modules with the installed compiler and Node's test runner.
function moduleUrl(name, imports = {}) {
  let source = readFileSync(join(output, `${name}.js`), 'utf8');
  for (const [path, url] of Object.entries(imports)) source = source.replace(`'${path}'`, JSON.stringify(url));
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const apiUrl = moduleUrl('api');
const api = await import(apiUrl);
const auth = await import(moduleUrl('auth', { './api': apiUrl, './config': moduleUrl('config') }));
rmSync(output, { recursive: true });

test('next permits local paths and rejects external or browser-normalized redirects', () => {
  for (const next of [null, '', '//evil.test', 'https://evil.test', '/\\evil.test', '/\n/evil.test', '\t//evil.test']) {
    assert.equal(auth.safeNext(next), '/catalog');
  }
  assert.equal(auth.safeNext('/catalog?ra=10&dec=20'), '/catalog?ra=10&dec=20');
});

test('FastAPI validation arrays and auth errors have useful messages', () => {
  assert.match(api.errorMessage([{loc:['body','username'], msg:'pattern'}], 422), /letters, numbers/);
  assert.match(api.errorMessage([{loc:['body','password']}], 422), /8–128/);
  assert.equal(api.errorMessage('Username already exists', 409), 'Username already exists');
  assert.equal(api.errorMessage('Invalid username or password', 401), 'Invalid username or password');
});

test('classification distinguishes pending, completed and retrying', () => {
  assert.equal(api.classificationText(null), 'Classifying…');
  assert.match(api.classificationText({classification:'Brown dwarf',confidence:.6}), /Brown dwarf · 60%/);
  assert.match(api.classificationText({classification:'Unclassified', error:'unavailable'}), /Retry scheduled/);
});

test('session header inserts a username as text', async () => {
  const nodes = [];
  globalThis.localStorage = {getItem: () => 'token'};
  globalThis.fetch = async () => ({ok:true,status:200,json:async () => ({username:'<img onerror=alert(1)>'})});
  globalThis.document = {
    getElementById: () => ({replaceChildren: () => {}, append: (...children) => nodes.push(...children)}),
    createElement: (tag) => ({tag}),
  };
  await auth.initSessionUI();
  assert.equal(nodes[0].textContent, '@<img onerror=alert(1)>');
  assert.equal(nodes[0].innerHTML, undefined);
});

test('each page has blocking CSS and its own entry; guide starts hidden', () => {
  for (const page of ['index', 'catalog', 'explorer', 'signin']) {
    const html = readFileSync(new URL(`../${page}.html`, import.meta.url), 'utf8');
    assert.match(html.split('</head>')[0], /href="\/src\/styles.css"/);
    assert.match(html, new RegExp(`/src/${page === 'index' ? 'main' : page}.ts`));
    if (page !== 'index') assert.doesNotMatch(html, /id="sky-map"|id="guide-modal"/);
  }
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="guide-modal" hidden/);
});
