(function () {
  const S = window.Store, $ = id => document.getElementById(id);
  const { tagHTML, isOut, outLabel, VET_NOTES, VET_OUT, hms, dur, sec, groups, sorted, startList, sheet, esc, STATUS, statusOf, numKey, byNum, parseTable, toParticipants, pName, pShort, pMap, RSTATUS, raceStatus, fmtDate, sortRaces, logoHTML, clubPlace, stageOf, ofStage, fmtKmh, kmText, results, neutralOf, start2Of, exportXlsx, reportPDF, vetMinOf, cierreOf, cierreMinOf } = window.R;
  let data = { raceId: null, race: null, arrivals: [], participants: [], meta: {} };
  let buf = '', sel = null, view = 'lleg', online = navigator.onLine;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let rol = lsGet('raid-rol') || 'completo';
  let stage = +(lsGet('raid-stage') || 1) === 2 ? 2 : 1;
  // Todas las llegadas del raid en data.all; en data.arrivals solo las de la etapa que se está cargando.
  function setData(d) { data = Object.assign({ participants: [] }, d); data.all = d.arrivals || []; data.arrivals = ofStage(data.all, stage); render(); }
  const addA = (t, n) => S.add(t, n, stage);

  R.registerSW();
  if (S.mode === 'demo') $('demo-banner').hidden = false;
  if (S.mode === 'nosdk') { $('nosdk-banner').hidden = false; setStatus('Sin conexión', 'bad'); return; }

  // ---------- Ingreso ----------
  let acc = { admin: false, clubs: [] }, races = [], clubs = {}, raceSel = null, unwatch = null, ticking = false, listening = false;
  function show(id) {
    ['login', 'pick', 'app'].forEach(k => { $(k).hidden = k !== id; if (k !== 'login') $(k).style.display = k === id ? 'flex' : 'none'; });
  }
  S.onAuth(async u => {
    if (!u) { if (unwatch) unwatch(); unwatch = null; raceSel = null; show('login'); return; }
    $('who').textContent = 'Conectado como ' + (u.email || '');
    $('pick-list').innerHTML = '<div class="table"><div class="empty-list">Cargando raids…</div></div>';
    show('pick');
    acc = await S.access();
    $('pick-admin').hidden = !acc.admin; $('admin-link').hidden = !acc.admin;
    $('pick-who').textContent = (u.email || '') + (acc.admin ? ' · Administrador FEU (todos los clubes)' : (acc.clubs.length ? '' : ''));
    if (!listening) {
      listening = true;
      S.watchClubs(list => { clubs = {}; list.forEach(c => { clubs[c.id] = c; }); renderPick(); if (raceSel) render(); });
      S.watchRaces(list => { races = list; renderPick(); if (raceSel) render(); });
    }
    const saved = lsGet('raid-sel');
    if (saved) choose(saved); else renderPick();
  });
  $('login-form').addEventListener('submit', e => {
    e.preventDefault(); $('login-msg').textContent = 'Entrando…'; $('login-msg').className = 'msg';
    S.signIn($('email').value.trim(), $('pass').value).then(() => { $('login-msg').textContent = ''; })
      .catch(() => { $('login-msg').textContent = 'No se pudo entrar: revisá el correo y la contraseña.' + (navigator.onLine ? '' : ' Necesitás señal para el primer ingreso.'); $('login-msg').className = 'msg warn'; });
  });
  $('forgot').addEventListener('click', () => {
    const e = $('email').value.trim();
    if (!e) { $('login-msg').textContent = 'Escribí tu correo arriba y tocá de nuevo "Olvidé mi contraseña".'; $('login-msg').className = 'msg warn'; return; }
    S.resetPassword(e).then(() => { $('login-msg').textContent = 'Te mandamos un correo a ' + e + ' para elegir una contraseña nueva. Revisá también el correo no deseado.'; $('login-msg').className = 'msg'; })
      .catch(() => { $('login-msg').textContent = 'No se pudo enviar el correo. Revisá que esté bien escrito.'; $('login-msg').className = 'msg warn'; });
  });
  $('logout').addEventListener('click', () => { lsSet('raid-sel', ''); S.signOut(); });
  $('pick-logout').addEventListener('click', () => { lsSet('raid-sel', ''); S.signOut(); });
  S.onError(e => { msg((e && e.code === 'permission-denied') ? 'Tu usuario no tiene permiso para cargar en este raid. Pedile a la FEU que te habilite para este club.' : 'Error al guardar: ' + ((e && e.message) || e), true); });

  // ---------- Elegir raid ----------
  const allowed = r => acc.admin || (r && acc.clubs.includes(r.clubId));
  function renderPick() {
    const mine = sortRaces(races.filter(allowed));
    const titles = { en_curso: 'En curso', proximo: 'Próximos', terminado: 'Terminados' };
    let h = '';
    ['en_curso', 'proximo', 'terminado'].forEach(k => {
      const l = mine.filter(r => raceStatus(r) === k); if (!l.length) return;
      h += '<div class="rsec ' + k + '"><h2><span class="dot"></span>' + titles[k] + '</h2><div class="rcards">';
      l.forEach(r => { const c = clubs[r.clubId];
        h += '<button class="rcard' + (r.id === raceSel ? ' sel' : '') + '" data-race="' + esc(r.id) + '">' + logoHTML(c, 44) + '<span><span class="rn">' + esc(r.name || 'Raid') + '</span><span class="rc">' + esc(clubPlace(r, c)) + '</span></span><span class="rd">' + esc(fmtDate(r.date)) + '</span></button>'; });
      h += '</div></div>';
    });
    if (!h) h = '<div class="card"><p>' + (acc.admin ? 'Todavía no hay raids. Crealos en <b>Administración</b>.' : (acc.clubs.length ? 'Tu club todavía no tiene raids cargados. Los crea la FEU.' : (acc.offline ? 'Sin señal: no se pudo comprobar tu usuario. Probá de nuevo con conexión.' : 'Tu usuario todavía no está asignado a ningún club. Pedile a la FEU que te habilite.'))) + '</p></div>';
    $('pick-list').innerHTML = h;
  }
  $('pick-list').addEventListener('click', e => { const b = e.target.closest('[data-race]'); if (b) choose(b.dataset.race); });
  $('change-raid').addEventListener('click', () => { if (unwatch) unwatch(); unwatch = null; raceSel = null; lsSet('raid-sel', ''); if (window.RaidTema) window.RaidTema.setClub(null); renderPick(); show('pick'); });
  function choose(id) {
    if (unwatch) unwatch();
    raceSel = id; lsSet('raid-sel', id);
    data = { raceId: id, race: null, arrivals: [], all: [], participants: [], meta: { fromCache: true } };
    sel = null; buf = ''; msg('');
    unwatch = S.watch(id, d => { if (d.error) return; setData(d); });
    show('app'); setView('lleg');
    if (!ticking) { ticking = true; setInterval(tick, 250); tick(); }
  }

  // ---------- Estado de conexión ----------
  function setStatus(t, cls) { const p = $('status'); p.textContent = t; p.className = 'pill ' + (cls || ''); }
  window.addEventListener('online', () => { online = true; renderStatus(); });
  window.addEventListener('offline', () => { online = false; renderStatus(); });
  function renderStatus() {
    if (S.mode === 'demo') return setStatus('Demostración', 'warn');
    if (!online) return setStatus(data.meta.pending ? 'Sin señal · pendiente de enviar' : 'Sin señal', 'bad');
    if (data.meta.pending) return setStatus('Enviando…', 'warn');
    setStatus('Guardado en línea', 'ok');
  }

  // ---------- Utilidades ----------
  const byId = id => data.arrivals.find(a => a.id === id);
  const pending = () => sorted(data.arrivals).filter(a => !a.num);
  const dup = (n, exceptId) => n && data.arrivals.some(a => a.num === n && a.id !== exceptId);
  const parts = () => data.participants || [];
  const pm = () => pMap(parts());
  function msg(t, warn) { $('msg').textContent = t || ''; $('msg').className = 'msg' + (warn ? ' warn' : ''); }
  function buzz() { if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {} }
  function validSel() {
    if (!sel) return null;
    if (sel.k === 'h' && !byId(sel.id)) return (sel = null);
    if (sel.k === 'g' && !data.arrivals.some(a => a.t === sel.t)) return (sel = null);
    return sel;
  }
  // Aviso según la lista de participantes
  function check(n, exceptId) {
    if (dup(n, exceptId)) return { warn: true, text: 'Ojo: el N° ' + n + ' ya estaba anotado.' };
    if (!parts().length) return { warn: false, text: '' };
    const p = pm()[n];
    if (!p) return { warn: true, text: 'Ojo: el N° ' + n + ' no está en la lista de participantes. Se anotó igual.' };
    const st = statusOf(p);
    if (st !== 'carrera') return { warn: true, text: 'Ojo: el N° ' + n + ' figura como ' + STATUS[st].toLowerCase() + '. Se anotó igual.' };
    return { warn: false, text: 'N° ' + n + (pName(p) ? ' · ' + pName(p) : '') };
  }
  let lock = null;
  async function keepAwake() { try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => lock = null); } } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

  // ---------- Rol ----------
  function applyRol() {
    document.querySelectorAll('[data-rol]').forEach(b => b.setAttribute('aria-pressed', b.dataset.rol === rol));
    $('mark').hidden = rol === 'planillero';
    $('same').hidden = rol === 'planillero';
    document.querySelector('.entry').hidden = rol === 'marcador';
  }
  document.querySelectorAll('[data-rol]').forEach(b => b.addEventListener('click', () => { rol = b.dataset.rol; lsSet('raid-rol', rol); buf = ''; msg(''); applyRol(); render(); }));
  applyRol();

  // ---------- Etapa ----------
  function applyStage() { document.querySelectorAll('[data-stage]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.stage === stage)); }
  document.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => {
    stage = +b.dataset.stage; lsSet('raid-stage', String(stage)); sel = null; buf = ''; msg('');
    data.arrivals = ofStage(data.all, stage); applyStage(); render();
  }));
  applyStage();

  // ---------- LLEGÓ ----------
  function mark() {
    if (rol === 'planillero') return;
    keepAwake();
    const t = sec(S.now());
    if (!data.race) { msg('Esperando los datos del raid…', true); return; }
    if (buf && rol === 'completo' && !pending().length && !validSel()) {
      const c = check(buf, null); msg(c.text, c.warn);
      addA(t, buf); buf = '';
    } else { addA(t, ''); msg(''); }
    buzz(); render();
  }
  $('mark').addEventListener('pointerdown', e => { e.preventDefault(); mark(); });
  $('mark').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mark(); } });

  function sameGroupTime() {
    const s = validSel();
    if (s && s.k === 'g') return s.t;
    if (s && s.k === 'h') return byId(s.id).t;
    const g = groups(data.arrivals); return g.length ? g[g.length - 1].t : null;
  }
  $('same').addEventListener('click', () => {
    const t = sameGroupTime(); if (t === null) return;
    if (buf && rol === 'completo') { const c = check(buf, null); msg(c.text, c.warn); addA(t, buf); buf = ''; }
    else { addA(t, ''); msg(''); }
    sel = null; buzz(); render();
  });

  // ---------- Números: teclado y panel ----------
  var padOpen = false;
  try { padOpen = localStorage.getItem('raid-pad') === '1'; } catch (e) {}
  $('padtoggle').addEventListener('click', () => {
    padOpen = !padOpen;
    try { localStorage.setItem('raid-pad', padOpen ? '1' : '0'); } catch (e) {}
    render();
  });
  $('pad').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k;
    if (k === 'del') buf = buf.slice(0, -1); else if (k === 'ok') assign(buf); else if (buf.length < 4) buf += k;
    render();
  });
  $('tiles').addEventListener('click', e => {
    const b = e.target.closest('[data-num]'); if (!b) return;
    assign(b.dataset.num); buzz(); render();
  });
  document.addEventListener('keydown', e => {
    if (view !== 'lleg' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || $('app').hidden || rol === 'marcador') return;
    if (/^[0-9]$/.test(e.key) && buf.length < 4) { buf += e.key; render(); }
    else if (e.key === 'Backspace') { buf = buf.slice(0, -1); render(); }
    else if (e.key === 'Enter' && document.activeElement !== $('mark')) { e.preventDefault(); assign(buf); render(); }
  });
  function target() {
    const s = validSel();
    if (s && s.k === 'h') return { k: 'h', a: byId(s.id) };
    if (s && s.k === 'g') return { k: 'g', t: s.t };
    const p = pending()[0]; return p ? { k: 'h', a: p } : null;
  }
  function assign(n) {
    n = numKey(n);
    const t = target();
    if (!n) { msg('Escribí o tocá el número del caballo.', true); return; }
    if (!t) {
      if (rol === 'planillero') { buf = ''; msg('No hay llegadas sin número. Esperá a que el marcador toque LLEGÓ.', true); return; }
      buf = n; msg('N° ' + n + ' listo: tocá LLEGÓ cuando cruce.'); return;
    }
    if (t.k === 'g') { const c = check(n, null); msg(c.text ? c.text + ' · agregado al grupo' : 'Agregado al grupo.', c.warn); addA(t.t, n); buf = ''; return; }
    const c = check(n, t.a.id); msg(c.text, c.warn);
    S.update(t.a.id, { num: n }); t.a.num = n; buf = ''; sel = null;
  }

  $('undo').addEventListener('click', () => {
    const me = S.me();
    const mine = data.arrivals.filter(a => a.by === me);
    if (!mine.length) { msg('No hay registros tuyos para deshacer.'); return; }
    const last = mine.reduce((a, b) => (b.seq || 0) >= (a.seq || 0) ? b : a);
    S.remove(last.id); sel = null;
    msg('Se quitó tu último registro (' + (last.num ? 'N° ' + last.num : 'sin número') + ', ' + hms(last.t) + ').');
  });

  // ---------- Lista de llegadas ----------
  $('list').addEventListener('click', e => {
    const x = e.target.closest('[data-act]'); if (!x) return;
    const act = x.dataset.act;
    if (act === 'horse') { const id = x.dataset.id; sel = (sel && sel.k === 'h' && sel.id === id) ? null : { k: 'h', id }; }
    else if (act === 'group') { const t = +x.dataset.t; sel = (sel && sel.k === 'g' && sel.t === t) ? null : { k: 'g', t }; }
    else if (act === 'addto') { sel = { k: 'g', t: +x.dataset.t }; msg('Escribí o tocá el número para sumarlo a este grupo.'); }
    else if (act === 'delh') { S.remove(x.dataset.id); sel = null; }
    else if (act === 'delg') {
      const t = +x.dataset.t, ids = data.arrivals.filter(a => a.t === t).map(a => a.id);
      if (ids.length > 1 && x.dataset.armed !== '1') { x.dataset.armed = '1'; x.textContent = '¿Borrar los ' + ids.length + '? Tocá de nuevo'; return; }
      S.removeMany(ids); sel = null; msg('Grupo borrado (' + ids.length + ' caballo' + (ids.length > 1 ? 's' : '') + ').');
    }
    else if (act === 'close') sel = null;
    render();
  });
  $('list').addEventListener('change', e => {
    if (e.target.id !== 'edit-time' || !e.target.value) return;
    const s = validSel(); if (!s) return;
    const [h, m, x] = e.target.value.split(':').map(Number);
    const moveT = old => { const d = new Date(old); d.setHours(h, m, x || 0, 0); return d.getTime(); };
    if (s.k === 'g') { const nt = moveT(s.t); S.moveGroup(data.arrivals.filter(a => a.t === s.t).map(a => a.id), nt); sel = { k: 'g', t: nt }; }
    else { const a = byId(s.id); S.update(a.id, { t: moveT(a.t) }); }
  });

  // ---------- Participantes ----------
  let parsed = null, replaceArmed = false;
  function preview() {
    replaceArmed = false; $('preplace').textContent = 'Reemplazar toda la lista';
    const rows = parseTable($('paste').value);
    parsed = toParticipants(rows);
    const ok = parsed.list.length > 0;
    $('pimport').disabled = !ok; $('preplace').disabled = !ok;
    if (!$('paste').value.trim()) { $('ppreview').textContent = ''; return; }
    if (!ok) { $('ppreview').textContent = 'No encontré números de caballo. Revisá que cada fila empiece con el número.'; $('ppreview').className = 'msg warn'; return; }
    const ex = parsed.list[0];
    $('ppreview').className = 'msg';
    $('ppreview').textContent = 'Encontré ' + parsed.list.length + ' caballos.' + (parsed.headers.length ? ' Columnas: ' + parsed.headers.join(', ') + '.' : '') + ' Ejemplo: N° ' + ex.num + (pName(ex) ? ' · ' + pName(ex) : '') + '.';
  }
  $('paste').addEventListener('input', preview);
  function loadScript(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
  $('pfile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    $('pfile-name').textContent = f.name;
    try {
      const buf2 = await f.arrayBuffer();
      let text;
      if (/\.xlsx?$/i.test(f.name)) {
        if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const wb = XLSX.read(buf2, { type: 'array' });
        text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t', blankrows: false });
      } else {
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf2); } catch (x) { text = new TextDecoder('windows-1252').decode(buf2); }
      }
      $('paste').value = text; preview();
    } catch (x) { $('ppreview').textContent = 'No pude leer el archivo. Probá copiar y pegar la lista.'; $('ppreview').className = 'msg warn'; }
    e.target.value = '';
  });
  async function doImport(replace) {
    if (!parsed || !parsed.list.length) return;
    if (!data.raceId) { $('pmsg').textContent = 'Elegí un raid primero.'; $('pmsg').className = 'msg warn'; return; }
    $('pmsg').textContent = 'Guardando…'; $('pmsg').className = 'msg';
    try {
      await S.importParticipants(parsed.list, replace);
      $('pmsg').textContent = 'Listo: ' + parsed.list.length + ' caballos ' + (replace ? 'en la lista. La lista anterior quedó guardada en una copia de seguridad.' : 'agregados o actualizados.');
      $('paste').value = ''; $('pfile-name').textContent = ''; preview();
    } catch (x) { $('pmsg').textContent = 'No se pudo guardar: ' + (x.message || x); $('pmsg').className = 'msg warn'; }
  }
  $('pimport').addEventListener('click', () => doImport(false));
  $('preplace').addEventListener('click', () => {
    if (!replaceArmed) { replaceArmed = true; $('preplace').textContent = '¿Seguro? Tocá de nuevo para reemplazar'; return; }
    doImport(true);
  });
  $('pclear').addEventListener('click', () => { $('pclear-confirm').hidden = false; });
  $('pclear-no').addEventListener('click', () => { $('pclear-confirm').hidden = true; });
  $('pclear-yes').addEventListener('click', async () => {
    $('pclear-confirm').hidden = true; $('pmsg').textContent = 'Guardando copia y borrando…'; $('pmsg').className = 'msg';
    try { await S.clearParticipants(); $('pmsg').textContent = 'Lista borrada. Quedó una copia de seguridad que un administrador puede restaurar.'; }
    catch (x) { $('pmsg').textContent = (x && x.message) || String(x); $('pmsg').className = 'msg warn'; }
  });
  $('psearch').addEventListener('input', renderParts);
  $('plist').addEventListener('change', e => {
    const s = e.target.closest('select[data-num]'); if (!s) return;
    S.setStatus(s.dataset.num, s.value);
  });

  function arrivedMap() {
    const m = {}; groups(ofStage(data.all, 1)).forEach((g, i) => g.horses.forEach(a => { if (a.num) m[a.num] = { t: g.t, g: i + 1 }; }));
    groups(ofStage(data.all, 2)).forEach((g, i) => g.horses.forEach(a => { if (a.num && m[a.num]) m[a.num].t2 = g.t; })); return m;
  }
  function renderParts() {
    const list = parts().slice().sort(byNum), am = arrivedMap();
    const c = { carrera: 0, llegados: 0, abandono: 0, retirado: 0 };
    list.forEach(p => { const st = statusOf(p); if (st === 'carrera') { if (am[p.num]) c.llegados++; else c.carrera++; } else c[st]++; });
    $('pstats').innerHTML = list.length
      ? '<span class="pstat"><b class="num">' + list.length + '</b>inscriptos</span><span class="pstat"><b class="num">' + c.carrera + '</b>en carrera sin llegar</span><span class="pstat"><b class="num">' + c.llegados + '</b>llegaron</span><span class="pstat"><b class="num">' + c.abandono + '</b>abandono</span><span class="pstat"><b class="num">' + c.retirado + '</b>retirados</span>'
      : '';
    const q = $('psearch').value.trim().toLowerCase();
    const shown = q ? list.filter(p => (p.num + ' ' + Object.values(p.data || {}).join(' ')).toLowerCase().includes(q)) : list;
    let h = '';
    if (!list.length) h = '<div class="empty-list">Todavía no hay participantes. Cargalos abajo.</div>';
    else if (!shown.length) h = '<div class="empty-list">Ningún participante coincide con "' + esc(q) + '".</div>';
    shown.forEach(p => {
      const st = statusOf(p), a = am[p.num];
      const extra = Object.keys(p.data || {}).filter(k => !/caballo|equino|animal|nombre|jinete|binomio|corredor|piloto/i.test(k)).map(k => p.data[k]).join(' · ');
      h += '<div class="prow st-' + st + '"><span class="pn2 num">' + esc(p.num) + '</span><span class="pi"><b>' + (esc(pName(p)) || '—') + '</b>' + (extra ? '<small>' + esc(extra) + '</small>' : '') + (a ? '<small class="arr num">1ª: llegó ' + hms(a.t) + ' · Grupo ' + a.g + (a.t2 ? ' · 2ª: llegó ' + hms(a.t2) : '') + '</small>' : '') + '</span>';
      h += '<select data-num="' + esc(p.num) + '" aria-label="Estado del N° ' + esc(p.num) + '">' + Object.keys(STATUS).map(k => '<option value="' + k + '"' + (k === st ? ' selected' : '') + '>' + STATUS[k] + '</option>').join('') + '</select></div>';
    });
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#plist')) return; // no redibujar mientras eligen un estado
    $('plist').innerHTML = h;
  }

  // ---------- Carrera ----------
  $('start1').addEventListener('change', e => S.setRace({ start1: e.target.value }));
  $('start0').addEventListener('change', e => S.setRace({ start0: e.target.value }));
  $('cierre').addEventListener('change', e => S.setRace({ cierre: e.target.value }));
  $('trofeo').addEventListener('change', e => S.setRace({ trofeo: e.target.value.trim() }));
  $('vetmin').addEventListener('change', e => { const v = e.target.value === '' ? 20 : Math.max(0, parseInt(e.target.value, 10) || 0); S.setRace({ vetMin: v }); });
  $('pdf').addEventListener('click', async () => {
    $('msg2').textContent = 'Preparando la planilla…';
    try { const f = await reportPDF(data.all, data.race, parts(), clubs[(data.race || {}).clubId]); $('msg2').textContent = 'Planilla lista: ' + f; }
    catch (x) { $('msg2').textContent = (x && x.message) || String(x); }
  });
  $('neutral').addEventListener('change', e => { const v = e.target.value === '' ? 60 : Math.max(0, parseInt(e.target.value, 10) || 0); S.setRace({ neutral: v }); });
  $('race-status').addEventListener('change', e => S.setRace({ status: e.target.value }));
  $('xlsx').addEventListener('click', async () => {
    $('msg2').textContent = 'Preparando el Excel…';
    try { await exportXlsx({ race: data.race, arrivals: data.all, participants: parts() }); $('msg2').textContent = 'Excel descargado.'; }
    catch (x) { $('msg2').textContent = (x && x.message) || String(x); }
  });
  $('backup-now').addEventListener('click', async () => {
    $('msg2').textContent = 'Guardando copia…';
    try { await S.backupNow('Copia manual'); $('msg2').textContent = 'Copia de seguridad guardada. Los administradores la ven en Administración → Copias.'; }
    catch (x) { $('msg2').textContent = (x && x.message) || String(x); }
  });
  $('copy').addEventListener('click', () => {
    const txt = sheet(data.all, data.race, parts()), box = $('copybox');
    const fb = () => { box.hidden = false; box.value = txt; box.select(); $('msg2').textContent = 'Seleccioná el texto y copialo.'; };
    try { navigator.clipboard.writeText(txt).then(() => { $('msg2').textContent = 'Planilla copiada. Se puede pegar en Excel o WhatsApp.'; }, fb); } catch (e) { fb(); }
  });

  const VIEWS = ['lleg', 'larg', 'vet', 'res', 'part', 'carr'];
  function setView(v) {
    view = v;
    VIEWS.forEach(k => {
      $('tab-' + k).setAttribute('aria-selected', k === v);
      $('view-' + k).hidden = k !== v; $('view-' + k).style.display = k === v ? 'flex' : 'none';
    });
  }
  VIEWS.forEach(k => $('tab-' + k).addEventListener('click', () => setView(k)));

  // ---------- Dibujo ----------
  function render() {
    validSel(); renderStatus();
    const race = data.race || {}, gs = groups(data.arrivals), pend = pending(), t = target(), P = pm();
    const club = clubs[race.clubId], gone = !data.race && !data.meta.fromCache;
    if (window.RaidTema) window.RaidTema.setClub(data.race ? club : null);
    $('race-logo').innerHTML = data.race ? logoHTML(club, 36) : '';
    $('race-name').innerHTML = esc(race.name || 'Raid') + '<small>' + esc(data.race ? clubPlace(race, club) : 'Cronometristas') + ' · ' + esc(fmtDate(race.date)) + '</small>';
    $('norace').hidden = !gone;
    $('done-banner').hidden = !(data.race && raceStatus(data.race) === 'terminado');
    $('mark').disabled = gone;
    $('carr-logo').innerHTML = logoHTML(club, 48);
    $('carr-name').textContent = race.name || 'Raid';
    $('carr-sub').textContent = clubPlace(race, club) + ' · ' + fmtDate(race.date) + ' · ' + RSTATUS[raceStatus(race)];
    if (document.activeElement !== $('race-status')) $('race-status').value = RSTATUS[race.status] ? race.status : '';
    $('public-link').href = 'index.html#' + encodeURIComponent(data.raceId || '');
    if (document.activeElement !== $('start1')) $('start1').value = race.start1 || '';
    if (document.activeElement !== $('start0')) $('start0').value = race.start0 || '';
    if (document.activeElement !== $('neutral')) $('neutral').value = neutralOf(race);
    if (document.activeElement !== $('cierre')) $('cierre').value = race.cierre || '';
    { const c = cierreOf(race, data.all), m = cierreMinOf(race);
      const autoTxt = (() => { const r2 = Object.assign({}, race, { cierre: '' }); return cierreOf(r2, data.all).hora; })();
      $('cierre-auto').textContent = race.cierre ? 'Cargado a mano. Si lo borrás, se calcula solo' + (autoTxt ? ': ' + autoTxt + '.' : '.') : (c.hora ? 'Calculado solo: ' + c.hora + ' (llegada del 1° en la 2ª etapa + ' + m + ' min). Solo cargalo si querés cambiarlo.' : 'Se calcula solo cuando llega el primero de la 2ª etapa: su llegada + ' + m + ' min (' + (m === 60 ? 'raid de 90 km o más' : 'raid de menos de 90 km') + ').'); }
    if (document.activeElement !== $('trofeo')) $('trofeo').value = race.trofeo || '';
    if (document.activeElement !== $('vetmin')) $('vetmin').value = vetMinOf(race);
    { const a1 = ofStage(data.all, 1), auto = a1.length ? hms(Math.min.apply(null, a1.map(a => a.t)) + neutralOf(race) * 60000) : '';
      $('start1-auto').textContent = race.start1 ? 'Cargada a mano. Si la borrás, se calcula sola' + (auto ? ': ' + auto + '.' : '.') : (auto ? 'Calculada sola: ' + auto + ' (llegada del 1° + ' + neutralOf(race) + ' min). Solo cargala si querés cambiarla.' : 'Se calcula sola cuando llega el primero de la 1ª etapa: su llegada + ' + neutralOf(race) + ' min.'); }
    $('buf').textContent = buf || '000'; $('buf').classList.toggle('empty', !buf);

    let tg;
    if (t && t.k === 'g') tg = 'Sumar caballo al <b>Grupo ' + (gs.findIndex(g => g.t === t.t) + 1) + '</b> (' + hms(t.t) + ')';
    else if (t) tg = 'Número para <b>Grupo ' + (gs.findIndex(g => g.t === t.a.t) + 1) + '</b> · ' + hms(t.a.t) + (t.a.num ? ' (hoy N° ' + esc(t.a.num) + ')' : '') + (pend.length > 1 ? ' · faltan ' + pend.length : '');
    else if (rol === 'planillero') tg = 'Esperando llegadas del marcador';
    else tg = buf ? 'Número listo: tocá <b>LLEGÓ</b> cuando cruce' : 'Tocá <b>LLEGÓ</b> y después cargá los números';
    $('target').innerHTML = tg;
    $('mark-sub').textContent = pend.length ? (pend.length + ' caballo' + (pend.length > 1 ? 's' : '') + ' sin número') : (buf && rol === 'completo' && !validSel() ? 'Anota al N° ' + buf + ' con la hora exacta' : 'Tocá una vez por cada caballo que cruza');
    const st = sameGroupTime();
    $('same').disabled = st === null;
    $('same-sub').textContent = st === null ? 'Primero marcá una llegada' : 'Suma un caballo al Grupo ' + (gs.findIndex(g => g.t === st) + 1) + ' (' + hms(st) + ')';
    $('count').textContent = (data.arrivals.length ? data.arrivals.length + ' caballos · ' + gs.length + ' grupos' : '') + ' · ' + stage + 'ª etapa';

    // Panel de números: solo en carrera y sin llegar; filtrado por lo que se va tecleando
    const arrived = new Set(data.arrivals.map(a => a.num).filter(Boolean));
    const in1 = new Set(ofStage(data.all, 1).map(a => a.num).filter(Boolean));
    // En la 2ª etapa solo corren los que llegaron en la 1ª
    const avail = parts().filter(p => statusOf(p) === 'carrera' && !(stage === 2 && p.noLarga) && !arrived.has(p.num) && (stage === 1 || !in1.size || in1.has(p.num))).sort(byNum);
    $('tiles-wrap').hidden = !parts().length;
    // Con lista de participantes alcanza con tocar el número: el teclado queda guardado
    const conLista = parts().length > 0;
    $('padtoggle').hidden = !conLista;
    $('pad').hidden = conLista && !padOpen;
    $('padtoggle').textContent = padOpen ? 'Ocultar teclado' : 'Número que no está en la lista: abrir teclado';
    $('tiles').classList.toggle('tall', conLista && !padOpen);
    const filt = buf ? avail.filter(p => String(p.num).startsWith(buf)) : avail;
    $('tiles-title').innerHTML = '<b class="num">' + avail.length + '</b> en carrera sin llegar' + (buf ? ' · empiezan con ' + esc(buf) : '');
    $('tiles').innerHTML = filt.length ? filt.map(p => '<button class="tile num" data-num="' + esc(p.num) + '">' + esc(p.num) + '<small>' + tagHTML(p) + '</small></button>').join('')
      : '<div class="none">' + (avail.length ? 'Ningún caballo en carrera empieza con ' + esc(buf) + '. Si igual es ese número, tocá OK.' : 'Ya llegaron todos los caballos en carrera.') + '</div>';

    let h = '', pos = 0; const f = gs[0];
    if (!gs.length) h = '<div class="table"><div class="empty-list">Todavía no llegó ningún caballo a la ' + stage + 'ª etapa.</div></div>';
    gs.forEach((g, i) => {
      const gSel = sel && sel.k === 'g' && sel.t === g.t;
      const diff = i === 0 ? '1°' : '+' + dur(g.t - f.t), dprev = i === 0 ? '' : '+' + dur(g.t - gs[i - 1].t) + ' del anterior';
      h += '<div class="grp' + (i === 0 ? ' first' : '') + (gSel ? ' selected' : '') + '">';
      h += '<button class="ghead" data-act="group" data-t="' + g.t + '"><span class="gname">Grupo ' + (i + 1) + '</span><span class="gtime num">' + hms(g.t) + ' · ' + g.horses.length + ' cab.</span><span class="gdiff num">' + diff + (dprev ? '<small>' + dprev + '</small>' : '') + '</span></button><div class="chips">';
      g.horses.forEach(a => { pos++; const s = sel && sel.k === 'h' && sel.id === a.id; const p = P[a.num];
        h += '<button class="chip num' + (a.num ? '' : ' pending') + (s ? ' selected' : '') + '" data-act="horse" data-id="' + esc(a.id) + '">' + (esc(a.num) || '?') + (p && pShort(p) ? '<span class="nm">' + tagHTML(p) + '</span>' : '') + '<small>' + pos + '°</small></button>'; });
      h += '<button class="chip add" data-act="addto" data-t="' + g.t + '" aria-label="Sumar caballo a este grupo">+</button></div>';
      if (gSel) h += '<div class="edit"><span class="hint">Corregir la hora de todo el grupo:</span><input id="edit-time" type="time" step="1" value="' + hms(g.t) + '"><button class="ghost danger" data-act="delg" data-t="' + g.t + '">Borrar grupo</button><button class="ghost" data-act="close">Listo</button></div>';
      const hs = g.horses.find(a => sel && sel.k === 'h' && sel.id === a.id);
      if (hs) h += '<div class="edit"><span class="hint">Para cambiar el N°, escribilo o tocalo en el panel. Si llegó en otro segundo, cambiale la hora:</span><input id="edit-time" type="time" step="1" value="' + hms(hs.t) + '"><button class="ghost danger" data-act="delh" data-id="' + esc(hs.id) + '">Quitar caballo</button><button class="ghost" data-act="close">Listo</button></div>';
      h += '</div>';
    });
    if (!(document.activeElement && document.activeElement.id === 'edit-time')) $('list').innerHTML = h;

    // Largada: los que abandonaron o se retiraron figuran tachados y no largan
    const rows = startList(ofStage(data.all, 1), start2Of(race, data.all));
    $('startlist').innerHTML = window.R.startTableHTML(rows, P);
    renderParts();
    renderRes();
    renderVet();
  }

  // ---------- Veterinaria ----------
  function renderVet() {
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#vetlist')) return; // no redibujar mientras escriben
    const P = pm(), vm = vetMinOf(data.race || {});
    const a1 = sorted(ofStage(data.all, 1)).filter(a => a.num), seen = new Set();
    const rows = a1.filter(a => !seen.has(a.num) && seen.add(a.num));
    if (!rows.length) { $('vetlist').innerHTML = '<div class="empty-list">Todavía no llegó ningún caballo a la 1ª etapa.</div>'; return; }
    $('vetlist').innerHTML = rows.map((a, i) => {
      const p = P[a.num] || {}, no = !!p.noLarga;
      return '<div class="vrow' + (no ? ' no' : '') + '" data-num="' + esc(a.num) + '"><span class="pos num">' + (i + 1) + '</span><span class="n num">' + esc(a.num) + (pShort(p) ? '<small>' + tagHTML(p) + '</small>' : '') + '</span>'
        + '<span class="t num">Llegó <b>' + hms(a.t) + '</b> · control hasta <b>' + hms(a.t + vm * 60000) + '</b></span>'
        + '<div class="ctl"><input type="number" inputmode="numeric" placeholder="FC" aria-label="Frecuencia cardíaca del N° ' + esc(a.num) + '" data-f="fc" value="' + esc(p.fc != null ? p.fc : '') + '">'
        + '<select data-f="vetNote" aria-label="Motivo"><option value="">Sin observación</option>' + VET_NOTES.map(n => '<option' + (p.vetNote === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>'
        + '<label><input type="checkbox" data-f="noLarga"' + (no ? ' checked' : '') + '> No larga</label></div></div>';
    }).join('');
  }
  $('vetlist').addEventListener('change', e => {
    const row = e.target.closest('.vrow'); if (!row) return;
    const num = row.dataset.num, f = e.target.dataset.f;
    if (f === 'fc') S.setVet(num, { fc: e.target.value === '' ? null : parseInt(e.target.value, 10) });
    else if (f === 'vetNote') { const v = e.target.value, nl = VET_OUT.includes(v); S.setVet(num, { vetNote: v, noLarga: nl }); row.querySelector('[data-f="noLarga"]').checked = nl; row.classList.toggle('no', nl); }
    else if (f === 'noLarga') { S.setVet(num, { noLarga: e.target.checked }); row.classList.toggle('no', e.target.checked); }
  });
  $('vetlist').addEventListener('focusout', () => setTimeout(() => { if (!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#vetlist'))) renderVet(); }, 50));

  // ---------- Resultados ----------
  function renderRes() {
    const race = data.race || {}, res = results(data.all, race, parts()), S2 = res.summary;
    const box = (l, km, o, cls) => '<div class="rbox' + (cls || '') + '"><span class="l">' + l + '</span><span class="k">' + km + '</span><span class="v num">' + fmtKmh(o.avg) + '</span><span class="s">promedio de ' + o.n + ' caballo' + (o.n === 1 ? '' : 's') + (o.best != null ? ' · ' + (cls ? 'ganador' : 'más rápido') + ': ' + fmtKmh(o.best) : '') + '</span></div>';
    $('resum').innerHTML = box('1ª etapa', res.km1 ? res.km1.toString().replace('.', ',') + ' km' : 'sin km', S2.v1) + box('2ª etapa', res.km2 ? res.km2.toString().replace('.', ',') + ' km' : 'sin km', S2.v2) + box('Raid completo', kmText(race) || 'sin km', S2.vt, ' total');
    const warn = [];
    if (!res.km1 || !res.km2) warn.push('Faltan los kilómetros de cada etapa: los carga la FEU en Administración → Raids.');
    if (!res.hasStart0) warn.push('Falta la hora de largada de la 1ª etapa (pestaña Largada).');
    if (res.start2 === null) warn.push('Todavía no llegó ningún caballo a la 1ª etapa: la largada de la 2ª se calcula con la llegada del primero.');
    $('res-warn').hidden = !warn.length; $('res-warn').innerHTML = warn.map(esc).join('<br>');
    let h = '<thead><tr><th>Pos.</th><th>N°</th><th>1ª etapa</th><th>2ª etapa</th><th>General</th></tr></thead><tbody>';
    if (!res.rows.length) h += '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Todavía no hay llegadas.</td></tr>';
    res.rows.forEach(r => {
      const cell = (e, v) => e != null ? dur(e) + '<span class="sub">' + fmtKmh(v) + '</span>' : '—';
      h += '<tr class="' + (r.out ? 'out' : '') + (r.pos === 1 ? ' first' : '') + '"><td class="p">' + (r.pos ? r.pos + '°' : (r.out ? '<small style="font-size:12px">' + outLabel(r.p) + '</small>' : '—')) + '</td><td class="n">' + esc(r.num) + (r.p && pShort(r.p) ? '<small>' + tagHTML(r.p) + '</small>' : '') + '</td><td>' + cell(r.e1, r.v1) + '</td><td>' + cell(r.e2, r.v2) + '</td><td class="vt">' + (r.tot != null ? dur(r.tot) + '<span class="sub">' + fmtKmh(r.vt) + '</span>' : '—') + '</td></tr>';
    });
    $('restable').innerHTML = h + '</tbody>';
  }

  function tick() {
    const now = S.now(); $('clock').textContent = hms(now);
    const ci = S.clockInfo();
    $('clocklbl').textContent = S.mode === 'firebase' ? (ci.synced ? 'Hora del servidor' : 'Hora (ajuste guardado)') : 'Hora del teléfono';
    $('clockinfo').textContent = S.mode === 'firebase' ? (ci.synced ? 'Reloj sincronizado con el servidor (este teléfono estaba ' + (Math.abs(ci.offset) < 1000 ? 'en hora' : (ci.offset > 0 ? 'atrasado ' : 'adelantado ') + dur(ci.offset)) + ').' : 'Reloj todavía sin sincronizar: se usa el último ajuste guardado.') : '';
    const f = groups(data.arrivals)[0]; $('since').textContent = f ? '+' + dur(sec(now) - f.t) : '—';
  }
})();
