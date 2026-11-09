import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp, resetData } from './server/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-0123456789';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://ubuntu:barnyard@127.0.0.1:5432/barnyard_test';
const app = await createApp({
  host: '127.0.0.1',
  port: 8765,
  databaseUrl: process.env.DATABASE_URL,
  connectAttempts: 5
});
await resetData(app.pool);
const base = app.url;
const results = [];
function ok(name, pass, detail='') {
  results.push({name, pass, detail});
  console.log((pass?'PASS':'FAIL') + ' — ' + name + (detail?': '+detail:''));
}

const health = await fetch(base + '/health');
ok('health endpoint', health.status === 200, String(health.status));

const browser = await chromium.launch();

async function signup(page, user) {
  await page.click('#authTabSignup');
  await page.fill('#suName', user.name);
  await page.fill('#suEmail', user.email);
  await page.fill('#suPassword', user.password);
  await page.fill('#suOrg', user.org);
  await page.click('#signupForm button[type=submit]');
}
async function login(page, user) {
  await page.click('#authTabLogin');
  await page.fill('#liEmail', user.email);
  await page.fill('#liPassword', user.password);
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#tLots', { timeout: 15000 });
}
async function waitSaved(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('syncState');
    return el && el.textContent === 'Saved';
  }, null, { timeout: 12000 });
}

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

