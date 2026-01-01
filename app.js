const DATA_URL = 'itinerary.json';
let DATA = null;

const state = {
  selectedCountry: 'הכל',
  limit: 24,
};

function el(id){ return document.getElementById(id); }
function show(node){ node.classList.remove('hidden'); }
function hide(node){ node.classList.add('hidden'); }

function escapeHtml(v){
  const s = String(v ?? '');
  return s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function mapsSearchUrl(q){
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || '');
}

function parseRoute(){
  const h = (location.hash || '#/').replace(/^#/, '');
  // Supported: #/ or #day=12
  if (h.startsWith('day=')){
    const idx = Number(h.slice(4)) - 1;
    return { name:'day', idx };
  }
  return { name:'home' };
}

async function loadData(){
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('לא הצלחתי לטעון itinerary.json (סטטוס ' + res.status + ')');
  return await res.json();
}

function buildCountryBar(data){
  const bar = el('countryBar');
  const countries = Array.from(new Set((data.days || [])
    .map(d => String(d.country || '').trim())
    .filter(Boolean)));
  countries.sort((a,b)=>a.localeCompare(b,'he'));
  const opts = ['הכל', ...countries];

  bar.innerHTML = opts.map(c=>{
    const cls = 'countryChip' + (c === state.selectedCountry ? ' isActive' : '');
    return '<button type="button" class="' + cls + '" data-country="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>';
  }).join('');

  bar.querySelectorAll('button[data-country]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.selectedCountry = btn.getAttribute('data-country') || 'הכל';
      state.limit = 24;
      renderHome(DATA);
    });
  });
}

function dayLabel(day){
  const date = String(day.date || '').trim();
  const loc = String(day.location || '').trim();
  const country = String(day.country || '').trim();
  const bits = [date, country, loc].filter(Boolean);
  return bits.join(' | ');
}

function renderDayCard(day, idx){
  const date = String(day.date || ('יום ' + (idx+1))).trim();
  const loc = String(day.location || 'לא צוין').trim();
  const country = String(day.country || 'לא צוין').trim();
  const lodging = String(day.lodging || '').trim() || 'לא צוין';
  const count = (day.places || []).length;

  const card = document.createElement('div');
  card.className = 'dayCard';
  card.innerHTML = `
    <div class="dayLeft">
      <div class="dayDate">${escapeHtml(date)}</div>
      <div class="dayLoc">${escapeHtml(loc)}</div>
      <div class="dayMeta">מדינה: ${escapeHtml(country)}<br>לינה: ${escapeHtml(lodging)}<br>מקומות: ${count}</div>
    </div>
    <div class="dayActions">
      <button type="button" class="btnSmall" data-open="${idx}">פירוט</button>
      <a class="btnSmall" target="_blank" rel="noopener" href="${mapsSearchUrl(loc + ' ' + country)}">מפות</a>
    </div>
  `;

  card.querySelector('button[data-open]').addEventListener('click', ()=>{
    location.hash = '#day=' + (idx+1);
  });

  return card;
}

