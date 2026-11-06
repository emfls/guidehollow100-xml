import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {tools} from '../src/utility/catalog.mjs';
const site=JSON.parse(await readFile('src/site.json','utf8'));
const tool=tools.find(t=>t.slug===site.slug);
assert.ok(tool,'Missing utility for site');
let pages=0;
async function check(dir){
 for(const e of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,e.name);
  if(e.isDirectory()){await check(path);continue;}
  if(!path.endsWith('.html'))continue;
  const html=await readFile(path,'utf8');
  assert.equal((html.match(/<iframe src="https:\/\/ads-partners.coupang.com\/widgets.html/g)||[]).length,1,path);
  assert.ok(html.includes('쿠팡 파트너스 활동의 일환'),path);
  assert.ok(html.includes('rel="canonical"'),path);
  if(path==='dist/index.html'){
   assert.ok(html.includes('data-utility="'+site.slug+'"'),'Missing live utility form');
   assert.ok(html.includes(tool.title));
   assert.ok(html.indexOf('</form>')<html.indexOf('<iframe'),'Ad must be outside form');
   assert.equal((html.match(/<h1[ >]/g)||[]).length,1,'One main title');
   assert.ok(html.includes('id="utility-submit"')&&html.includes('id="utility-result"'));
  }
  pages++;
 }
}
await check('dist');
assert.ok(pages>=7);
console.log(site.slug+': '+pages+' HTML pages with one banner and utility home');
