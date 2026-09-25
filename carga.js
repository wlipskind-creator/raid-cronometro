(function () {
  const S = window.Store, $ = id => document.getElementById(id);
  const { hms, dur, sec, groups, sorted, startList, sheet, esc } = window.R;
  let data = { raceId: null, race: null, arrivals: [], meta: {} };
  let buf = '', sel = null, view = 'lleg', online = navigator.onLine, lastErr = '';

  R.registerSW();
  if (S.mode === 'demo') $('demo-banner').hidden = false;
  if (S.mode === 'nosdk') { $('nosdk-banner').hidden = false; setStatus('Sin conexión', 'bad'); return; }

  // ---------- Ingreso ----------
  S.onAuth(u => {
    $('login').hidden = !!u; $('app').hidden = !u;
    if (u) { $('who').textContent = 'Conectado como ' + (u.email || ''); start(); }
  });
  $('login-form').addEventListener('submit', e => {
    e.preventDefault(); $('login-msg').textContent = 'Entrando…'; $('login-msg').className = 'msg';
    S.signIn($('email').value.trim(), $('pass').value).then(() => { $('login-msg').textContent = ''; })
      .catch(err => { $('login-msg').textContent = 'No se pudo entrar: revisá el correo y la contraseña.' + (navigator.onLine ? '' : ' Necesitás señal para el primer ingreso.'); $('login-msg').className = 'msg warn'; });
  });
  $('logout').addEventListener('click', () => S.signOut());
  S.onError(e => { lastErr = (e && e.code === 'permission-denied') ? 'Tu usuario no tiene permiso para cargar datos. Pedile al organizador que te habilite.' : 'Error al guardar: ' + ((e && e.message) || e); msg(lastErr, true); });

  let started = false;
  function start() {
    if (started) return; started = true;
    S.watch(d => { if (d.error) return; data = d; render(); });
    setInterval(tick, 250); tick();
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
  function msg(t, warn) { $('msg').textContent = t || ''; $('msg').className = 'msg' + (warn ? ' warn' : ''); }
  function buzz() { if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {} }
  function validSel() {
    if (!sel) return null;
    if (sel.k === 'h' && !byId(sel.id)) return (sel = null);
    if (sel.k === 'g' && !data.arrivals.some(a => a.t === sel.t)) return (sel = null);
    return sel;
  }
  let lock = null;
  async function keepAwake() { try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => lock = null); } } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

  // ---------- LLEGÓ ----------
  function mark() {
    keepAwake();
    const t = sec(S.now());
    if (!data.raceId) { msg('No hay carrera activa. Creala en la pestaña Carrera.', true); return; }
    if (buf && !pending().length && !validSel()) {
      if (dup(buf, null)) msg('Ojo: el N° ' + buf + ' ya estaba anotado.', true); else msg('');
      S.add(t, buf); buf = '';
    } else { S.add(t, ''); msg(''); }
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
    if (buf) { if (dup(buf, null)) msg('Ojo: el N° ' + buf + ' ya estaba anotado.', true); else msg(''); S.add(t, buf); buf = ''; }
    else { S.add(t, ''); msg(''); }
    sel = null; buzz(); render();
  });

  // ---------- Teclado ----------
  $('pad').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k;
    if (k === 'del') buf = buf.slice(0, -1); else if (k === 'ok') applyNum(); else if (buf.length < 4) buf += k;
    render();
  });
  document.addEventListener('keydown', e => {
    if (view !== 'lleg' || e.target.tagName === 'INPUT' || $('app').hidden) return;
    if (/^[0-9]$/.test(e.key) && buf.length < 4) { buf += e.key; render(); }
    else if (e.key === 'Backspace') { buf = buf.slice(0, -1); render(); }
    else if (e.key === 'Enter' && document.activeElement !== $('mark')) { e.preventDefault(); applyNum(); render(); }
  });
  function target() {
    const s = validSel();
    if (s && s.k === 'h') return { k: 'h', a: byId(s.id) };
    if (s && s.k === 'g') return { k: 'g', t: s.t };
    const p = pending()[0]; return p ? { k: 'h', a: p } : null;
  }
  function applyNum() {
    const t = target();
    if (!buf) { msg('Escribí el número del caballo.', true); return; }
    if (!t) { msg('Tocá LLEGÓ cuando cruce: el N° ' + buf + ' se anota con esa hora.'); return; }
    if (t.k === 'g') {
      if (dup(buf, null)) msg('Ojo: el N° ' + buf + ' ya estaba anotado.', true); else msg('Se agregó el N° ' + buf + ' al grupo.');
      S.add(t.t, buf); buf = ''; return;
    }
    if (dup(buf, t.a.id)) msg('Ojo: el N° ' + buf + ' ya estaba anotado en otro lugar.', true); else msg('');
    S.update(t.a.id, { num: buf }); t.a.num = buf; buf = ''; sel = null;
  }

  $('undo').addEventListener('click', () => {
    const me = S.me();
    const mine = data.arrivals.filter(a => a.by === me);
    if (!mine.length) { msg('No hay registros tuyos para deshacer.'); return; }
    const last = mine.reduce((a, b) => (b.seq || 0) >= (a.seq || 0) ? b : a);
    S.remove(last.id); sel = null;
    msg('Se quitó tu último registro (' + (last.num ? 'N° ' + last.num : 'sin número') + ', ' + hms(last.t) + ').');
  });

  // ---------- Lista ----------
  $('list').addEventListener('click', e => {
    const x = e.target.closest('[data-act]'); if (!x) return;
    const act = x.dataset.act;
    if (act === 'horse') { const id = x.dataset.id; sel = (sel && sel.k === 'h' && sel.id === id) ? null : { k: 'h', id }; }
    else if (act === 'group') { const t = +x.dataset.t; sel = (sel && sel.k === 'g' && sel.t === t) ? null : { k: 'g', t }; }
    else if (act === 'addto') { sel = { k: 'g', t: +x.dataset.t }; msg('Escribí el número y tocá OK para sumarlo a este grupo.'); }
    else if (act === 'delh') { S.remove(x.dataset.id); sel = null; }
    else if (act === 'delg') { const t = +x.dataset.t; S.removeMany(data.arrivals.filter(a => a.t === t).map(a => a.id)); sel = null; }
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

  // ---------- Carrera ----------
  $('start1').addEventListener('change', e => S.setRace({ start1: e.target.value }));
  $('race-input').addEventListener('change', e => S.setRace({ name: e.target.value.trim() }));
  $('new-race').addEventListener('click', () => { $('new-confirm').hidden = false; });
  $('new-no').addEventListener('click', () => { $('new-confirm').hidden = true; });
  $('new-yes').addEventListener('click', () => { S.newRace($('new-name').value.trim() || 'Raid'); $('new-name').value = ''; $('new-confirm').hidden = true; sel = null; buf = ''; setView('lleg'); });
  $('copy').addEventListener('click', () => {
    const txt = sheet(data.arrivals, data.race && data.race.start1), box = $('copybox');
    const fb = () => { box.hidden = false; box.value = txt; box.select(); $('msg2').textContent = 'Seleccioná el texto y copialo.'; };
    try { navigator.clipboard.writeText(txt).then(() => { $('msg2').textContent = 'Planilla copiada. Se puede pegar en Excel o WhatsApp.'; }, fb); } catch (e) { fb(); }
  });

  function setView(v) {
    view = v;
    ['lleg', 'larg', 'carr'].forEach(k => {
      $('tab-' + k).setAttribute('aria-selected', k === v);
      $('view-' + k).hidden = k !== v; $('view-' + k).style.display = k === v ? 'flex' : 'none';
    });
  }
  ['lleg', 'larg', 'carr'].forEach(k => $('tab-' + k).addEventListener('click', () => setView(k)));

  // ---------- Dibujo ----------
  function render() {
    validSel(); renderStatus();
    const race = data.race || {}, gs = groups(data.arrivals), pend = pending(), t = target();
    $('race-name').innerHTML = esc(race.name || 'Raid') + '<small>Cronometristas · llegadas 1ª etapa</small>';
    $('norace').hidden = !!data.raceId;
    $('mark').disabled = !data.raceId;
    if (document.activeElement !== $('race-input')) $('race-input').value = race.name || '';
    if (document.activeElement !== $('start1')) $('start1').value = race.start1 || '';
    $('buf').textContent = buf || '000'; $('buf').classList.toggle('empty', !buf);

    let tg;
    if (t && t.k === 'g') tg = 'Sumar caballo al <b>Grupo ' + (gs.findIndex(g => g.t === t.t) + 1) + '</b> (' + hms(t.t) + ')';
    else if (t) tg = 'Número para <b>Grupo ' + (gs.findIndex(g => g.t === t.a.t) + 1) + '</b> · ' + hms(t.a.t) + (t.a.num ? ' (hoy N° ' + esc(t.a.num) + ')' : '');
    else tg = buf ? 'Número listo: tocá <b>LLEGÓ</b> cuando cruce' : 'Tocá <b>LLEGÓ</b> y después cargá los números';
    $('target').innerHTML = tg;
    $('mark-sub').textContent = pend.length ? (pend.length + ' caballo' + (pend.length > 1 ? 's' : '') + ' sin número') : (buf && !validSel() ? 'Anota al N° ' + buf + ' con la hora exacta' : 'Tocá una vez por cada caballo que cruza');
    const st = sameGroupTime();
    $('same').disabled = st === null;
    $('same-sub').textContent = st === null ? 'Primero marcá una llegada' : 'Suma un caballo al Grupo ' + (gs.findIndex(g => g.t === st) + 1) + ' (' + hms(st) + ')';
    $('count').textContent = data.arrivals.length ? data.arrivals.length + ' caballos · ' + gs.length + ' grupos' : '';

    let h = '', pos = 0; const f = gs[0];
    if (!gs.length) h = '<div class="table"><div class="empty-list">Todavía no llegó ningún caballo.</div></div>';
    gs.forEach((g, i) => {
      const gSel = sel && sel.k === 'g' && sel.t === g.t;
      const diff = i === 0 ? '1°' : '+' + dur(g.t - f.t), dprev = i === 0 ? '' : '+' + dur(g.t - gs[i - 1].t) + ' del anterior';
      h += '<div class="grp' + (i === 0 ? ' first' : '') + (gSel ? ' selected' : '') + '">';
      h += '<button class="ghead" data-act="group" data-t="' + g.t + '"><span class="gname">Grupo ' + (i + 1) + '</span><span class="gtime num">' + hms(g.t) + ' · ' + g.horses.length + ' cab.</span><span class="gdiff num">' + diff + (dprev ? '<small>' + dprev + '</small>' : '') + '</span></button><div class="chips">';
      g.horses.forEach(a => { pos++; const s = sel && sel.k === 'h' && sel.id === a.id;
        h += '<button class="chip num' + (a.num ? '' : ' pending') + (s ? ' selected' : '') + '" data-act="horse" data-id="' + esc(a.id) + '">' + (esc(a.num) || '?') + '<small>' + pos + '°</small></button>'; });
      h += '<button class="chip add" data-act="addto" data-t="' + g.t + '" aria-label="Sumar caballo a este grupo">+</button></div>';
      if (gSel) h += '<div class="edit"><span class="hint">Corregir la hora de todo el grupo:</span><input id="edit-time" type="time" step="1" value="' + hms(g.t) + '"><button class="ghost danger" data-act="delg" data-t="' + g.t + '">Borrar grupo</button><button class="ghost" data-act="close">Listo</button></div>';
      const hs = g.horses.find(a => sel && sel.k === 'h' && sel.id === a.id);
      if (hs) h += '<div class="edit"><span class="hint">Para cambiar el N°, escribilo y tocá OK. Si llegó en otro segundo, cambiale la hora:</span><input id="edit-time" type="time" step="1" value="' + hms(hs.t) + '"><button class="ghost danger" data-act="delh" data-id="' + esc(hs.id) + '">Quitar caballo</button><button class="ghost" data-act="close">Listo</button></div>';
      h += '</div>';
    });
    if (document.activeElement && document.activeElement.id === 'edit-time') { /* no redibujar mientras se edita la hora */ }
    else $('list').innerHTML = h;

    // Largada
    const rows = startList(data.arrivals, race.start1);
    let s = '<div class="row hd"><span>Orden</span><span>N°</span><span>Grupo</span><span>Diferencia</span><span>Largada</span></div>';
    if (!rows.length) s += '<div class="empty-list">Sin llegadas todavía.</div>';
    rows.forEach(r => { s += '<div class="row' + (r.num ? '' : ' pending') + '"><span class="pos num">' + r.pos + '</span><span class="n num">' + (esc(r.num) || '?') + '</span><span class="g">G' + r.group + '</span><span class="d num">' + (r.off ? '+' + dur(r.off) : '—') + '</span><span class="h num">' + (r.start !== null ? hms(r.start) : '—') + '</span></div>'; });
    $('startlist').innerHTML = s;
  }

  function tick() {
    const now = S.now(); $('clock').textContent = hms(now);
    const ci = S.clockInfo();
    $('clocklbl').textContent = S.mode === 'firebase' ? (ci.synced ? 'Hora del servidor' : 'Hora (ajuste guardado)') : 'Hora del teléfono';
    $('clockinfo').textContent = S.mode === 'firebase' ? (ci.synced ? 'Reloj sincronizado con el servidor (este teléfono estaba ' + (Math.abs(ci.offset) < 1000 ? 'en hora' : (ci.offset > 0 ? 'atrasado ' : 'adelantado ') + dur(ci.offset)) + ').' : 'Reloj todavía sin sincronizar: se usa el último ajuste guardado.') : '';
    const f = groups(data.arrivals)[0]; $('since').textContent = f ? '+' + dur(sec(now) - f.t) : '—';
  }
})();
