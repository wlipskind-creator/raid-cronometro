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
  const STATUS = { carrera: 'En carrera', abandono: 'Abandono', retirado: 'Retirado', descalificado: 'Descalificado' };
  const statusOf = p => (p && STATUS[p.status]) ? p.status : 'carrera';
  // Fuera de carrera: abandono, retirado, descalificado o no pasó el control veterinario (no larga la 2ª).
  const isOut = p => !!p && (statusOf(p) !== 'carrera' || !!p.noLarga);
  const outLabel = p => (p && p.noLarga && statusOf(p) === 'carrera') ? 'No larga' : STATUS[statusOf(p)];
  // Motivos del control veterinario (los últimos tres dejan al caballo sin largar la 2ª etapa)
  const VET_NOTES = ['Rech.', 'Rech. Elim.', 'R.V.', 'F.C.E.'];
  const VET_OUT = ['Rech. Elim.', 'R.V.', 'F.C.E.'];
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
  const NUM_HEAD = /^(n\s*[°ºo.]*\s*(de\s+)?(orden|dorsal|caballo|inscripci[oó]n)?|nro\.?(\s*de)?(\s*\w+)?|n[uú]m(ero|\.)?(\s*de)?(\s*\w+)?|dorsal|#)$/i;
  const onlyNum = v => /^\s*\d+[a-zA-Z]?\s*$/.test(String(v == null ? '' : v));
  function toParticipants(rows) {
    if (!rows.length) return { list: [], headers: [] };
    // La fila de títulos puede no ser la primera (a veces arriba va el nombre del raid)
    let hi = rows.slice(0, 6).findIndex(r => r.some(c => NUM_HEAD.test(String(c || '').trim())));
    if (hi < 0) {
      const first = rows[0];
      hi = (!onlyNum(first[0]) && first.some(c => /[a-záéíóúñ]/i.test(c))) ? 0 : -1;
    }
    const hasHeader = hi >= 0;
    const first = hasHeader ? rows[hi] : rows[0];
    const width = Math.max.apply(null, rows.map(r => r.length));
    let headers = [];
    for (let i = 0; i < width; i++) headers.push(hasHeader ? (String(first[i] || '').trim() || 'Dato ' + (i + 1)) : (i === 0 ? 'N°' : 'Dato ' + (i + 1)));
    const body = hasHeader ? rows.slice(hi + 1) : rows;
    let ni = hasHeader ? headers.findIndex(h => NUM_HEAD.test(h)) : 0;
    if (ni < 0) { // sin título reconocible: la primera columna con números
      ni = headers.findIndex((_, j) => { const v = body.map(r => r[j]).filter(x => x !== undefined && String(x).trim() !== ''); return v.length && v.filter(onlyNum).length >= v.length * 0.8; });
      if (ni < 0) ni = 0;
    }
    const list = [], seen = new Set();
    body.forEach((r, i) => {
      const num = numKey(r[ni]); if (!num || seen.has(num)) return; seen.add(num);
      const data = {};
      headers.forEach((h, j) => {
        if (j === ni || r[j] == null || String(r[j]).trim() === '') return;
        if (numKey(r[j]) === num && (NUM_HEAD.test(h) || onlyNum(r[j]))) return; // el número repetido en otra columna
        data[h] = r[j];
      });
      list.push({ num, data, order: i });
    });
    return { list, headers: headers.filter((_, j) => j !== ni) };
  }
  // Texto corto para mostrar: caballo y jinete si hay columnas con esos nombres, si no las dos primeras.
  function pName(p) {
    if (!p || !p.data) return '';
    // nunca repetir el número del caballo ni mostrar columnas que son solo números
    const ok = v => { const t = String(v == null ? '' : v).trim(); return t && numKey(t) !== String(p.num) && !onlyNum(t); };
    const ks = Object.keys(p.data).filter(k => ok(p.data[k]) && !NUM_HEAD.test(k.trim()));
    const horse = ks.find(k => /caballo|equino|animal|nombre/i.test(k));
    const rider = ks.find(k => /jinete|binomio|corredor|piloto/i.test(k));
    const parts = [];
    if (horse) parts.push(p.data[horse]);
    if (rider) parts.push(p.data[rider]);
    if (!parts.length) ks.slice(0, 2).forEach(k => parts.push(p.data[k]));
    return parts.map(v => String(v).trim()).filter(Boolean).join(' · ');
  }
  function pShort(p) { const n = pName(p); return n.split(' · ')[0] || ''; }
  // Apellido para identificar rápido: columna "Apellido" si existe; si no, el del jinete o el del dueño.
  function pSur(p) {
    if (!p || !p.data) return '';
    const ks = Object.keys(p.data);
    if (!ks.some(k => /caballo|equino|animal|nombre/i.test(k))) return '';
    const ap = ks.find(k => /apellido/i.test(k));
    if (ap && p.data[ap] && !onlyNum(p.data[ap])) return String(p.data[ap]).trim();
    const who = ks.find(k => /jinete|binomio|corredor|piloto/i.test(k)) || ks.find(k => /propietario|due[ñn]o|stud|haras|criador/i.test(k));
    const v = who ? String(p.data[who] || '').trim() : '';
    if (!v || onlyNum(v) || numKey(v) === String(p.num)) return '';
    if (v.includes(',')) return v.split(',')[0].trim();
    const w = v.split(/\s+/).filter(x => x.replace(/\./g, '').length > 1);
    return w.length ? w[w.length - 1] : v;
  }
  // Nombre del caballo y, debajo, el apellido
  const tagHTML = p => { const h = pShort(p), su = pSur(p); return esc(h) + (su && su !== h ? '<br>' + esc(su) : ''); };
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
      return { num, p, out: isOut(p), arr1: t1[num] ? t1[num].t : null, arr2: t2[num] ? t2[num].t : null,
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
      res.rows.forEach(r => L.push([r.pos || (r.out ? outLabel(r.p) : ''), r.num, pName(r.p), r.e1 != null ? dur(r.e1) : '', n(r.v1), r.e2 != null ? dur(r.e2) : '', n(r.v2), r.tot != null ? dur(r.tot) : '', n(r.vt)].join('\t')));
    }
    const out = (parts || []).filter(p => isOut(p)).sort(byNum);
    if (out.length) { L.push(''); L.push('N°\tCaballo / Jinete\tEstado'); out.forEach(p => L.push([p.num, pName(p), outLabel(p)].join('\t'))); }
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
    add('Participantes', [['N°', ...keys, 'Estado']].concat(parts.slice().sort(byNum).map(p => [p.num, ...keys.map(k => (p.data || {})[k] || ''), outLabel(p)])));
    const res = results(all, race, parts), n = v => v == null ? '' : Math.round(v * 100) / 100;
    add('Resultados', [['Puesto', 'N°', 'Caballo / Jinete', 'Tiempo 1ª', 'Prom. 1ª (km/h)', 'Tiempo 2ª', 'Prom. 2ª (km/h)', 'Tiempo total', 'Prom. general (km/h)']]
      .concat(res.rows.map(r => [r.pos || (r.out ? outLabel(r.p) : ''), r.num, pName(r.p), r.e1 != null ? dur(r.e1) : '', n(r.v1), r.e2 != null ? dur(r.e2) : '', n(r.v2), r.tot != null ? dur(r.tot) : '', n(r.vt)])));
    XLSX.writeFile(wb, fileName || ((race.name || 'raid').replace(/[\\/:*?"<>|]/g, '') + '.xlsx'));
  }
  // ---------- Planilla final (formato FEU) ----------
  const hsLong = ms => { if (ms == null) return ''; const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return h + ' Hs. ' + pad2(m) + "' " + pad2(x) + "''"; };
  const hsClock = t => { if (t == null) return ''; const d = new Date(t); return d.getHours() + ' hs. ' + pad2(d.getMinutes()) + "' " + pad2(d.getSeconds()) + "''"; };
  const kmh3 = v => v == null ? '—' : v.toFixed(3).replace('.', ',') + ' Kmts./Hs.';
  // Cierre de control: llegada del primero en la 2ª etapa + 60 min (raids de 90 km o más) o + 50 min (menores).
  const cierreMinOf = race => (kmOf(race && race.km1) + kmOf(race && race.km2)) >= 90 ? 60 : 50;
  function cierreOf(race, all) {
    if (race && race.cierre) return { hora: race.cierre, auto: false };
    const a2 = ofStage(all, 2).filter(a => a.num);
    if (!a2.length) return { hora: '', auto: true };
    return { hora: hms(Math.min.apply(null, a2.map(a => a.t)) + cierreMinOf(race) * 60000), auto: true };
  }
  const vetMinOf = race => { const n = parseFloat(race && race.vetMin); return isFinite(n) && n >= 0 ? n : 20; };
  function reportData(all, race, parts, club) {
    race = race || {}; parts = parts || [];
    const pm = pMap(parts), res = results(all, race, parts);
    const a1 = sorted(ofStage(all, 1)).filter(a => a.num), a2 = sorted(ofStage(all, 2)).filter(a => a.num);
    const seen1 = new Set(), seen2 = new Set();
    const arr1 = a1.filter(a => !seen1.has(a.num) && seen1.add(a.num)), arr2 = a2.filter(a => !seen2.has(a.num) && seen2.add(a.num));
    const start0 = res.start0, start2 = res.start2, rest = res.rest;
    const km1 = res.km1, km2 = res.km2;
    const starts = {}; startList(ofStage(all, 1), start2Of(race, all)).forEach(r => { if (r.num && r.start != null) starts[r.num] = r.start; });
    const st = p => statusOf(p);
    // 1ª etapa
    const largaron1 = parts.length ? parts.filter(p => st(p) !== 'retirado').length : arr1.length;
    const aband1 = parts.filter(p => st(p) === 'abandono' && !seen1.has(p.num)).map(p => p.num).sort((x, y) => (+x) - (+y));
    const t1 = (arr1.length && start0 != null) ? arr1[0].t - start0 : null;
    // 2ª etapa: largan los que llegaron a la 1ª y pasaron el control veterinario
    const larg2 = arr1.filter(a => { const p = pm[a.num]; return !(p && (p.noLarga || st(p) === 'retirado')); });
    const aband2 = larg2.filter(a => !seen2.has(a.num)).map(a => a.num).sort((x, y) => (+x) - (+y));
    const win = res.summary.winner;
    const t2 = (win && start2 != null) ? win.arr2 - start2 : null;
    const tt = win ? win.tot : null;
    const neut = arr1.map((a, i) => {
      const p = pm[a.num] || {};
      const fc = [p.fc, p.vetNote].filter(x => x !== undefined && x !== null && x !== '').join(' ');
      const noLarga = !!p.noLarga || st(p) === 'retirado' || st(p) === 'abandono' || st(p) === 'descalificado';
      return { pos: i + 1, num: a.num, llegada: a.t, vet: a.t + vetMinOf(race) * 60000, fc, noLarga, largada: noLarga ? null : starts[a.num] };
    });
    const desc = new Set(parts.filter(p => st(p) === 'descalificado').map(p => p.num));
    const clasif = arr2.filter(a => !desc.has(a.num) && !(pm[a.num] && pm[a.num].noLarga)).map((a, i) => ({ pos: i + 1, num: a.num, llegada: a.t, total: (start0 != null && rest != null) ? a.t - start0 - rest : null }));
    const fmtD = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return dd + '/' + m + '/' + y; };
    return { inst: club ? club.name : '', name: race.name || 'Raid', place: race.place || '', fecha: fmtD(race.date), km1, km2, dist: km1 + km2, start0,
      largaron1, aband1, t1, v1: speed(km1, t1), largaron2: larg2.length, aband2, t2, v2: speed(km2, t2), tt, vt: speed(km1 + km2, tt),
      winner: win ? win.num : '', trofeo: race.trofeo || '', cierre: cierreOf(race, all).hora, neut, clasif, desc: [...desc].sort((x, y) => (+x) - (+y)) };
  }
  function loadScriptOnce(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => ko(new Error('No se pudo preparar el PDF. Revisá la conexión.')); document.head.appendChild(sc); });
  }
  async function reportPDF(all, race, parts, club) {
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf);
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', () => window.jspdf && window.jspdf.jsPDF.API.autoTable);
    const D = reportData(all, race, parts, club);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const BLUE = [47, 84, 150], LIGHT = [220, 230, 242], RED = [230, 0, 0], W = 190, L = 10;
    const cellBox = { lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], font: 'helvetica', fontSize: 9, fontStyle: 'bold', halign: 'center', valign: 'middle', cellPadding: 1.2 };
    const km = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
    const t = (body, opts) => { doc.autoTable(Object.assign({ startY: y, margin: { left: L, right: L }, tableWidth: W, theme: 'grid', styles: cellBox, body }, opts || {})); y = doc.lastAutoTable.finalY; };
    let y = 10;
    t([[{ content: 'INSTITUCIÓN ORGANIZADORA:     ' + (D.inst || ''), styles: { fillColor: BLUE, textColor: [255, 255, 255], fontSize: 13 } }]]);
    t([[{ content: D.name.toUpperCase(), styles: { fontSize: 14, textColor: BLUE } }]]);
    t([['FECHA ' + D.fecha, 'DISTANCIA ' + km(D.dist) + ' KMTS.', 'HORA LARGADA ' + (D.start0 != null ? hsLong(D.start0 - new Date(new Date(D.start0).setHours(0, 0, 0, 0))) : '')]], { columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 60 } } });
    const etapa = (lab, kmv, larg, ab, tm, v, abLabel) => t([
      [{ content: lab, rowSpan: 2, styles: { fillColor: BLUE, textColor: [255, 255, 255] } }, 'DE ' + km(kmv) + ' KMTS.  ---  LARGARON ' + larg, { content: 'ABANDONAN LOS Nº  ' + (ab.length ? ab.join(' - ') : abLabel), styles: ab.length ? {} : { textColor: RED } }],
      ['TIEMPO ' + (tm != null ? hsLong(tm) : '—'), 'PROMEDIO ' + kmh3(v)]], { columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 78 } } });
    etapa('1ª ETAPA', D.km1, D.largaron1, D.aband1, D.t1, D.v1, 'NO HUBO ABANDONOS');
    etapa('2ª ETAPA', D.km2, D.largaron2, D.aband2, D.t2, D.v2, 'NO HUBO ABANDONOS');
    t([[{ content: 'TOTAL', styles: { fillColor: BLUE, textColor: [255, 255, 255] } }, 'TIEMPO TOTAL ' + (D.tt != null ? hsLong(D.tt) : '—'), 'PROMEDIO GENERAL ' + kmh3(D.vt)]], { columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 78 } } });
    t([['GANADOR de la COMPETENCIA Nº ' + (D.winner || '—'), 'GANADOR TROFEO F.E.U. Nº ' + (D.trofeo || '—')]], { columnStyles: { 0: { cellWidth: 100 } } });
    y += 3;
    const head = { fillColor: LIGHT, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 7, halign: 'center', cellPadding: 1 };
    const small = Object.assign({}, cellBox, { fontSize: 7.5, cellPadding: 1 });
    const neutBody = D.neut.map(n => [n.pos, n.num, hsClock(n.llegada), hsClock(n.vet), n.fc, n.noLarga ? 'NO LARGA' : hsClock(n.largada)]);
    const clasBody = D.clasif.length ? D.clasif.map(c => [c.pos, c.num, hsClock(c.llegada), c.total != null ? hsLong(c.total) : '']) : [[{ content: 'Sin llegadas en la 2ª etapa', colSpan: 4 }]];
    const redNo = h => { if (h.section === 'body' && h.column.index === 5 && h.cell.raw === 'NO LARGA') { h.cell.styles.fillColor = RED; h.cell.styles.textColor = [255, 255, 255]; } };
    const pieRows = [['CIERRE DE CONTROL   ' + (D.cierre ? D.cierre.replace(/^(\d+):(\d+):?(\d+)?$/, (m, h, mi, se) => (+h) + ' H ' + mi + " ' " + (se || '00') + " ''") : '—')],
      ['L U N E S  -  EQUINOS DESCALIFICADOS:  ' + (D.desc.length ? D.desc.join(' - ') : 'ninguno')]];
    const fits = Math.max(D.neut.length, D.clasif.length + 3) <= 38;
    const neutTable = (left, width) => doc.autoTable({ startY: y, margin: { left, right: 210 - left - width }, tableWidth: width, theme: 'grid', styles: small,
      head: [[{ content: 'N E U T R A L I Z A C I Ó N', colSpan: 6, styles: { fontSize: 9 } }], ['', 'Nº', 'HORA LLEGADA', 'HORA CONT. VET.', 'FREC. CARD. / MOT. DESC.', 'HORA LARGADA']],
      headStyles: head, body: neutBody, columnStyles: { 0: { cellWidth: 7, fillColor: LIGHT }, 1: { cellWidth: 9 } }, didParseCell: redNo });
    const clasTable = (left, width, startY) => doc.autoTable({ startY, margin: { left, right: 210 - left - width }, tableWidth: width, theme: 'grid', styles: small,
      head: [[{ content: 'C L A S I F I C A C I Ó N   F I N A L', colSpan: 4, styles: { fontSize: 9 } }], ['', 'Nº', 'HORA LLEGADA', 'TIEMPO TOTAL']],
      headStyles: head, body: clasBody, columnStyles: { 0: { cellWidth: 7, fillColor: LIGHT }, 1: { cellWidth: 9 } } });
    const pie = (left, width, startY) => doc.autoTable({ startY, margin: { left, right: 210 - left - width }, tableWidth: width, theme: 'grid', styles: Object.assign({}, small, { halign: 'left' }), body: pieRows });
    if (fits) {
      // Como la planilla de la FEU: neutralización a la izquierda y clasificación a la derecha
      const top = y;
      neutTable(L, 122);
      const endLeft = doc.lastAutoTable.finalY;
      clasTable(L + 124, W - 124, top);
      pie(L + 124, W - 124, doc.lastAutoTable.finalY);
      y = Math.max(endLeft, doc.lastAutoTable.finalY);
    } else {
      // Muchos caballos: una tabla debajo de la otra
      neutTable(L, W); clasTable(L, W, doc.lastAutoTable.finalY + 4); pie(L, W, doc.lastAutoTable.finalY);
    }
    const fname = 'Planilla FEU - ' + D.name.replace(/[\\/:*?"<>|]/g, '') + '.pdf';
    const blob = doc.output('blob'), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = fname; document.body.appendChild(link); link.click();
    setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 4000);
    return fname;
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
    STATUS, statusOf, isOut, outLabel, VET_NOTES, VET_OUT, numKey, byNum, parseTable, toParticipants, pName, pShort, pSur, tagHTML, pMap,
    RSTATUS, todayStr, raceStatus, fmtDate, sortRaces, logoHTML, initials, clubPlace,
    stageOf, ofStage, kmOf, fmtKmh, fmtKm, kmText, results, neutralOf, start2Of, exportXlsx, reportData, reportPDF, vetMinOf, hsLong, hsClock, cierreOf, cierreMinOf };
})();
