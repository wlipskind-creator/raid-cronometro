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

  function sheet(arr, start1, parts) {
    const pm = pMap(parts);
    const L = ['Orden\tN°\tCaballo / Jinete\tGrupo\tLlegada\tDif. 1°\tLargada 2ª'];
    startList(arr, start1).forEach(r => L.push([r.pos, r.num || '?', pName(pm[r.num]), 'G' + r.group, hms(r.arrive), '+' + dur(r.off), r.start !== null ? hms(r.start) : ''].join('\t')));
    const out = (parts || []).filter(p => statusOf(p) !== 'carrera').sort(byNum);
    if (out.length) { L.push(''); L.push('N°\tCaballo / Jinete\tEstado'); out.forEach(p => L.push([p.num, pName(p), STATUS[statusOf(p)]].join('\t'))); }
    return L.join('\n');
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  return { pad2, sec, hms, dur, sorted, groups, baseStart, startList, sheet, esc, registerSW,
    STATUS, statusOf, numKey, byNum, parseTable, toParticipants, pName, pShort, pMap };
})();
