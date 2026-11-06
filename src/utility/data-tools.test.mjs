import test from 'node:test';
import assert from 'node:assert/strict';
import { tools, readJSON, flattenJSON, convertDelimiter, csvText, formatXMLNode } from './data-tools.mjs';
import { parseCSV } from './csv-core.mjs';

const get = slug => tools.find(t => t.slug === slug);
const run = (slug, values) => get(slug).run(values);
const content = (slug, values) => run(slug, values).download.content;
const csv = (slug, values) => parseCSV(content(slug, values));
const json = (slug, values) => JSON.parse(content(slug, values));
const normal = {
  json: { data: '{"a":1}', indent: '2' },
  'csv-delimiter': { data: 'a,b\nx,2', from: ',', to: '\t' },
  'json-csv': { data: '[{"a":"x","b":2}]', direction: 'json' },
  'json-flatten': { data: '{"a":{"b":2}}', arrays: 'index' },
  'csv-columns': { data: 'a,b\nx,2', columns: 'b\na' },
  'csv-filter': { data: 'a,b\nx,2\ny,3', column: 'b', operation: 'gt', value: '2' },
  pivot: { data: 'a,b\nx,2\nx,3', group: 'a', value: 'b', operation: 'sum' },
  'table-reshape': { data: 'id,a,b\nx,2,3', direction: 'long', key: 'id', columns: 'a\nb', attribute: 'item', value: 'value' },
  'data-mask': { data: 'a,b\nx,2\nx,3', columns: 'a', mode: 'alias' },
  'csv-deduplicate': { data: 'a,b\nx,2\nx,3', columns: 'a', keep: 'first' },
  'date-column': { data: 'date,x\n2024-02-29,a', column: 'date', from: 'YYYY-MM-DD', to: 'DD/MM/YYYY' },
  'table-schema': { data: 'qty\n2\n-1', rules: '{"qty":{"required":true,"type":"integer","min":0}}' },
  'table-sort': { data: 'a,b\nx,2\ny,1', rules: 'column,type,direction\nb,number,asc' },
  'json-diff': { left: '{"a":1}', right: '{"a":2,"b":3}', arrays: 'index' },
  timestamp: { data: '0', mode: 'seconds' },
  'csv-merge': { data: 'a,b\nx,1', other: 'a,b\ny,2', policy: 'strict' },
  'data-sample': { data: 'a,b\nx,1\ny,2\nz,3', size: '2', seed: 'sample' },
  chart: { data: 'a,b\nx,2\ny,3', label: 'a', value: 'b', kind: 'bar' },
  vcard: { name: '홍길동', phone: '+82 10-1234-5678', email: 'a@example.com', organization: '회사', note: '메모' },
};
const expected = {
  json: c => assert.match(c, /\n  "a": 1/),
  'csv-delimiter': c => assert.match(c, /"a"\t"b"/),
  'json-csv': c => assert.deepEqual(parseCSV(c).rows, [['x', '2']]),
  'json-flatten': c => assert.deepEqual(JSON.parse(c), { '/a/b': 2 }),
  'csv-columns': c => assert.deepEqual(parseCSV(c), { headers: ['b', 'a'], rows: [['2', 'x']], recordNumbers: [2] }),
  'csv-filter': c => assert.deepEqual(parseCSV(c).rows, [['y', '3']]),
  pivot: c => assert.deepEqual(parseCSV(c).rows, [['x', '5']]),
  'table-reshape': c => assert.deepEqual(parseCSV(c).rows, [['x', 'a', '2'], ['x', 'b', '3']]),
  'data-mask': c => assert.deepEqual(parseCSV(c).rows, [['가명1', '2'], ['가명1', '3']]),
  'csv-deduplicate': c => assert.deepEqual(parseCSV(c).rows, [['x', '2']]),
  'date-column': c => assert.equal(parseCSV(c).rows[0][0], '29/02/2024'),
  'table-schema': c => assert.equal(parseCSV(c).rows[0][3], '허용 범위 밖'),
  'table-sort': c => assert.deepEqual(parseCSV(c).rows, [['y', '1'], ['x', '2']]),
  'json-diff': c => assert.equal(JSON.parse(c).length, 2),
  timestamp: c => assert.equal(JSON.parse(c).isoUTC, '1970-01-01T00:00:00.000Z'),
  'csv-merge': c => assert.deepEqual(parseCSV(c).rows, [['x', '1'], ['y', '2']]),
  'data-sample': c => assert.equal(parseCSV(c).rows.length, 2),
  chart: c => assert.match(c, /<rect.*fill="#225ea8"/),
  vcard: c => assert.match(c, /FN:홍길동\r\n/),
};
for (const [slug, values] of Object.entries(normal)) {
  test(`${slug}: useful normal artifact`, () => { const r = run(slug, values); assert.equal(typeof r.text, 'string'); assert.ok(r.download.name); expected[slug](r.download.content); });
  test(`${slug}: invalid input`, () => {
    const bad = slug === 'json-diff' ? { ...values, left: '{' } : slug === 'vcard' ? { ...values, name: '' } : { ...values, data: '' };
    assert.throws(() => run(slug, bad), Error);
  });
}

