// Capa de datos. Con Firebase configurado: datos compartidos y en vivo,
// y funciona sin señal (guarda en el teléfono y envía al reconectar).
// Sin configurar: modo demostración, datos solo en este navegador.
//
// Estructura:
//   clubs/{clubId}            nombre, sigla, logo
//   races/{raceId}            nombre, clubId, fecha, estado, hora de largada
//     arrivals/{id}           llegadas
//     participants/{num}      participantes y su estado
//   staff/{email}             cronometristas y sus clubes
//   admins/{email}            administradores FEU
window.Store = (function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = cfg.apiKey && cfg.apiKey !== 'PEGAR_AQUI' && window.firebase;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const low = e => String(e || '').trim().toLowerCase();
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), ms))]);

  // ---------------- FIREBASE ----------------
  function firebaseStore() {
    firebase.initializeApp(cfg);
    const auth = firebase.auth(), db = firebase.firestore();
    // Guardar en el teléfono para trabajar sin señal (no hace falta en Administración).
    if (!window.RAID_NO_PERSIST) db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    const FV = firebase.firestore.FieldValue;
    let user = null, raceId = null, offset = +(lsGet('raid-offset') || 0), clockSynced = false, second = null;
    const errHandlers = [];
    // En iPhone, al salir de Safari (por ejemplo para elegir una foto) a veces se corta el almacenamiento
    // interno y Firebase queda fuera de servicio ("client has already been terminated").
    // En ese caso se recarga la página: lo pendiente queda guardado y se envía al volver.
    function recover(e) {
      const m = String((e && (e.message || e.code)) || e || '');
      if (!/terminated|INTERNAL ASSERTION|IndexedDB|indexeddb/i.test(m)) return false;
      let last = 0; try { last = +sessionStorage.getItem('raid-reload') || 0; } catch (x) {}
      if (Date.now() - last > 20000) { try { sessionStorage.setItem('raid-reload', String(Date.now())); } catch (x) {} setTimeout(() => location.reload(), 300); }
      return true;
    }
    window.addEventListener('unhandledrejection', ev => { if (recover(ev.reason)) ev.preventDefault(); });
    const fail = e => { if (!recover(e)) errHandlers.forEach(f => f(e)); };
    const arrCol = () => db.collection('races').doc(raceId).collection('arrivals');
    const partCol = () => db.collection('races').doc(raceId).collection('participants');
    const list = q => q.docs.map(d => Object.assign({ id: d.id }, d.data()));
    async function commitChunks(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = db.batch();
        ops.slice(i, i + 400).forEach(o => o(b));
        await b.commit();
      }
    }
    async function syncClock() {
      // Ajusta el reloj del teléfono a la hora del servidor, así todos los cronometristas usan la misma hora.
      try {
        const ref = db.collection('ping').doc(user.uid);
        const t0 = Date.now();
        await withTimeout(ref.set({ at: FV.serverTimestamp() }), 10000);
        const t1 = Date.now();
        const s = await ref.get({ source: 'server' });
        offset = s.data().at.toMillis() - (t0 + t1) / 2;
        clockSynced = true; lsSet('raid-offset', String(offset));
      } catch (e) { /* sin señal: se usa el último ajuste guardado */ }
    }
    const me = () => user ? low(user.email) : '';
    // Foto completa de un raid: sus datos, llegadas y participantes.
    async function raceSnapshot(id) {
      const r = db.collection('races').doc(id);
      const [rd, aq, pq] = await Promise.all([r.get(), r.collection('arrivals').get(), r.collection('participants').get()]);
      return { race: rd.exists ? rd.data() : null, arrivals: list(aq), participants: list(pq) };
    }
    // Guarda una copia antes de borrar. Si no se puede guardar, no se borra nada.
    async function backupRace(id, reason) {
      if (!id) return null;
      try {
        const snap = await withTimeout(raceSnapshot(id), 15000);
        if (!snap.race) return null;
        const ref = db.collection('backups').doc();
        await withTimeout(ref.set({ raceId: id, clubId: snap.race.clubId || '', raceName: snap.race.name || 'Raid', reason, by: me(), atMs: Date.now(), at: FV.serverTimestamp(),
          race: snap.race, arrivals: snap.arrivals, participants: snap.participants, nArr: snap.arrivals.length, nPart: snap.participants.length }), 15000);
        return ref.id;
      } catch (e) {
        throw new Error('No se pudo guardar la copia de seguridad, así que no se borró nada. Revisá la conexión y probá de nuevo.');
      }
    }

    return {
      mode: 'firebase',
      onError: f => errHandlers.push(f),
      onAuth(cb) { auth.onAuthStateChanged(u => { user = u; if (u) syncClock(); cb(u); }); },
      signIn: (email, pass) => auth.signInWithEmailAndPassword(email.trim(), pass),
      signOut: () => auth.signOut(),
      now: () => Date.now() + offset,
      clockInfo: () => ({ synced: clockSynced, offset }),
      me,

      // Qué puede hacer el usuario: administrador FEU y/o cronometrista de ciertos clubes.
      async access() {
        const e = me(); if (!e) return { admin: false, clubs: [] };
        const key = 'raid-access-' + e;
        try {
          let admin = false;
          const a = await withTimeout(db.doc('admins/' + e).get(), 8000);
          if (a.exists) admin = true;
          else {
            // Los administradores escritos en las reglas quedan registrados la primera vez que entran.
            try { await withTimeout(db.doc('admins/' + e).set({ email: e, at: FV.serverTimestamp() }), 8000); admin = true; } catch (x) { admin = false; }
          }
          const s = await withTimeout(db.doc('staff/' + e).get(), 8000);
          const res = { admin, clubs: s.exists ? (s.data().clubs || []) : [] };
          lsSet(key, JSON.stringify(res));
          return res;
        } catch (x) {
          try { return JSON.parse(lsGet(key)) || { admin: false, clubs: [], offline: true }; } catch (y) { return { admin: false, clubs: [], offline: true }; }
        }
      },

      watchClubs(cb) { return db.collection('clubs').onSnapshot(q => cb(list(q)), fail); },
      watchRaces(cb) { return db.collection('races').onSnapshot(q => cb(list(q)), fail); },

      // Sigue un raid: sus datos, llegadas y participantes.
      watch(id, cb) {
        raceId = id;
        let race = null, arrivals = [], participants = [], meta = { pending: false, fromCache: true };
        const emit = () => cb({ raceId: id, race, arrivals, participants, meta });
        const u1 = db.collection('races').doc(id).onSnapshot(r => { race = r.exists ? Object.assign({ id }, r.data()) : null; emit(); }, fail);
        const u2 = db.collection('races').doc(id).collection('arrivals').onSnapshot({ includeMetadataChanges: true }, q => {
          arrivals = list(q); meta = { pending: q.metadata.hasPendingWrites, fromCache: q.metadata.fromCache }; emit();
        }, fail);
        const u3 = db.collection('races').doc(id).collection('participants').onSnapshot(q => { participants = list(q); emit(); }, fail);
        return () => { u1(); u2(); u3(); };
      },
      add(t, num, stage) {
        if (!raceId) return null;
        const ref = arrCol().doc();
        ref.set({ t, num: num || '', stage: stage === 2 ? 2 : 1, seq: Date.now() + offset + Math.random(), by: me(), at: FV.serverTimestamp() }).catch(fail);
        return ref.id;
      },
      update(id, patch) { arrCol().doc(id).update(patch).catch(fail); },
      remove(id) { arrCol().doc(id).delete().catch(fail); },
      moveGroup(ids, t) { const b = db.batch(); ids.forEach(id => b.update(arrCol().doc(id), { t })); b.commit().catch(fail); },
      removeMany(ids) { const b = db.batch(); ids.forEach(id => b.delete(arrCol().doc(id))); b.commit().catch(fail); },
      setRace(patch) { if (raceId) db.collection('races').doc(raceId).set(patch, { merge: true }).catch(fail); },
      async importParticipants(items, replace) {
        if (!raceId) throw new Error('Elegí un raid primero');
        if (replace) await backupRace(raceId, 'Antes de reemplazar la lista de participantes');
        const col = partCol(), keep = new Set(items.map(p => p.num)), ops = [];
        if (replace) (await col.get()).docs.forEach(d => { if (!keep.has(d.id)) ops.push(b => b.delete(col.doc(d.id))); });
        items.forEach(p => ops.push(b => b.set(col.doc(p.num), { num: p.num, data: p.data, order: p.order }, { merge: true })));
        await commitChunks(ops);
      },
      setStatus(num, status) { if (raceId) partCol().doc(num).set({ num, status }, { merge: true }).catch(fail); },
      async clearParticipants() { if (!raceId) return; await backupRace(raceId, 'Antes de borrar la lista de participantes'); const col = partCol(); const ds = (await col.get()).docs; await commitChunks(ds.map(d => b => b.delete(col.doc(d.id)))); },
      backupNow(reason) { return backupRace(raceId, reason || 'Copia manual'); },
      snapshot: () => raceSnapshot(raceId),

      // ---- Administración ----
      async saveClub(id, data) { const ref = id ? db.collection('clubs').doc(id) : db.collection('clubs').doc(); try { await ref.set(data, { merge: true }); } catch (e) { if (recover(e)) throw new Error('Se reinició la conexión. La página se recarga: volvé a tocar Crear club.'); throw e; } return ref.id; },
      deleteClub(id) { return db.collection('clubs').doc(id).delete(); },
      async saveRace(id, data) {
        const ref = id ? db.collection('races').doc(id) : db.collection('races').doc();
        await ref.set(id ? data : Object.assign({ start1: '', createdAt: FV.serverTimestamp() }, data), { merge: true });
        return ref.id;
      },
      async deleteRace(id) {
        await backupRace(id, 'Antes de borrar el raid');
        const r = db.collection('races').doc(id), ops = [];
        for (const sub of ['arrivals', 'participants']) (await r.collection(sub).get()).docs.forEach(d => ops.push(b => b.delete(d.ref)));
        ops.push(b => b.delete(r));
        await commitChunks(ops);
      },
      watchStaff(cb) { return db.collection('staff').onSnapshot(q => cb(list(q)), fail); },
      saveStaff(email, data) { return db.collection('staff').doc(low(email)).set(Object.assign({ email: low(email) }, data), { merge: true }); },
      deleteStaff(email) { return db.collection('staff').doc(low(email)).delete(); },
      watchAdmins(cb) { return db.collection('admins').onSnapshot(q => cb(list(q)), fail); },
      addAdmin(email) { return db.collection('admins').doc(low(email)).set({ email: low(email), at: FV.serverTimestamp() }); },
      removeAdmin(email) { return db.collection('admins').doc(low(email)).delete(); },
      // Crea el usuario y contraseña sin cerrar la sesión del administrador.
      async createLogin(email, pass) {
        second = second || firebase.initializeApp(cfg, 'altas');
        const a = second.auth();
        await a.setPersistence(firebase.auth.Auth.Persistence.NONE);
        try { await a.createUserWithEmailAndPassword(low(email), pass); } finally { try { await a.signOut(); } catch (e) {} }
      },
      resetPassword(email) { return auth.sendPasswordResetEmail(low(email)); },
      // ---- Copias de seguridad ----
      watchBackups(cb) { return db.collection('backups').orderBy('atMs', 'desc').limit(60).onSnapshot(q => cb(list(q)), fail); },
      async restoreBackup(b) {
        await backupRace(b.raceId, 'Antes de restaurar una copia');
        const r = db.collection('races').doc(b.raceId), ops = [];
        for (const sub of ['arrivals', 'participants']) (await r.collection(sub).get()).docs.forEach(d => ops.push(x => x.delete(d.ref)));
        ops.push(x => x.set(r, b.race || {}));
        (b.arrivals || []).forEach(a => { const d = Object.assign({}, a); const id = d.id; delete d.id; ops.push(x => x.set(r.collection('arrivals').doc(id), d)); });
        (b.participants || []).forEach(p => { const d = Object.assign({}, p); const id = d.id || d.num; delete d.id; ops.push(x => x.set(r.collection('participants').doc(id), d)); });
        await commitChunks(ops);
      },
      deleteBackup(id) { return db.collection('backups').doc(id).delete(); }
    };
  }

  // ---------------- DEMOSTRACIÓN ----------------
  function demoStore() {
    const KEY = 'raid-demo-v5';
    const pad = n => String(n).padStart(2, '0');
    const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = days => { const d = new Date(); d.setDate(d.getDate() + days); return dstr(d); };
    function seed() {
      const d = new Date(); d.setHours(11, 42, 17, 0); const b = d.getTime();
      const offs = [[27, 0], [14, 38], [31, 38], [8, 40], [45, 41], [3, 41], [19, 95], [22, 95], [11, 95], [5, 95], [40, 98], [16, 98], [33, 99], [2, 99], [29, 100]];
      const names = { 2: ['Tábano', 'L. Silva'], 3: ['Lucero', 'M. Rodríguez'], 5: ['Pampero', 'A. Gómez'], 6: ['Chimango', 'F. Núñez'], 8: ['Tordillo', 'P. Méndez'], 9: ['Zorzal', 'C. Pereira'], 11: ['Malacara', 'J. Acosta'], 12: ['Ñandú', 'R. Sosa'], 14: ['Bagual', 'D. Fernández'], 16: ['Cimarrón', 'S. López'], 17: ['Alazán', 'G. Martínez'], 18: ['Tero', 'E. Cabrera'], 19: ['Moro', 'N. Díaz'], 22: ['Picazo', 'V. Castro'], 24: ['Carancho', 'H. Suárez'], 25: ['Overo', 'I. Ramos'], 27: ['Gateado', 'B. Olivera'], 29: ['Rosillo', 'T. Benítez'], 31: ['Colorado', 'M. Ferreira'], 33: ['Zaino', 'K. Álvarez'], 36: ['Hornero', 'O. Viera'], 38: ['Tostado', 'U. Correa'], 40: ['Pangaré', 'W. Techera'], 41: ['Yaguareté', 'Y. Moreira'], 45: ['Bayo', 'Q. Silveira'] };
      const status = { 17: 'abandono', 25: 'retirado' };
      const participants = Object.keys(names).map((n, i) => ({ id: n, num: n, order: i, data: { Caballo: names[n][0], Jinete: names[n][1], Categoría: +n % 3 ? '80 km' : '80 km Jóvenes' }, status: status[n] || 'carrera' }));
      const past = new Date(); past.setDate(past.getDate() - 21); past.setHours(12, 5, 0, 0);
      return {
        clubs: { c1: { name: 'Club Hípico del Este', short: 'CHE', logo: '' }, c2: { name: 'Sociedad Criolla Los Horneros', short: 'SCLH', logo: '' } },
        races: {
          r1: { name: 'Raid de la Primavera', place: 'Minas, Lavalleja', km1: 45, km2: 35, clubId: 'c1', date: shift(0), status: '', start0: '08:30:00', start1: '', participants, arrivals: offs.map(([n, s], i) => ({ id: 'e' + i, seq: i + 1, t: b + s * 1000, num: String(n), by: 'demo' })) },
          r2: { name: 'Raid Aniversario', km1: 50, km2: 40, place: 'Sarandí Grande, Florida', clubId: 'c2', date: shift(14), status: '', start1: '', participants: [], arrivals: [] },
          r3: { name: 'Raid de Invierno', place: 'Minas, Lavalleja', km1: 45, km2: 35, clubId: 'c1', date: shift(-21), status: '', start0: '09:00:00', start1: '13:00:00', participants: participants.filter(p => ['27', '14', '8', '3'].includes(p.num)).map(p => Object.assign({}, p, { status: 'carrera' })),
            arrivals: [[27, 0], [14, 52], [8, 52], [3, 130]].map(([n, s], i) => ({ id: 'p' + i, stage: 1, seq: i + 1, t: past.getTime() + s * 1000, num: String(n), by: 'demo' }))
              .concat([[14, 8410], [27, 8440], [8, 8700], [3, 9600]].map(([n, s], i) => ({ id: 'q' + i, stage: 2, seq: 10 + i, t: past.getTime() + 3300 * 1000 + s * 1000, num: String(n), by: 'demo' }))) }
        },
        staff: { 'cronometrista@ejemplo.com': { email: 'cronometrista@ejemplo.com', name: 'Cronometrista de ejemplo', clubs: ['c1'] } },
        admins: { demo: { email: 'demo' } }
      };
    }
    const load = () => { try { return JSON.parse(lsGet(KEY)) || seed(); } catch (e) { return seed(); } };
    let st = load(), raceId = null;
    const subs = { race: [], races: [], clubs: [], staff: [], admins: [], backups: [] };
    st.backups = st.backups || {};
    function dbackup(id, reason) {
      const r = st.races[id]; if (!r) return;
      st.backups = st.backups || {};
      const bid = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const race = Object.assign({}, r); delete race.arrivals; delete race.participants;
      st.backups[bid] = { raceId: id, clubId: r.clubId, raceName: r.name, reason, by: 'demo', atMs: Date.now(), race, arrivals: JSON.parse(JSON.stringify(r.arrivals || [])), participants: JSON.parse(JSON.stringify(r.participants || [])), nArr: (r.arrivals || []).length, nPart: (r.participants || []).length };
    }
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const R = () => st.races[raceId];
    const arrOf = obj => Object.keys(obj).map(id => Object.assign({ id }, obj[id]));
    const raceMeta = (id, r) => { const o = Object.assign({ id }, r); delete o.arrivals; delete o.participants; return o; };
    function emit() {
      subs.race.forEach(s => { const r = st.races[s.id]; s.cb({ raceId: s.id, race: r ? raceMeta(s.id, r) : null, arrivals: r ? r.arrivals.slice() : [], participants: r ? (r.participants || []).slice() : [], meta: { pending: false, fromCache: false } }); });
      subs.races.forEach(cb => cb(Object.keys(st.races).map(id => raceMeta(id, st.races[id]))));
      subs.clubs.forEach(cb => cb(arrOf(st.clubs)));
      subs.staff.forEach(cb => cb(arrOf(st.staff)));
      subs.admins.forEach(cb => cb(arrOf(st.admins)));
      subs.backups.forEach(cb => cb(arrOf(st.backups || {}).sort((a, b) => b.atMs - a.atMs)));
    }
    const save = () => { lsSet(KEY, JSON.stringify(st)); emit(); };
    window.addEventListener('storage', e => { if (e.key === KEY) { st = load(); emit(); } });
    const pm = () => { const m = {}; ((R() && R().participants) || []).forEach(p => { m[p.num] = p; }); return m; };
    const later = f => setTimeout(f, 0);
    const sub = (k, cb) => { subs[k].push(cb); later(emit); return () => { subs[k] = subs[k].filter(x => x !== cb); }; };
    return {
      mode: 'demo',
      onError() {},
      onAuth(cb) { later(() => cb({ email: 'demo' })); },
      signIn: () => Promise.resolve(), signOut() {},
      now: () => Date.now(),
      clockInfo: () => ({ synced: false, offset: 0 }),
      me: () => 'demo',
      access: () => Promise.resolve({ admin: true, clubs: Object.keys(st.clubs) }),
      watchClubs: cb => sub('clubs', cb),
      watchRaces: cb => sub('races', cb),
      watch(id, cb) { raceId = id; const s = { id, cb }; subs.race.push(s); later(emit); return () => { subs.race = subs.race.filter(x => x !== s); }; },
      add(t, num, stage) { if (!R()) return null; const id = uid(); R().arrivals.push({ id, t, num: num || '', stage: stage === 2 ? 2 : 1, seq: Date.now() + Math.random(), by: 'demo' }); save(); return id; },
      update(id, patch) { const a = R().arrivals.find(x => x.id === id); if (a) Object.assign(a, patch); save(); },
      remove(id) { R().arrivals = R().arrivals.filter(a => a.id !== id); save(); },
      moveGroup(ids, t) { R().arrivals.forEach(a => { if (ids.includes(a.id)) a.t = t; }); save(); },
      removeMany(ids) { R().arrivals = R().arrivals.filter(a => !ids.includes(a.id)); save(); },
      setRace(patch) { if (R()) { Object.assign(R(), patch); save(); } },
      importParticipants(items, replace) {
        if (replace) dbackup(raceId, 'Antes de reemplazar la lista de participantes');
        const cur = pm(); const keep = new Set(items.map(p => p.num));
        const next = replace ? [] : (R().participants || []).filter(p => !keep.has(p.num));
        items.forEach(p => next.push(Object.assign({ status: 'carrera' }, cur[p.num] || {}, { id: p.num, num: p.num, data: p.data, order: p.order })));
        R().participants = next; save(); return Promise.resolve();
      },
      setStatus(num, status) { const p = pm()[num]; if (p) p.status = status; else (R().participants = R().participants || []).push({ id: num, num, status, data: {} }); save(); },
      clearParticipants() { dbackup(raceId, 'Antes de borrar la lista de participantes'); R().participants = []; save(); return Promise.resolve(); },
      backupNow(reason) { dbackup(raceId, reason || 'Copia manual'); save(); return Promise.resolve(); },
      snapshot: () => Promise.resolve(R() ? { race: raceMeta(raceId, R()), arrivals: R().arrivals.slice(), participants: (R().participants || []).slice() } : null),
      saveClub(id, data) { id = id || 'c' + uid(); st.clubs[id] = Object.assign(st.clubs[id] || {}, data); save(); return Promise.resolve(id); },
      deleteClub(id) { delete st.clubs[id]; save(); return Promise.resolve(); },
      saveRace(id, data) { const nid = id || 'r' + uid(); st.races[nid] = Object.assign(st.races[nid] || { start1: '', arrivals: [], participants: [] }, data); save(); return Promise.resolve(nid); },
      deleteRace(id) { dbackup(id, 'Antes de borrar el raid'); delete st.races[id]; save(); return Promise.resolve(); },
      watchStaff: cb => sub('staff', cb),
      saveStaff(email, data) { const e = low(email); st.staff[e] = Object.assign(st.staff[e] || { email: e }, data); save(); return Promise.resolve(); },
      deleteStaff(email) { delete st.staff[low(email)]; save(); return Promise.resolve(); },
      watchAdmins: cb => sub('admins', cb),
      addAdmin(email) { st.admins[low(email)] = { email: low(email) }; save(); return Promise.resolve(); },
      removeAdmin(email) { delete st.admins[low(email)]; save(); return Promise.resolve(); },
      createLogin() { return Promise.resolve(); },
      resetPassword() { return Promise.resolve(); },
      watchBackups: cb => sub('backups', cb),
      restoreBackup(b) { dbackup(b.raceId, 'Antes de restaurar una copia'); st.races[b.raceId] = Object.assign({}, b.race, { arrivals: JSON.parse(JSON.stringify(b.arrivals || [])), participants: JSON.parse(JSON.stringify(b.participants || [])) }); save(); return Promise.resolve(); },
      deleteBackup(id) { delete st.backups[id]; save(); return Promise.resolve(); }
    };
  }

  if (cfg.apiKey && cfg.apiKey !== 'PEGAR_AQUI' && !window.firebase) {
    // Está configurado pero no cargó Firebase (sin internet la primera vez): no caer en modo demo.
    const noop = () => {};
    return { mode: 'nosdk', onError: noop, onAuth: noop, watch: noop, watchRaces: noop, watchClubs: noop, now: () => Date.now(), clockInfo: () => ({ synced: false, offset: 0 }) };
  }
  return configured ? firebaseStore() : demoStore();
})();
