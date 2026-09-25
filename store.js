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
        let unR = null, unA = null, race = null, arrivals = [], meta = { pending: false, fromCache: true }, first = true;
        const emit = () => cb({ raceId, race, arrivals, meta });
        return db.doc('config/actual').onSnapshot(s => {
          const id = s.exists ? s.data().raceId : null;
          if (!first && id === raceId) return;
          first = false;
          raceId = id; if (unR) unR(); if (unA) unA(); unR = unA = null; race = null; arrivals = [];
          if (!id) { emit(); return; }
          unR = db.collection('races').doc(id).onSnapshot(r => { race = r.exists ? r.data() : null; emit(); }, fail);
          unA = arrCol().onSnapshot({ includeMetadataChanges: true }, q => {
            arrivals = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
            meta = { pending: q.metadata.hasPendingWrites, fromCache: q.metadata.fromCache };
            emit();
          }, fail);
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
      me: () => user && user.email
    };
  }

  // ---------------- DEMOSTRACIÓN ----------------
  function demoStore() {
    const KEY = 'raid-demo-v1';
    function seed() {
      const d = new Date(); d.setHours(11, 42, 17, 0); const b = d.getTime();
      const offs = [[27, 0], [14, 38], [31, 38], [8, 40], [45, 41], [3, 41], [19, 95], [22, 95], [11, 95], [5, 95], [40, 98], [16, 98], [33, 99], [2, 99], [29, 100]];
      return { raceId: 'demo', race: { name: 'Raid de ejemplo 80 km', start1: '' }, arrivals: offs.map(([n, s], i) => ({ id: 'e' + i, seq: i + 1, t: b + s * 1000, num: String(n), by: 'demo' })) };
    }
    const load = () => { try { return JSON.parse(lsGet(KEY)) || seed(); } catch (e) { return seed(); } };
    let st = load(); const subs = [];
    const emit = () => subs.forEach(cb => cb({ raceId: st.raceId, race: st.race, arrivals: st.arrivals.slice(), meta: { pending: false, fromCache: false } }));
    const save = () => { lsSet(KEY, JSON.stringify(st)); emit(); };
    window.addEventListener('storage', e => { if (e.key === KEY) { st = load(); emit(); } });
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
      newRace(name) { st = { raceId: 'demo' + uid(), race: { name: name || 'Raid', start1: '' }, arrivals: [] }; save(); },
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
