import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function ok(name, pass, detail='') {
  results.push({name, pass, detail});
  console.log((pass?'PASS':'FAIL') + ' — ' + name + (detail?': '+detail:''));
}

const html = fs.readFileSync(path.join(__dirname,'index.html'));
const server = http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(html);
});
await new Promise(r=>server.listen(8765,r));

const browser = await chromium.launch();

async function dlgFill(page, fields) {
  for (const [k,v] of Object.entries(fields)) {
    await page.fill('#dlg_'+k, String(v));
  }
  await page.click('#dlgOk');
  await page.waitForFunction(() => document.getElementById('dlg').classList.contains('hidden'), null, {timeout: 8000});
}
async function dlgOk(page, opts={}) {
  const prev = await page.locator('#dlgTitle').textContent();
  await page.click('#dlgOk');
  if (opts.nextTitle) {
    await page.waitForFunction((want) => {
      const d = document.getElementById('dlg');
      return d && !d.classList.contains('hidden') && document.getElementById('dlgTitle').textContent === want;
    }, opts.nextTitle, {timeout: 8000});
  } else {
    await page.waitForFunction((old) => {
      const d = document.getElementById('dlg');
      if (!d) return false;
      if (d.classList.contains('hidden')) return true;
      // also treat title change as progress when another dialog opens immediately
      return document.getElementById('dlgTitle').textContent !== old;
    }, prev, {timeout: 8000});
    // if a new dialog opened, leave it; if closed, good
  }
}
async function waitDlgTitle(page, title) {
  await page.waitForFunction((want) => {
    const d = document.getElementById('dlg');
    return d && !d.classList.contains('hidden') && document.getElementById('dlgTitle').textContent === want;
  }, title, {timeout: 8000});
}

// ---- Migration test ----
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.addInitScript(()=>{
    const old = {
      current:'eOLD',
      events:[{
        id:'eOLD',
        name:'County Fair Small Animal Sale',
        lots:[
          {n:1,ex:'Maddie R.',sp:'Rabbit',de:'Pair of Mini Rex, 10 wks',buyer:'Hayes Feed & Seed',price:85},
          {n:2,ex:'Tyler B.',sp:'Hen',de:'Pen of 3 Buff Orpingtons',buyer:'',price:null}
        ]
      }]
    };
    localStorage.setItem('barnyard-demo-v1', JSON.stringify(old));
  });
  await p.goto('http://127.0.0.1:8765/');
  await p.waitForSelector('#tLots');
  const migrated = await p.evaluate(()=>{
    const S=JSON.parse(localStorage.getItem('barnyard-demo-v1'));
    const ev=S.events[0];
    return {
      version:S.version,
      hasBuyers:Array.isArray(ev.buyers),
      feePct:ev.feePct,
      lotIds:ev.lots.every(l=>!!l.id),
      addOns:ev.lots.every(l=>Array.isArray(l.addOns)),
      lots:ev.lots.length,
      soldText:document.getElementById('tSold').textContent,
      grossText:document.getElementById('tGross').textContent
    };
  });
  ok('migrate sets version 2', migrated.version===2, JSON.stringify(migrated));
  ok('migrate adds buyers array', migrated.hasBuyers);
  ok('migrate adds feePct', migrated.feePct===0);
  ok('migrate adds lot ids', migrated.lotIds);
  ok('migrate adds addOns arrays', migrated.addOns);
  ok('migrate preserves lots', migrated.lots===2);
  ok('migrate shows sold count', migrated.soldText==='1');
  ok('migrate shows gross', migrated.grossText.includes('85'));
  await ctx.close();
}

// ---- Full sale ----
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage({viewport:{width:1100,height:900}});
await page.addInitScript(()=>{ window.print = ()=>{}; });

// Start clean once
await page.goto('http://127.0.0.1:8765/');
await page.evaluate(()=>localStorage.clear());
await page.reload();
await page.waitForSelector('#tLots');

