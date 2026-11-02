const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CIRC = 565.5;

// ---------- storage ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let sessions = load('sessions', []); // {id, date:'YYYY-MM-DD', ts, minutes, note}
let goals = load('goals', { day: 10, week: 70 });
const save = () => {
  localStorage.setItem('sessions', JSON.stringify(sessions));
  localStorage.setItem('goals', JSON.stringify(goals));
};

const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumMin = list => list.reduce((a, s) => a + s.minutes, 0);

// ---------- Tibetan bowl (synthesized) ----------
let ctx;
function bowl() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 9);
  master.connect(ctx.destination);
  // inharmonic partials typical of a singing bowl, each with a slow beating detune
  [[220, 1], [220 * 2.71, 0.5], [220 * 5.04, 0.25], [220 * 8.2, 0.1]].forEach(([f, a]) => {
    [0, 1.5].forEach(det => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f + det;
      g.gain.value = a * 0.5;
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 9);
    });
  });
}

// ---------- tabs ----------
$$('nav button').forEach(b => b.onclick = () => {
  $$('nav button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  renderAll();
});

// ---------- timer ----------
let minutes = 10, total = 0, endAt = 0, running = false, tick = null, pending = null;

const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function showTime(left) {
  $('#timeLeft').textContent = fmt(left);
  $('#timerBar').style.strokeDashoffset = total ? CIRC * (1 - left / total) : 0;
}

$$('.presets button').forEach(b => b.onclick = () => {
  minutes = +b.dataset.min;
  $('#customMin').value = '';
  $$('.presets button').forEach(x => x.classList.toggle('sel', x === b));
  showTime(minutes * 60);
});
$('#customMin').oninput = e => {
  const v = Math.max(1, Math.min(180, +e.target.value || 0));
  if (!v) return;
  minutes = v;
  $$('.presets button').forEach(x => x.classList.remove('sel'));
  showTime(minutes * 60);
};

$('#startBtn').onclick = () => {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); // unlock audio on user gesture
  if (ctx.state === 'suspended') ctx.resume();
  if (running) return;
  total = minutes * 60;
  endAt = Date.now() + total * 1000;
  running = true;
  $('#startBtn').hidden = true;
  $('#resetBtn').hidden = false;
  $('#setup').hidden = true;
  $('#reflect').hidden = true;
  bowl();
  tick = setInterval(update, 250);
  update();
};

function update() {
  const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  showTime(left);
  if (left === 0) finish(true);
}

$('#resetBtn').onclick = () => finish(false);

function finish(completed) {
  clearInterval(tick);
  running = false;
  const elapsed = Math.round(Math.min(total, total - (endAt - Date.now()) / 1000) / 60);
  $('#startBtn').hidden = false;
  $('#resetBtn').hidden = true;
  $('#setup').hidden = false;
  const mins = completed ? minutes : elapsed;
  total = 0;
  showTime(minutes * 60);
  if (completed) bowl();
  if (mins >= 1) {
    const now = new Date();
    pending = { id: now.getTime(), date: dateKey(now), ts: now.getTime(), minutes: mins, note: '' };
    sessions.push(pending);
    save();
    $('#reflect').hidden = false;
    $('#reflectText').value = '';
  }
  renderToday();
}

function closeReflect(withNote) {
  if (pending && withNote) { pending.note = $('#reflectText').value.trim(); save(); }
  pending = null;
  $('#reflect').hidden = true;
  renderAll();
}
$('#saveReflect').onclick = () => closeReflect(true);
$('#skipReflect').onclick = () => closeReflect(false);

function renderToday() {
  const m = sumMin(sessions.filter(s => s.date === dateKey(new Date())));
  $('#today').textContent = `Hoy: ${m} min de ${goals.day}`;
}

// ---------- journal ----------
function renderJournal() {
  const el = $('#journal');
  const list = sessions.filter(s => s.note).sort((a, b) => b.ts - a.ts);
  el.innerHTML = list.length ? '' : '<p class="muted">Aún no hay reflexiones.</p>';
  list.forEach(s => el.appendChild(entryEl(s)));
}
function entryEl(s) {
  const d = document.createElement('div');
  d.className = 'entry';
  const when = new Date(s.ts).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  d.innerHTML = `<small>${when} · ${s.minutes} min</small>`;
  if (s.note) { const p = document.createElement('p'); p.textContent = s.note; d.appendChild(p); }
  return d;
}

// ---------- calendar ----------
let view = new Date(); view.setDate(1);
$('#prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); renderCalendar(); };
$('#nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); renderCalendar(); };

function renderCalendar() {
  $('#monthTitle').textContent = view.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const el = $('#calendar');
  el.innerHTML = '';
  ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(d => el.insertAdjacentHTML('beforeend', `<div class="dow">${d}</div>`));
  const first = (view.getDay() + 6) % 7;
  for (let i = 0; i < first; i++) el.insertAdjacentHTML('beforeend', '<div class="day blank"></div>');
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const today = dateKey(new Date());
  for (let n = 1; n <= days; n++) {
    const key = dateKey(new Date(view.getFullYear(), view.getMonth(), n));
    const div = document.createElement('div');
    div.className = 'day' + (sessions.some(s => s.date === key) ? ' done' : '') + (key === today ? ' today' : '');
    div.textContent = n;
    div.onclick = () => showDay(key);
    el.appendChild(div);
  }
  $('#dayDetail').hidden = true;
}
function showDay(key) {
  const box = $('#dayDetail');
  const list = sessions.filter(s => s.date === key).sort((a, b) => a.ts - b.ts);
  box.hidden = false;
  box.innerHTML = `<h3>${key} · ${sumMin(list)} min</h3>`;
  if (!list.length) box.insertAdjacentHTML('beforeend', '<p class="muted">Sin sesiones.</p>');
  list.forEach(s => box.appendChild(entryEl(s)));
}

// ---------- goals ----------
function weekStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function renderGoals() {
  const day = sumMin(sessions.filter(s => s.date === dateKey(new Date())));
  const week = sumMin(sessions.filter(s => s.ts >= weekStart().getTime()));
  $('#dayBar').style.width = Math.min(100, day / goals.day * 100) + '%';
  $('#weekBar').style.width = Math.min(100, week / goals.week * 100) + '%';
  $('#dayText').textContent = day >= goals.day ? `¡Meta diaria cumplida! ${day}/${goals.day} min` : `${day}/${goals.day} min`;
  $('#weekText').textContent = week >= goals.week ? `¡Meta semanal cumplida! ${week}/${goals.week} min` : `${week}/${goals.week} min`;
  $('#goalDay').value = goals.day;
  $('#goalWeek').value = goals.week;
  // streak of consecutive days with a session (today may still be pending)
  const days = new Set(sessions.map(s => s.date));
  const d = new Date();
  if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(dateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  $('#streak').textContent = `${streak} ${streak === 1 ? 'día' : 'días'} 🔥`;
}
$('#goalDay').onchange = e => { goals.day = Math.max(1, +e.target.value || 1); save(); renderAll(); };
$('#goalWeek').onchange = e => { goals.week = Math.max(1, +e.target.value || 1); save(); renderAll(); };

function renderAll() { renderToday(); renderJournal(); renderCalendar(); renderGoals(); }
showTime(minutes * 60);
renderAll();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
