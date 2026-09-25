// Funciones comunes: formato de horas, agrupado por tiempo, largadas, participantes.
window.R = (function () {
  const pad2 = n => String(n).padStart(2, '0');
  const sec = t => Math.floor(t / 1000) * 1000;
  const hms = t => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); };
  function dur(ms) {
    const s = Math.round(Math.abs(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(x) : m + ':' + pad2(x);
  }
  const sorted = arr => arr.slice().sort((a, b) => a.t - b.t || (a.seq || 0) - (b.seq || 0));
  // Un grupo = todos los caballos con la misma hora (al segundo)
  function groups(arr) {
    const g = [];
    sorted(arr).forEach(a => { const l = g[g.length - 1]; if (l && l.t === a.t) l.horses.push(a); else g.push({ t: a.t, horses: [a] }); });
    return g;
  }
  // Hora de largada del 1° ("HH:MM:SS") llevada al día de la carrera
  function baseStart(start1, arr) {
    if (!start1) return null;
    const [h, m, s] = start1.split(':').map(Number);
    const ref = arr && arr.length ? new Date(Math.min.apply(null, arr.map(a => a.t))) : new Date();
    ref.setHours(h, m, s || 0, 0);
    return ref.getTime();
  }
  function startList(arr, start1) {
    const gs = groups(arr), base = baseStart(start1, arr), out = [];
    if (!gs.length) return out;
    const f = gs[0].t; let pos = 0;
    gs.forEach((g, i) => g.horses.forEach(a => {
      pos++; const off = g.t - f;
      out.push({ pos, num: a.num, group: i + 1, arrive: g.t, off, start: base !== null ? base + off : null });
    }));
    return out;
  }

  // ---------- Participantes ----------
  const STATUS = { carrera: 'En carrera', abandono: 'Abandono', retirado: 'Retirado' };
  const statusOf = p => (p && STATUS[p.status]) ? p.status : 'carrera';
  const numKey = n => String(n == null ? '' : n).trim().replace(/^0+(?=\d)/, '').replace(/\//g, '-');
  const byNum = (a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0) || String(a.num).localeCompare(String(b.num));
  // Lee texto pegado desde Excel, WhatsApp o un CSV. Devuelve filas (arrays de celdas).
  function parseTable(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (!lines.length) return [];
    const d = lines.some(l => l.includes('\t')) ? '\t' : (lines.some(l => l.includes(';')) ? ';' : (lines.some(l => l.includes(',')) ? ',' : null));
    return lines.map(l => {
      if (!d) { const m = l.trim().match(/^(\S+)\s*[-–:]?\s*(.*)$/); return m ? [m[1], m[2]].filter((x, i) => i === 0 || x) : [l.trim()]; }
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === d && !q) { out.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      out.push(cur.trim()); return out;
    });
  }
  // Convierte filas en participantes. La columna del número se detecta por el título (N°, Número, Dorsal) o es la primera.
  function toParticipants(rows) {
    if (!rows.length) return { list: [], headers: [] };
    const first = rows[0];
    const hasHeader = !/^\d+[a-zA-Z]?$/.test(String(first[0] || '').trim()) && first.some(c => /[a-záéíóúñ]/i.test(c));
    let headers = hasHeader ? first.map((h, i) => h || 'Dato ' + (i + 1)) : first.map((_, i) => i === 0 ? 'N°' : 'Dato ' + (i + 1));
    let ni = hasHeader ? headers.findIndex(h => /^(n[°ºo.]?|nro\.?|n[uú]mero|dorsal|num\.?)$/i.test(h.trim())) : 0;
    if (ni < 0) ni = 0;
    const body = hasHeader ? rows.slice(1) : rows;
    const list = [], seen = new Set();
    body.forEach((r, i) => {
      const num = numKey(r[ni]); if (!num || seen.has(num)) return; seen.add(num);
      const data = {};
      headers.forEach((h, j) => { if (j !== ni && r[j]) data[h] = r[j]; });
      list.push({ num, data, order: i });
    });
    return { list, headers: headers.filter((_, j) => j !== ni) };
  }
  // Texto corto para mostrar: caballo y jinete si hay columnas con esos nombres, si no las dos primeras.
  function pName(p) {
    if (!p || !p.data) return '';
    const ks = Object.keys(p.data);
    const horse = ks.find(k => /caballo|equino|animal|nombre/i.test(k));
    const rider = ks.find(k => /jinete|binomio|corredor|piloto/i.test(k));
    const parts = [];
    if (horse) parts.push(p.data[horse]);
    if (rider) parts.push(p.data[rider]);
    if (!parts.length) ks.slice(0, 2).forEach(k => parts.push(p.data[k]));
    return parts.filter(Boolean).join(' · ');
  }
  function pShort(p) { const n = pName(p); return n.split(' · ')[0] || ''; }
  const pMap = list => { const m = {}; (list || []).forEach(p => { m[p.num] = p; }); return m; };

  // ---------- Etapas, tiempos y promedios ----------
  const stageOf = a => (a && +a.stage === 2) ? 2 : 1;
  const ofStage = (arr, st) => (arr || []).filter(a => stageOf(a) === st);
  const kmOf = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const speed = (km, ms) => (km > 0 && ms > 0) ? km / (ms / 3600000) : null;
  const fmtKmh = v => v == null ? '—' : v.toFixed(2).replace('.', ',') + ' km/h';
  const fmtKm = v => (Math.round(v * 10) / 10).toString().replace('.', ',') + ' km';
  function kmText(r) {
    const a = kmOf(r && r.km1), b = kmOf(r && r.km2);
    if (!a && !b) return '';
    return fmtKm(a + b) + (a && b ? ' (' + fmtKm(a).replace(' km', '') + ' + ' + fmtKm(b) + ')' : '');
  }
  // Neutralización en minutos (por defecto 1 hora)
  const neutralOf = race => { const n = parseFloat(race && race.neutral); return isFinite(n) && n >= 0 ? n : 60; };
  // Hora de largada del 1° en la 2ª etapa: la que se cargó a mano o, si no, llegada del 1° + neutralización.
  function start2Of(race, all) {
    const a1 = ofStage(all, 1);
    if (race && race.start1) return race.start1;
    if (!a1.length) return '';
    return hms(Math.min.apply(null, a1.map(a => a.t)) + neutralOf(race) * 60000);
  }
  // Resultados por caballo: tiempo y velocidad de cada etapa y del raid (sin contar la neutralización).
  // 2ª etapa: se mide desde la largada del primero (llegada del 1° en la 1ª + neutralización), para todos.
  function results(all, race, parts) {
    race = race || {};
    const km1 = kmOf(race.km1), km2 = kmOf(race.km2);
    const a1 = ofStage(all, 1), a2 = ofStage(all, 2);
    const start0 = baseStart(race.start0, a1);
    const s2 = start2Of(race, all), start2 = baseStart(s2, a1);
    const first1 = a1.length ? Math.min.apply(null, a1.map(a => a.t)) : null;
    const rest = (start2 !== null && first1 !== null) ? start2 - first1 : null;
    const t1 = {}, t2 = {};
    sorted(a1).forEach(a => { if (a.num && !(a.num in t1)) t1[a.num] = a; });
    sorted(a2).forEach(a => { if (a.num && !(a.num in t2)) t2[a.num] = a; });
    const pm = pMap(parts);
    const nums = new Set([...Object.keys(t1), ...Object.keys(t2)]);
    const rows = [...nums].map(num => {
      const e1 = (t1[num] && start0 !== null) ? t1[num].t - start0 : null;
      const e2 = (t2[num] && start2 !== null) ? t2[num].t - start2 : null;
      // Tiempo total neto: de la largada de la 1ª a la llegada de la 2ª, menos la neutralización.
      const tot = (t2[num] && start0 !== null && rest !== null) ? t2[num].t - start0 - rest : null;
      const p = pm[num];
      return { num, p, out: p ? statusOf(p) !== 'carrera' : false, arr1: t1[num] ? t1[num].t : null, arr2: t2[num] ? t2[num].t : null,
        e1, e2, tot, v1: speed(km1, e1), v2: speed(km2, e2), vt: speed(km1 + km2, tot), seq2: t2[num] ? (t2[num].seq || 0) : 0 };
    });
    // Orden: los que terminaron la 2ª etapa por llegada; después el resto por su llegada a la 1ª.
    rows.sort((x, y) => {
      if (x.arr2 != null && y.arr2 != null) return x.arr2 - y.arr2 || x.seq2 - y.seq2;
      if (x.arr2 != null) return -1; if (y.arr2 != null) return 1;
      return (x.arr1 || 0) - (y.arr1 || 0);
    });
    let pos = 0; rows.forEach(r => { r.pos = (r.arr2 != null && !r.out) ? ++pos : null; });
    const avg = l => { const v = l.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const ok = rows.filter(r => !r.out);
    const win = rows.find(r => r.pos === 1) || null;
    const fast1 = ok.filter(r => r.v1 != null).sort((a, b) => a.e1 - b.e1)[0] || null;
    return {
      rows, km1, km2, start0, hasStart0: start0 !== null, start2, rest,
      summary: {
        v1: { best: fast1 ? fast1.v1 : null, avg: avg(ok.map(r => r.v1)), n: ok.filter(r => r.v1 != null).length },
        v2: { best: (() => { const b = ok.filter(r => r.v2 != null).sort((a, b) => a.e2 - b.e2)[0]; return b ? b.v2 : null; })(), avg: avg(ok.map(r => r.v2)), n: ok.filter(r => r.v2 != null).length },
        vt: { best: win ? win.vt : null, avg: avg(ok.map(r => r.vt)), n: ok.filter(r => r.vt != null).length },
        winner: win
      }
    };
  }

  function sheet(all, race, parts) {
    race = race || {};
    const pm = pMap(parts);
    const a1 = ofStage(all, 1);
    const L = ['LLEGADAS 1ª ETAPA Y LARGADA 2ª', 'Orden\tN°\tCaballo / Jinete\tGrupo\tLlegada\tDif. 1°\tLargada 2ª'];
    startList(a1, start2Of(race, all)).forEach(r => L.push([r.pos, r.num || '?', pName(pm[r.num]), 'G' + r.group, hms(r.arrive), '+' + dur(r.off), r.start !== null ? hms(r.start) : ''].join('\t')));
    const res = results(all, race, parts);
    if (res.rows.length) {
      L.push(''); L.push('RESULTADOS' + (res.km1 || res.km2 ? ' · ' + kmText(race) : ''));
      L.push('Puesto\tN°\tCaballo / Jinete\tTiempo 1ª\tProm. 1ª (km/h)\tTiempo 2ª\tProm. 2ª (km/h)\tTiempo total\tProm. general (km/h)');
      const n = v => v == null ? '' : v.toFixed(2).replace('.', ',');
      res.rows.forEach(r => L.push([r.pos || (r.out ? STATUS[statusOf(r.p)] : ''), r.num, pName(r.p), r.e1 != null ? dur(r.e1) : '', n(r.v1), r.e2 != null ? dur(r.e2) : '', n(r.v2), r.tot != null ? dur(r.tot) : '', n(r.vt)].join('\t')));
    }
    const out = (parts || []).filter(p => statusOf(p) !== 'carrera').sort(byNum);
    if (out.length) { L.push(''); L.push('N°\tCaballo / Jinete\tEstado'); out.forEach(p => L.push([p.num, pName(p), STATUS[statusOf(p)]].join('\t'))); }
    return L.join('\n');
  }
  // Copia en Excel de un raid: llegadas de cada etapa, participantes y resultados.
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => ko(new Error('No se pudo preparar el Excel. Revisá la conexión.')); document.head.appendChild(sc); });
  }
  async function exportXlsx(snap, fileName) {
    await loadXLSX();
    const race = snap.race || {}, all = snap.arrivals || [], parts = snap.participants || [], pm = pMap(parts);
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    add('Raid', [['Raid', race.name || ''], ['Localidad', race.place || ''], ['Fecha', race.date || ''], ['Km 1ª etapa', kmOf(race.km1) || ''], ['Km 2ª etapa', kmOf(race.km2) || ''],
      ['Largada 1ª etapa', race.start0 || ''], ['Neutralización (min)', neutralOf(race)], ['Largada 2ª etapa (1°)', start2Of(race, all)], ['Copia del', new Date().toLocaleString('es-UY')]]);
    [1, 2].forEach(st => {
      const rows = [['Orden', 'N°', 'Caballo / Jinete', 'Grupo', 'Hora de llegada', 'Dif. con el 1°']]; let pos = 0;
      const gs = groups(ofStage(all, st)); const f = gs[0];
      gs.forEach((g, i) => g.horses.forEach(a => { pos++; rows.push([pos, a.num || '?', pName(pm[a.num]), i + 1, hms(g.t), '+' + dur(g.t - f.t)]); }));
      add('Llegadas ' + st + 'ª', rows);
    });
    const keys = [...new Set(parts.flatMap(p => Object.keys(p.data || {})))];
    add('Participantes', [['N°', ...keys, 'Estado']].concat(parts.slice().sort(byNum).map(p => [p.num, ...keys.map(k => (p.data || {})[k] || ''), STATUS[statusOf(p)]])));
    const res = results(all, race, parts), n = v => v == null ? '' : Math.round(v * 100) / 100;
    add('Resultados', [['Puesto', 'N°', 'Caballo / Jinete', 'Tiempo 1ª', 'Prom. 1ª (km/h)', 'Tiempo 2ª', 'Prom. 2ª (km/h)', 'Tiempo total', 'Prom. general (km/h)']]
      .concat(res.rows.map(r => [r.pos || (r.out ? STATUS[statusOf(r.p)] : ''), r.num, pName(r.p), r.e1 != null ? dur(r.e1) : '', n(r.v1), r.e2 != null ? dur(r.e2) : '', n(r.v2), r.tot != null ? dur(r.tot) : '', n(r.vt)])));
    XLSX.writeFile(wb, fileName || ((race.name || 'raid').replace(/[\\/:*?"<>|]/g, '') + '.xlsx'));
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Raids y clubes ----------
  const RSTATUS = { en_curso: 'En curso', proximo: 'Próximo', terminado: 'Terminado' };
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  // Estado del raid: el que se eligió a mano o, si no, según la fecha.
  function raceStatus(r) {
    if (r && RSTATUS[r.status]) return r.status;
    const d = r && r.date, t = todayStr();
    if (!d) return 'proximo';
    return d > t ? 'proximo' : (d === t ? 'en_curso' : 'terminado');
  }
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  function fmtDate(s) {
    if (!s) return 'Sin fecha';
    const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d);
    return DIAS[dt.getDay()] + ' ' + d + ' ' + MESES[m - 1] + ' ' + y;
  }
  // Orden: en curso, próximos (el más cercano primero), terminados (el más reciente primero).
  function sortRaces(list) {
    const rank = { en_curso: 0, proximo: 1, terminado: 2 };
    return list.slice().sort((a, b) => {
      const sa = raceStatus(a), sb = raceStatus(b);
      if (sa !== sb) return rank[sa] - rank[sb];
      const da = a.date || '', dbb = b.date || '';
      return sa === 'terminado' ? dbb.localeCompare(da) : da.localeCompare(dbb);
    });
  }
  // "Club · Localidad" para mostrar debajo del nombre del raid
  function clubPlace(r, c) { const k = kmOf(r && r.km1) + kmOf(r && r.km2); return [c ? c.name : '', r && r.place ? r.place : '', k ? fmtKm(k) : ''].filter(Boolean).join(' · ') || 'Sin club'; }
  function initials(name) { return String(name || '?').split(/\s+/).filter(w => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 3).map(w => w[0]).join('').toUpperCase() || '?'; }
  function logoHTML(club, size) {
    size = size || 40;
    const st = 'width:' + size + 'px;height:' + size + 'px';
    if (club && club.logo) return '<img class="logo" src="' + esc(club.logo) + '" alt="" style="' + st + '">';
    const txt = (club && club.short) || initials(club && club.name);
    return '<span class="logo logo-txt" style="' + st + ';font-size:' + Math.round(size * (txt.length > 3 ? .26 : .36)) + 'px">' + esc(txt) + '</span>';
  }
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  return { pad2, sec, hms, dur, sorted, groups, baseStart, startList, sheet, esc, registerSW,
    STATUS, statusOf, numKey, byNum, parseTable, toParticipants, pName, pShort, pMap,
    RSTATUS, todayStr, raceStatus, fmtDate, sortRaces, logoHTML, initials, clubPlace,
    stageOf, ofStage, kmOf, fmtKmh, fmtKm, kmText, results, neutralOf, start2Of, exportXlsx };
})();
