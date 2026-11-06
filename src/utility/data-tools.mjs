import { parseCSV } from './csv-core.mjs';

const LIMIT = 200_000;
const fail = message => { throw new Error(message); };
const input = (value, name = '입력', blank = false) => {
  if (typeof value !== 'string' || (!blank && !value.trim())) fail(`${name}을 입력해 주세요.`);
  if (value.length > LIMIT) fail(`${name}은 200,000자 이하여야 합니다.`);
  return value;
};
const choice = (value, values) => values.includes(value) ? value : fail('설정 값을 확인해 주세요.');
const integer = (value, min, max) => {
  input(value); const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) fail(`${min}~${max} 사이 정수를 입력해 주세요.`);
  return n;
};
const normalizeDecimal = (coefficient, exponent) => {
  if (coefficient === 0n) return { coefficient: 0n, exponent: 0 };
  while (coefficient % 10n === 0n) { coefficient /= 10n; exponent++; }
  return { coefficient, exponent };
};
const decimal = value => {
  if (typeof value !== 'string' || value.length > 400) fail('숫자는 최대 400자입니다.');
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value.trim());
  if (!match) fail('빈칸 없이 십진 숫자를 입력해 주세요.');
  const fraction = match[3] ?? match[4] ?? '', digits = (match[2] ?? '') + fraction;
  const exponent = Number(match[5] ?? 0);
  if (digits.length > 100 || !Number.isSafeInteger(exponent) || Math.abs(exponent) > 308) fail('숫자는 가수 100자리·지수 -308~308 범위만 지원합니다.');
  return normalizeDecimal(BigInt((match[1] === '-' ? '-' : '') + digits), exponent - fraction.length);
};
const alignDecimals = (a, b) => { const exponent = Math.min(a.exponent, b.exponent); return [a.coefficient * 10n ** BigInt(a.exponent - exponent), b.coefficient * 10n ** BigInt(b.exponent - exponent), exponent]; };
const compareDecimals = (a, b) => { const [x, y] = alignDecimals(a, b); return x === y ? 0 : x < y ? -1 : 1; };
const addDecimals = (a, b) => { const [x, y, exponent] = alignDecimals(a, b); return normalizeDecimal(x + y, exponent); };
const decimalText = value => {
  const { coefficient, exponent } = value, sign = coefficient < 0n ? '-' : '', digits = String(coefficient < 0n ? -coefficient : coefficient);
  return sign + (exponent >= 0 ? digits + '0'.repeat(exponent) : digits.length + exponent > 0 ? digits.slice(0, exponent) + '.' + digits.slice(exponent) : '0.' + '0'.repeat(-exponent - digits.length) + digits);
};
const meanDecimal = (sum, count) => {
  let numerator = sum.coefficient, denominator = BigInt(count), divisor = numerator < 0n ? -numerator : numerator, other = denominator;
  while (other) [divisor, other] = [other, divisor % other];
  numerator /= divisor; denominator /= divisor;
  let twos = 0, fives = 0;
  while (denominator % 2n === 0n) { denominator /= 2n; twos++; }
  while (denominator % 5n === 0n) { denominator /= 5n; fives++; }
  if (denominator !== 1n) fail('평균이 무한소수입니다. 정확한 합계와 개수를 각각 확인해 주세요.');
  const scale = Math.max(twos, fives);
  return normalizeDecimal(numerator * 2n ** BigInt(scale - twos) * 5n ** BigInt(scale - fives), sum.exponent - scale);
};
const number = value => {
  const exact = decimal(value), n = Number(value);
  if (!Number.isFinite(n) || (n === 0 && exact.coefficient !== 0n) || compareDecimals(exact, decimal(String(n))) !== 0) fail('표시 가능한 숫자 정밀도 범위를 넘었습니다.');
  return n;
};
const textField = (name, label, hint, required = true) => ({ name, label, type: 'text', required, ...(hint ? { hint } : {}) });
const area = (name = 'data', label = 'CSV 표', hint = '첫 행은 중복 없는 열 이름입니다. 최대 200,000자·20,000행·100열.') => ({ name, label, hint, type: 'textarea', required: true });
const select = (name, label, options, value = options[0][0]) => ({ name, label, type: 'select', required: true, value, options: options.map(([value, label]) => ({ value, label })) });
const columnsField = (name = 'columns', label = '열 이름과 순서') => textField(name, label, '열 이름을 한 줄에 하나씩 입력하세요.');
const col = (table, name) => { input(name, '열 이름'); const index = table.headers.indexOf(name); if (index < 0) fail(`열 이름을 찾을 수 없습니다: ${name.slice(0, 80)}`); return index; };
const cols = (table, names) => {
  const list = input(names, '열 이름').split(/\r?\n/);
  if (new Set(list).size !== list.length) fail('열 이름을 중복 선택할 수 없습니다.');
  return list.map(name => col(table, name));
};
const table = data => parseCSV(input(data, 'CSV'));
export function csvText(headers, rows, delimiter = ',') {
  const cell = value => {
    let s = String(value ?? '');
    if (/^[\s\u0000-\u001f\u007f]*[=+@-]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(delimiter)).join('\r\n') + '\r\n';
}
const artifact = (content, name, type = 'text/plain;charset=utf-8', summary) => ({ text: summary ?? (content.length <= 30_000 ? content : `${content.slice(0, 30_000)}\n… 전체 결과는 파일로 저장하세요.`), download: { name, type, content } });
const csvArtifact = (headers, rows, name, summary) => {
  const content = csvText(headers, rows);
  const text = summary ?? `${rows.length}개 데이터 행 · ${headers.length}개 열\n${content.slice(0, 30_000)}`;
  return artifact(content, `${name}.csv`, 'text/csv;charset=utf-8', `${text}\nCSV 안전 처리: = + - @로 시작하는 셀은 작은따옴표를 앞에 붙입니다. 음수 문자열도 포함됩니다.`);
};
export function readJSON(value) {
  let parsed;
  try { parsed = JSON.parse(input(value, 'JSON')); } catch (e) { fail(`JSON 문법 오류: ${e.message.slice(0, 220)}`); }
  let quoted = false, escaped = false;
  const token = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; continue; }
    if (c === '-' || c >= '0' && c <= '9') {
      token.lastIndex = i; const raw = token.exec(value)[0]; number(raw); i += raw.length - 1;
    }
  }
  const stack = [[parsed, 0]]; let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (++count > 100_000 || depth > 80) fail('JSON은 깊이 80단계·값 100,000개 이하만 지원합니다.');
    if (typeof node === 'number' && (!Number.isFinite(node) || (Number.isInteger(node) && !Number.isSafeInteger(node)))) fail('JSON 숫자는 유한한 값과 안전한 정수 범위만 지원합니다.');
    if (node && typeof node === 'object') for (const value of Object.values(node)) stack.push([value, depth + 1]);
  }
  return parsed;
}
const jsonArtifact = (value, name, space = 2, summary) => artifact(JSON.stringify(value, null, space) + '\n', `${name}.json`, 'application/json;charset=utf-8', summary);
const pointer = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equalJSON = (left, right) => {
  const stack = [[left, right]];
  while (stack.length) {
    const [a, b] = stack.pop(); if (Object.is(a, b)) continue;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a); if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) { if (!Object.hasOwn(b, key)) return false; stack.push([a[key], b[key]]); }
  }
  return true;
};
export function flattenJSON(root, arrays = 'index') {
  choice(arrays, ['index', 'keep']); const output = Object.create(null); const stack = [['', root]];
  while (stack.length) {
    const [path, node] = stack.pop(); const keys = node && typeof node === 'object' ? Object.keys(node) : [];
    if (!keys.length || (Array.isArray(node) && arrays === 'keep') || node === null || typeof node !== 'object') output[path] = node;
    else for (let i = keys.length - 1; i >= 0; i--) { const key = keys[i]; stack.push([`${path}/${pointer(key)}`, node[key]]); }
  }
  return output;
}
export function formatXMLNode(node, serialize, level = 0) {
  if (level === 0) {
    const stack = [[node, 0]];
    while (stack.length) {
      const [current, depth] = stack.pop(); if (depth > 80) fail('XML은 깊이 80단계 이하만 지원합니다.');
      for (const child of current.childNodes ?? []) if (child.nodeType === 1) stack.push([child, depth + (current.nodeType === 9 ? 0 : 1)]);
    }
  }
  if (level > 80) fail('XML은 깊이 80단계 이하만 지원합니다.');
  if (node.nodeType !== 1 && node.nodeType !== 9) return serialize(node);
  const children = [...node.childNodes];
  if (node.nodeType === 1 && (node.getAttribute('xml:space') === 'preserve' || children.some(n => n.nodeType === 3 && n.nodeValue.trim()) || children.some(n => n.nodeType === 4))) return serialize(node);
  if (node.nodeType === 9) return children.map(n => formatXMLNode(n, serialize, 0)).join('\n');
  const significant = children.filter(n => n.nodeType !== 3 || n.nodeValue.trim());
  if (!significant.length) return serialize(node);
  const shell = serialize(node.cloneNode(false)); const end = shell.lastIndexOf('/>');
  if (end < 0) return serialize(node);
  const open = shell.slice(0, end) + '>';
  return `${open}\n${significant.map(n => '  '.repeat(level + 1) + formatXMLNode(n, serialize, level + 1)).join('\n')}\n${'  '.repeat(level)}</${node.nodeName}>`;
}
export function convertDelimiter(data, from, to) {
  choice(from, [',', '\t']); choice(to, [',', '\t']); input(data);
  let converted = '', quoted = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === '"') { if (quoted && data[i + 1] === '"') { converted += '""'; i++; continue; } quoted = !quoted; }
    // Normalize only outside quotes; the shared parser validates every record afterwards.
    if (!quoted && c === from) converted += ',';
    else if (!quoted && from === '\t' && c === ',') converted += '\u0001';
    else converted += c;
  }
  if (from === '\t' && data.includes('\u0001')) fail('제어 문자 U+0001은 지원하지 않습니다.');
  const parsed = table(converted);
  if (from === '\t') { parsed.headers = parsed.headers.map(s => s.replace(/\u0001/g, ',')); parsed.rows = parsed.rows.map(row => row.map(s => s.replace(/\u0001/g, ','))); }
  return { ...parsed, content: csvText(parsed.headers, parsed.rows, to) };
}
const validateCalendarDate = (y, m, d) => {
  const maxDay = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > maxDay) fail('실제로 존재하는 날짜를 입력해 주세요.');
};
const formatDate = (value, format) => {
  choice(format, ['YYYY-MM-DD', 'YYYY/MM/DD', 'DD/MM/YYYY', 'MM/DD/YYYY']);
  const delimiter = format.includes('-') ? '-' : '/'; const parts = value.split(delimiter); const keys = format.split(delimiter);
  if (parts.length !== 3 || parts.some((v, i) => !/^\d+$/.test(v) || v.length !== keys[i].length)) fail('날짜 형식이 올바르지 않습니다.');
  const [y, m, d] = ['YYYY', 'MM', 'DD'].map(k => Number(parts[keys.indexOf(k)]));
  validateCalendarDate(y, m, d);
  return { YYYY: String(y).padStart(4, '0'), MM: String(m).padStart(2, '0'), DD: String(d).padStart(2, '0') };
};
const dates = [['YYYY-MM-DD', '년-월-일'], ['YYYY/MM/DD', '년/월/일'], ['DD/MM/YYYY', '일/월/년'], ['MM/DD/YYYY', '월/일/년']];
const renderDate = (date, format) => format.replace(/YYYY|MM|DD/g, key => date[key]);

