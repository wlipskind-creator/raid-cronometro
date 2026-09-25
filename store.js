// Capa de datos. Con Firebase configurado: datos compartidos y en vivo,
// y funciona sin señal (guarda en el teléfono y envía al reconectar).
// Sin configurar: modo demostración, datos solo en este navegador.
window.Store = (function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = cfg.apiKey && cfg.apiKey !== 'PEGAR_AQUI' && window.firebase;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  // ---------------- FIREBASE ----------------
  function firebaseStore() {
    firebase.initializeApp(cfg);
    const auth = firebase.auth(), db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    const FV = firebase.firestore.FieldValue;
    let user = null, raceId = null, offset = +(lsGet('raid-offset') || 0), clockSynced = false;
    const errHandlers = [];
    const fail = e => errHandlers.forEach(f => f(e));
    const arrCol = () => db.collection('races').doc(raceId).collection('arrivals');
    const partCol = () => db.collection('races').doc(raceId).collection('participants');
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
        await ref.set({ at: FV.serverTimestamp() });
        const t1 = Date.now();
        const s = await ref.get({ source: 'server' });
        offset = s.data().at.toMillis() - (t0 + t1) / 2;
        clockSynced = true; lsSet('raid-offset', String(offset));
      } catch (e) { /* sin señal: se usa el último ajuste guardado */ }
    }

    return {
      mode: 'firebase',
      onError: f => errHandlers.push(f),
      onAuth(cb) { auth.onAuthStateChanged(u => { user = u; if (u) syncClock(); cb(u); }); },
      signIn: (email, pass) => auth.signInWithEmailAndPassword(email, pass),
      signOut: () => auth.signOut(),
      now: () => Date.now() + offset,
      clockInfo: () => ({ synced: clockSynced, offset }),
      watch(cb) {
        let unR = null, unA = null, unP = null, race = null, arrivals = [], participants = [], meta = { pending: false, fromCache: true }, first = true;
        const emit = () => cb({ raceId, race, arrivals, participants, meta });
        return db.doc('config/actual').onSnapshot(s => {
          const id = s.exists ? s.data().raceId : null;
          if (!first && id === raceId) return;
          first = false;
          raceId = id; if (unR) unR(); if (unA) unA(); if (unP) unP(); unR = unA = unP = null; race = null; arrivals = []; participants = [];
          if (!id) { emit(); return; }
          unR = db.collection('races').doc(id).onSnapshot(r => { race = r.exists ? r.data() : null; emit(); }, fail);
          unA = arrCol().onSnapshot({ includeMetadataChanges: true }, q => {
            arrivals = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
            meta = { pending: q.metadata.hasPendingWrites, fromCache: q.metadata.fromCache };
            emit();
          }, fail);
          unP = partCol().onSnapshot(q => { participants = q.docs.map(d => Object.assign({ id: d.id }, d.data())); emit(); }, fail);
        }, fail);
      },
      add(t, num) {
        if (!raceId) return null;
        const ref = arrCol().doc();
        ref.set({ t, num: num || '', seq: Date.now() + offset + Math.random(), by: (user && user.email) || '', at: FV.serverTimestamp() }).catch(fail);
        return ref.id;
      },
      update(id, patch) { arrCol().doc(id).update(patch).catch(fail); },
      remove(id) { arrCol().doc(id).delete().catch(fail); },
      moveGroup(ids, t) { const b = db.batch(); ids.forEach(id => b.update(arrCol().doc(id), { t })); b.commit().catch(fail); },
      removeMany(ids) { const b = db.batch(); ids.forEach(id => b.delete(arrCol().doc(id))); b.commit().catch(fail); },
      setRace(patch) { if (raceId) db.collection('races').doc(raceId).set(patch, { merge: true }).catch(fail); },
      newRace(name) {
        const ref = db.collection('races').doc(), b = db.batch();
        b.set(ref, { name: name || 'Raid', start1: '', createdAt: FV.serverTimestamp() });
        b.set(db.doc('config/actual'), { raceId: ref.id });
        b.commit().catch(fail);
      },
      async importParticipants(list, replace) {
        if (!raceId) throw new Error('No hay carrera activa');
        const col = partCol(), keep = new Set(list.map(p => p.num)), ops = [];
        if (replace) (await col.get()).docs.forEach(d => { if (!keep.has(d.id)) ops.push(b => b.delete(col.doc(d.id))); });
        list.forEach(p => ops.push(b => b.set(col.doc(p.num), { num: p.num, data: p.data, order: p.order }, { merge: true })));
        await commitChunks(ops);
      },
      setStatus(num, status) { if (raceId) partCol().doc(num).set({ num, status }, { merge: true }).catch(fail); },
      async clearParticipants() { if (!raceId) return; const col = partCol(); const ds = (await col.get()).docs; await commitChunks(ds.map(d => b => b.delete(col.doc(d.id)))); },
      me: () => user && user.email
    };
  }

  // ---------------- DEMOSTRACIÓN ----------------
  function demoStore() {
    const KEY = 'raid-demo-v2';
    function seed() {
      const d = new Date(); d.setHours(11, 42, 17, 0); const b = d.getTime();
      const offs = [[27, 0], [14, 38], [31, 38], [8, 40], [45, 41], [3, 41], [19, 95], [22, 95], [11, 95], [5, 95], [40, 98], [16, 98], [33, 99], [2, 99], [29, 100]];
      const names = { 2: ['Tábano', 'L. Silva'], 3: ['Lucero', 'M. Rodríguez'], 5: ['Pampero', 'A. Gómez'], 6: ['Chimango', 'F. Núñez'], 8: ['Tordillo', 'P. Méndez'], 9: ['Zorzal', 'C. Pereira'], 11: ['Malacara', 'J. Acosta'], 12: ['Ñandú', 'R. Sosa'], 14: ['Bagual', 'D. Fernández'], 16: ['Cimarrón', 'S. López'], 17: ['Alazán', 'G. Martínez'], 18: ['Tero', 'E. Cabrera'], 19: ['Moro', 'N. Díaz'], 22: ['Picazo', 'V. Castro'], 24: ['Carancho', 'H. Suárez'], 25: ['Overo', 'I. Ramos'], 27: ['Gateado', 'B. Olivera'], 29: ['Rosillo', 'T. Benítez'], 31: ['Colorado', 'M. Ferreira'], 33: ['Zaino', 'K. Álvarez'], 36: ['Hornero', 'O. Viera'], 38: ['Tostado', 'U. Correa'], 40: ['Pangaré', 'W. Techera'], 41: ['Yaguareté', 'Y. Moreira'], 45: ['Bayo', 'Q. Silveira'] };
      const status = { 17: 'abandono', 25: 'retirado' };
      const participants = Object.keys(names).map((n, i) => ({ id: n, num: n, order: i, data: { Caballo: names[n][0], Jinete: names[n][1], Categoría: +n % 3 ? '80 km' : '80 km Jóvenes' }, status: status[n] || 'carrera' }));
      return { raceId: 'demo', race: { name: 'Raid de ejemplo 80 km', start1: '' }, participants, arrivals: offs.map(([n, s], i) => ({ id: 'e' + i, seq: i + 1, t: b + s * 1000, num: String(n), by: 'demo' })) };
    }
    const load = () => { try { return JSON.parse(lsGet(KEY)) || seed(); } catch (e) { return seed(); } };
    let st = load(); const subs = [];
    const emit = () => subs.forEach(cb => cb({ raceId: st.raceId, race: st.race, arrivals: st.arrivals.slice(), participants: (st.participants || []).slice(), meta: { pending: false, fromCache: false } }));
    const save = () => { lsSet(KEY, JSON.stringify(st)); emit(); };
    window.addEventListener('storage', e => { if (e.key === KEY) { st = load(); emit(); } });
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const pm = () => { const m = {}; (st.participants || []).forEach(p => { m[p.num] = p; }); return m; };
    return {
      mode: 'demo',
      onError() {},
      onAuth(cb) { setTimeout(() => cb({ email: 'demo' }), 0); },
      signIn: () => Promise.resolve(), signOut() {},
      now: () => Date.now(),
      clockInfo: () => ({ synced: false, offset: 0 }),
      watch(cb) { subs.push(cb); setTimeout(emit, 0); },
      add(t, num) { if (!st.raceId) return null; const id = uid(); st.arrivals.push({ id, t, num: num || '', seq: Date.now() + Math.random(), by: 'demo' }); save(); return id; },
      update(id, patch) { const a = st.arrivals.find(x => x.id === id); if (a) Object.assign(a, patch); save(); },
      remove(id) { st.arrivals = st.arrivals.filter(a => a.id !== id); save(); },
      moveGroup(ids, t) { st.arrivals.forEach(a => { if (ids.includes(a.id)) a.t = t; }); save(); },
      removeMany(ids) { st.arrivals = st.arrivals.filter(a => !ids.includes(a.id)); save(); },
      setRace(patch) { Object.assign(st.race, patch); save(); },
      newRace(name) { st = { raceId: 'demo' + uid(), race: { name: name || 'Raid', start1: '' }, arrivals: [], participants: [] }; save(); },
      importParticipants(list, replace) {
        const cur = pm(); const keep = new Set(list.map(p => p.num));
        const next = replace ? [] : (st.participants || []).filter(p => !keep.has(p.num));
        list.forEach(p => next.push(Object.assign({ status: 'carrera' }, cur[p.num] || {}, { id: p.num, num: p.num, data: p.data, order: p.order })));
        st.participants = next; save(); return Promise.resolve();
      },
      setStatus(num, status) { const p = pm()[num]; if (p) p.status = status; else (st.participants = st.participants || []).push({ id: num, num, status, data: {} }); save(); },
      clearParticipants() { st.participants = []; save(); return Promise.resolve(); },
      me: () => 'demo'
    };
  }

  if (cfg.apiKey && cfg.apiKey !== 'PEGAR_AQUI' && !window.firebase) {
    // Está configurado pero no cargó Firebase (sin internet la primera vez): no caer en modo demo.
    const noop = () => {};
    return { mode: 'nosdk', onError: noop, onAuth: noop, watch: noop, now: () => Date.now(), clockInfo: () => ({ synced: false, offset: 0 }) };
  }
  return configured ? firebaseStore() : demoStore();
})();
