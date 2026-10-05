'use strict';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_MRZiKIO6GAyq9LJZg9O02Tlq3UxKb9pPSnlZS-74vYPPkMMd87b8PiOmEsArWG1q1xeOxr96DwRa/pub?gid=1675226732&single=true&output=csv';
const $ = s => document.querySelector(s);
const state = { data: [], cities: [], cats: [], city: '', cat: 'All', q: '' };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const norm = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const sizeKey = s => {
  const t = String(s || '').toLowerCase().replace(/\s/g, '');
  const m = t.match(/([\d.]+)(ml|l|ltr|litre|liter|cl)?/);
  if (!m) return t;
  let v = parseFloat(m[1]); const u = m[2] || 'ml';
  if (['l', 'ltr', 'litre', 'liter'].includes(u)) v *= 1000;
  if (u === 'cl') v *= 10;
  return Math.round(v) + 'ml';
};

/* ---------- Data mapping ---------- */
const FIELDS = {
  brand: ['brand', 'brandname', 'drink', 'item'],
  variant: ['variant', 'variantname', 'productname', 'product', 'sku', 'name'],
  category: ['category', 'type', 'drinktype', 'class'],
  size: ['size', 'volume', 'quantity', 'qty', 'ml', 'pack'],
  price: ['price', 'mrp', 'rate', 'cost', 'priceinr', 'amount'],
  city: ['city', 'location', 'market', 'state'],
  rating: ['rating', 'ratings', 'stars', 'score']
};
function pick(row, names) {
  const keys = Object.keys(row);
  for (const n of names) { const k = keys.find(k => norm(k) === n); if (k && String(row[k]).trim() !== '') return row[k]; }
  for (const n of names) { const k = keys.find(k => norm(k).includes(n)); if (k && String(row[k]).trim() !== '') return row[k]; }
  return '';
}
function mapRows(rows) {
  return rows.map((r, i) => {
    const o = {};
    for (const f in FIELDS) o[f] = String(pick(r, FIELDS[f])).trim();
    const price = parseFloat(o.price.replace(/[^\d.]/g, ''));
    const rating = parseFloat(o.rating.replace(/[^\d.]/g, ''));
    return { id: i, brand: o.brand || o.variant, name: o.variant || o.brand, category: title(o.category || 'Other'), size: o.size, sizeKey: sizeKey(o.size),
      price, rating: isNaN(rating) ? 0 : rating, city: title(o.city) };
  }).filter(d => d.brand && d.city && !isNaN(d.price));
}
const title = s => String(s).toLowerCase().replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const uniq = a => [...new Set(a)].sort((x, y) => x.localeCompare(y));

