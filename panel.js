(function () {
  const S = window.Store, $ = id => document.getElementById(id);
  const { tagHTML, isOut, outLabel, VET_NOTES, VET_OUT, hms, dur, groups, startList, esc, STATUS, statusOf, byNum, pName, pShort, pMap, RSTATUS, raceStatus, fmtDate, sortRaces, logoHTML, clubPlace, ofStage, fmtKmh, kmText, results, start2Of, cierreOf } = window.R;
  const INFO = window.APP_INFO || {};
  let data = { race: null, arrivals: [], participants: [], meta: {} }, lastUpdate = null, seenGroups = new Set(), firstRender = true;
  let races = [], clubs = {}, current = null, unwatch = null, pstage = 1, all = [];

  R.registerSW();
  if (INFO.title) { $('app-title').textContent = INFO.title; document.title = INFO.title + ' · En vivo'; }
  if (INFO.subtitle) $('app-sub').textContent = INFO.subtitle;
  if (S.mode === 'demo') $('demo-banner').hidden = false;
  if (S.mode === 'nosdk') { $('nosdk-banner').hidden = false; $('races').innerHTML = ''; return; }

  function setStatus(t, cls) { const p = $('status'); p.textContent = t; p.className = 'pill ' + (cls || ''); }
  function renderStatus() {
    if (S.mode === 'demo') return setStatus('Demostración', 'warn');
    if (!navigator.onLine) return setStatus('Sin señal · reconectando', 'bad');
    if (data.meta && data.meta.fromCache) return setStatus('Conectando…', 'warn');
    const st = data.race ? raceStatus(data.race) : '';
    setStatus(st === 'en_curso' ? 'En vivo' : (RSTATUS[st] || 'En vivo'), st === 'en_curso' ? 'ok' : '');
  }
  window.addEventListener('online', renderStatus); window.addEventListener('offline', renderStatus);

  // ---------- Lista de raids ----------
  S.watchClubs(list => { clubs = {}; list.forEach(c => { clubs[c.id] = c; }); renderHome(); if (current) render(); });
  S.watchRaces(list => { races = list; renderHome(); });
  function renderHome() {
    const byStatus = { en_curso: [], proximo: [], terminado: [] };
    sortRaces(races).forEach(r => byStatus[raceStatus(r)].push(r));
    const titles = { en_curso: 'En curso', proximo: 'Próximos', terminado: 'Terminados' };
    let h = '';
    Object.keys(byStatus).forEach(k => {
      if (!byStatus[k].length) return;
      h += '<div class="rsec ' + k + '"><h2><span class="dot"></span>' + titles[k] + '</h2><div class="rcards">';
      byStatus[k].forEach(r => {
        const c = clubs[r.clubId];
        h += '<a class="rcard" href="#' + encodeURIComponent(r.id) + '">' + logoHTML(c, 48) + '<span><span class="rn">' + esc(r.name || 'Raid') + '</span><span class="rc">' + esc(clubPlace(r, c)) + '</span></span><span class="rd">' + esc(fmtDate(r.date)) + (k === 'en_curso' ? '<br><span class="badge en_curso">En vivo</span>' : '') + '</span></a>';
      });
      h += '</div></div>';
    });
    $('races').innerHTML = h || '<div class="table"><div class="empty-list">Todavía no hay raids publicados.</div></div>';
  }

  // ---------- Navegación: #id del raid ----------
  function route() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (id && id !== current) open(id);
    else if (!id) close();
  }
  function open(id) {
    if (unwatch) unwatch();
    current = id; data = { race: null, arrivals: [], participants: [], meta: { fromCache: true } };
    seenGroups = new Set(); firstRender = true; lastUpdate = null;
    $('home').hidden = true; $('home').style.display = 'none';
    $('raid').hidden = false; $('raid').style.display = 'flex';
    unwatch = S.watch(id, d => { if (d.error) return; data = Object.assign({ participants: [] }, d); all = d.arrivals || []; data.arrivals = ofStage(all, pstage); lastUpdate = Date.now(); render(); });
    window.scrollTo(0, 0);
  }
  function close() {
    if (unwatch) unwatch(); unwatch = null; current = null;
    $('raid').hidden = true; $('raid').style.display = 'none';
    $('home').hidden = false; $('home').style.display = 'flex';
    document.title = (INFO.title || 'Raids') + ' · En vivo';
  }
  window.addEventListener('hashchange', route);
  $('back').addEventListener('click', () => { history.pushState('', '', location.pathname); close(); });
  $('share').addEventListener('click', () => {
    const url = location.origin + location.pathname + '#' + encodeURIComponent(current);
    const ok = () => { $('share-msg').textContent = 'Link copiado: ' + url; };
    try { navigator.clipboard.writeText(url).then(ok, () => { $('share-msg').textContent = url; }); } catch (e) { $('share-msg').textContent = url; }
  });

  // Pestañas: 1ª etapa y 2ª etapa usan la misma vista de llegadas
  const TABS = ['lleg', 'larg', 'lleg2', 'res'];
  function setView(v) {
    const view = v === 'lleg2' ? 'lleg' : v;
    TABS.forEach(k => $('tab-' + k).setAttribute('aria-selected', k === v));
    ['lleg', 'larg', 'res'].forEach(k => { $('view-' + k).hidden = k !== view; $('view-' + k).style.display = k === view ? 'flex' : 'none'; });
    const ns = v === 'lleg2' ? 2 : 1;
    if (ns !== pstage) { pstage = ns; data.arrivals = ofStage(all, pstage); seenGroups = new Set(); firstRender = true; if (current) render(); }
    try { localStorage.setItem('raid-panel-tab', v); } catch (e) {}
  }
  TABS.forEach(k => $('tab-' + k).addEventListener('click', () => setView(k)));
  try { const v = localStorage.getItem('raid-panel-tab'); if (TABS.includes(v)) setView(v); } catch (e) {}

  // ---------- Un raid ----------
  function render() {
    renderStatus();
    const race = data.race, gs = groups(data.arrivals);
    if (!race && !data.meta.fromCache) { $('race-name').textContent = 'Raid no encontrado'; $('race-sub').textContent = 'Puede que lo hayan borrado. Volvé a la lista de raids.'; $('race-logo').innerHTML = ''; }
    if (!race) return;
    const c = clubs[race.clubId];
    $('race-logo').innerHTML = logoHTML(c, 56);
    $('race-name').textContent = race.name || 'Raid';
    $('race-sub').textContent = clubPlace(race, c) + ' · ' + fmtDate(race.date);
    document.title = (race.name || 'Raid') + ' · En vivo';
    const n = data.arrivals.length, conNum = data.arrivals.filter(a => a.num).length;
    const P = pMap(data.participants), parts = (data.participants || []).slice().sort(byNum);
    const arrived = new Set(data.arrivals.map(a => a.num).filter(Boolean));
    const in1 = new Set(ofStage(all, 1).map(a => a.num).filter(Boolean));
    const falta = parts.filter(p => statusOf(p) === 'carrera' && !(pstage === 2 && p.noLarga) && !arrived.has(p.num) && (pstage === 1 || !in1.size || in1.has(p.num)));
    const noStart = !all.length;
    $('falta-title').textContent = noStart ? 'Inscriptos (' + falta.length + ')' : (pstage === 2 ? 'Todavía en la 2ª etapa' : 'Todavía en carrera');
    const fuera = parts.filter(p => isOut(p));
    $('strip').innerHTML = (n ? '<span><b class="num">' + n + '</b>llegaron</span><span><b class="num">' + gs.length + '</b>grupos</span>' : '')
      + (parts.length ? '<span><b class="num">' + falta.length + '</b>en carrera sin llegar</span>' + (fuera.length ? '<span><b class="num">' + fuera.length + '</b>abandono o retiro</span>' : '') : '')
      + (n - conNum ? '<span><b class="num">' + (n - conNum) + '</b>número a confirmar</span>' : '');
    $('rest').hidden = !parts.length;
    $('falta').innerHTML = falta.length ? falta.map(p => '<span class="pn num">' + esc(p.num) + (pShort(p) ? '<small>' + tagHTML(p) + '</small>' : '') + '</span>').join('') : '<span class="foot">Ya llegaron todos.</span>';
    $('fuera-wrap').hidden = !fuera.length;
    $('fuera').innerHTML = fuera.map(p => '<span class="pn num ' + (statusOf(p) === 'abandono' || statusOf(p) === 'descalificado' ? 'ab' : 'rt') + '">' + esc(p.num) + '<small>' + outLabel(p) + (pShort(p) ? ' · ' + tagHTML(p) : '') + '</small></span>').join('');

    const lg = gs[gs.length - 1];
    if (lg) {
      $('last').hidden = false;
      const ci = pstage === 2 ? cierreOf(race, all).hora : '';
      $('last').innerHTML = (ci ? '<span class="lbl">Cierre de control: ' + ci + '</span>' : '') + '<span class="lbl">Última llegada · Grupo ' + gs.length + '</span><span class="nums num">' + lg.horses.map(a => esc(a.num) || '?').join(' · ') + (lg.horses.length === 1 && P[lg.horses[0].num] ? '</span><span class="meta">' + esc(pName(P[lg.horses[0].num])) : '') + '</span><span class="meta num">' + hms(lg.t) + (gs.length > 1 ? ' · +' + dur(lg.t - gs[0].t) + ' del 1°' : ' · primero') + '</span>';
    } else $('last').hidden = true;

    let h = '', pos = 0;
    if (!gs.length) h = '<div class="table"><div class="empty-list">' + (raceStatus(race) === 'proximo' ? 'El raid todavía no empezó. ' + esc(fmtDate(race.date)) + '.' : 'Todavía no llegó ningún caballo a la ' + pstage + 'ª etapa.') + '</div></div>';
    gs.forEach((g, i) => {
      const fresh = !firstRender && !seenGroups.has(g.t);
      seenGroups.add(g.t);
      const from = pos + 1; pos += g.horses.length;
      h += '<div class="pg' + (i === 0 ? ' first' : '') + (fresh ? ' fresh' : '') + '"><span class="gl">Grupo ' + (i + 1) + '<small class="num">' + hms(g.t) + ' · ' + (from === pos ? from + '°' : from + '° a ' + pos + '°') + '</small></span><span class="gd num">' + (i === 0 ? '1° en llegar' : '+' + dur(g.t - gs[0].t)) + '</span><div class="pnums">';
      g.horses.forEach(a => { const p = P[a.num]; h += '<span class="pn num' + (a.num ? '' : ' pending') + '">' + (esc(a.num) || '?') + (p && pShort(p) ? '<small>' + tagHTML(p) + '</small>' : '') + '</span>'; });
      h += '</div></div>';
    });
    $('list').innerHTML = h;
    firstRender = false;
    renderStart();
    renderRes();
  }

  function renderStart() {
    const race = data.race || {}, P = pMap(data.participants), now = S.now();
    const out = r => isOut(P[r.num]);
    const s2 = start2Of(race, all);
    const rows = startList(ofStage(all, 1), s2);
    $('larg-note').textContent = s2 ? 'Cada caballo larga con la diferencia con que llegó. Los del mismo grupo largan juntos.' : 'La hora de largada todavía no está definida. Se muestran las diferencias.';
    let s = '<div class="row hd"><span>#</span><span>N°</span><span>Grupo</span><span>Diferencia</span><span>Largada</span></div>';
    if (!rows.length) s += '<div class="empty-list">Sin llegadas todavía.</div>';
    const next = rows.find(r => !out(r) && r.start !== null && r.start > now - 1000);
    rows.forEach(r => {
      const o = out(r), p = P[r.num];
      const cls = o || (r.start !== null && r.start < now - 1000) ? ' past' : (next && r.start === next.start ? ' next' : '');
      s += '<div class="row' + cls + (r.num ? '' : ' pending') + '"><span class="pos num">' + r.pos + '</span><span class="n num">' + (esc(r.num) || '?') + (p && pShort(p) ? '<small>' + tagHTML(p) + '</small>' : '') + '</span><span class="g">G' + r.group + '</span><span class="d num">' + (r.off ? '+' + dur(r.off) : '—') + '</span><span class="h num">' + (o ? '<small style="font-size:13px">' + outLabel(p) + '</small>' : (r.start !== null ? hms(r.start) : '—')) + '</span></div>';
    });
    $('startlist').innerHTML = s;
    if (next) {
      const who = rows.filter(r => !out(r) && r.start === next.start).map(r => esc(r.num) || '?').join(' · ');
      $('next').hidden = false;
      $('next').innerHTML = '<span class="lbl">Próxima largada · ' + hms(next.start) + '</span><span class="big num">' + who + '</span><span class="big num" style="font-size:clamp(24px,5vw,36px)">en ' + dur(next.start - now) + '</span>';
    } else $('next').hidden = true;
  }

  function renderRes() {
    const race = data.race || {}, res = results(all, race, data.participants), S2 = res.summary;
    const box = (l, km, o, cls) => '<div class="rbox' + (cls || '') + '"><span class="l">' + l + '</span><span class="k">' + km + '</span><span class="v num">' + fmtKmh(o.avg) + '</span><span class="s">promedio de ' + o.n + ' caballo' + (o.n === 1 ? '' : 's') + (o.best != null ? ' · ' + (cls ? 'ganador' : 'más rápido') + ': ' + fmtKmh(o.best) : '') + '</span></div>';
    $('resum').innerHTML = box('1ª etapa', res.km1 ? res.km1.toString().replace('.', ',') + ' km' : '—', S2.v1) + box('2ª etapa', res.km2 ? res.km2.toString().replace('.', ',') + ' km' : '—', S2.v2) + box('Raid completo', kmText(race) || '—', S2.vt, ' total');
    let h = '<thead><tr><th>Pos.</th><th>N°</th><th>1ª etapa</th><th>2ª etapa</th><th>General</th></tr></thead><tbody>';
    if (!res.rows.length) h += '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Todavía no hay resultados.</td></tr>';
    res.rows.forEach(r => {
      const cell = (e, v) => e != null ? dur(e) + '<span class="sub">' + fmtKmh(v) + '</span>' : '—';
      h += '<tr class="' + (r.out ? 'out' : '') + (r.pos === 1 ? ' first' : '') + '"><td class="p">' + (r.pos ? r.pos + '°' : (r.out ? '<small style="font-size:12px">' + outLabel(r.p) + '</small>' : '—')) + '</td><td class="n">' + esc(r.num) + (r.p && pShort(r.p) ? '<small>' + tagHTML(r.p) + '</small>' : '') + '</td><td>' + cell(r.e1, r.v1) + '</td><td>' + cell(r.e2, r.v2) + '</td><td class="vt">' + (r.tot != null ? dur(r.tot) + '<span class="sub">' + fmtKmh(r.vt) + '</span>' : '—') + '</td></tr>';
    });
    $('restable').innerHTML = h + '</tbody>';
  }

  setInterval(() => {
    if (!current) return;
    if (lastUpdate) $('updated').textContent = 'Actualizado ' + hms(lastUpdate);
    if (data.race && start2Of(data.race, all)) renderStart();
  }, 1000);
  route();
})();