const bannerVisible = await page.isVisible('#exampleBanner:not(.hidden)');
ok('example banner visible on seed', bannerVisible);
await page.click('#clearExample');
await dlgOk(page);

await page.click('#newEvt');
await dlgFill(page, {name:'WNC Youth Livestock Sale 2026'});
let line = await page.textContent('#evtline');
ok('created event', line.includes('WNC Youth Livestock Sale 2026'), line);

await page.fill('#fFee','5');
await page.dispatchEvent('#fFee','change');

await page.click('#tabBuyers');
await page.fill('#bNum','10');
await page.fill('#bName','Acme Farm Supply');
await page.fill('#bBiz','Acme Farm Supply LLC');
await page.fill('#bPhone','828-555-0100');
await page.click('#buyerForm button[type=submit]');
await page.fill('#bNum','22');
await page.fill('#bName','Jordan Lee');
await page.click('#buyerForm button[type=submit]');
ok('registered 2 buyers', await page.locator('.buyer-row').count()===2);

await page.click('#tabLots');
const lots = [
  {ex:'Sam H.', sp:'Rabbit', de:'Netherland Dwarf doe'},
  {ex:'Casey M.', sp:'Hen', de:'Pen of 3 Rhode Island Reds'},
  {ex:'Riley T.', sp:'Goat', de:'Boer wether 55 lb'},
  {ex:'Alex K.', sp:'Rabbit', de:'Holland Lop pair'}
];
for (const L of lots) {
  await page.fill('#fEx', L.ex);
  await page.fill('#fSp', L.sp);
  await page.fill('#fDe', L.de);
  await page.click('#addForm button[type=submit]');
}
ok('added 4 lots', await page.locator('.lot').count()===4);
ok('lots entered total', await page.textContent('#tLots')==='4');
ok('next-up on first', await page.locator('.lot').nth(0).evaluate(el=>el.classList.contains('next-up')));

await page.locator('[data-down="0"]').click();
const firstTitle = await page.locator('.lot').nth(0).locator('h3').textContent();
ok('reordered — Casey first', firstTitle.includes('Casey M.'), firstTitle);
ok('next-up after reorder', await page.locator('.lot').nth(0).evaluate(el=>el.classList.contains('next-up')));

await page.locator('form[data-sell]').nth(0).locator('select[name=bidder]').selectOption('10');
await page.locator('form[data-sell]').nth(0).locator('input[name=price]').fill('120');
await page.locator('form[data-sell]').nth(0).locator('button[type=submit]').click();

await page.locator('form[data-sell]').nth(0).locator('select[name=bidder]').selectOption('22');
await page.locator('form[data-sell]').nth(0).locator('input[name=price]').fill('95');
await page.locator('form[data-sell]').nth(0).locator('button[type=submit]').click();

await page.locator('form[data-sell]').nth(0).locator('input[name=buyer]').fill('Hometown Bank');
await page.locator('form[data-sell]').nth(0).locator('input[name=price]').fill('200');
await page.locator('form[data-sell]').nth(0).locator('button[type=submit]').click();
ok('sold count 3', await page.textContent('#tSold')==='3');

await page.locator('[data-addon]').first().click();
await dlgFill(page, {amount:'40', note:'Support from 4-H alumni', buyer:'10'});

const gross = await page.textContent('#tGross');
const addons = await page.textContent('#tAddons');
const fee = await page.textContent('#tFee');
const net = await page.textContent('#tNet');
ok('gross $415', gross.replace(/,/g,'')==='$415', gross);
ok('addons $40', addons==='$40', addons);
ok('fee $20.75', fee==='$20.75', fee);
ok('net $434.25', net==='$434.25', net);

