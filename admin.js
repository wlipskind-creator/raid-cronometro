(function () {
  const S = window.Store, $ = id => document.getElementById(id);
  const { esc, RSTATUS, raceStatus, fmtDate, sortRaces, logoHTML, clubPlace, kmOf, fmtKm, exportXlsx, reportPDF } = window.R;
  let clubs = [], races = [], staff = [], admins = [], backups = [], me = '', delRace = null, restoring = null;
  let editRace = null, editClub = null, editStaff = null, logoData = null, confirmKey = null, cols = null;

  if (S.mode === 'demo') $('demo-banner').hidden = false;
  if (S.mode === 'nosdk') { $('nosdk-banner').hidden = false; return; }

  function show(id) { ['login', 'denied', 'app'].forEach(k => { $(k).hidden = k !== id; if (k === 'app') $(k).style.display = k === id ? 'flex' : 'none'; }); }
  function note(id, t, warn) { $(id).textContent = t || ''; $(id).className = 'msg' + (warn ? ' warn' : ''); }
  const errText = e => {
    const c = e && e.code;
    if (c === 'permission-denied') return 'No tenés permiso para hacer esto.';
    if (c === 'auth/email-already-in-use') return 'Ese correo ya tenía usuario.';
    if (c === 'auth/weak-password') return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (c === 'auth/invalid-email') return 'El correo no es válido.';
    return (e && e.message) || String(e);
  };

  // ---------- Ingreso ----------
  let listening = false;
  S.onAuth(async u => {
    if (!u) { show('login'); return; }
    me = String(u.email || '').toLowerCase();
    $('who').textContent = me;
    const acc = await S.access();
    if (!acc.admin) { show('denied'); return; }
    show('app');
    if (!listening) {
      listening = true;
      S.watchClubs(l => { clubs = l.sort((a, b) => (a.name || '').localeCompare(b.name || '')); renderAll(); });
      S.watchRaces(l => { races = l; renderRaces(); renderClubs(); });
      S.watchStaff(l => { staff = l.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)); renderStaff(); });
      S.watchAdmins(l => { admins = l; renderAdmins(); });
      S.watchBackups(l => { backups = l; renderBackups(); });
    }
  });
  $('login-form').addEventListener('submit', e => {
    e.preventDefault(); note('login-msg', 'Entrando…');
    S.signIn($('email').value.trim(), $('pass').value).then(() => note('login-msg', '')).catch(() => note('login-msg', 'No se pudo entrar: revisá el correo y la contraseña.', true));
  });
  $('logout').addEventListener('click', () => S.signOut());
  $('logout2').addEventListener('click', () => S.signOut());

  const VIEWS = ['raids', 'clubs', 'staff', 'admins', 'backups'];
  function setView(v) { VIEWS.forEach(k => { $('tab-' + k).setAttribute('aria-selected', k === v); $('view-' + k).hidden = k !== v; $('view-' + k).style.display = k === v ? 'flex' : 'none'; }); }
  VIEWS.forEach(k => $('tab-' + k).addEventListener('click', () => setView(k)));

  const clubName = id => { const c = clubs.find(x => x.id === id); return c ? c.name : 'Sin club'; };
  // Botón de borrar con confirmación en dos toques
  function armed(key) { if (confirmKey === key) { confirmKey = null; return true; } confirmKey = key; renderAll(); setTimeout(() => { if (confirmKey === key) { confirmKey = null; renderAll(); } }, 4000); return false; }
  const delBtn = (key, label) => '<button class="ghost danger" data-del="' + esc(key) + '">' + (confirmKey === key ? '¿Seguro? Tocá de nuevo' : label) + '</button>';
  function renderAll() { renderRaces(); renderClubs(); renderStaff(); renderAdmins(); renderBackups(); renderClubOptions(); }

  // ---------- Raids ----------
  function renderClubOptions() {
    const cur = $('r-club').value;
    $('r-club').innerHTML = '<option value="">Elegí un club…</option>' + clubs.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    if (cur) $('r-club').value = cur;
    const checked = new Set([...document.querySelectorAll('#s-clubs input:checked')].map(i => i.value));
    $('s-clubs').innerHTML = clubs.length ? clubs.map(c => '<label><input type="checkbox" value="' + esc(c.id) + '"' + (checked.has(c.id) ? ' checked' : '') + '> ' + esc(c.name) + '</label>').join('') : '<span class="foot">Primero creá los clubes.</span>';
  }
  function renderRaces() {
    const l = sortRaces(races);
    $('raid-list').innerHTML = l.length ? l.map(r => {
      const st = raceStatus(r), c = clubs.find(x => x.id === r.clubId);
      return '<div class="arow">' + logoHTML(c, 40) + '<div class="main"><b>' + esc(r.name || 'Raid') + '</b><small>' + esc(clubPlace(r, c)) + ' · ' + esc(fmtDate(r.date)) + ' · <span class="badge ' + st + '">' + RSTATUS[st] + '</span>' + (r.status ? '' : ' (automático)') + '</small></div>'
        + '<div class="actions"><button class="ghost" data-pdf="' + esc(r.id) + '">Planilla PDF</button><button class="ghost" data-edit-race="' + esc(r.id) + '">Editar</button><button class="ghost danger" data-delrace="' + esc(r.id) + '">Borrar</button></div></div>';
    }).join('') : '<div class="empty-list">Todavía no hay raids.</div>';
  }
  $('raid-list').addEventListener('click', async e => {
    const pd = e.target.closest('[data-pdf]');
    if (pd) {
      note('r-msg', 'Preparando la planilla…');
      try { const snap = await S.snapshotOf(pd.dataset.pdf); if (!snap || !snap.race) throw new Error('No se encontró el raid.');
        const f = await reportPDF(snap.arrivals, snap.race, snap.participants, clubs.find(c => c.id === snap.race.clubId)); note('r-msg', 'Planilla lista: ' + f); }
      catch (x) { note('r-msg', errText(x), true); }
      return;
    }
    const ed = e.target.closest('[data-edit-race]');
    if (ed) {
      const r = races.find(x => x.id === ed.dataset.editRace); if (!r) return;
      editRace = r.id; $('r-name').value = r.name || ''; $('r-club').value = r.clubId || ''; $('r-place').value = r.place || ''; $('r-km1').value = r.km1 ? String(r.km1).replace('.', ',') : ''; $('r-km2').value = r.km2 ? String(r.km2).replace('.', ',') : ''; kmTotal(); $('r-date').value = r.date || ''; $('r-status').value = RSTATUS[r.status] ? r.status : '';
      $('raid-form-title').textContent = 'Editar raid'; $('r-save').textContent = 'Guardar cambios'; $('r-cancel').hidden = false; note('r-msg', '');
      $('raid-form').scrollIntoView({ behavior: 'smooth' }); return;
    }
    const d = e.target.closest('[data-delrace]');
    if (d) {
      const r = races.find(x => x.id === d.dataset.delrace); if (!r) return;
      delRace = r.id; $('rdel').hidden = false; $('rdel-input').value = ''; $('rdel-yes').disabled = true;
      $('rdel-text').innerHTML = 'Vas a borrar <b>' + esc(r.name || 'Raid') + '</b> (' + esc(fmtDate(r.date)) + ') con <b>todas sus llegadas y su lista de participantes</b>.';
      $('rdel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  $('rdel-input').addEventListener('input', () => { $('rdel-yes').disabled = $('rdel-input').value.trim().toUpperCase() !== 'BORRAR'; });
  $('rdel-no').addEventListener('click', () => { delRace = null; $('rdel').hidden = true; });
  $('rdel-yes').addEventListener('click', async () => {
    if (!delRace) return;
    $('rdel-yes').disabled = true; note('r-msg', 'Guardando copia y borrando…');
    try { await S.deleteRace(delRace); note('r-msg', 'Raid borrado. Quedó una copia de seguridad en la pestaña Copias.'); $('rdel').hidden = true; delRace = null; }
    catch (x) { note('r-msg', errText(x), true); $('rdel-yes').disabled = false; }
  });
  function kmTotal() { const t = kmOf($('r-km1').value) + kmOf($('r-km2').value); $('r-kmt').textContent = t ? '= ' + fmtKm(t) : ''; }
  ['r-km1', 'r-km2'].forEach(id => $(id).addEventListener('input', kmTotal));
  function resetRaceForm() { editRace = null; $('raid-form').reset(); $('r-kmt').textContent = ''; $('raid-form-title').textContent = 'Nuevo raid'; $('r-save').textContent = 'Crear raid'; $('r-cancel').hidden = true; }
  $('r-cancel').addEventListener('click', () => { resetRaceForm(); note('r-msg', ''); });
  $('raid-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = { name: $('r-name').value.trim(), clubId: $('r-club').value, place: $('r-place').value.trim(), km1: kmOf($('r-km1').value), km2: kmOf($('r-km2').value), date: $('r-date').value, status: $('r-status').value };
    if (!data.clubId) { note('r-msg', 'Elegí el club organizador.', true); return; }
    try { await S.saveRace(editRace, data); note('r-msg', editRace ? 'Cambios guardados.' : 'Raid creado: ' + data.name + '.'); resetRaceForm(); } catch (x) { note('r-msg', errText(x), true); }
  });

  // ---------- Clubes ----------
  function renderClubs() {
    $('club-list').innerHTML = clubs.length ? clubs.map(c => {
      const n = races.filter(r => r.clubId === c.id).length, cr = staff.filter(s => (s.clubs || []).includes(c.id)).length;
      return '<div class="arow">' + logoHTML(c, 40) + '<div class="main"><b>' + esc(c.name) + '</b>' + (c.col1 ? '<span class="clubband sm" style="background:' + window.R.clubStripe(c) + '"></span>' : '') + '<small>' + (c.short ? esc(c.short) + ' · ' : '') + n + ' raid' + (n === 1 ? '' : 's') + ' · ' + cr + ' cronometrista' + (cr === 1 ? '' : 's') + '</small></div>'
        + '<div class="actions"><button class="ghost" data-edit-club="' + esc(c.id) + '">Editar</button>' + delBtn('club:' + c.id, 'Borrar') + '</div></div>';
    }).join('') : '<div class="empty-list">Todavía no hay clubes. Creá el primero arriba.</div>';
  }
  // Colores de la camiseta (null = sin colores)
  function setCols(c) {
    cols = c && c.col1 ? { col1: c.col1, col2: c.col2 || '' } : null;
    if (cols) { $('c-col1').value = cols.col1; $('c-col2').value = cols.col2 || '#FFFFFF'; }
    $('c-band').style.background = cols ? window.R.clubStripe(cols) : 'transparent';
    $('c-band').hidden = !cols; $('c-col-clear').hidden = !cols;
    $('c-col-note').textContent = cols ? 'La app toma el color del club en sus raids: botón LLEGÓ, resaltados y una franja arriba.' : 'Sin colores: la app usa el verde de siempre. Tocá un cuadrado para elegir.';
    setLogo(logoData);
  }
  ['c-col1', 'c-col2'].forEach(id => $(id).addEventListener('input', () => setCols({ col1: $('c-col1').value, col2: $('c-col2').value })));
  $('c-col-clear').addEventListener('click', () => setCols(null));
  function setLogo(d) { logoData = d; $('c-logo-prev').innerHTML = logoHTML(Object.assign({ logo: d, name: $('c-name').value, short: $('c-short').value }, cols || {}), 56); $('c-logo-clear').hidden = !d; }
  $('club-list').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-club]');
    if (ed) {
      const c = clubs.find(x => x.id === ed.dataset.editClub); if (!c) return;
      editClub = c.id; $('c-name').value = c.name || ''; $('c-short').value = c.short || ''; logoData = c.logo || ''; setCols(c);
      $('club-form-title').textContent = 'Editar club'; $('c-save').textContent = 'Guardar cambios'; $('c-cancel').hidden = false; note('c-msg', '');
      $('club-form').scrollIntoView({ behavior: 'smooth' }); return;
    }
    const d = e.target.closest('[data-del]');
    if (d && d.dataset.del.startsWith('club:')) {
      const id = d.dataset.del.slice(5);
      if (races.some(r => r.clubId === id)) { note('c-msg', 'Este club tiene raids. Borralos o pasalos a otro club antes de borrarlo.', true); return; }
      if (!armed(d.dataset.del)) return;
      try { await S.deleteClub(id); note('c-msg', 'Club borrado.'); } catch (x) { note('c-msg', errText(x), true); }
    }
  });
  // Achica el logo a 160 px para que quede liviano
  $('c-logo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 160, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const png = cv.toDataURL('image/png'), jpg = cv.toDataURL('image/jpeg', 0.85);
      setLogo(/png|svg|gif|webp/.test(f.type) && png.length < 120000 ? png : jpg);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => note('c-msg', 'No se pudo leer la imagen. Probá con un JPG o PNG.', true);
    img.src = url; e.target.value = '';
  });
  $('c-logo-clear').addEventListener('click', () => setLogo(''));
  ['c-name', 'c-short'].forEach(id => $(id).addEventListener('input', () => setLogo(logoData)));
  function resetClubForm() { editClub = null; $('club-form').reset(); logoData = ''; setCols(null); $('club-form-title').textContent = 'Nuevo club'; $('c-save').textContent = 'Crear club'; $('c-cancel').hidden = true; }
  $('c-cancel').addEventListener('click', () => { resetClubForm(); note('c-msg', ''); });
  $('club-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = { name: $('c-name').value.trim(), short: $('c-short').value.trim().toUpperCase(), logo: logoData || '', col1: cols ? cols.col1 : '', col2: cols ? (cols.col2 || '') : '' };
    try { await S.saveClub(editClub, data); note('c-msg', editClub ? 'Cambios guardados.' : 'Club creado: ' + data.name + '.'); resetClubForm(); } catch (x) { note('c-msg', errText(x), true); }
  });
  logoData = ''; setCols(null);

  // ---------- Cronometristas ----------
  function renderStaff() {
    $('staff-list').innerHTML = staff.length ? staff.map(s => '<div class="arow"><span class="logo logo-txt" style="width:40px;height:40px;font-size:14px">' + esc((s.name || s.email).slice(0, 2).toUpperCase()) + '</span><div class="main"><b>' + esc(s.name || s.email) + '</b><small>' + (s.name ? esc(s.email) + ' · ' : '') + esc((s.clubs || []).map(clubName).join(', ') || 'Sin club asignado') + '</small></div>'
      + '<div class="actions"><button class="ghost" data-edit-staff="' + esc(s.email) + '">Editar</button><button class="ghost" data-reset="' + esc(s.email) + '">Contraseña</button>' + delBtn('staff:' + s.email, 'Quitar') + '</div></div>').join('')
      : '<div class="empty-list">Todavía no hay cronometristas.</div>';
  }
  $('staff-list').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-staff]');
    if (ed) {
      const s = staff.find(x => x.email === ed.dataset.editStaff); if (!s) return;
      editStaff = s.email; $('s-email').value = s.email; $('s-email').disabled = true; $('s-name').value = s.name || ''; $('s-pass').value = '';
      document.querySelectorAll('#s-clubs input').forEach(i => { i.checked = (s.clubs || []).includes(i.value); });
      $('staff-form-title').textContent = 'Editar cronometrista'; $('s-cancel').hidden = false; note('s-msg', '');
      $('staff-form').scrollIntoView({ behavior: 'smooth' }); return;
    }
    const rs = e.target.closest('[data-reset]');
    if (rs) { try { await S.resetPassword(rs.dataset.reset); note('s-msg', 'Le mandamos a ' + rs.dataset.reset + ' un correo para elegir una contraseña nueva.'); } catch (x) { note('s-msg', errText(x), true); } return; }
    const d = e.target.closest('[data-del]');
    if (d && d.dataset.del.startsWith('staff:')) {
      if (!armed(d.dataset.del)) return;
      try { await S.deleteStaff(d.dataset.del.slice(6)); note('s-msg', 'Cronometrista quitado. Ya no puede cargar datos.'); } catch (x) { note('s-msg', errText(x), true); }
    }
  });
  function resetStaffForm() { editStaff = null; $('staff-form').reset(); $('s-email').disabled = false; document.querySelectorAll('#s-clubs input').forEach(i => { i.checked = false; }); $('staff-form-title').textContent = 'Nuevo cronometrista'; $('s-cancel').hidden = true; }
  $('s-cancel').addEventListener('click', () => { resetStaffForm(); note('s-msg', ''); });
  $('staff-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = (editStaff || $('s-email').value).trim().toLowerCase(), pass = $('s-pass').value;
    const cl = [...document.querySelectorAll('#s-clubs input:checked')].map(i => i.value);
    if (!cl.length) { note('s-msg', 'Marcá al menos un club.', true); return; }
    note('s-msg', 'Guardando…');
    let extra = '';
    if (pass) {
      try { await S.createLogin(email, pass); extra = ' Ya puede entrar con esa contraseña.'; }
      catch (x) { if (x && x.code === 'auth/email-already-in-use') extra = ' Ya tenía usuario: mantiene su contraseña de antes.'; else { note('s-msg', errText(x), true); return; } }
    }
    try { await S.saveStaff(email, { name: $('s-name').value.trim(), clubs: cl }); note('s-msg', 'Guardado: ' + email + ' puede cronometrar en ' + cl.map(clubName).join(', ') + '.' + extra); resetStaffForm(); }
    catch (x) { note('s-msg', errText(x), true); }
  });

  // ---------- Copias de seguridad ----------
  const when = ms => { const d = new Date(ms); return d.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }); };
  function renderBackups() {
    $('backup-list').innerHTML = backups.length ? backups.map(b => '<div class="arow"><span class="logo logo-txt" style="width:40px;height:40px;font-size:13px">' + esc(when(b.atMs).split(' ').slice(0, 2).join(' ')) + '</span><div class="main"><b>' + esc(b.raceName || 'Raid') + '</b><small>' + esc(when(b.atMs)) + ' · ' + esc(b.reason || '') + '<br>' + (b.nArr || 0) + ' llegadas · ' + (b.nPart || 0) + ' participantes · por ' + esc(b.by || '') + '</small></div>'
      + '<div class="actions"><button class="ghost" data-bdown="' + esc(b.id) + '">Excel</button><button class="ghost" data-brest="' + esc(b.id) + '">Restaurar</button>' + delBtn('backup:' + b.id, 'Borrar') + '</div></div>').join('')
      : '<div class="empty-list">Todavía no hay copias. Se crean solas antes de cada borrado.</div>';
  }
  $('backup-list').addEventListener('click', async e => {
    const dn = e.target.closest('[data-bdown]');
    if (dn) { const b = backups.find(x => x.id === dn.dataset.bdown); if (!b) return; note('b-msg', 'Preparando el Excel…');
      try { await exportXlsx(b, 'Copia ' + (b.raceName || 'raid') + ' ' + new Date(b.atMs).toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h') + '.xlsx'); note('b-msg', 'Excel descargado.'); } catch (x) { note('b-msg', errText(x), true); } return; }
    const rs = e.target.closest('[data-brest]');
    if (rs) { const b = backups.find(x => x.id === rs.dataset.brest); if (!b) return; restoring = b; $('brest').hidden = false; $('brest-input').value = ''; $('brest-yes').disabled = true;
      $('brest-text').innerHTML = 'El raid <b>' + esc(b.raceName || 'Raid') + '</b> va a quedar como estaba el <b>' + esc(when(b.atMs)) + '</b>: ' + (b.nArr || 0) + ' llegadas y ' + (b.nPart || 0) + ' participantes.';
      $('brest').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const d = e.target.closest('[data-del]');
    if (d && d.dataset.del.startsWith('backup:')) { if (!armed(d.dataset.del)) return; try { await S.deleteBackup(d.dataset.del.slice(7)); note('b-msg', 'Copia borrada.'); } catch (x) { note('b-msg', errText(x), true); } }
  });
  $('brest-input').addEventListener('input', () => { $('brest-yes').disabled = $('brest-input').value.trim().toUpperCase() !== 'RESTAURAR'; });
  $('brest-no').addEventListener('click', () => { restoring = null; $('brest').hidden = true; });
  $('brest-yes').addEventListener('click', async () => {
    if (!restoring) return; $('brest-yes').disabled = true; note('b-msg', 'Restaurando…');
    try { await S.restoreBackup(restoring); note('b-msg', 'Listo: el raid quedó como en la copia. Lo que había antes quedó guardado en una copia nueva.'); $('brest').hidden = true; restoring = null; }
    catch (x) { note('b-msg', errText(x), true); $('brest-yes').disabled = false; }
  });

  // ---------- Administradores ----------
  function renderAdmins() {
    $('admin-list').innerHTML = admins.length ? admins.map(a => '<div class="arow"><span class="logo logo-txt" style="width:40px;height:40px;font-size:14px">FEU</span><div class="main"><b>' + esc(a.email || a.id) + '</b><small>' + ((a.email || a.id) === me ? 'Vos' : 'Administrador') + '</small></div><div class="actions">' + ((a.email || a.id) === me ? '' : delBtn('admin:' + (a.email || a.id), 'Quitar')) + '</div></div>').join('')
      : '<div class="empty-list">Sin administradores registrados.</div>';
  }
  $('admin-list').addEventListener('click', async e => {
    const d = e.target.closest('[data-del]');
    if (d && d.dataset.del.startsWith('admin:')) {
      if (!armed(d.dataset.del)) return;
      try { await S.removeAdmin(d.dataset.del.slice(6)); note('a-msg', 'Administrador quitado. Si figura en las reglas de Firebase, lo sigue siendo hasta que lo saques de ahí.'); } catch (x) { note('a-msg', errText(x), true); }
    }
  });
  $('admin-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('a-email').value.trim().toLowerCase(), pass = $('a-pass').value;
    note('a-msg', 'Guardando…'); let extra = '';
    if (pass) {
      try { await S.createLogin(email, pass); extra = ' Ya puede entrar con esa contraseña.'; }
      catch (x) { if (x && x.code === 'auth/email-already-in-use') extra = ' Ya tenía usuario.'; else { note('a-msg', errText(x), true); return; } }
    }
    try { await S.addAdmin(email); note('a-msg', email + ' ahora es administrador.' + extra); $('admin-form').reset(); } catch (x) { note('a-msg', errText(x), true); }
  });
})();
