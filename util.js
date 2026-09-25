// Funciones comunes: formato de horas, agrupado por tiempo, largadas.
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
  function sheet(arr, start1) {
    const L = ['Orden\tN°\tGrupo\tLlegada\tDif. 1°\tLargada 2ª'];
    startList(arr, start1).forEach(r => L.push([r.pos, r.num || '?', 'G' + r.group, hms(r.arrive), '+' + dur(r.off), r.start !== null ? hms(r.start) : ''].join('\t')));
    return L.join('\n');
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  return { pad2, sec, hms, dur, sorted, groups, baseStart, startList, sheet, esc, registerSW };
})();
