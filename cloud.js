// Login + nuvem (Firebase Auth e Firestore). Carregado pelo index.html só se firebase-config.js estiver preenchido.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getFirestore, doc, onSnapshot, setDoc
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const sync = (s, m) => window.ffSync && window.ffSync(s, m);
const num = k => Number(localStorage.getItem(k) || 0);

let DEV = localStorage.getItem('ff_dev');
if (!DEV) { DEV = Math.random().toString(36).slice(2); localStorage.setItem('ff_dev', DEV); }

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) { db = getFirestore(app); }

let user = null, unsub = null, ref = null, timer = null, ready = false;

function errMsg(e) {
  const c = (e && e.code) || '';
  const map = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Não existe conta com esse e-mail.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Esse e-mail já tem conta. Toque em Entrar.',
    'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
    'auth/missing-password': 'Digite a senha.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'auth/network-request-failed': 'Sem internet no momento.',
    'auth/operation-not-allowed': 'Ative o login por E-mail/Senha no Firebase (Authentication).',
    'auth/unauthorized-domain': 'Adicione o endereço do site em Authentication > Configurações > Domínios autorizados.',
    'permission-denied': 'Sem permissão no Firestore. Confira as regras (veja o LEIA-ME).',
    'unavailable': 'Sem conexão com a nuvem agora.'
  };
  return map[c] || (e && e.message) || 'Erro desconhecido.';
}

function doPush() {
  if (!user || !ready) return;
  const json = JSON.stringify(window.ffGetPayload());
  if (json.length > 950000) {
    sync('err', 'Os dados passaram do limite da nuvem (1 MB). Remova logos grandes ou times que não usa mais.');
    return;
  }
  const ts = num('ff_localts') || Date.now();
  sync(navigator.onLine ? 'saving' : 'offline');
  setDoc(ref, { json, ts, by: DEV })
    .then(() => sync('ok'))
    .catch(e => sync('err', errMsg(e)));
}

window.cloudPush = () => {
  if (!user || !ready) return;
  clearTimeout(timer);
  sync(navigator.onLine ? 'saving' : 'offline');
  timer = setTimeout(doPush, 700);
};

function onSnap(snap) {
  if (snap.metadata.hasPendingWrites) return;       // eco da nossa própria gravação
  const first = !ready;

  if (!snap.exists()) {
    if (snap.metadata.fromCache) { sync('offline'); return; } // ainda não sabemos o que há na nuvem
    ready = true;
    localStorage.setItem('ff_uid', user.uid);
    doPush();                                        // nuvem vazia: sobe o que há neste aparelho
    return;
  }

  const d = snap.data();
  const localTs = num('ff_localts');
  let useRemote, bump = false;

  if (first) {
    const same = localStorage.getItem('ff_uid') === user.uid;
    if (!same && window.ffHasContent()) {
      useRemote = confirm('Esta conta já tem dados na nuvem.\n\nOK = usar os dados da nuvem\nCancelar = substituir a nuvem pelos dados deste aparelho');
      bump = !useRemote;
    } else {
      useRemote = !same || d.ts > localTs;
    }
  } else {
    useRemote = d.ts > localTs && d.by !== DEV;
  }

  localStorage.setItem('ff_uid', user.uid);
  ready = true;

  if (useRemote) {
    try { window.ffApplyRemote(JSON.parse(d.json), d.ts); sync('ok'); }
    catch (e) { sync('err', 'Não consegui ler os dados da nuvem.'); }
  } else if (first) {
    if (bump) localStorage.setItem('ff_localts', Date.now());
    doPush();                                        // este aparelho tem versão mais nova
  }
}

onAuthStateChanged(auth, u => {
  user = u;
  if (unsub) { unsub(); unsub = null; }
  ready = false;
  clearTimeout(timer);
  if (!u) { window.ffAuth && window.ffAuth(null); return; }
  ref = doc(db, 'placares', u.uid);
  window.ffAuth && window.ffAuth(u);
  sync('conn');
  unsub = onSnapshot(ref, onSnap, e => sync('err', errMsg(e)));
});

window.addEventListener('online', () => window.cloudPush());
window.addEventListener('offline', () => sync('offline'));

window.Cloud = {
  user: () => user,
  err: errMsg,
  signIn: (m, p) => signInWithEmailAndPassword(auth, m, p),
  signUp: (m, p) => createUserWithEmailAndPassword(auth, m, p),
  reset: m => sendPasswordResetEmail(auth, m),
  signOut: () => signOut(auth)
};
