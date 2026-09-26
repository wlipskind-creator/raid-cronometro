// Colores de la app: modo (automático, claro, oscuro, pleno sol) y color principal.
// Se elige desde el botón "Colores" al pie de cada pantalla y queda guardado en este teléfono.
(function () {
  const COLORS = {
    club:    { n: 'Del club', l: ['#1D6A43', '#D9EDE2'], d: ['#3FB97C', '#1F3A2B'] },
    verde:   { n: 'Verde',   l: ['#1D6A43', '#D9EDE2'], d: ['#3FB97C', '#1F3A2B'] },
    azul:    { n: 'Azul',    l: ['#1F5FA8', '#DCE8F7'], d: ['#5EA3F0', '#1B2E45'] },
    celeste: { n: 'Celeste', l: ['#0B7A9E', '#D6EEF5'], d: ['#4CC3E8', '#15343F'] },
    rojo:    { n: 'Rojo',    l: ['#B0282E', '#F7DCDC'], d: ['#F26B6B', '#44201F'] },
    naranja: { n: 'Naranja', l: ['#B85A00', '#FBE6D0'], d: ['#F59A3C', '#43301A'] },
    violeta: { n: 'Violeta', l: ['#6A3FA8', '#E7DEF6'], d: ['#A887F0', '#2F2445'] },
    negro:   { n: 'Negro',   l: ['#1B1B1B', '#E4E4E4'], d: ['#E6E6E6', '#383838'] }
  };
  const MODES = [['auto', 'Automático', 'Como el teléfono'], ['light', 'Claro', ''], ['dark', 'Oscuro', 'Para la noche'], ['sun', 'Pleno sol', 'Máximo contraste']];
  const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let box = null;
  let mode = get('raid-modo', 'auto'), color = get('raid-color', 'club'), club = null;
  if (!COLORS[color]) color = 'club';
  // ---- Cuentas de color: el color del club se aclara u oscurece hasta que se lea bien ----
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const rgb2hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lum = c => { const f = v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); const [r, g, b] = c.map(f); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  function rgb2hsl([r, g, b]) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
  function hsl2rgb([h, s, l]) { if (!s) return [l, l, l]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const t = x => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < .5 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; }; return [t(h + 1 / 3), t(h), t(h - 1 / 3)]; }
  const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
  // Elige el color de la camiseta con más "color" (si uno es blanco o negro, usa el otro)
  // Devuelve [color para la app, segundo color o null]. Si uno es blanco o negro, no sirve para botones.
  const plain = x => { const [, s, l] = rgb2hsl(x); return l < .1 || l > .92 || (s < .12 && (l < .2 || l > .85)); };
  function clubPair(c) {
    const ok = v => /^#[0-9a-f]{6}$/i.test(v || '');
    const list = [c.col1, c.col2].filter(ok).map(hex2rgb);
    if (!list.length) return null;
    let [a, b] = list;
    if (b && plain(a) && !plain(b)) [a, b] = [b, a];
    return [a, b && !plain(b) && contrast(a, b) > 1.3 ? b : null];
  }
  // Ajusta la luminosidad hasta tener buen contraste con el fondo
  function fit(rgb, bg, dark) {
    let [h, s, l] = rgb2hsl(rgb), out = rgb, n = 0;
    while (contrast(out, bg) < 4.5 && n++ < 60) { l = dark ? Math.min(1, l + .02) : Math.max(0, l - .02); out = hsl2rgb([h, s, l]); }
    return out;
  }
  function clubColors(dark) {
    const pr = club && clubPair(club); if (!pr) return null;
    const bg = hex2rgb(dark ? '#17201B' : '#FFFFFF'), acc = fit(pr[0], bg, dark), acc2 = pr[1] ? fit(pr[1], bg, dark) : acc;
    return [rgb2hex(acc), rgb2hex(mix(bg, acc, dark ? .28 : .16)), rgb2hex(acc2), rgb2hex(mix(bg, acc2, dark ? .28 : .16))];
  }
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function apply() {
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    const dark = mode === 'dark' || (mode === 'auto' && mq && mq.matches);
    const c = COLORS[color] || COLORS.verde, cc = color === 'club' ? clubColors(dark) : null, cl = color === 'club' ? clubColors(false) : null;
    const [acc, sel] = cc || (dark ? c.d : c.l);
    root.style.setProperty('--accent', acc);
    root.style.setProperty('--live', acc);
    root.style.setProperty('--sel', mode === 'sun' ? (cl ? cl[1] : c.l[1]) : sel);
    const stripe = club && window.R && window.R.clubStripe ? window.R.clubStripe(club) : '';
    root.style.setProperty('--club-stripe', stripe || 'none');
    root.classList.toggle('club-on', !!stripe);
    root.style.setProperty('--accent-ink', dark ? '#0B0F0D' : '#FFFFFF');
    root.style.setProperty('--accent2', cc ? cc[2] : acc);
    root.style.setProperty('--sel2', mode === 'sun' ? (cl ? cl[3] : c.l[1]) : (cc ? cc[3] : sel));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && !meta.dataset.fixed) meta.setAttribute('content', dark ? '#0E1411' : acc);
    paint();
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (mode === 'auto') apply(); });
  apply();

  function paint() {
    if (!box) return;
    box.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    box.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', b.dataset.color === color));
  }
  function open() {
    if (!box) {
      box = document.createElement('div');
      box.className = 'tema-back';
      box.innerHTML = '<div class="tema" role="dialog" aria-label="Colores"><h2>Colores</h2>'
        + '<div class="tema-l">Modo</div><div class="tema-modes">' + MODES.map(m => '<button type="button" data-mode="' + m[0] + '"><b>' + m[1] + '</b>' + (m[2] ? '<small>' + m[2] + '</small>' : '') + '</button>').join('') + '</div>'
        + '<div class="tema-l">Color principal</div><div class="tema-colors">' + Object.keys(COLORS).map(k => '<button type="button" data-color="' + k + '"><i style="background:' + (k === 'club' ? 'var(--club-stripe),#1D6A43' : COLORS[k].l[0]) + '"></i>' + COLORS[k].n + (k === 'club' ? '<small>&nbsp;(verde si no tiene)</small>' : '') + '</button>').join('') + '</div>'
        + '<p class="foot" style="font-size:13px;margin:0">Se guarda solo en este teléfono. No cambia lo que ven los demás. «Del club» usa los colores de la camiseta del club que organiza el raid.</p>'
        + '<div class="actions"><button type="button" class="primary" data-close>Listo</button></div></div>';
      box.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (e.target === box || (b && b.hasAttribute('data-close'))) { box.hidden = true; return; }
        if (!b) return;
        if (b.dataset.mode) { mode = b.dataset.mode; set('raid-modo', mode); }
        if (b.dataset.color) { color = b.dataset.color; set('raid-color', color); }
        apply();
      });
      document.body.appendChild(box);
    }
    box.hidden = false; paint();
  }
  // Lo llaman las pantallas al abrir un raid (con su club) o al volver a la lista (null)
  function setClub(c) {
    const key = x => x ? [x.col1, x.col2, x.col3].join() : '';
    if (key(c && c.col1 ? c : null) === key(club)) return;
    club = c && c.col1 ? { col1: c.col1, col2: c.col2 || '', col3: c.col3 || '' } : null; apply();
  }
  window.RaidTema = { open, setClub };
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.querySelector('.wrap') || document.body;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost tema-btn'; b.textContent = 'Colores de la app';
    b.addEventListener('click', open);
    wrap.appendChild(b);
    if (!(window.R && window.R.VERSION)) return;
    const v = document.createElement('p');
    v.className = 'foot'; v.style.cssText = 'text-align:center;font-size:12px;margin:0';
    v.textContent = 'Versión ' + window.R.VERSION;
    wrap.appendChild(v);
  });
})();