try {
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
  await p.goto(base + '/');
  await p.waitForSelector('#loginForm');
  await signup(p, {name:'Migration User', email:'migrate@example.com', password:'fair-week-1', org:'Wilkes 4-H'});
  await waitDlgTitle(p, "Import this device's sales?");
  await dlgOk(p);
  await p.waitForFunction(() => document.getElementById('tSold').textContent === '1');
  const migrated = await p.evaluate(()=>{
    const key=Object.keys(localStorage).find(k=>k.startsWith('barnyard-cache-'));
    const blob=JSON.parse(localStorage.getItem(key));
    const ev=blob.events[0];
    return {
      version:blob.version,
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

const owner = {name:'Casey Clerk', email:'casey@example.com', password:'fair-week-1', org:'Wilkes County 4-H'};
await page.goto(base + '/');
await page.evaluate(()=>localStorage.clear());
await page.reload();
await page.waitForSelector('#loginForm');
await page.screenshot({path:path.join(__dirname,'screens','login.png')});
await signup(page, owner);
await page.waitForSelector('#exampleBanner:not(.hidden)', {timeout:15000});

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
await waitDlgTitle(page, 'Record payment');
await dlgFill(page, {paidAt: '2026-06-01'});
const paidLabel = await page.locator('.buyer-row').first().locator('.paid, .unpaid').textContent();
ok('buyer payment toggled', /Paid/.test(paidLabel), paidLabel);
await waitSaved(page);

const ctx2 = await browser.newContext({viewport:{width:1100,height:900}});
const page2 = await ctx2.newPage();
await page2.goto(base + '/');
await login(page2, owner);
await page2.waitForFunction(() => {
  const sel = document.getElementById('evt');
  return sel && Array.from(sel.options).some(o => o.textContent.includes('WNC'));
}, null, {timeout:10000});
await page2.selectOption('#evt', {label:'WNC Youth Livestock Sale 2026'});
ok('second device sees the sale', (await page2.textContent('#tNet'))==='$434.25' && (await page2.textContent('#tLots'))==='4', await page2.textContent('#evtline'));
await ctx2.close();

const serverSale = await page.evaluate(async ()=>{
  const res = await fetch('/api/sales', {headers:{'X-Barnyard':'1'}});
  const body = await res.json();
  const sale = (body.sales||[]).find(s => !s.deleted && s.data && String(s.data.name).includes('WNC'));
  const acme = sale && sale.data.buyers.find(b => b.name.includes('Acme'));
  return {name:sale&&sale.data.name, paid:!!(acme&&acme.paid), fee:sale&&sale.data.feePct, lots:sale&&sale.data.lots.length};
});
ok('server has the sale', serverSale.name.includes('WNC') && serverSale.paid===true && serverSale.fee===5 && serverSale.lots===4, JSON.stringify(serverSale));

await page.reload();
await page.waitForSelector('#tLots');
await page.click('#tabBuyers');
const acmeState = await page.evaluate(()=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith('barnyard-cache-'));
  const S=JSON.parse(localStorage.getItem(key));
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
await waitSaved(page);
await page.evaluate(()=>localStorage.clear());
await page.reload();
await page.waitForFunction(() => {
  const line = document.getElementById('evtline') && document.getElementById('evtline').textContent || '';
  const banner = document.getElementById('exampleBanner');
  return line.includes('WNC') || (banner && !banner.classList.contains('hidden'));
}, null, {timeout:10000});
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
  const key=Object.keys(localStorage).find(k=>k.startsWith('barnyard-cache-'));
  const S=JSON.parse(localStorage.getItem(key));
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

await page.click('#peopleBtn');
await page.waitForSelector('#addClerkForm:not(.hidden)');
await page.fill('#clerkName', 'Jordan Clerk');
await page.fill('#clerkEmail', 'jordan-clerk@example.com');
await page.fill('#clerkPassword', 'clerk-pass-1');
await page.click('#addClerkForm button[type=submit]');
await page.waitForFunction(() => (document.getElementById('peopleMsg').textContent || '').includes('Clerk added'));
ok('owner can add a clerk from the sale screen', (await page.locator('.member-row').count()) >= 2);
await page.click('#peopleClose');

await page.setViewportSize({width:1100,height:900});
await page.selectOption('#fStatus','all');
await page.click('#tabLots');
await waitSaved(page);
await page.screenshot({path:path.join(__dirname,'screens','main.png'), fullPage:true});

await page.click('#tabPayouts');
await page.waitForSelector('#payoutList .payout-row, #payoutList .empty');
await page.screenshot({path:path.join(__dirname,'screens','payouts.png'), fullPage:true});
const avgSold = await page.textContent('#tAvg');
ok('avg sale price on board', avgSold && avgSold !== '—' && avgSold.startsWith('$'), avgSold);
await page.locator('#tabLots').click();
await page.screenshot({path:path.join(__dirname,'screens','sale-summary-avg.png'), fullPage:false});

await page.evaluate(()=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith('barnyard-cache-'));
  const S=JSON.parse(localStorage.getItem(key));
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
  document.getElementById('appScreen').style.display='none';
  const root=document.getElementById('printRoot');
  root.classList.remove('print-only');
  root.style.display='block';
  root.innerHTML=`<div class="print-sheet" style="padding:24px;font-family:Archivo,system-ui,sans-serif;color:#1d2b26"><h1 style="margin:0 0 4px">Buyer Invoice</h1><div>${esc(ev.name)}</div><div style="margin-top:8px"><strong>#${b.num} ${esc(b.name)}</strong>${b.business?' · '+esc(b.business):''}</div><div>Status: ${b.paid?'PAID':'UNPAID'}</div><table style="width:100%;border-collapse:collapse;margin-top:12px"><thead><tr><th style="text-align:left;border-bottom:1px solid #ccc;padding:6px 4px">Lot</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:6px 4px">Description</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:6px 4px">Amount</th></tr></thead><tbody>${lines.join('')}</tbody></table><div style="font-weight:800;font-size:1.1rem;margin-top:12px">Total due: ${money(total)}</div></div>`;
});
await page.screenshot({path:path.join(__dirname,'screens','buyer-invoice.png'), fullPage:true});

await page.evaluate(()=>{
  document.getElementById('appScreen').style.display='';
  const root=document.getElementById('printRoot');
  root.innerHTML=''; root.classList.add('print-only'); root.style.display='';
});
await page.setViewportSize({width:390,height:844});
await page.click('#tabLots');
await page.screenshot({path:path.join(__dirname,'screens','mobile-390.png'), fullPage:true});

ok('login screenshot written', fs.existsSync(path.join(__dirname,'screens','login.png')));
ok('screenshots written',
  fs.existsSync(path.join(__dirname,'screens','main.png')) &&
  fs.existsSync(path.join(__dirname,'screens','buyer-invoice.png')) &&
  fs.existsSync(path.join(__dirname,'screens','mobile-390.png')));

await page.context().setOffline(true);
await page.click('#tabLots');
await page.fill('#fEx','Offline Kid');
await page.fill('#fSp','Duck');
await page.fill('#fDe','Added while wifi dropped');
await page.click('#addForm button[type=submit]');
await page.waitForFunction(() => {
  const el = document.getElementById('syncState');
  return el && el.textContent.indexOf('Offline') >= 0;
}, null, {timeout:8000});
ok('offline indicator', (await page.textContent('#syncState')).includes('Offline'), await page.textContent('#syncState'));
ok('lot added offline', (await page.locator('.lot').count()) >= 1);
await page.context().setOffline(false);
await waitSaved(page);
const offlineSynced = await page.evaluate(async ()=>{
  const res = await fetch('/api/sales', {headers:{'X-Barnyard':'1'}});
  const body = await res.json();
  return (body.sales||[]).some(s => !s.deleted && s.data && (s.data.lots||[]).some(l => l.ex==='Offline Kid'));
});
ok('offline lot reached the server', offlineSynced);

const failed = results.filter(r=>!r.pass);
console.log('\n==== SUMMARY ====');
console.log('Passed:', results.filter(r=>r.pass).length, '/', results.length);
fs.writeFileSync(path.join(__dirname,'screens','test-results.json'), JSON.stringify(results,null,2));
await browser.close();
await app.close();
if (failed.length) {
  console.log('Failures:');
  failed.forEach(f=>console.log(' -', f.name, f.detail));
  process.exit(1);
}
} catch (err) {
  console.error(err);
  try { await browser.close(); } catch {}
  try { await app.close(); } catch {}
  process.exit(1);
}