async function load() {
  skeleton();
  let text;
  try {
    const res = await fetch(CSV_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    text = await res.text();
    try { localStorage.setItem('dd-csv', text); } catch (e) {}
  } catch (e) {
    try { text = localStorage.getItem('dd-csv'); } catch (e2) {}
    if (!text) { $('#grid').innerHTML = '<div class="empty">Couldn’t load prices. Check your connection and reload.</div>'; return; }
    toast('Offline – showing saved prices');
  }
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  state.data = mapRows(parsed.data);
  state.cities = uniq(state.data.map(d => d.city));
  state.cats = uniq(state.data.map(d => d.category));
  state.city = state.cities[0] || '';
  initUI();
}

/* ---------- Browse ---------- */
function skeleton() { $('#grid').innerHTML = '<div class="sk"></div>'.repeat(8); }
function fillSelect(el, items, val) { el.innerHTML = items.map(c => `<option>${esc(c)}</option>`).join(''); if (val) el.value = val; }

function initUI() {
  fillSelect($('#city'), state.cities, state.city);
  fillSelect($('#home'), state.cities, state.cities[0]);
  fillSelect($('#dest'), state.cities, state.cities[1] || state.cities[0]);
  renderPills(); renderGrid();
}
function renderPills() {
  $('#pills').innerHTML = ['All', ...state.cats].map(c =>
    `<button class="pill ${c === state.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
function renderGrid() {
  const q = state.q.toLowerCase();
  const list = state.data.filter(d => d.city === state.city && (state.cat === 'All' || d.category === state.cat) &&
    (!q || (d.name + ' ' + d.brand).toLowerCase().includes(q))).sort((a, b) => b.rating - a.rating || a.price - b.price);
  $('#count').textContent = list.length ? `${list.length} drinks in ${state.city}` : '';
  $('#grid').innerHTML = list.length ? list.map(cardHTML).join('') : '<div class="empty">No drinks match. Try another category or search.</div>';
}
const stars = r => r ? `<span class="rating">★ ${r.toFixed(1)}</span>` : '<span class="muted">Not rated</span>';
function cardHTML(d) {
  return `<div class="card" tabindex="0" role="button" data-id="${d.id}">
    <button class="share" data-share="${d.id}" aria-label="Share ${esc(d.name)}">⤴</button>
    <div class="name">${esc(d.name)}</div>
    <div class="meta">${esc(d.category)} · ${esc(d.size || '—')}</div>
    <div class="price">${inr(d.price)}</div>${stars(d.rating)}</div>`;
}

/* ---------- Modal + alternatives ---------- */
function openModal(id) {
  const d = state.data[id] || state.data.find(x => x.id == id);
  const alts = state.data.filter(x => x.city === d.city && x.id !== d.id && (x.category === d.category || norm(x.brand) === norm(d.brand)))
    .sort((a, b) => b.rating - a.rating || Math.abs(a.price - d.price) - Math.abs(b.price - d.price)).slice(0, 8);
  $('#sheet-body').innerHTML = `<h2>${esc(d.name)}</h2>
    <p class="meta muted">${esc(d.category)} · ${esc(d.size || '—')} · ${esc(d.city)}</p>
    <div class="price">${inr(d.price)}</div>${stars(d.rating)}
    <p><button class="btn" data-share="${d.id}">Share this price</button></p>
    <h3>You might also like</h3>
    <div class="alts">${alts.map(a => `<button class="alt" data-id="${a.id}"><span>${esc(a.name)}<small>${esc(a.category)} · ${esc(a.size || '—')} · ${stars(a.rating).replace(/<[^>]+>/g, '')}</small></span><b class="price">${inr(a.price)}</b></button>`).join('') || '<p class="muted">No alternatives in this city yet.</p>'}</div>`;
  $('#modal').hidden = false; document.body.style.overflow = 'hidden';
  $('#sheet-body').parentElement.scrollTop = 0;
}
function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }

async function share(id) {
  const d = state.data.find(x => x.id == id);
  const text = `${d.name} ${d.size} – ${inr(d.price)} in ${d.city} (rated ${d.rating || 'n/a'}★) on Daru Desi`;
  const url = 'https://daru-desi.suvadipchakraborty.workers.dev/';
  try {
    if (navigator.share) await navigator.share({ title: 'Daru Desi', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Copied to clipboard'); }
  } catch (e) {}
}

/* ---------- Travel ---------- */
function findDeals() {
  const home = $('#home').value, dest = $('#dest').value, out = $('#deals');
  if (home === dest) { out.innerHTML = '<div class="empty">Choose two different cities.</div>'; return; }
  const minBy = city => { const m = new Map(); state.data.filter(d => d.city === city).forEach(d => {
    const k = norm(d.name) + '|' + d.sizeKey, c = m.get(k); if (!c || d.price < c.price) m.set(k, d); }); return m; };
  const h = minBy(home), t = minBy(dest), deals = [];
  t.forEach((d, k) => { const x = h.get(k); if (x && d.price < x.price) deals.push({ d, x, save: x.price - d.price }); });
  deals.sort((a, b) => b.save - a.save);
  out.innerHTML = deals.length ? deals.map(({ d, x, save }) =>
    `<div class="deal">Buy <b>${esc(d.name)} ${esc(d.size)}</b>. Costs ${inr(d.price)} in ${esc(dest)} vs ${inr(x.price)} in ${esc(home)}. <span class="save">You save ${inr(save)}!</span></div>`).join('')
    : `<div class="empty">No bottles are cheaper in ${esc(dest)} than in ${esc(home)}.</div>`;
}

/* ---------- Tabs, toast, PWA ---------- */
function showTab(t) {
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + t);
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  window.scrollTo(0, 0);
}
let tt; function toast(m) { const e = $('#toast'); e.textContent = m; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 2200); }

let deferred;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
window.addEventListener('appinstalled', () => { $('#install').hidden = true; toast('App saved'); });
$('#install').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; };
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) $('#ios-hint').hidden = false;
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

/* ---------- Events ---------- */
$('#gate-yes').onclick = () => { try { sessionStorage.setItem('dd-age', '1'); } catch (e) {} unlock(); };
$('#gate-no').onclick = () => { location.href = 'https://www.google.com'; };
function unlock() { $('#gate').classList.add('gone'); $('#app').inert = false; }
let ok = false; try { ok = sessionStorage.getItem('dd-age') === '1'; } catch (e) {}
if (ok) unlock();

document.querySelector('.tabs').onclick = e => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); };
$('#city').onchange = e => { state.city = e.target.value; renderGrid(); };
$('#search').oninput = e => { state.q = e.target.value.trim(); renderGrid(); };
$('#pills').onclick = e => { const p = e.target.closest('.pill'); if (p) { state.cat = p.dataset.cat; renderPills(); renderGrid(); } };
$('#find').onclick = findDeals;
document.addEventListener('click', e => {
  const s = e.target.closest('[data-share]'); if (s) { e.stopPropagation(); share(s.dataset.share); return; }
  const c = e.target.closest('.card, .alt'); if (c) openModal(c.dataset.id);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) { e.preventDefault(); openModal(e.target.dataset.id); }
});
$('#close').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

load();