test('contract: exact 20 distinct slugs and at most six fields', () => {
  assert.equal(tools.length, 20); assert.equal(new Set(tools.map(t => t.slug)).size, 20);
  for (const tool of tools) { assert.ok(tool.fields.length <= 6); assert.ok(tool.description); assert.equal(new Set(tool.fields.map(f => f.name)).size, tool.fields.length); }
});
test('all text trust boundaries reject oversized input', () => { for (const slug of ['json', 'csv-columns', 'xml']) assert.throws(() => run(slug, { ...(normal[slug] || {}), data: 'x'.repeat(200001) }), /200,000/); });
test('JSON: unsafe and infinite numbers, extreme depth rejected', () => {
  assert.throws(() => readJSON('1e400')); assert.throws(() => readJSON('9007199254740993'));
  assert.throws(() => readJSON('['.repeat(82) + '0' + ']'.repeat(82)), /80/);
});
test('JSON: prototype keys remain literal and never pollute', () => {
  const data = '{"__proto__":{"polluted":true},"constructor":1,"prototype":2}';
  const value = json('json', { data, indent: '2' }); assert.ok(Object.hasOwn(value, '__proto__')); assert.equal({}.polluted, undefined);
  assert.equal(flattenJSON(readJSON(data))['/__proto__/polluted'], true);
  const array = json('json-csv', { data: '__proto__,constructor\nx,y', direction: 'csv' }); assert.equal(array[0].__proto__, 'x'); assert.equal({}.polluted, undefined);
});
test('JSON flatten: pointer escaping, root primitive, empty object, array policy', () => {
  assert.deepEqual({ ...flattenJSON(readJSON('{"a/b":{"~x":[]}}')) }, { '/a~1b/~0x': [] });
  assert.deepEqual({ ...flattenJSON(null) }, { '': null });
  assert.deepEqual({ ...flattenJSON({}) }, { '': {} });
  assert.deepEqual({ ...flattenJSON({ a: [1, 2] }, 'keep') }, { '/a': [1, 2] });
  assert.throws(() => flattenJSON({}, 'guess'));
});
test('JSON ↔ CSV: mismatch and nested values rejected, CSV strings preserved', () => {
  assert.throws(() => run('json-csv', { data: '[{"a":1},{"b":2}]', direction: 'json' }));
  assert.throws(() => run('json-csv', { data: '[{"a":{}}]', direction: 'json' }));
  assert.throws(() => run('json-csv', { data: '[{"a":1," a ":2}]', direction: 'json' }));
  assert.deepEqual(json('json-csv', { data: 'a,b\n001,true', direction: 'csv' }), [{ a: '001', b: 'true' }]);
});
test('CSV/TSV: embedded comma, tab, quote, CRLF and empty cells preserved', () => {
  const source = 'a,b,c\r\n"x,y","two\twords","a""b\nc"\r\n,,last\r\n';
  const tsv = convertDelimiter(source, ',', '\t').content;
  const result = convertDelimiter(tsv, '\t', ',');
  assert.deepEqual(result.rows, [['x,y', 'two\twords', 'a"b\nc'], ['', '', 'last']]);
  assert.deepEqual(convertDelimiter('a,b\tc\nx,y\tz', '\t', ',').headers, ['a,b', 'c']);
});
test('CSV/TSV: malformed quoting, mismatched columns, duplicate headers rejected', () => {
  for (const data of ['a,b\n"x,2', 'a,a\nx,2', 'a,b\nx', 'a,b\n"x"junk,2']) assert.throws(() => convertDelimiter(data, ',', '\t'));
  assert.throws(() => convertDelimiter('a\ta\nx\ty', '\t', ','));
  assert.throws(() => convertDelimiter('a\tb\nx\ty\tz', '\t', ','));
});
test('CSV export: leading formula controls protected, normal strings preserved', () => {
  const parsed = parseCSV(csvText(['a'], [['=SUM(1)'], ['\t@cmd'], ['-2'], ['+3'], ['hello']]));
  assert.deepEqual(parsed.rows, [["'=SUM(1)"], ["'\t@cmd"], ["'-2"], ["'+3"], ['hello']]);
});
test('column selection: reject missing and duplicated columns', () => {
  assert.throws(() => run('csv-columns', { ...normal['csv-columns'], columns: 'c' }));
  assert.throws(() => run('csv-columns', { ...normal['csv-columns'], columns: 'a\na' }));
});
test('filter: empty text condition and strict numeric errors', () => {
  assert.equal(csv('csv-filter', { data: 'a,b\nx,\ny,2', column: 'b', operation: 'eq', value: '' }).rows.length, 1);
  assert.throws(() => run('csv-filter', { data: 'a,b\nx,\ny,2', column: 'b', operation: 'gt', value: '0' }));
  assert.equal(csv('csv-filter', { ...normal['csv-filter'], column: 'a', operation: 'contains', value: 'x' }).rows.length, 1);
  assert.throws(() => run('csv-filter', { ...normal['csv-filter'], operation: 'eval' }));
});
test('pivot: count, mean, blank number and overflow', () => {
  assert.deepEqual(csv('pivot', { ...normal.pivot, operation: 'count', value: '' }).rows, [['x', '2']]);
  assert.deepEqual(csv('pivot', { ...normal.pivot, operation: 'mean' }).rows, [['x', '2.5']]);
  assert.throws(() => run('pivot', { ...normal.pivot, data: 'a,b\nx,' }));
  assert.throws(() => run('pivot', { ...normal.pivot, data: 'a,b\nx,1e308\nx,1e308' }));
});
test('reshape: reversible wide and long, original empty cells retained', () => {
  const long = content('table-reshape', { ...normal['table-reshape'], data: 'id,a,b\nx,,3\ny,4,5' });
  const wide = csv('table-reshape', { data: long, direction: 'wide', key: 'id', attribute: 'item', value: 'value' });
  assert.deepEqual(wide.headers, ['id', 'a', 'b']); assert.deepEqual(wide.rows, [['x', '', '3'], ['y', '4', '5']]);
});
test('reshape: duplicate keys, duplicate pairs, missing combos, output header collision rejected', () => {
  assert.throws(() => run('table-reshape', { ...normal['table-reshape'], data: 'id,a,b\nx,1,2\nx,3,4' }));
  for (const data of ['id,item,value\nx,a,1\nx,a,2', 'id,item,value\nx,a,1\nx,b,2\ny,a,3', 'id,item,value\nx,id,1']) assert.throws(() => run('table-reshape', { data, direction: 'wide', key: 'id', attribute: 'item', value: 'value' }));
});
test('mask: fixed masking, separate column namespaces, empty preserved', () => {
  assert.deepEqual(csv('data-mask', { data: 'a,b\nx,x\n,y', columns: 'a\nb', mode: 'alias' }).rows, [['가명1', '가명1'], ['', '가명2']]);
  assert.deepEqual(csv('data-mask', { ...normal['data-mask'], mode: 'fixed' }).rows, [['***', '2'], ['***', '3']]);
  assert.throws(() => run('data-mask', { ...normal['data-mask'], mode: 'hash' }));
});
test('deduplication: last/unique rules and composite separator collisions', () => {
  assert.deepEqual(csv('csv-deduplicate', { ...normal['csv-deduplicate'], keep: 'last' }).rows, [['x', '3']]);
  assert.equal(csv('csv-deduplicate', { ...normal['csv-deduplicate'], keep: 'unique' }).rows.length, 0);
  const data = 'a,b\n"x,y",z\nx,"y,z"'; assert.equal(csv('csv-deduplicate', { data, columns: 'a\nb', keep: 'first' }).rows.length, 2);
  assert.match(run('csv-deduplicate', normal['csv-deduplicate']).text, /제거.*3/);
});
test('dates: leap years, explicit order, invalid preserved and reported', () => {
  const r = run('date-column', { ...normal['date-column'], data: 'date,x\n1900-02-29,a\n2000-02-29,b\n0004-02-29,c\n2024-04-31,d\n,e' });
  assert.deepEqual(parseCSV(r.download.content).rows.map(r => r[0]), ['1900-02-29', '29/02/2000', '29/02/0004', '2024-04-31', '']); assert.match(r.text, /오류 3행/);
  assert.equal(csv('date-column', { data: 'date\n03/04/2025', column: 'date', from: 'DD/MM/YYYY', to: 'YYYY-MM-DD' }).rows[0][0], '2025-04-03');
  assert.throws(() => run('date-column', { ...normal['date-column'], from: 'guess' }));
});
test('schema: required, numeric, date and enum validation, malformed rules rejected', () => {
  const r = run('table-schema', { data: 'a,b,c\n,1,2025-02-30\nx,2.5,2024-02-29', rules: '{"a":{"required":true},"b":{"type":"integer"},"c":{"type":"date"}}' });
  assert.equal(parseCSV(r.download.content).rows.length, 3);
  assert.equal(csv('table-schema', { data: 'a\nx\ny', rules: '{"a":{"enum":["x"]}}' }).rows.length, 1);
  for (const rules of ['[]', '{}', '{"missing":{}}', '{"qty":{"required":"yes"}}', '{"qty":{"min":0}}', '{"qty":{"type":"integer","min":4,"max":2}}', '{"qty":{"pattern":".*"}}']) assert.throws(() => run('table-schema', { ...normal['table-schema'], rules }));
});
test('sort: multiple criteria, stable ties, missing/invalid numeric rejected', () => {
  const data = 'a,b,id\nx,2,first\nx,2,second\ny,1,third\nx,3,fourth';
  const r = csv('table-sort', { data, rules: 'column,type,direction\na,text,asc\nb,number,desc' });
  assert.deepEqual(r.rows.map(r => r[2]), ['fourth', 'first', 'second', 'third']);
  assert.throws(() => run('table-sort', { ...normal['table-sort'], data: 'a,b\nx,' }));
  assert.throws(() => run('table-sort', { ...normal['table-sort'], rules: 'column,type,direction\nb,number,asc\nb,text,desc' }));
});
test('JSON diff: object order, arrays, path escaping, type change and root paths', () => {
  assert.deepEqual(json('json-diff', { left: '{"a":1,"b":2}', right: '{"b":2,"a":1}', arrays: 'index' }), []);
  assert.deepEqual(json('json-diff', { left: '[{"a":1,"b":2}]', right: '[{"b":2,"a":1}]', arrays: 'atomic' }), []);
  assert.equal(json('json-diff', { left: '[1]', right: '[2]', arrays: 'index' })[0].path, '/0');
  assert.equal(json('json-diff', { left: '[1]', right: '[2]', arrays: 'atomic' })[0].path, '');
  assert.equal(json('json-diff', { left: '{"a/b":1}', right: '{"a/b":2}', arrays: 'index' })[0].path, '/a~1b');
  assert.equal(json('json-diff', { left: '{}', right: '[]', arrays: 'index' })[0].change, 'changed');
  assert.equal(json('json-diff', { left: '{"__proto__":1}', right: '{}', arrays: 'index' })[0].change, 'removed');
});
test('timestamp: seconds/ms explicit, zero, negative, leap days and low years', () => {
  assert.equal(json('timestamp', { data: '1000', mode: 'milliseconds' }).epochSeconds, 1);
  assert.equal(json('timestamp', { data: '-1', mode: 'seconds' }).isoUTC, '1969-12-31T23:59:59.000Z');
  assert.equal(json('timestamp', { data: '0004-02-29T00:00:00.123Z', mode: 'iso' }).isoUTC, '0004-02-29T00:00:00.123Z');
  for (const data of ['2025-02-29T00:00:00Z', '2024-01-01T24:00:00Z', '2024-01-01T00:00:60Z', '2024-01-01 00:00:00Z', '2024-01-01T00:00:00+09:00', '2024-01-01T00:00:00.12Z', '0000-01-01T00:00:00Z']) assert.throws(() => run('timestamp', { data, mode: 'iso' }));
  assert.throws(() => run('timestamp', { data: '1.5', mode: 'seconds' }));
  assert.throws(() => run('timestamp', { data: '9999999999999999', mode: 'milliseconds' }));
});
test('merge: align to first order, strict mismatches and total bound', () => {
  assert.deepEqual(csv('csv-merge', { data: 'a,b\nx,1', other: 'b,a\n2,y', policy: 'align' }).rows, [['x', '1'], ['y', '2']]);
  assert.throws(() => run('csv-merge', { data: 'a,b\nx,1', other: 'b,a\n2,y', policy: 'strict' }));
  assert.throws(() => run('csv-merge', { data: 'a,b\nx,1', other: 'a,c\ny,2', policy: 'align' }));
  const data = 'a\n' + 'x\n'.repeat(10001); assert.throws(() => run('csv-merge', { data, other: data, policy: 'strict' }), /20,000/);
});
test('sample: repeatable, seed-sensitive, nonreplacement, original order, invalid size', () => {
  const data = 'id\n' + Array.from({ length: 100 }, (_, i) => i).join('\n'); const values = { data, seed: 'test', size: '20' };
  const a = csv('data-sample', values).rows.map(r => Number(r[0]));
  assert.equal(content('data-sample', values), content('data-sample', values));
  assert.notEqual(content('data-sample', values), content('data-sample', { ...values, seed: 'other' }));
  assert.equal(new Set(a).size, 20); assert.deepEqual(a, [...a].sort((x, y) => x - y));
  for (const size of ['0', '101', '1.2', '']) assert.throws(() => run('data-sample', { ...values, size }));
});
test('SVG chart: escaped labels, negative/zero/extreme finite coordinates, line artifact', () => {
  const c = content('chart', { data: 'a,b\n<script>,1e308\nx,-1e308\ny,0', label: 'a', value: 'b', kind: 'bar' });
  assert.ok(c.includes('&lt;script&gt;')); assert.ok(!c.includes('<script>')); assert.ok(!c.includes('NaN')); assert.ok(!c.includes('Infinity'));
  assert.match(content('chart', { ...normal.chart, kind: 'line' }), /<polyline/);
  assert.ok(!content('chart', { ...normal.chart, data: 'a,b\nx,0' }).includes('NaN'));
  assert.throws(() => run('chart', { ...normal.chart, data: 'a,b\nx,Infinity' }));
  assert.throws(() => run('chart', { ...normal.chart, data: 'a,b\n' + 'x,1\n'.repeat(101) }));
});
test('vCard: field injection prevented and UTF-8 lines ≤75 bytes', () => {
  const c = content('vcard', { name: '홍'.repeat(70), organization: 'a;b,c\\d', note: 'safe\r\nTEL:911\nEND:VCARD' });
  assert.ok(c.includes('ORG:a\\;b\\,c\\\\d')); assert.ok(c.includes('safe\\nTEL:911\\nEND:VCARD')); assert.equal(c.split('\r\n').filter(s => s === 'END:VCARD').length, 1);
  for (const line of c.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.throws(() => run('vcard', { name: 'a', email: 'a@b.com\r\nTEL:911' }));
  assert.throws(() => run('vcard', { name: 'a', phone: '123\r\nEMAIL:evil' }));
  assert.throws(() => run('vcard', { name: 'a\u0000' }));
});

// Browser XML parsing is covered by parent browser QA. These fixtures exercise formatting/integration independently.
const xmlText = value => ({ nodeType: 3, nodeValue: value, raw: value });
const xmlElement = (name, children = [], preserve = false) => ({ nodeType: 1, nodeName: name, childNodes: children, getAttribute: key => key === 'xml:space' && preserve ? 'preserve' : null, cloneNode: () => ({ nodeType: 1, nodeName: name, childNodes: [], getAttribute: () => null }) });
const serialize = n => n.nodeType === 3 ? n.raw : n.nodeType === 9 ? n.childNodes.map(serialize).join('') : n.childNodes.length ? `<${n.nodeName}>${n.childNodes.map(serialize).join('')}</${n.nodeName}>` : `<${n.nodeName}/>`;
test('XML: useful formatting normal result via native-platform fixture', () => {
  const oldParser = globalThis.DOMParser, oldSerializer = globalThis.XMLSerializer;
  const root = xmlElement('root', [xmlElement('a'), xmlElement('b')]);
  try {
    globalThis.DOMParser = class { parseFromString() { return { nodeType: 9, documentElement: root, childNodes: [root], getElementsByTagNameNS: () => [] }; } };
    globalThis.XMLSerializer = class { serializeToString(n) { return serialize(n); } };
    assert.equal(content('xml', { data: '<root><a/><b/></root>' }), '<root>\n  <a/>\n  <b/>\n</root>\n');
  } finally { if (oldParser === undefined) delete globalThis.DOMParser; else globalThis.DOMParser = oldParser; if (oldSerializer === undefined) delete globalThis.XMLSerializer; else globalThis.XMLSerializer = oldSerializer; }
});
test('XML: invalid DTD/entity/stylesheet and unavailable platform rejected', () => {
  for (const data of ['<!DOCTYPE a SYSTEM "https://example.com"><a/>', '<!ENTITY x "abc"><a/>', '<?xml-stylesheet href="x"?><a/>', '']) assert.throws(() => run('xml', { data }));
  if (typeof DOMParser === 'undefined') assert.throws(() => run('xml', { data: '<a/>' }), /브라우저/);
});
test('XML formatter: preserve mixed text and xml:space, enforce depth limit', () => {
  const mixed = xmlElement('p', [xmlText('Hello '), xmlElement('b', [xmlText('world')])]); assert.equal(formatXMLNode(mixed, serialize), '<p>Hello <b>world</b></p>');
  const preserved = xmlElement('root', [xmlElement('a')], true); assert.equal(formatXMLNode(preserved, serialize), '<root><a/></root>');
  let root = xmlElement('a'); for (let i = 0; i < 82; i++) root = xmlElement('a', [root]); assert.throws(() => formatXMLNode(root, serialize), /80/);
});


test('numeric precision: exact decimal sorting and filtering beyond Number integer precision', () => {
  const data = 'n,id\n9007199254740993,bigger\n9007199254740992,smaller';
  assert.deepEqual(csv('table-sort', { data, rules: 'column,type,direction\nn,number,asc' }).rows.map(r => r[1]), ['smaller', 'bigger']);
  assert.deepEqual(csv('csv-filter', { data, column: 'n', operation: 'gt', value: '9007199254740992' }).rows.map(r => r[1]), ['bigger']);
  const precise = 'n,id\n0.10000000000000000001,bigger\n0.1,smaller';
  assert.deepEqual(csv('table-sort', { data: precise, rules: 'column,type,direction\nn,number,asc' }).rows.map(r => r[1]), ['smaller', 'bigger']);
});
test('numeric precision: schema integer checks raw fractional/exponent value', () => {
  const result = csv('table-schema', { data: 'n\n9007199254740990.9\n1e-9999\n2.0\n1e2\n9007199254740992', rules: '{"n":{"type":"integer"}}' });
  assert.deepEqual(result.rows.map(row => row[0]), ['2', '3', '6']);
  const range = csv('table-schema', { data: 'n\n0.10000000000000000001', rules: '{"n":{"type":"number","max":0.1}}' });
  assert.equal(range.rows[0][3], '허용 범위 밖');
});
test('numeric precision: exact sums, cancellation, finite means and explicit repeating-mean rejection', () => {
  const values = { group: 'g', value: 'n', operation: 'sum' };
  assert.equal(csv('pivot', { ...values, data: 'g,n\nx,0.1\nx,0.2' }).rows[0][1], '0.3');
  assert.equal(csv('pivot', { ...values, data: 'g,n\nx,1e16\nx,1\nx,-1e16' }).rows[0][1], '1');
  assert.equal(csv('pivot', { ...values, operation: 'mean', data: 'g,n\nx,0.1\nx,0.2' }).rows[0][1], '0.15');
  assert.equal(csv('pivot', { ...values, operation: 'mean', data: 'g,n\nx,0\nx,0' }).rows[0][1], '0');
  assert.throws(() => run('pivot', { ...values, operation: 'mean', data: 'g,n\nx,1\nx,0\nx,0' }), /무한소수/);
  assert.throws(() => run('pivot', { ...values, data: 'g,n\nx,1e9999' }), /지수/);
});
test('numeric precision: every JSON consumer rejects raw-token underflow and round-trip loss', () => {
  for (const raw of ['1e-9999', '0.10000000000000001', '9007199254740990.9', '1e9999']) {
    assert.throws(() => run('json', { data: raw, indent: '2' }));
    assert.throws(() => run('json-flatten', { data: `{\"n\":${raw}}`, arrays: 'index' }));
    assert.throws(() => run('json-diff', { left: raw, right: '0', arrays: 'index' }));
    assert.throws(() => run('json-csv', { data: `[{\"n\":${raw}}]`, direction: 'json' }));
    assert.throws(() => run('table-schema', { data: 'n\n1', rules: `{\"n\":{\"type\":\"number\",\"min\":${raw}}}` }));
  }
  assert.equal(json('json', { data: '{"text":"1e-9999","escaped":"a\\\"12","n":0.1}', indent: '2' }).text, '1e-9999');
});
test('XML formatter: deep mixed content is validated before early serialization', () => {
  let deep = xmlElement('a'); for (let i = 0; i < 82; i++) deep = xmlElement('a', [deep]);
  const mixed = xmlElement('root', [xmlText('hello'), deep]);
  assert.throws(() => formatXMLNode(mixed, serialize), /80/);
  const preserved = xmlElement('root', [deep], true); assert.throws(() => formatXMLNode(preserved, serialize), /80/);
});
test('XML: ordinary parsererror element is data, native error namespace is rejected', () => {
  const oldParser = globalThis.DOMParser, oldSerializer = globalThis.XMLSerializer;
  const root = xmlElement('root', [xmlElement('parsererror', [xmlText('normal data')])]);
  try {
    globalThis.XMLSerializer = class { serializeToString(n) { return serialize(n); } };
    globalThis.DOMParser = class { parseFromString() { return { nodeType: 9, documentElement: root, childNodes: [root], getElementsByTagNameNS: () => [] }; } };
    assert.match(content('xml', { data: '<root><parsererror>normal data</parsererror></root>' }), /normal data/);
    globalThis.DOMParser = class { parseFromString() { return { documentElement: {}, getElementsByTagNameNS: namespace => namespace === 'http://www.mozilla.org/newlayout/xml/parsererror.xml' ? [{ textContent: 'bad tag' }] : [] }; } };
    assert.throws(() => run('xml', { data: '<root>' }), /XML 구조 오류/);
  } finally { if (oldParser === undefined) delete globalThis.DOMParser; else globalThis.DOMParser = oldParser; if (oldSerializer === undefined) delete globalThis.XMLSerializer; else globalThis.XMLSerializer = oldSerializer; }
});
test('SVG: reject XML-illegal controls/surrogates and preserve codepoints when truncating labels', () => {
  for (const label of ['bad\u0000', 'bad\u0001', 'bad\ud800', 'bad\ufffe']) assert.throws(() => run('chart', { ...normal.chart, data: `a,b\n${label},1` }), /XML/);
  const output = content('chart', { ...normal.chart, data: `a,b\n${'x'.repeat(19)}😀,1` });
  assert.ok(output.includes('x'.repeat(19) + '😀'));
});