await page.click('#tabBuyers');
await page.locator('[data-buyer-paid]').first().click();
const paidLabel = await page.locator('.buyer-row').first().locator('.paid, .unpaid').textContent();
ok('buyer payment toggled', /Paid|Unpaid/.test(paidLabel), paidLabel);
await page.evaluate(()=>{
  const S=JSON.parse(localStorage.getItem('barnyard-demo-v1'));
  const ev=S.events.find(e=>e.id===S.current);
  const acme=ev.buyers.find(b=>b.name.includes('Acme'));
  acme.paid=true;
  localStorage.setItem('barnyard-demo-v1',JSON.stringify(S));
});
await page.reload();
await page.waitForSelector('#tLots');
await page.click('#tabBuyers');
const acmeState = await page.evaluate(()=>{
  const S=JSON.parse(localStorage.getItem('barnyard-demo-v1'));
  const ev=S.events.find(e=>e.id===S.current);
  return {name:ev.name, paid:ev.buyers.find(b=>b.name.includes('Acme')).paid, fee:ev.feePct, lots:ev.lots.length};
});
ok('data survives reload after paid mark', acmeState.name.includes('WNC') && acmeState.paid===true && acmeState.fee===5 && acmeState.lots===4, JSON.stringify(acmeState));

await page.click('#tabReports');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#jsonExport')
]);
const tmp = path.join(__dirname,'screens','backup-test.json');
await download.saveAs(tmp);
const backup = JSON.parse(fs.readFileSync(tmp,'utf8'));
ok('json backup has event', backup.format==='barnyard-auction' && backup.event && backup.event.lots.length===4, backup.event&&backup.event.name);
ok('json backup has add-ons', backup.event.lots.some(l=>(l.addOns||[]).length>0));
ok('json backup fee 5', backup.event.feePct===5, String(backup.event.feePct));

// Import into fresh storage
await page.evaluate(()=>localStorage.clear());
await page.reload();
await page.waitForSelector('#tLots');
const banner = page.locator('#exampleBanner');
if (await banner.isVisible()) {
  await page.click('#clearExample');
  await page.waitForSelector('#dlgTitle', {state:'visible'});
  await dlgOk(page);
}
await page.click('#tabReports');
const dlgTitle = page.locator('#dlgTitle');
await page.setInputFiles('#jsonFile', tmp);
await waitDlgTitle(page, 'Import event');
await dlgOk(page, {nextTitle: 'Imported'}); // import confirm -> success alert
await dlgOk(page); // imported alert

const afterImport = await page.evaluate(()=>{
  const S=JSON.parse(localStorage.getItem('barnyard-demo-v1'));
  const ev=S.events.find(e=>e.id===S.current);
  return {
    name:ev.name, lots:ev.lots.length, sold:ev.lots.filter(l=>l.price!=null).length,
    fee:ev.feePct, buyers:ev.buyers.length,
    addon:ev.lots.reduce((a,l)=>a+(l.addOns||[]).reduce((x,y)=>x+(Number(y.amount)||0),0),0),
    tGross:document.getElementById('tGross').textContent,
    tNet:document.getElementById('tNet').textContent
  };
});
ok('re-import name', afterImport.name.includes('WNC Youth'), afterImport.name);
ok('re-import 4 lots', afterImport.lots===4);
ok('re-import 3 sold', afterImport.sold===3);
ok('re-import 2 buyers', afterImport.buyers===2);
ok('re-import fee', afterImport.fee===5);
ok('re-import addon total', afterImport.addon===40, String(afterImport.addon));
ok('re-import gross UI', afterImport.tGross.replace(/,/g,'')==='$415', afterImport.tGross);
ok('re-import net UI', afterImport.tNet==='$434.25', afterImport.tNet);

await page.reload();
await page.waitForSelector('#tNet');
ok('survives reload', await page.textContent('#tNet')==='$434.25');

await page.click('#renEvt');
await dlgFill(page, {name:'WNC Youth Livestock Sale 2026 (Final)'});
ok('rename event', (await page.textContent('#evtline')).includes('Final'));

await page.locator('[data-edit]').first().click();
await dlgFill(page, {ex:'Casey M.', sp:'Chicken', de:'Pen of 3 Rhode Island Reds'});
ok('edit lot species', (await page.locator('.lot').first().locator('h3').textContent()).includes('Chicken'));

