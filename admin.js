(function () {
  const S = window.Store, $ = id => document.getElementById(id);
  const { esc, RSTATUS, raceStatus, fmtDate, sortRaces, logoHTML } = window.R;
  let clubs = [], races = [], staff = [], admins = [], me = '';
  let editRace = null, editClub = null, editStaff = null, logoData = null, confirmKey = null;

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
    }
  });
  $('login-form').addEventListener('submit', e => {
    e.preventDefault(); note('login-msg', 'Entrando…');
    S.signIn($('email').value.trim(), $('pass').value).then(() => note('login-msg', '')).catch(() => note('login-msg', 'No se pudo entrar: revisá el correo y la contraseña.', true));
  });
  $('logout').addEventListener('click', () => S.signOut());
  $('logout2').addEventListener('click', () => S.signOut());

  const VIEWS = ['raids', 'clubs', 'staff', 'admins'];
  function setView(v) { VIEWS.forEach(k => { $('tab-' + k).setAttribute('aria-selected', k === v); $('view-' + k).hidden = k !== v; $('view-' + k).style.display = k === v ? 'flex' : 'none'; }); }
  VIEWS.forEach(k => $('tab-' + k).addEventListener('click', () => setView(k)));

  const clubName = id => { const c = clubs.find(x => x.id === id); return c ? c.name : 'Sin club'; };
  // Botón de borrar con confirmación en dos toques
  function armed(key) { if (confirmKey === key) { confirmKey = null; return true; } confirmKey = key; renderAll(); setTimeout(() => { if (confirmKey === key) { confirmKey = null; renderAll(); } }, 4000); return false; }
  const delBtn = (key, label) => '<button class="ghost danger" data-del="' + esc(key) + '">' + (confirmKey === key ? '¿Seguro? Tocá de nuevo' : label) + '</button>';
  function renderAll() { renderRaces(); renderClubs(); renderStaff(); renderAdmins(); renderClubOptions(); }

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
      return '<div class="arow">' + logoHTML(c, 40) + '<div class="main"><b>' + esc(r.name || 'Raid') + '</b><small>' + esc(clubName(r.clubId)) + ' · ' + esc(fmtDate(r.date)) + ' · <span class="badge ' + st + '">' + RSTATUS[st] + '</span>' + (r.status ? '' : ' (automático)') + '</small></div>'
        + '<div class="actions"><button class="ghost" data-edit-race="' + esc(r.id) + '">Editar</button>' + delBtn('race:' + r.id, 'Borrar') + '</div></div>';
    }).join('') : '<div class="empty-list">Todavía no hay raids.</div>';
  }
  $('raid-list').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-race]');
    if (ed) {
      const r = races.find(x => x.id === ed.dataset.editRace); if (!r) return;
      editRace = r.id; $('r-name').value = r.name || ''; $('r-club').value = r.clubId || ''; $('r-date').value = r.date || ''; $('r-status').value = RSTATUS[r.status] ? r.status : '';
      $('raid-form-title').textContent = 'Editar raid'; $('r-save').textContent = 'Guardar cambios'; $('r-cancel').hidden = false; note('r-msg', '');
      $('raid-form').scrollIntoView({ behavior: 'smooth' }); return;
    }
    const d = e.target.closest('[data-del]');
    if (d && d.dataset.del.startsWith('race:')) {
      const id = d.dataset.del.slice(5);
      if (!armed(d.dataset.del)) return;
      try { await S.deleteRace(id); note('r-msg', 'Raid borrado, con sus llegadas y participantes.'); } catch (x) { note('r-msg', errText(x), true); }
    }
  });
  function resetRaceForm() { editRace = null; $('raid-form').reset(); $('raid-form-title').textContent = 'Nuevo raid'; $('r-save').textContent = 'Crear raid'; $('r-cancel').hidden = true; }
  $('r-cancel').addEventListener('click', () => { resetRaceForm(); note('r-msg', ''); });
  $('raid-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = { name: $('r-name').value.trim(), clubId: $('r-club').value, date: $('r-date').value, status: $('r-status').value };
    if (!data.clubId) { note('r-msg', 'Elegí el club organizador.', true); return; }
    try { await S.saveRace(editRace, data); note('r-msg', editRace ? 'Cambios guardados.' : 'Raid creado: ' + data.name + '.'); resetRaceForm(); } catch (x) { note('r-msg', errText(x), true); }
  });

  // ---------- Clubes ----------
  function renderClubs() {
    $('club-list').innerHTML = clubs.length ? clubs.map(c => {
      const n = races.filter(r => r.clubId === c.id).length, cr = staff.filter(s => (s.clubs || []).includes(c.id)).length;
      return '<div class="arow">' + logoHTML(c, 40) + '<div class="main"><b>' + esc(c.name) + '</b><small>' + (c.short ? esc(c.short) + ' · ' : '') + n + ' raid' + (n === 1 ? '' : 's') + ' · ' + cr + ' cronometrista' + (cr === 1 ? '' : 's') + '</small></div>'
        + '<div class="actions"><button class="ghost" data-edit-club="' + esc(c.id) + '">Editar</button>' + delBtn('club:' + c.id, 'Borrar') + '</div></div>';
    }).join('') : '<div class="empty-list">Todavía no hay clubes. Creá el primero arriba.</div>';
  }
  function setLogo(d) { logoData = d; $('c-logo-prev').innerHTML = logoHTML({ logo: d, name: $('c-name').value, short: $('c-short').value }, 56); $('c-logo-clear').hidden = !d; }
  $('club-list').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-club]');
    if (ed) {
      const c = clubs.find(x => x.id === ed.dataset.editClub); if (!c) return;
      editClub = c.id; $('c-name').value = c.name || ''; $('c-short').value = c.short || ''; setLogo(c.logo || '');
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
  function resetClubForm() { editClub = null; $('club-form').reset(); setLogo(''); $('club-form-title').textContent = 'Nuevo club'; $('c-save').textContent = 'Crear club'; $('c-cancel').hidden = true; }
  $('c-cancel').addEventListener('click', () => { resetClubForm(); note('c-msg', ''); });
  $('club-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = { name: $('c-name').value.trim(), short: $('c-short').value.trim().toUpperCase(), logo: logoData || '' };
    try { await S.saveClub(editClub, data); note('c-msg', editClub ? 'Cambios guardados.' : 'Club creado: ' + data.name + '.'); resetClubForm(); } catch (x) { note('c-msg', errText(x), true); }
  });
  setLogo('');

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
