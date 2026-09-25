// Colores de la app: modo (automático, claro, oscuro, pleno sol) y color principal.
// Se elige desde el botón "Colores" al pie de cada pantalla y queda guardado en este teléfono.
(function () {
  const COLORS = {
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
  let mode = get('raid-modo', 'auto'), color = get('raid-color', 'verde');
  if (!COLORS[color]) color = 'verde';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function apply() {
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    const dark = mode === 'dark' || (mode === 'auto' && mq && mq.matches);
    const c = COLORS[color], [acc, sel] = dark ? c.d : c.l;
    root.style.setProperty('--accent', acc);
    root.style.setProperty('--live', acc);
    root.style.setProperty('--sel', mode === 'sun' ? c.l[1] : sel);
    root.style.setProperty('--accent-ink', dark ? '#0B0F0D' : '#FFFFFF');
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
        + '<div class="tema-l">Color principal</div><div class="tema-colors">' + Object.keys(COLORS).map(k => '<button type="button" data-color="' + k + '"><i style="background:' + COLORS[k].l[0] + '"></i>' + COLORS[k].n + '</button>').join('') + '</div>'
        + '<p class="foot" style="font-size:13px;margin:0">Se guarda solo en este teléfono. No cambia lo que ven los demás.</p>'
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
  window.RaidTema = { open };
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.querySelector('.wrap') || document.body;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost tema-btn'; b.textContent = 'Colores de la app';
    b.addEventListener('click', open);
    wrap.appendChild(b);
  });
})();
