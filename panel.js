(function () {
  const S = window.Store, $ = id => document.getElementById(id);
  const { hms, dur, groups, startList, esc } = window.R;
  let data = { race: null, arrivals: [], meta: {} }, lastUpdate = null, seenGroups = new Set(), firstRender = true;

  R.registerSW();
  if (S.mode === 'demo') $('demo-banner').hidden = false;
  if (S.mode === 'nosdk') { $('nosdk-banner').hidden = false; setStatus('Sin conexión', 'bad'); return; }

  function setStatus(t, cls) { const p = $('status'); p.textContent = t; p.className = 'pill ' + (cls || ''); }
  function renderStatus() {
    if (S.mode === 'demo') return setStatus('Demostración', 'warn');
    if (!navigator.onLine) return setStatus('Sin señal · reconectando', 'bad');
    if (data.meta && data.meta.fromCache) return setStatus('Conectando…', 'warn');
    setStatus('En vivo', 'ok');
  }
  window.addEventListener('online', renderStatus); window.addEventListener('offline', renderStatus);

  S.watch(d => { if (d.error) return; data = d; lastUpdate = Date.now(); render(); });

  function setView(v) {
    ['lleg', 'larg'].forEach(k => {
      $('tab-' + k).setAttribute('aria-selected', k === v);
      $('view-' + k).hidden = k !== v; $('view-' + k).style.display = k === v ? 'flex' : 'none';
    });
    try { localStorage.setItem('raid-panel-tab', v); } catch (e) {}
  }
  ['lleg', 'larg'].forEach(k => $('tab-' + k).addEventListener('click', () => setView(k)));
  try { const v = localStorage.getItem('raid-panel-tab'); if (v === 'larg') setView('larg'); } catch (e) {}
  if (location.hash === '#largada') setView('larg');

  function render() {
    renderStatus();
    const race = data.race || {}, gs = groups(data.arrivals);
    $('race-name').textContent = race.name || (data.raceId ? 'Raid' : 'Sin carrera activa');
    document.title = (race.name || 'Raid') + ' · Panel en vivo';
    const n = data.arrivals.length, conNum = data.arrivals.filter(a => a.num).length;
    $('strip').innerHTML = n ? '<span><b class="num">' + n + '</b>caballos llegados</span><span><b class="num">' + gs.length + '</b>grupos</span>' + (n - conNum ? '<span><b class="num">' + (n - conNum) + '</b>número a confirmar</span>' : '') : '';

    // Última llegada
    const lg = gs[gs.length - 1];
    if (lg) {
      $('last').hidden = false;
      $('last').innerHTML = '<span class="lbl">Última llegada · Grupo ' + gs.length + '</span><span class="nums num">' + lg.horses.map(a => esc(a.num) || '?').join(' · ') + '</span><span class="meta num">' + hms(lg.t) + (gs.length > 1 ? ' · +' + dur(lg.t - gs[0].t) + ' del 1°' : ' · primero') + '</span>';
    } else $('last').hidden = true;

    // Grupos
    let h = '', pos = 0;
    if (!gs.length) h = '<div class="table"><div class="empty-list">Todavía no llegó ningún caballo.</div></div>';
    gs.forEach((g, i) => {
      const fresh = !firstRender && !seenGroups.has(g.t);
      seenGroups.add(g.t);
      const from = pos + 1; pos += g.horses.length;
      h += '<div class="pg' + (i === 0 ? ' first' : '') + (fresh ? ' fresh' : '') + '"><span class="gl">Grupo ' + (i + 1) + '<small class="num">' + hms(g.t) + ' · ' + (from === pos ? from + '°' : from + '° a ' + pos + '°') + '</small></span><span class="gd num">' + (i === 0 ? '1° en llegar' : '+' + dur(g.t - gs[0].t)) + '</span><div class="pnums">';
      g.horses.forEach(a => { h += '<span class="pn num' + (a.num ? '' : ' pending') + '">' + (esc(a.num) || '?') + '</span>'; });
      h += '</div></div>';
    });
    $('list').innerHTML = h;
    firstRender = false;
    renderStart();
  }

  function renderStart() {
    const race = data.race || {}, rows = startList(data.arrivals, race.start1), now = S.now();
    $('larg-note').textContent = race.start1 ? 'Cada caballo larga con la diferencia con que llegó. Los del mismo grupo largan juntos.' : 'La hora de largada todavía no está definida. Se muestran las diferencias.';
    let s = '<div class="row hd"><span>Orden</span><span>N°</span><span>Grupo</span><span>Diferencia</span><span>Largada</span></div>';
    if (!rows.length) s += '<div class="empty-list">Sin llegadas todavía.</div>';
    const next = rows.find(r => r.start !== null && r.start > now - 1000);
    rows.forEach(r => {
      const cls = r.start !== null && r.start < now - 1000 ? ' past' : (next && r.start === next.start ? ' next' : '');
      s += '<div class="row' + cls + (r.num ? '' : ' pending') + '"><span class="pos num">' + r.pos + '</span><span class="n num">' + (esc(r.num) || '?') + '</span><span class="g">G' + r.group + '</span><span class="d num">' + (r.off ? '+' + dur(r.off) : '—') + '</span><span class="h num">' + (r.start !== null ? hms(r.start) : '—') + '</span></div>';
    });
    $('startlist').innerHTML = s;
    if (next) {
      const who = rows.filter(r => r.start === next.start).map(r => esc(r.num) || '?').join(' · ');
      $('next').hidden = false;
      $('next').innerHTML = '<span class="lbl">Próxima largada · ' + hms(next.start) + '</span><span class="big num">' + who + '</span><span class="big num" style="font-size:clamp(24px,5vw,36px)">en ' + dur(next.start - now) + '</span>';
    } else $('next').hidden = true;
  }

  setInterval(() => {
    if (lastUpdate) $('updated').textContent = 'Actualizado ' + hms(lastUpdate);
    if (data.race && data.race.start1) renderStart();
  }, 1000);
})();