export const tools = [
  { slug: 'json', title: 'JSON 오류 찾기·정리', description: '문법을 검사하고 JSON 파일을 정리합니다. 최대 200,000자·깊이 80단계.', fields: [area('data', 'JSON 텍스트', '객체·배열·문자·숫자 등 유효한 JSON을 입력하세요.'), select('indent', '들여쓰기', [['2', '2칸'], ['4', '4칸'], ['0', '최소화']])], run(v) { return jsonArtifact(readJSON(v.data), 'formatted', Number(choice(v.indent, ['2', '4', '0']))); } },
  { slug: 'xml', title: 'XML 오류 찾기·정리', description: '브라우저 XML 파서로 검사합니다. DTD·외부 엔티티·스타일시트 지시문은 허용하지 않습니다. 혼합 본문과 xml:space는 보존합니다.', fields: [area('data', 'XML 텍스트', 'DTD 없이 완전한 XML 문서를 입력하세요.')], run(v) {
    const data = input(v.data, 'XML');
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(data)) fail('DTD·엔티티 선언·외부 스타일시트는 지원하지 않습니다.');
    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') fail('XML 처리는 최신 브라우저에서 실행해 주세요.');
    const doc = new DOMParser().parseFromString(data, 'application/xml');
    const parseError = doc.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror')[0];
    if (parseError || !doc.documentElement) fail(`XML 구조 오류: ${(parseError?.textContent || '태그를 확인해 주세요.').slice(0, 240)}`);
    const serialize = node => new XMLSerializer().serializeToString(node);
    return artifact(formatXMLNode(doc, serialize) + '\n', 'formatted.xml', 'application/xml;charset=utf-8');
  } },
  { slug: 'csv-delimiter', title: '쉼표·탭 구분 파일 바꾸기', description: '셀 안의 줄바꿈과 구분자를 인용해 보존합니다. 수식 시작 문자는 작은따옴표로 보호합니다.', fields: [area('data', 'CSV 또는 TSV'), select('from', '입력 구분', [[',', '쉼표 CSV'], ['\t', '탭 TSV']]), select('to', '출력 구분', [['\t', '탭 TSV'], [',', '쉼표 CSV']])], run(v) { const t = convertDelimiter(v.data, v.from, v.to); return artifact(t.content, v.to === ',' ? 'converted.csv' : 'converted.tsv', v.to === ',' ? 'text/csv;charset=utf-8' : 'text/tab-separated-values;charset=utf-8', `${t.rows.length}개 행 · ${t.headers.length}개 열\n${t.content.slice(0, 30000)}`); } },
  { slug: 'json-csv', title: 'JSON 배열과 CSV 바꾸기', description: '같은 키의 단순 객체 배열을 표로 바꾸거나 CSV의 모든 셀을 JSON 문자열 값으로 저장합니다. JSON 숫자·불리언 자료형은 CSV에서 보존되지 않습니다.', fields: [area('data', 'JSON 또는 CSV'), select('direction', '변환 방향', [['json', 'JSON → CSV'], ['csv', 'CSV → JSON']])], run(v) {
    choice(v.direction, ['json', 'csv']);
    if (v.direction === 'csv') { const t = table(v.data); return jsonArtifact(t.rows.map(row => Object.fromEntries(t.headers.map((key, i) => [key, row[i]]))), 'records'); }
    const records = readJSON(v.data);
    if (!Array.isArray(records) || !records.length || records.length > 20000 || !records.every(isObject)) fail('1~20,000개 단순 객체 배열을 입력해 주세요.');
    const headers = Object.keys(records[0]);
    if (!headers.length || headers.length > 100 || headers.some(h => !h.trim()) || new Set(headers.map(h => h.trim())).size !== headers.length) fail('중복 없는 1~100개 열 이름이 필요합니다.');
    const rows = records.map(record => { const keys = Object.keys(record); if (keys.length !== headers.length || !headers.every(k => Object.hasOwn(record, k))) fail('모든 객체의 필드는 같아야 합니다.'); return headers.map(k => { const value = record[k]; if (value !== null && typeof value === 'object') fail('중첩 값은 JSON 경로 펼치기 도구로 처리하세요.'); return value === null ? '' : String(value); }); });
    return csvArtifact(headers, rows, 'records');
  } },
  { slug: 'json-flatten', title: '중첩 JSON 경로 펼치기', description: 'RFC 6901 JSON Pointer 경로를 사용합니다. 빈 경로는 최상위 값이며 /와 ~는 이스케이프됩니다.', fields: [area('data', 'JSON'), select('arrays', '배열 처리', [['index', '번호 경로로 펼치기'], ['keep', '배열 값 보존']])], run(v) { return jsonArtifact(flattenJSON(readJSON(v.data), v.arrays), 'flattened'); } },
  { slug: 'csv-columns', title: '표 열 고르기·순서 바꾸기', description: '선택한 순서의 열과 원래 행 순서를 저장합니다.', fields: [area(), { ...columnsField(), type: 'textarea' }], run(v) { const t = table(v.data), indices = cols(t, v.columns); return csvArtifact(indices.map(i => t.headers[i]), t.rows.map(row => indices.map(i => row[i])), 'columns'); } },
  { slug: 'csv-filter', title: '조건에 맞는 표 행 추출', description: '문자 조건은 대소문자를 구분합니다. 수치 비교는 열의 모든 값을 검증하며 빈 수치는 오류입니다.', fields: [area(), textField('column', '조건 열'), select('operation', '조건', [['eq', '같음'], ['ne', '다름'], ['contains', '문자 포함'], ['gt', '숫자 초과'], ['ge', '숫자 이상'], ['lt', '숫자 미만'], ['le', '숫자 이하']]), textField('value', '비교값', '같음·다름·포함에서는 빈 문자열도 사용할 수 있습니다.', false)], run(v) {
    const t = table(v.data), i = col(t, v.column), op = choice(v.operation, ['eq', 'ne', 'contains', 'gt', 'ge', 'lt', 'le']); input(v.value ?? '', '비교값', true);
    const numeric = ['gt', 'ge', 'lt', 'le'].includes(op), compare = numeric ? decimal(v.value) : v.value ?? '';
    const rows = t.rows.filter(row => { const value = numeric ? compareDecimals(decimal(row[i]), compare) : row[i]; return op === 'eq' ? value === compare : op === 'ne' ? value !== compare : op === 'contains' ? value.includes(compare) : op === 'gt' ? value > 0 : op === 'ge' ? value >= 0 : op === 'lt' ? value < 0 : value <= 0; });
    return csvArtifact(t.headers, rows, 'filtered', `${t.rows.length}개 중 ${rows.length}개 행 선택\n${csvText(t.headers, rows).slice(0, 30000)}`);
  } },
  { slug: 'pivot', title: '묶어서 합계·개수 내기', description: '분류별 개수·합계·평균을 계산합니다. 십진 합계는 정확히 계산합니다. 유한소수로 표현되지 않는 평균은 오류입니다. 가수 100자리·지수 -308~308 제한입니다.', fields: [area(), textField('group', '분류 열'), textField('value', '수치 열', '개수 집계에서는 입력하지 않아도 됩니다.', false), select('operation', '집계', [['count', '개수'], ['sum', '합계'], ['mean', '평균']])], run(v) {
    const t = table(v.data), g = col(t, v.group), op = choice(v.operation, ['count', 'sum', 'mean']), i = op === 'count' ? -1 : col(t, v.value), groups = new Map();
    for (const row of t.rows) { const item = groups.get(row[g]) ?? { count: 0, sum: { coefficient: 0n, exponent: 0 } }; item.count++; if (i >= 0) item.sum = addDecimals(item.sum, decimal(row[i])); groups.set(row[g], item); }
    return csvArtifact(['분류', op === 'count' ? '개수' : op === 'sum' ? '합계' : '평균'], [...groups].map(([key, item]) => { const value = op === 'count' ? String(item.count) : decimalText(op === 'sum' ? item.sum : meanDecimal(item.sum, item.count)); if (!Number.isFinite(Number(value))) fail('집계 결과가 표시 가능한 숫자 범위를 넘었습니다.'); return [key, value]; }), 'summary');
  } },
  { slug: 'table-reshape', title: '가로로 긴 표를 세로 표로', description: '가로→세로는 고정 키와 측정 열을 모두 지정하세요. 세로→가로는 키·항목·값의 3열 구조만 지원합니다. 중복 키·누락 조합은 거부합니다.', fields: [area(), select('direction', '방향', [['long', '가로 → 세로'], ['wide', '세로 → 가로']]), textField('key', '고정 키 열', '값이 비어 있거나 중복되면 오류입니다.'), { ...columnsField('columns', '측정 열 (세로 변환 때)'), type: 'textarea', required: false }, textField('attribute', '항목 열 이름', '세로 표에서 사용할 이름입니다.'), textField('value', '값 열 이름')], run(v) {
    const t = table(v.data), k = col(t, v.key); choice(v.direction, ['long', 'wide']);
    input(v.attribute, '항목 열'); input(v.value, '값 열');
    if (new Set([v.key.trim(), v.attribute.trim(), v.value.trim()]).size !== 3) fail('키·항목·값 열 이름은 서로 달라야 합니다.');
    if (v.direction === 'long') {
      const selected = cols(t, v.columns); if (selected.includes(k) || selected.length !== t.headers.length - 1) fail('키를 제외한 모든 측정 열을 선택해 주세요.');
      if (t.rows.length * selected.length > 20000) fail('변환 결과는 최대 20,000행입니다.');
      const keys = new Set(); const rows = [];
      for (const row of t.rows) { if (!row[k].trim() || keys.has(row[k])) fail('고정 키가 비었거나 중복되었습니다.'); keys.add(row[k]); for (const i of selected) rows.push([row[k], t.headers[i], row[i]]); }
      return csvArtifact([v.key, v.attribute, v.value], rows, 'long');
    }
    const a = col(t, v.attribute), value = col(t, v.value); if (t.headers.length !== 3) fail('세로 표는 키·항목·값 3개 열이어야 합니다.');
    const groups = new Map(), attributes = new Set();
    for (const row of t.rows) { if (!row[k].trim() || !row[a].trim() || row[a].trim() === v.key.trim()) fail('키·항목이 비었거나 출력 열 이름이 겹칩니다.'); const group = groups.get(row[k]) ?? new Map(); if (group.has(row[a])) fail('같은 키와 항목 조합이 중복되었습니다.'); group.set(row[a], row[value]); groups.set(row[k], group); attributes.add(row[a]); }
    const names = [...attributes]; if (names.length > 99 || new Set(names.map(s => s.trim())).size !== names.length) fail('항목 이름 중복 또는 100열 초과입니다.');
    const rows = [...groups].map(([key, group]) => { if (group.size !== names.length) fail('키별 항목 조합이 다릅니다. 누락 값을 확인해 주세요.'); return [key, ...names.map(name => group.get(name))]; });
    return csvArtifact([v.key, ...names], rows, 'wide');
  } },
  { slug: 'data-mask', title: '표의 민감한 값 가리기', description: '선택한 열의 비어 있지 않은 값을 가립니다. 가명은 열별 첫 등장 순서로 부여하며 익명성을 보장하지 않습니다.', fields: [area(), { ...columnsField(), type: 'textarea' }, select('mode', '처리 방식', [['fixed', '고정 마스크 ***'], ['alias', '같은 값에 같은 가명']])], run(v) {
    const t = table(v.data), indices = new Set(cols(t, v.columns)); choice(v.mode, ['fixed', 'alias']); const maps = new Map([...indices].map(i => [i, new Map()])); let count = 0;
    const rows = t.rows.map(row => row.map((value, i) => { if (!indices.has(i) || value === '') return value; count++; if (v.mode === 'fixed') return '***'; const map = maps.get(i); if (!map.has(value)) map.set(value, `가명${map.size + 1}`); return map.get(value); }));
    return csvArtifact(t.headers, rows, 'masked', `${count}개 셀 처리. 다른 열·행 조합으로 재식별될 수 있습니다.\n${csvText(t.headers, rows).slice(0, 30000)}`);
  } },
  { slug: 'csv-deduplicate', title: '표 중복 행 정리', description: '선택 열의 정확한 문자열 조합으로 비교합니다. 빈 키도 같은 값으로 처리됩니다. 다운로드에는 보존된 행만 들어 있습니다.', fields: [area(), { ...columnsField(), type: 'textarea' }, select('keep', '보존 규칙', [['first', '첫 행'], ['last', '마지막 행'], ['unique', '중복 없는 키만']])], run(v) {
    const t = table(v.data), indices = cols(t, v.columns); choice(v.keep, ['first', 'last', 'unique']); const map = new Map();
    t.rows.forEach((row, i) => { const key = JSON.stringify(indices.map(j => row[j])); const entry = map.get(key) ?? { first: i, last: i, count: 0 }; entry.last = i; entry.count++; map.set(key, entry); });
    const kept = new Set([...map.values()].filter(e => v.keep !== 'unique' || e.count === 1).map(e => v.keep === 'last' ? e.last : e.first));
    const rows = t.rows.filter((_, i) => kept.has(i)); const removed = t.rows.flatMap((row, i) => kept.has(i) ? [] : [t.recordNumbers[i]]);
    return csvArtifact(t.headers, rows, 'deduplicated', `보존 ${rows.length}행 · 제거 ${removed.length}행\n제거 원본 데이터 행 번호(제목 행 포함, CSV 레코드 기준): ${removed.join(', ')}\n${csvText(t.headers, rows).slice(0, 20000)}`);
  } },
  { slug: 'date-column', title: '표 날짜 형식 통일', description: '원본 형식을 명시하세요. 잘못된 날짜와 빈칸은 원문을 보존하고 오류 행 목록으로 표시합니다.', fields: [area(), textField('column', '날짜 열'), select('from', '원본 형식', dates), select('to', '출력 형식', dates)], run(v) {
    const t = table(v.data), i = col(t, v.column); choice(v.from, dates.map(d => d[0])); choice(v.to, dates.map(d => d[0])); const errors = [];
    const rows = t.rows.map((row, n) => { const next = [...row]; try { next[i] = renderDate(formatDate(row[i], v.from), v.to); } catch { errors.push(`행 ${t.recordNumbers[n]}: ${row[i].slice(0, 80) || '(빈칸)'}`); } return next; });
    return csvArtifact(t.headers, rows, 'dates', `변환 ${rows.length - errors.length}행 · 원문 보존 오류 ${errors.length}행\n${errors.join('\n').slice(0, 25000)}\n${csvText(t.headers, rows).slice(0, 5000)}`);
  } },
  { slug: 'table-schema', title: '표 입력 규칙 검사', description: '열별 JSON 규칙: required, type(text/number/integer/date), min, max, enum. date는 YYYY-MM-DD입니다. 데이터는 고치지 않습니다.', fields: [area(), area('rules', '열별 규칙 JSON', '예: {"수량":{"required":true,"type":"integer","min":0}}. min/max는 수치형에서만 사용합니다.')], run(v) {
    const t = table(v.data), rules = readJSON(v.rules); if (!isObject(rules) || !Object.keys(rules).length) fail('열별 규칙 객체가 필요합니다.');
    const checks = Object.entries(rules).map(([name, rule]) => {
      const index = col(t, name); if (!isObject(rule) || Object.keys(rule).some(k => !['required', 'type', 'min', 'max', 'enum'].includes(k))) fail('지원하지 않는 규칙이 있습니다.');
      if (rule.required !== undefined && typeof rule.required !== 'boolean') fail('required는 true 또는 false입니다.');
      const type = rule.type ?? 'text'; choice(type, ['text', 'number', 'integer', 'date']);
      for (const bound of ['min', 'max']) if (rule[bound] !== undefined && (!['number', 'integer'].includes(type) || typeof rule[bound] !== 'number' || !Number.isFinite(rule[bound]))) fail('min/max는 수치형 규칙의 유한한 숫자여야 합니다.');
      if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) fail('min은 max보다 클 수 없습니다.');
      if (rule.enum !== undefined && (!Array.isArray(rule.enum) || !rule.enum.length || rule.enum.some(x => typeof x !== 'string'))) fail('enum은 하나 이상의 문자열 배열이어야 합니다.');
      return { name, index, rule, type, allowed: rule.enum ? new Set(rule.enum) : null };
    });
    const errors = []; let passed = 0;
    t.rows.forEach((row, n) => { const before = errors.length;
      for (const { name, index, rule, type, allowed } of checks) { const value = row[index]; let error = '';
        if (!value.trim()) { if (rule.required) error = '필수값 누락'; }
        else { try { if (type === 'number' || type === 'integer') { const exact = decimal(value); if (type === 'integer' && (exact.exponent < 0 || compareDecimals(exact, decimal('9007199254740991')) > 0 || compareDecimals(exact, decimal('-9007199254740991')) < 0)) error = '안전한 정수 아님'; else if ((rule.min !== undefined && compareDecimals(exact, decimal(String(rule.min))) < 0) || (rule.max !== undefined && compareDecimals(exact, decimal(String(rule.max))) > 0)) error = '허용 범위 밖'; } else if (type === 'date') formatDate(value, 'YYYY-MM-DD'); } catch { error = '자료형 오류'; }
          if (!error && allowed && !allowed.has(value)) error = '허용값 아님'; }
        if (error) errors.push([t.recordNumbers[n], name, value, error]); }
      if (errors.length === before) passed++;
    });
    return csvArtifact(['행', '열', '입력값', '오류'], errors, 'validation-errors', `통과 ${passed}행 / 전체 ${t.rows.length}행 · 오류 ${errors.length}개\n${csvText(['행', '열', '입력값', '오류'], errors).slice(0, 28000)}`);
  } },
  { slug: 'table-sort', title: '여러 기준으로 표 정렬', description: '기준 CSV의 column,type,direction 열에 열 이름,text 또는 number,asc 또는 desc를 입력하세요. 동률은 원래 행 순서를 보존합니다. 문자는 유니코드 순서입니다.', fields: [area(), area('rules', '정렬 기준 CSV', '첫 행: column,type,direction. 다음 행부터 실제 열 이름과 형식·방향을 입력하세요.')], run(v) {
    const t = table(v.data), rules = table(v.rules); if (JSON.stringify(rules.headers) !== JSON.stringify(['column', 'type', 'direction']) || !rules.rows.length || rules.rows.length > 100) fail('정렬 기준 제목은 column,type,direction이며 1~100개 기준이 필요합니다.');
    const seen = new Set(); const keys = rules.rows.map(([name, type, direction]) => { const index = col(t, name); choice(type, ['text', 'number']); choice(direction, ['asc', 'desc']); if (seen.has(index)) fail('정렬 열이 중복되었습니다.'); seen.add(index); return { index, type, sign: direction === 'asc' ? 1 : -1 }; });
    const decorated = t.rows.map((row, index) => ({ row, index, values: keys.map(k => k.type === 'number' ? decimal(row[k.index]) : row[k.index]) }));
    decorated.sort((a, b) => { for (let i = 0; i < keys.length; i++) { const x = a.values[i], y = b.values[i]; const order = keys[i].type === 'number' ? compareDecimals(x, y) : x === y ? 0 : x < y ? -1 : 1; if (order) return order * keys[i].sign; } return a.index - b.index; });
    return csvArtifact(t.headers, decorated.map(item => item.row), 'sorted');
  } },
  { slug: 'json-diff', title: '두 JSON의 구조 차이 찾기', description: '객체 키 순서는 무시합니다. 경로는 JSON Pointer입니다. 배열은 위치별 또는 배열 전체 값으로 비교합니다.', fields: [area('left', '기준 JSON'), area('right', '비교 JSON'), select('arrays', '배열 비교', [['index', '위치별 비교'], ['atomic', '배열 전체 값 비교']])], run(v) {
    const left = readJSON(v.left), right = readJSON(v.right); choice(v.arrays, ['index', 'atomic']); const changes = [], stack = [['', left, right]];
    while (stack.length) { const [path, a, b] = stack.pop(); if (Object.is(a, b)) continue;
      const sameContainers = (isObject(a) && isObject(b)) || (Array.isArray(a) && Array.isArray(b));
      if (sameContainers && !(Array.isArray(a) && v.arrays === 'atomic')) { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); for (const key of keys) { const next = `${path}/${pointer(key)}`; if (!Object.hasOwn(a, key)) changes.push({ path: next, change: 'added', after: b[key] }); else if (!Object.hasOwn(b, key)) changes.push({ path: next, change: 'removed', before: a[key] }); else stack.push([next, a[key], b[key]]); } }
      else if (!equalJSON(a, b)) changes.push({ path, change: 'changed', before: a, after: b });
    }
    return jsonArtifact(changes, 'differences', 2, `${changes.length}개 변경\n${JSON.stringify(changes, null, 2).slice(0, 29000)}`);
  } },
  { slug: 'timestamp', title: '컴퓨터 시각값 읽기·변환', description: '초·밀리초를 추측하지 않습니다. ISO 입력은 YYYY-MM-DDTHH:mm:ss[.sss]Z UTC 형식만 지원합니다. 출력은 UTC입니다.', fields: [textField('data', '시각값', 'ISO 예: 2026-11-05T12:00:00Z. 초·밀리초는 정수만 입력하세요.'), select('mode', '입력 형식', [['seconds', 'epoch 초'], ['milliseconds', 'epoch 밀리초'], ['iso', 'ISO UTC']])], run(v) {
    const data = input(v.data, '시각값'); choice(v.mode, ['seconds', 'milliseconds', 'iso']); let ms;
    if (v.mode === 'iso') {
      // Parse a fixed UTC grammar explicitly: no locale/date parser guesses or timezone inference.
      if (data.length !== 20 && data.length !== 24) fail('ISO UTC 형식과 밀리초 3자리를 확인해 주세요.');
      for (const i of [4, 7, 10, 13, 16, data.length - 1]) { const expected = i === 4 || i === 7 ? '-' : i === 10 ? 'T' : i === data.length - 1 ? 'Z' : ':'; if (data[i] !== expected) fail('ISO UTC 구분 문자를 확인해 주세요.'); }
      if (data.length === 24 && data[19] !== '.') fail('밀리초 앞에 점이 필요합니다.');
      const pieces = [data.slice(0, 4), data.slice(5, 7), data.slice(8, 10), data.slice(11, 13), data.slice(14, 16), data.slice(17, 19), data.length === 24 ? data.slice(20, 23) : '000'];
      if (pieces.some(piece => [...piece].some(c => c < '0' || c > '9'))) fail('ISO UTC 숫자를 확인해 주세요.');
      const [year, month, day, hour, minute, second, milli] = pieces.map(Number); validateCalendarDate(year, month, day);
      if (hour > 23 || minute > 59 || second > 59) fail('시·분·초 범위가 올바르지 않습니다.');
      const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, milli); ms = date.getTime();
    } else {
      const digits = data[0] === '-' || data[0] === '+' ? data.slice(1) : data;
      if (!digits.length || [...digits].some(c => c < '0' || c > '9')) fail('epoch 값은 부호와 십진 정수만 입력해 주세요.');
      const n = Number(data); if (!Number.isSafeInteger(n)) fail('epoch 값은 안전한 정수여야 합니다.'); ms = v.mode === 'seconds' ? n * 1000 : n;
    }
    if (!Number.isSafeInteger(ms) || Math.abs(ms) > 8640000000000000) fail('지원하는 날짜 범위를 넘었습니다.');
    const result = { isoUTC: new Date(ms).toISOString(), epochSeconds: ms / 1000, epochMilliseconds: ms, timezone: 'UTC' };
    return jsonArtifact(result, 'timestamp');
  } },
  { slug: 'csv-merge', title: '여러 표를 행으로 합치기', description: '최대 5개 CSV를 행으로 연결합니다. 제목 순서 일치 또는 첫 표 순서로 맞추기를 선택하세요. 전체 20,000행·입력 합계 200,000자 제한입니다.', fields: [area('data', '첫 CSV'), area('other', '두 번째 CSV'), { ...area('third', '세 번째 CSV'), required: false }, { ...area('fourth', '네 번째 CSV'), required: false }, { ...area('fifth', '다섯 번째 CSV'), required: false }, select('policy', '제목 정책', [['strict', '순서까지 일치'], ['align', '같은 열을 첫 표 순서로 맞춤']])], run(v) {
    const sources = [input(v.data), input(v.other), ...[v.third, v.fourth, v.fifth].filter(s => typeof s === 'string' && s.trim())]; if (sources.reduce((n, s) => n + s.length, 0) > LIMIT) fail('CSV 입력 합계는 200,000자 이하여야 합니다.'); choice(v.policy, ['strict', 'align']);
    const tables = sources.map(table), headers = tables[0].headers; let rows = [];
    for (const t of tables) { if (t.headers.length !== headers.length || headers.some(h => !t.headers.includes(h)) || (v.policy === 'strict' && headers.some((h, i) => h !== t.headers[i]))) fail('각 CSV의 제목 구성이 정책과 다릅니다.'); const indices = headers.map(h => t.headers.indexOf(h)); rows.push(...t.rows.map(row => indices.map(i => row[i]))); if (rows.length > 20000) fail('병합 결과는 최대 20,000행입니다.'); }
    return csvArtifact(headers, rows, 'merged', `합계 ${rows.length}행\n${tables.map((t, i) => `${i + 1}번 CSV: ${t.rows.length}행`).join('\n')}\n${csvText(headers, rows).slice(0, 25000)}`);
  } },
  { slug: 'data-sample', title: '표에서 재현 가능한 표본 뽑기', description: '시드 기반 비복원 추출입니다. 결과는 원본 행 순서이며 같은 입력·크기·시드로 재현됩니다. 통계적 대표성·암호학적 무작위는 보장하지 않습니다.', fields: [area(), { name: 'size', label: '표본 행 수', type: 'number', required: true, min: 1, max: 20000, step: 1 }, textField('seed', '시드', '같은 문자열은 같은 결과를 만듭니다. 최대 200자.')], run(v) {
    const t = table(v.data), size = integer(v.size, 1, t.rows.length); const seed = input(v.seed, '시드'); if (seed.length > 200) fail('시드는 최대 200자입니다.'); let state = 2166136261;
    for (const c of seed) { state ^= c.codePointAt(0); state = Math.imul(state, 16777619) >>> 0; }
    const random = () => { state = (state + 0x6D2B79F5) >>> 0; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
    const indices = t.rows.map((_, i) => i); for (let i = 0; i < size; i++) { const j = i + Math.floor(random() * (indices.length - i)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
    const chosen = indices.slice(0, size).sort((a, b) => a - b), rows = chosen.map(i => t.rows[i]);
    return csvArtifact(t.headers, rows, 'sample', `${t.rows.length}행 중 ${size}행 · 시드 ${seed}\n원본 행: ${chosen.map(i => t.recordNumbers[i]).join(', ')}\n${csvText(t.headers, rows).slice(0, 25000)}`);
  } },
  { slug: 'chart', title: '표로 SVG 그래프 만들기', description: '최대 100개 행의 유한한 수치로 막대·선 그래프를 만듭니다. 행 순서는 보존됩니다. SVG는 900px 너비입니다.', fields: [area(), textField('label', '가로축 이름 열'), textField('value', '수치 열'), select('kind', '그래프 종류', [['bar', '막대'], ['line', '선']])], run(v) {
    const t = table(v.data), li = col(t, v.label), vi = col(t, v.value); choice(v.kind, ['bar', 'line']); if (!t.rows.length || t.rows.length > 100) fail('그래프는 1~100개 데이터 행을 지원합니다.');
    for (const label of [v.label, v.value, ...t.rows.map(row => row[li])]) for (const character of label) {
      const code = character.codePointAt(0);
      if (!(code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xD7FF || code >= 0xE000 && code <= 0xFFFD || code >= 0x10000 && code <= 0x10FFFF)) fail('그래프 이름에 XML에서 허용하지 않는 문자 코드가 있습니다.');
    }
    const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
    const values = t.rows.map(r => number(r[vi])); const maxAbs = Math.max(...values.map(Math.abs));
    const normalized = values.map(n => maxAbs ? n / maxAbs : 0), low = Math.min(0, ...normalized), high = Math.max(0, ...normalized), span = high - low || 1;
    const y = n => 350 - (n - low) / span * 280, step = 800 / values.length, x = i => 75 + step * (i + .5), zero = y(0);
    const marks = v.kind === 'bar' ? normalized.map((n, i) => `<rect x="${x(i) - step * .35}" y="${Math.min(y(n), zero)}" width="${step * .7}" height="${Math.abs(y(n) - zero)}" fill="#225ea8"><title>${escape(t.rows[i][li])}: ${values[i]}</title></rect>`).join('') : `<polyline fill="none" stroke="#225ea8" stroke-width="3" points="${normalized.map((n, i) => `${x(i)},${y(n)}`).join(' ')}"/>${normalized.map((n, i) => `<circle cx="${x(i)}" cy="${y(n)}" r="3" fill="#225ea8"><title>${escape(t.rows[i][li])}: ${values[i]}</title></circle>`).join('')}`;
    const labels = t.rows.map((r, i) => i % Math.ceil(values.length / 12) ? '' : `<text x="${x(i)}" y="375" text-anchor="end" transform="rotate(-35 ${x(i)} 375)" font-size="11">${escape([...r[li]].slice(0, 20).join(''))}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="470" viewBox="0 0 900 470" role="img" aria-labelledby="title"><title id="title">${escape(v.label)}별 ${escape(v.value)}</title><rect width="900" height="470" fill="white"/><g font-family="sans-serif" fill="#17202a"><text x="75" y="28">${escape(v.value)} (${values.length}행)</text><text x="5" y="75" font-size="11">${escape(String(high * maxAbs))}</text><text x="5" y="350" font-size="11">${escape(String(low * maxAbs))}</text><line x1="75" x2="875" y1="${zero}" y2="${zero}" stroke="#555"/>${marks}${labels}</g></svg>`;
    return artifact(svg, 'chart.svg', 'image/svg+xml;charset=utf-8', `${values.length}개 행 · ${v.kind === 'bar' ? '막대' : '선'} 그래프\n수치: ${values.join(', ')}\n다운로드한 SVG를 브라우저에서 확인하세요.`);
  } },
  { slug: 'vcard', title: '연락처 파일 만들기', description: 'vCard 3.0 연락처를 만듭니다. 줄바꿈은 속성 값 안의 이스케이프로 저장합니다. 저장 후 사용 중인 연락처 앱에서 확인하세요.', fields: [textField('name', '이름'), textField('phone', '전화번호', '선택 입력입니다.', false), textField('email', '이메일', '선택 입력입니다.', false), textField('organization', '소속', '', false), { ...area('note', '메모'), required: false }], run(v) {
    const name = input(v.name, '이름'); const phone = input(v.phone ?? '', '전화번호', true), email = input(v.email ?? '', '이메일', true), org = input(v.organization ?? '', '소속', true), note = input(v.note ?? '', '메모', true);
    if ([name, phone, email, org, note].some(s => s.includes('\u0000'))) fail('널 문자는 지원하지 않습니다.');
    if (phone && (!/^[+0-9() .-]+$/.test(phone) || !/[0-9]/.test(phone))) fail('전화번호에는 숫자·+·괄호·공백·점·하이픈만 사용할 수 있습니다.');
    if (email && !/^[^\s@,;:]+@[^\s@,;:]+\.[^\s@,;:]+$/.test(email)) fail('이메일 주소를 확인해 주세요.');
    const escape = s => s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(name)}`, `N:;${escape(name)};;;`, ...(phone ? [`TEL;TYPE=CELL:${escape(phone)}`] : []), ...(email ? [`EMAIL;TYPE=INTERNET:${escape(email)}`] : []), ...(org ? [`ORG:${escape(org)}`] : []), ...(note ? [`NOTE:${escape(note)}`] : []), 'END:VCARD'];
    // Fold at 75 UTF-8 octets without splitting a Unicode code point (continuation space counts).
    const folded = lines.flatMap(line => { const chunks = []; let chunk = '', bytes = 0; for (const c of line) { const length = new TextEncoder().encode(c).length; if (bytes + length > 75) { chunks.push(chunk); chunk = ' '; bytes = 1; } chunk += c; bytes += length; } chunks.push(chunk); return chunks; });
    return artifact(folded.join('\r\n') + '\r\n', 'contact.vcf', 'text/vcard;charset=utf-8');
  } },
];