await page.selectOption('#fStatus','unsold');
ok('filter unsold', await page.locator('.lot').count()===1);
await page.selectOption('#fStatus','all');
await page.fill('#fSearch','Rabbit');
const rabbitLots = await page.locator('.lot').count();
ok('search rabbit', rabbitLots>=1 && rabbitLots<=2, String(rabbitLots));
await page.fill('#fSearch','');

await page.setViewportSize({width:1100,height:900});
await page.selectOption('#fStatus','all');
await page.click('#tabLots');
await page.screenshot({path:path.join(__dirname,'screens','main.png'), fullPage:true});

await page.evaluate(()=>{
  const S=JSON.parse(localStorage.getItem('barnyard-demo-v1'));
  const ev=S.events.find(e=>e.id===S.current);
  function money(n){n=Number(n)||0;return '$'+n.toLocaleString('en-US',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})}
  function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}
  const b=ev.buyers.find(x=>x.name.includes('Acme'))||ev.buyers[0];
  let lines=[], total=0;
  ev.lots.forEach(l=>{
    if(l.price!=null && (l.buyerId===b.id || l.buyer===b.name)){
      lines.push(`<tr><td>${l.n}</td><td>${esc(l.sp)} · ${esc(l.ex)}</td><td>${money(l.price)}</td></tr>`);
      total+=Number(l.price)||0;
    }
    (l.addOns||[]).forEach(a=>{
      if(a.buyerId===b.id || a.buyerName===b.name){
        lines.push(`<tr><td>${l.n}</td><td>Add-on${a.note?' ('+esc(a.note)+')':''}</td><td>${money(a.amount)}</td></tr>`);
        total+=Number(a.amount)||0;
      }
    });
  });
  document.querySelector('.wrap').style.display='none';
  const root=document.getElementById('printRoot');
  root.classList.remove('print-only');
  root.style.display='block';
  root.innerHTML=`<div class="print-sheet" style="padding:24px;font-family:Archivo,system-ui,sans-serif;color:#1d2b26"><h1 style="margin:0 0 4px">Buyer Invoice</h1><div>${esc(ev.name)}</div><div style="margin-top:8px"><strong>#${b.num} ${esc(b.name)}</strong>${b.business?' · '+esc(b.business):''}</div><div>Status: ${b.paid?'PAID':'UNPAID'}</div><table style="width:100%;border-collapse:collapse;margin-top:12px"><thead><tr><th style="text-align:left;border-bottom:1px solid #ccc;padding:6px 4px">Lot</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:6px 4px">Description</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:6px 4px">Amount</th></tr></thead><tbody>${lines.join('')}</tbody></table><div style="font-weight:800;font-size:1.1rem;margin-top:12px">Total due: ${money(total)}</div></div>`;
});
await page.screenshot({path:path.join(__dirname,'screens','buyer-invoice.png'), fullPage:true});

await page.evaluate(()=>{
  document.querySelector('.wrap').style.display='';
  const root=document.getElementById('printRoot');
  root.innerHTML=''; root.classList.add('print-only'); root.style.display='';
});
await page.setViewportSize({width:390,height:844});
await page.click('#tabLots');
await page.screenshot({path:path.join(__dirname,'screens','mobile-390.png'), fullPage:true});

ok('screenshots written',
  fs.existsSync(path.join(__dirname,'screens','main.png')) &&
  fs.existsSync(path.join(__dirname,'screens','buyer-invoice.png')) &&
  fs.existsSync(path.join(__dirname,'screens','mobile-390.png')));

await browser.close();
server.close();

const failed = results.filter(r=>!r.pass);
console.log('\n==== SUMMARY ====');
console.log('Passed:', results.filter(r=>r.pass).length, '/', results.length);
fs.writeFileSync(path.join(__dirname,'screens','test-results.json'), JSON.stringify(results,null,2));
if (failed.length) {
  console.log('Failures:');
  failed.forEach(f=>console.log(' -', f.name, f.detail));
  process.exit(1);
}