function renderHome(data){
  hide(el('viewDay'));
  show(el('viewHome'));

  el('appTitle').textContent = data.title || 'מסלול הטיול שלי';
  el('appSub').textContent = 'בחר יום כדי לראות פירוט';

  const q = (el('q').value || '').trim().toLowerCase();
  const list = el('dayList');

  const allDays = (data.days || []).map((d,i)=>({day:d, idx:i}));

  const filtered = allDays.filter(({day})=>{
    const country = String(day.country || '').trim();
    const countryOk = (state.selectedCountry === 'הכל') || (country === state.selectedCountry);
    if (!countryOk) return false;
    if (!q) return true;
    const hay = [
      day.date, day.location, day.country, day.lodging,
      ...(day.transfers || []),
      ...(day.restaurants || []),
      ...(day.places || []).map(p=>p.name)
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  list.innerHTML = '';
  if (!filtered.length){
    list.innerHTML = '<div class="card"><div class="cardBody">לא נמצאו ימים תואמים. נסה לשנות מדינה או חיפוש.</div></div>';
    el('btnMore').classList.add('hidden');
    return;
  }

  const shown = filtered.slice(0, state.limit);
  const frag = document.createDocumentFragment();
  shown.forEach(({day, idx})=> frag.appendChild(renderDayCard(day, idx)));
  list.appendChild(frag);

  const btnMore = el('btnMore');
  if (state.limit >= filtered.length){
    btnMore.classList.add('hidden');
  } else {
    btnMore.classList.remove('hidden');
    btnMore.textContent = 'טען עוד (' + Math.min(filtered.length, state.limit + 24) + ' מתוך ' + filtered.length + ')';
    btnMore.onclick = ()=>{
      state.limit += 24;
      renderHome(data);
    };
  }
}

function placeCard(p, fallbackQuery){
  const name = String(p.name || '').trim();
  const type = String(p.type || 'מקום').trim();
  const desc = String(p.description || '').trim();
  const tips = String(p.tips || '').trim();
  let websiteRaw = String(p.website || '').trim();

  // Normalize website URL if user entered "www..."
  if (websiteRaw && websiteRaw.startsWith('www.')) websiteRaw = 'https://' + websiteRaw;

  const query = (name + ' ' + String(fallbackQuery || '')).trim();
  const mapsUrl = mapsSearchUrl(query);

  // Website button:
  // - If we have a real website URL, open it
  // - Otherwise open a Google search ("more info")
  const looksShortened = websiteRaw.includes('...');
  const looksMaps = websiteRaw.includes('google.com/maps');
  const hasWebsite = Boolean(websiteRaw) && !looksMaps && !looksShortened;

  const infoUrl = hasWebsite
    ? websiteRaw
    : ('https://www.google.com/search?q=' + encodeURIComponent(query));

  const infoLabel = hasWebsite ? 'אתר' : 'מידע נוסף';

  return `
    <div class="placeCard">
      <div class="placeTop">
        <div>
          <div class="placeName">${escapeHtml(name || 'מקום')}</div>
          <div class="placeType">${escapeHtml(type)}</div>
        </div>
        <div class="placeLinks">
          <a class="smallLink" target="_blank" rel="noopener" href="${mapsUrl}">מפות</a>
          <a class="smallLink" target="_blank" rel="noopener" href="${infoUrl}">${infoLabel}</a>
        </div>
      </div>
      ${desc ? `<div class="placeDesc">${escapeHtml(desc)}</div>` : ''}
      ${tips ? `<div class="placeTips"><b>טיפ:</b> ${escapeHtml(tips)}</div>` : ''}
      <div class="placeActions">
        <button class="smallBtn" data-copy="${escapeHtml(name)}">העתק שם</button>
      </div>
    </div>
  `;
}


function renderDay(data, idx){
  const day = (data.days || [])[idx];
  if (!day){
    location.hash = '#/';
    return;
  }

  hide(el('viewHome'));
  show(el('viewDay'));

  el('appTitle').textContent = data.title || 'מסלול הטיול שלי';
  el('appSub').textContent = dayLabel(day);

  const date = String(day.date || ('יום ' + (idx+1))).trim();
  const loc = String(day.location || 'לא צוין').trim();
  const country = String(day.country || 'לא צוין').trim();

  el('dayTitle').textContent = loc + (date ? (' (' + date + ')') : '');
  el('dayMeta').textContent = 'מדינה: ' + country;

  el('dayLodging').textContent = String(day.lodging || 'לא צוין');
  el('btnMapsDay').href = mapsSearchUrl(loc + ' ' + country);

  const transfers = el('dayTransfers');
  const t = day.transfers || [];
  transfers.innerHTML = t.length ? t.map(x=>'<li>' + escapeHtml(x) + '</li>').join('') : '<li>לא צוינו מעברים</li>';

  const r = day.restaurants || [];
  if (r.length){
    el('restaurantsCard').style.display = '';
    el('dayRestaurants').innerHTML = r.map(x=>'<li>' + escapeHtml(x) + '</li>').join('');
  } else {
    el('restaurantsCard').style.display = 'none';
    el('dayRestaurants').innerHTML = '';
  }

  const ps = day.places || [];
  const fallbackQuery = loc + ' ' + country;
  el('placesList').innerHTML = ps.length
    ? ps.map(p=>placeCard(p, fallbackQuery)).join('')
    : '<div class="cardBody">לא הוזנו אטרקציות ליום זה.</div>';

  document.querySelectorAll('[data-copy]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const text = btn.getAttribute('data-copy') || '';
      try { await navigator.clipboard.writeText(text); } catch(e) {}
      const old = btn.textContent;
      btn.textContent = 'הועתק';
      setTimeout(()=> btn.textContent = old, 900);
    });
  });
}

function route(){
  const r = parseRoute();
  if (r.name === 'day' && Number.isFinite(r.idx) && r.idx >= 0){
    renderDay(DATA, r.idx);
  } else {
    renderHome(DATA);
  }
}

(async function init(){
  DATA = await loadData();

  buildCountryBar(DATA);

  el('btnHome').addEventListener('click', ()=>{ location.hash = '#/'; });
  el('btnClear').addEventListener('click', ()=>{ el('q').value=''; renderHome(DATA); });
  el('q').addEventListener('input', ()=>{ if (parseRoute().name === 'home') renderHome(DATA); });

  window.addEventListener('hashchange', route);
  route();
})();
