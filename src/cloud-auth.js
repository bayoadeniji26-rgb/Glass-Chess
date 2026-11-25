/*
 * Glass Chess Cloud Account + Sync
 *
 * Firebase web configuration is public client configuration, not a server secret.
 * Copy the values from Firebase Console > Project settings > Your apps into the
 * Vite environment variables in .env.local (see .env.example and FIREBASE_SETUP.md).
 * Enable Google in Authentication, create Firestore + Storage, and deploy the
 * supplied firestore.rules and storage.rules before enabling cloud sync.
 */
import { saveEngine } from './save-engine.js';
import './cloud-auth.css';

const CASHAPP_TAG = '$RaphaelAboy';
const CASHAPP_URL = 'https://cash.app/$RaphaelAboy';
const FIREBASE_VERSION = '13.4.0';
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || '';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '';

// Firebase Console > Project settings > Your apps > Web app configuration.
// The same values can be set in Render's Static Site > Environment.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

const $ = id => document.getElementById(id);
const FIREBASE_AUTH_FIELDS = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingFirebaseFields = FIREBASE_AUTH_FIELDS.filter(key => !String(firebaseConfig[key] || '').trim());
const hasFirebaseConfig = missingFirebaseFields.length === 0;
let appSdk, authSdk, firestoreSdk, storageSdk;
let app, auth, db, storage;
let activeUser = null;
let profileAvatarUrl = '';
let authMenuOpen = false;
let cloudGames = [];
let cloudProfile = {};
let stopAuthObserver = null;
let stopProfileObserver = null;
let stopGamesObserver = null;
let syncTimer = null;
let syncInProgress = false;
let firebaseReady = false;
const uploadedAssets = new Map();

function toast(message, isError = false) {
  let node = $('gc-save-toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'gc-save-toast';
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.toggle('gc-toast-error', Boolean(isError));
  node.classList.add('gc-toast-visible');
  clearTimeout(node._hideTimer);
  node._hideTimer = setTimeout(() => node.classList.remove('gc-toast-visible'), 2800);
}

function setSyncStatus(message, kind = 'idle') {
  const text = $('gc-auth-sync-text');
  const dot = $('gc-auth-sync-dot');
  if (text) text.textContent = message;
  if (dot) {
    dot.dataset.state = kind;
    dot.setAttribute('aria-label', message);
  }
}

function ensureMenu() {
  let menu = $('gc-auth-menu');
  if (menu) return menu;
  menu = document.createElement('div');
  menu.id = 'gc-auth-menu';
  menu.className = 'gc-auth-menu';
  menu.hidden = true;
  menu.innerHTML = `
    <button type="button" data-action="switch">Switch Account</button>
    <button type="button" data-action="sync">Force Sync Now</button>
    <button type="button" data-action="vault">Cloud Game Vault</button>
    <button type="button" data-action="avatar">Change Profile Picture</button>
    <div class="gc-auth-menu-divider"></div>
    <button type="button" data-action="signout">Sign Out</button>
  `;
  document.body.appendChild(menu);
  menu.addEventListener('click', async event => {
    const action = event.target.closest('button[data-action]')?.dataset.action;
    if (!action) return;
    menu.hidden = true;
    authMenuOpen = false;
    try {
      if (action === 'switch') {
        await authSdk.signOut(auth);
        await signIn();
      } else if (action === 'sync') {
        await syncNow();
      } else if (action === 'vault') {
        openVault();
      } else if (action === 'avatar') {
        $('gc-auth-avatar-file')?.click();
      } else if (action === 'signout') {
        await authSdk.signOut(auth);
      }
    } catch (error) {
      toast(error.message || 'That account action could not be completed.', true);
    }
  });
  return menu;
}

function mountAuthWidget() {
  const header = document.querySelector('.topbar');
  if (!header || $('gc-auth-widget')) return;
  const widget = document.createElement('div');
  widget.id = 'gc-auth-widget';
  widget.innerHTML = `
    <button id="gc-google-signin" class="gc-google-signin" type="button">
      <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.05 13.22l7.98 6.19C11.92 13.72 17.48 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.9c-.58 2.96-2.25 5.47-4.73 7.16l7.27 5.64c4.24-3.92 7.54-9.7 7.54-17.27Z"/><path fill="#FBBC05" d="M10.03 28.59A14.4 14.4 0 0 1 9.25 24c0-1.59.27-3.12.75-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.9.94 7.59 2.61 10.78l7.42-6.19Z"/><path fill="#34A853" d="M24 48c6.47 0 11.91-2.13 15.88-5.82l-7.27-5.64c-2.02 1.35-4.61 2.14-8.61 2.14-6.52 0-12.08-4.22-14.07-10.09l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
      <span>Sign in with Google</span>
    </button>
    <button id="gc-user-pill" class="gc-user-pill" type="button" hidden aria-expanded="false">
      <img id="gc-user-avatar" alt="" referrerpolicy="no-referrer">
      <span class="gc-user-copy"><strong id="gc-user-name">Player</strong><small><i id="gc-auth-sync-dot"></i><span id="gc-auth-sync-text">Guest mode</span></small></span>
      <span class="gc-user-chevron" aria-hidden="true">⌄</span>
    </button>
    <input id="gc-auth-avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
  `;
  header.insertBefore(widget, header.firstChild);
  $('gc-google-signin').addEventListener('click', () => void signIn());
  $('gc-user-pill').addEventListener('click', () => {
    const menu = ensureMenu();
    authMenuOpen = !authMenuOpen;
    menu.hidden = !authMenuOpen;
    $('gc-user-pill').setAttribute('aria-expanded', String(authMenuOpen));
    const rect = $('gc-user-pill').getBoundingClientRect();
    menu.style.top = Math.min(window.innerHeight - 280, rect.bottom + 8) + 'px';
    menu.style.left = Math.max(10, rect.left) + 'px';
  });
  $('gc-auth-avatar-file').addEventListener('change', event => void uploadProfileAvatar(event.target.files?.[0]));
  ensureMenu();

  let actions = $('gc-top-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.id = 'gc-top-actions';
    const newGame = $('new-game');
    header.insertBefore(actions, newGame || null);
    actions.innerHTML = `
      <button id="gc-donate" type="button" title="Support Glass Chess"><span aria-hidden="true">$</span> Donate</button>
      <button id="gc-copy-cashapp" type="button" title="Copy Cash App tag">Copy $RaphaelAboy</button>
    `;
    $('gc-donate').addEventListener('click', () => openDonationDialog());
    mountDonationDialog();
    $('gc-copy-cashapp').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(CASHAPP_TAG);
        toast('Copied $RaphaelAboy to clipboard!');
      } catch {
        toast('Clipboard access is unavailable. Cash App tag: $RaphaelAboy', true);
      }
    });
  }
  renderAuth();
}

function mountDonationDialog() {
  if ($('gc-donation-dialog')) return;
  const modal = document.createElement('section');
  modal.id = 'gc-donation-dialog';
  modal.className = 'gc-donation-overlay';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="gc-donation-card" role="dialog" aria-modal="true" aria-labelledby="gc-donation-title">
      <header class="gc-donation-header">
        <div class="gc-donation-mark" aria-hidden="true">$</div>
        <div><small>SUPPORT THE PROJECT</small><h2 id="gc-donation-title">Support Glass Chess</h2>
        <p>Your contribution helps keep the board improving.</p></div>
        <button type="button" id="gc-donation-close" aria-label="Close donation dialog">×</button>
      </header>
      <form id="gc-donation-form">
        <label for="gc-donation-name">Your name <span>(optional)</span></label>
        <input id="gc-donation-name" name="from_name" maxlength="80" autocomplete="name" placeholder="Name">
        <label for="gc-donation-email">Your email <span>(optional, for a reply)</span></label>
        <input id="gc-donation-email" name="reply_to" type="email" maxlength="160" autocomplete="email" placeholder="you@example.com">
        <label for="gc-donation-amount">Donation amount</label>
        <select id="gc-donation-amount" name="donation_amount">
          <option value="Not specified">Choose an amount (optional)</option>
          <option value="$3">$3</option><option value="$5">$5</option>
          <option value="$10">$10</option><option value="$15">$15</option>
          <option value="$20">$20</option><option value="$25">$25</option>
          <option value="$50">$50</option><option value="Other amount">Other amount</option>
        </select>
        <input id="gc-donation-custom-amount" type="number" min="1" max="1000" step="1" placeholder="Enter amount in USD" hidden>
        <label for="gc-donation-message">Message <span>(sent to the Glass Chess creator)</span></label>
        <textarea id="gc-donation-message" name="message" rows="4" maxlength="1200" required placeholder="Write a thank-you, suggestion, or note about your donation…"></textarea>
        <input class="gc-donation-honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p id="gc-donation-status" class="gc-donation-status" role="status">
          Messages are emailed using the project's email service. Payment happens separately in Cash App.
        </p>
        <div class="gc-donation-actions">
          <button type="submit" id="gc-donation-send">Send message</button>
          <a href="${CASHAPP_URL}" target="_blank" rel="noopener noreferrer" id="gc-donation-cashapp">Continue to Cash App <span aria-hidden="true">↗</span></a>
        </div>
        <small class="gc-donation-footnote">Cash App: <strong>${CASHAPP_TAG}</strong>. Sending a message does not make a payment.</small>
      </form>
    </div>`;
  document.body.appendChild(modal);
  const close = () => { modal.hidden = true; };
  $('gc-donation-close').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  $('gc-donation-cashapp').addEventListener('click', () => {
    // The link opens Cash App separately. Keep the message form open so it can still be sent.
  });
  $('gc-donation-amount').addEventListener('change', event => {
    $('gc-donation-custom-amount').hidden = event.target.value !== 'Other amount';
  });
  $('gc-donation-form').addEventListener('submit', event => {
    event.preventDefault();
    void sendDonationMessage();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
}

function openDonationDialog() {
  mountDonationDialog();
  const modal = $('gc-donation-dialog');
  if (!modal) return;
  modal.hidden = false;
  $('gc-donation-status').textContent = EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY
    ? 'Your message will be emailed to the recipient configured in the EmailJS template. Payment is separate in Cash App.'
    : 'Email delivery needs EmailJS configuration before messages can be sent. You can still continue to Cash App below.';
  $('gc-donation-message').focus();
}

async function sendDonationMessage() {
  const form = $('gc-donation-form');
  const send = $('gc-donation-send');
  const status = $('gc-donation-status');
  if (!form || !send || !status) return;
  if (form.elements.website?.value) {
    status.textContent = 'Thanks. Your message could not be submitted.';
    return;
  }
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    status.textContent = 'Email is not connected yet. Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY to Render, then redeploy.';
    status.classList.add('is-error');
    return;
  }
  const message = $('gc-donation-message').value.trim();
  if (message.length < 3) {
    status.textContent = 'Please write a short message before sending.';
    status.classList.add('is-error');
    $('gc-donation-message').focus();
    return;
  }
  const email = $('gc-donation-email').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    status.textContent = 'Please enter a valid email address or leave that field blank.';
    status.classList.add('is-error');
    $('gc-donation-email').focus();
    return;
  }
  send.disabled = true;
  send.textContent = 'Sending…';
  status.classList.remove('is-error');
  status.textContent = 'Sending your message securely through the configured email service…';
  const selectedAmount = $('gc-donation-amount').value;
  const customAmount = $('gc-donation-custom-amount').value;
  if (selectedAmount === 'Other amount' && (!Number.isFinite(Number(customAmount)) || Number(customAmount) < 1 || Number(customAmount) > 1000)) {
    status.textContent = 'Enter an amount between $1 and $1,000.';
    status.classList.add('is-error');
    $('gc-donation-custom-amount').focus();
    return;
  }
  const templateParams = {
    from_name: $('gc-donation-name').value.trim() || 'Glass Chess visitor',
    reply_to: email || '',
    donation_amount: selectedAmount === 'Other amount' ? '
    message,
    cashapp_tag: CASHAPP_TAG,
    submitted_at: new Date().toLocaleString(),
    source_url: window.location.origin
  };
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: templateParams
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail.slice(0, 300) || 'The email service rejected the message.');
    }
    status.textContent = 'Message sent! Thank you for supporting Glass Chess.';
    toast('Your message was sent to the Glass Chess creator.');
    form.reset();
    $('gc-donation-custom-amount').hidden = true;
  } catch (error) {
    status.textContent = 'Your message could not be sent: ' + (error.message || 'Email service error') + '. Please try again.';
    status.classList.add('is-error');
    toast('Donation message could not be emailed.', true);
  } finally {
    send.disabled = false;
    send.textContent = 'Send message';
  }
}

function authErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/unauthorized-domain': 'This website address is not authorized in Firebase Authentication. Add glass-chess-pro.onrender.com under Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Google sign-in is disabled in Firebase. Enable Google under Authentication → Sign-in method.',
    'auth/invalid-api-key': 'The Firebase API key is missing or incorrect. Copy the Web app config from Firebase Project settings.',
    'auth/popup-blocked': 'The browser blocked the Google sign-in popup. Allow popups for this site and try again.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.',
    'auth/network-request-failed': 'Google sign-in could not reach Firebase. Check your internet connection or browser privacy extensions.',
    'auth/web-storage-unsupported': 'This browser blocked the storage needed for Google sign-in. Try allowing site data or using another browser.',
    'auth/invalid-oauth-client-id': 'The Google OAuth client is not configured correctly. Re-enable Google in Firebase Authentication and check its Web client in Google Cloud.'
  };
  return messages[code] || error?.message || 'Google sign-in could not be completed.';
}

function renderAuth() {
  const signInButton = $('gc-google-signin');
  const pill = $('gc-user-pill');
  if (!signInButton || !pill) return;
  signInButton.hidden = Boolean(activeUser);
  pill.hidden = !activeUser;
  if (!activeUser) return;
  const image = profileAvatarUrl || activeUser.photoURL || '';
  const avatar = $('gc-user-avatar');
  if (image) {
    avatar.src = image;
    avatar.hidden = false;
  } else {
    avatar.removeAttribute('src');
    avatar.hidden = true;
  }
  $('gc-user-name').textContent = activeUser.displayName || activeUser.email?.split('@')[0] || 'Glass Chess player';
}

async function loadFirebaseSdk() {
  if (firebaseReady) return;
  if (!hasFirebaseConfig) {
    throw new Error('Google sign-in is not configured yet. Missing Firebase web-app values: ' +
      missingFirebaseFields.map(key => 'VITE_FIREBASE_' + key.replace(/[A-Z]/g, letter => '_' + letter).toUpperCase()).join(', ') +
      '. Copy them from Firebase Console → Project settings → Your apps → Web app, then add them to Render and redeploy.');
  }
  const [appModule, authModule, firestoreModule, storageModule] = await Promise.all([
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-app.js'),
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-auth.js'),
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-firestore.js'),
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-storage.js')
  ]);
  appSdk = appModule;
  authSdk = authModule;
  firestoreSdk = firestoreModule;
  storageSdk = storageModule;
  app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
  auth = authSdk.getAuth(app);
  storage = firebaseConfig.storageBucket ? storageSdk.getStorage(app) : null;

  // Keep Firestore's IndexedDB offline persistence enabled. Firebase currently
  // marks this function obsolete but still exports it; the cache continues to
  // work when the browser supports it. Failure is non-fatal (multi-tab/browser limits).
  db = firestoreSdk.getFirestore(app);
  if (typeof firestoreSdk.enableIndexedDbPersistence === 'function') {
    try {
      await firestoreSdk.enableIndexedDbPersistence(db);
    } catch (error) {
      console.info('Firestore IndexedDB persistence was not enabled:', error.code || error.message);
    }
  }
  firebaseReady = true;
}

function mobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia?.('(max-width: 700px)').matches;
}

async function signIn() {
  const button = $('gc-google-signin');
  if (button) {
    button.disabled = true;
    button.querySelector('span').textContent = 'Connecting…';
  }
  try {
    await loadFirebaseSdk();
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (mobileBrowser()) {
      await authSdk.signInWithRedirect(auth, provider);
      return;
    }
    try {
      await authSdk.signInWithPopup(auth, provider);
    } catch (error) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(error.code)) {
        await authSdk.signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('Glass Chess Google sign-in failed:', error);
    toast(authErrorMessage(error), true);
  } finally {
    if (button) {
      button.disabled = false;
      const span = button.querySelector('span');
      if (span) span.textContent = 'Sign in with Google';
    }
  }
}

function profileRef(uid) {
  return firestoreSdk.doc(db, 'users', uid, 'profile', 'settings');
}
function gamesRef(uid) {
  return firestoreSdk.collection(db, 'users', uid, 'games');
}

function hashId(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function uploadProfileAsset(uid, name, value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (!storage) return '';
  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(value)) return '';
  const cacheKey = uid + ':' + name;
  const previous = uploadedAssets.get(cacheKey);
  if (previous?.data === value) return previous.url;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,/i);
  const contentType = match?.[1] || 'image/webp';
  const object = storageSdk.ref(storage, 'users/' + uid + '/profile/' + name);
  await storageSdk.uploadString(object, value, 'data_url', { contentType });
  const url = await storageSdk.getDownloadURL(object);
  uploadedAssets.set(cacheKey, { data: value, url });
  return url;
}

function gameDocumentId(user, game) {
  const base = String(game.id || 'g_' + hashId(String(game.pgn || '') + '|' + String(game.fen || '')));
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 110);
  return user.uid.slice(0, 12) + '_' + safe;
}

async function pushCloudState(state) {
  if (!activeUser || !db) throw new Error('Sign in to sync your Glass Chess profile.');
  const user = activeUser;
  const [backgroundImageUrl, playerAvatarUrl, opponentAvatarUrl] = await Promise.all([
    uploadProfileAsset(user.uid, 'background', state.backgroundImage || state.backgroundUrl || ''),
    uploadProfileAsset(user.uid, 'avatar-player', state.avatars?.player || ''),
    uploadProfileAsset(user.uid, 'avatar-opponent', state.avatars?.opponent || '')
  ]);
  const games = Array.isArray(state.games) ? state.games.slice(-150) : [];
  if (state.activePgn && !games.some(game => game.pgn === state.activePgn)) {
    games.push({ id: 'active_' + hashId(state.activePgn), pgn: state.activePgn, fen: state.activeFen || '', savedAt: new Date().toISOString(), status: 'in-progress' });
  }
  const cleanGames = games.filter(game => typeof game?.pgn === 'string' && game.pgn.trim()).slice(-150);
  const profileData = {
    ownerUid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    avatarUrl: profileAvatarUrl || '',
    backgroundImageUrl,
    backgroundUrl: state.backgroundUrl || '',
    backgroundDimmer: Math.max(0, Math.min(88, Number(state.backgroundDimmer ?? 56))),
    avatars: { player: playerAvatarUrl, opponent: opponentAvatarUrl },
    chatLog: (Array.isArray(state.chatLog) ? state.chatLog : []).slice(-30).map(item => ({
      role: String(item.role || '').slice(0, 20),
      content: String(item.content || '').slice(0, 3000),
      fen: String(item.fen || '').slice(0, 120),
      pgn: String(item.pgn || '').slice(0, 10000),
      turn: item.turn === 'b' ? 'b' : 'w',
      inCheck: Boolean(item.inCheck),
      checkState: String(item.checkState || '').slice(0, 80),
      material: item.material && typeof item.material === 'object' ? item.material : {},
      at: String(item.at || '')
    })),
    localStorage: state.localStorage || {},
    activePgn: String(state.activePgn || ''),
    activeFen: String(state.activeFen || ''),
    updatedAtIso: new Date().toISOString(),
    updatedAt: firestoreSdk.serverTimestamp()
  };

  const batch = firestoreSdk.writeBatch(db);
  batch.set(profileRef(user.uid), profileData, { merge: true });
  for (const game of cleanGames) {
    const id = gameDocumentId(user, game);
    const gameData = {
      id,
      ownerUid: user.uid,
      pgn: game.pgn,
      fen: String(game.fen || ''),
      opponent: String(game.opponent || 'Glass Chess').slice(0, 120),
      result: String(game.result || game.status || 'saved').slice(0, 60),
      savedAtIso: String(game.savedAt || game.date || new Date().toISOString()),
      updatedAtIso: new Date().toISOString()
    };
    batch.set(firestoreSdk.doc(db, 'users', user.uid, 'games', id), gameData, { merge: true });
    batch.set(firestoreSdk.doc(db, 'global_matches', id), gameData, { merge: true });
  }
  await batch.commit();
  return { syncedAt: new Date().toISOString(), gameCount: cleanGames.length };
}

async function pullCloudState() {
  if (!activeUser || !db) throw new Error('Sign in to load your cloud profile.');
  const user = activeUser;
  const [profileSnapshot, gamesSnapshot] = await Promise.all([
    firestoreSdk.getDoc(profileRef(user.uid)),
    firestoreSdk.getDocs(gamesRef(user.uid))
  ]);
  const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
  const games = gamesSnapshot.docs.map(snapshot => snapshot.data())
    .sort((a, b) => String(a.savedAtIso || '').localeCompare(String(b.savedAtIso || '')));
  return {
    schema: 1,
    backgroundImage: profile.backgroundImageUrl || profile.backgroundUrl || '',
    backgroundUrl: profile.backgroundUrl || '',
    backgroundDimmer: Number(profile.backgroundDimmer ?? 56),
    avatars: profile.avatars || { player: '', opponent: '' },
    chatLog: Array.isArray(profile.chatLog) ? profile.chatLog : [],
    games,
    activePgn: profile.activePgn || '',
    activeFen: profile.activeFen || '',
    localStorage: profile.localStorage || {},
    profileAvatarUrl: profile.avatarUrl || '',
    profileData: profile,
    updatedAt: profile.updatedAtIso || ''
  };
}

const cloudAdapter = {
  push: pushCloudState,
  pull: pullCloudState
};

function mergeCloudAndLocal(remote, local) {
  const byId = new Map();
  for (const game of [...(local.games || []), ...(remote.games || [])]) {
    const key = game.id || game.pgn;
    if (key) byId.set(key, game);
  }
  const chat = new Map();
  for (const item of [...(local.chatLog || []), ...(remote.chatLog || [])]) {
    const key = [item.at, item.role, item.content].join('|');
    chat.set(key, item);
  }
  return {
    ...local,
    ...remote,
    backgroundImage: remote.backgroundImage || local.backgroundImage || '',
    backgroundUrl: remote.backgroundUrl || local.backgroundUrl || '',
    backgroundDimmer: remote.backgroundDimmer ?? local.backgroundDimmer ?? 56,
    avatars: { ...(local.avatars || {}), ...(remote.avatars || {}) },
    chatLog: Array.from(chat.values()).slice(-300),
    games: Array.from(byId.values()).slice(-150),
    activePgn: remote.activePgn || local.activePgn || '',
    activeFen: remote.activeFen || local.activeFen || '',
    localStorage: { ...(local.localStorage || {}), ...(remote.localStorage || {}) }
  };
}

function applyCloudProfileToApp(profile) {
  profileAvatarUrl = profile.avatarUrl || profile.photoURL || profileAvatarUrl;
  renderAuth();
  Promise.resolve(window.GlassChessKingPawn?.applyCloudProfile?.(profile))
    .catch(error => console.warn('Cloud profile could not be applied to the local workspace:', error));
}

function stopCloudObservers() {
  stopProfileObserver?.();
  stopGamesObserver?.();
  stopProfileObserver = null;
  stopGamesObserver = null;
}

function renderVault() {
  const host = $('gc-cloud-vault-list');
  const count = $('gc-cloud-vault-count');
  if (!host || !count) return;
  count.textContent = cloudGames.length + (cloudGames.length === 1 ? ' saved match' : ' saved matches');
  host.replaceChildren();
  const summary = $('gc-cloud-vault-profile');
  const chats = $('gc-cloud-vault-chat');
  if (summary) {
    let preferences = {};
    try { preferences = JSON.parse(cloudProfile.localStorage?.['glass-chess-settings'] || '{}'); } catch {}
    const theme = String(preferences.theme || 'midnight').replace(/[-_]/g, ' ');
    const bg = cloudProfile.backgroundImageUrl || cloudProfile.backgroundUrl ? 'Custom background' : String(preferences.background || 'midnight').replace(/[-_]/g, ' ');
    const avatarCount = Object.values(cloudProfile.avatars || {}).filter(Boolean).length;
    summary.replaceChildren();
    const description = document.createElement('p');
    description.textContent = 'Theme: ' + theme + ' · Background: ' + bg + ' · Custom player pictures: ' + avatarCount + ' · King Pawn messages: ' + (cloudProfile.chatLog || []).length;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore Cloud Profile';
    restore.addEventListener('click', async () => {
      try {
        await window.GlassChessKingPawn?.applyCloudProfile?.(cloudProfile);
        toast('Cloud profile, theme, player pictures, and King Pawn chat restored.');
      } catch (error) { toast('Profile restore failed: ' + error.message, true); }
    });
    summary.append(description, restore);
  }
  if (chats) {
    chats.replaceChildren();
    const messages = Array.isArray(cloudProfile.chatLog) ? cloudProfile.chatLog : [];
    if (!messages.length) {
      const empty = document.createElement('p');
      empty.className = 'gc-cloud-empty';
      empty.textContent = 'No King Pawn messages are saved in the cloud yet.';
      chats.appendChild(empty);
    } else {
      for (const message of messages.slice(-30)) {
        const item = document.createElement('article');
        item.className = 'gc-cloud-chat-entry';
        const heading = document.createElement('strong');
        heading.textContent = message.role === 'user' ? 'You' : 'King Pawn';
        const body = document.createElement('p');
        body.textContent = String(message.content || '');
        const context = document.createElement('small');
        context.textContent = (message.at ? new Date(message.at).toLocaleString() : 'Saved message') +
          ' · ' + (message.turn === 'b' ? 'Black' : 'White') + ' to move' +
          (message.inCheck ? ' · Check' : '');
        item.append(heading, body, context);
        chats.appendChild(item);
      }
    }
  }
  if (!cloudGames.length) {
    const empty = document.createElement('p');
    empty.className = 'gc-cloud-empty';
    empty.textContent = 'No matches are saved to this account yet. Your games will appear here as you play.';
    host.appendChild(empty);
    return;
  }
  for (const game of cloudGames.slice().sort((a, b) => String(b.savedAtIso || '').localeCompare(String(a.savedAtIso || '')))) {
    const card = document.createElement('article');
    card.className = 'gc-cloud-game';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = game.opponent || 'Glass Chess match';
    const meta = document.createElement('small');
    const date = game.savedAtIso ? new Date(game.savedAtIso).toLocaleString() : 'Saved match';
    const plies = game.pgn ? (game.pgn.match(/\d+\./g) || []).length : 0;
    meta.textContent = date + ' · ' + plies + ' moves · ' + (game.result || 'saved');
    info.append(title, meta);
    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = 'Load Game';
    load.addEventListener('click', () => {
      try {
        window.GlassChess?.setMode?.('analysis', false);
        window.GlassChess?.loadPgn?.(game.pgn);
        closeVault();
        toast('Cloud match loaded into Analysis Studio.');
      } catch (error) {
        toast('This saved game could not be loaded: ' + error.message, true);
      }
    });
    card.append(info, load);
    host.appendChild(card);
  }
}

function mountVault() {
  if ($('gc-cloud-vault')) return;
  const modal = document.createElement('section');
  modal.id = 'gc-cloud-vault';
  modal.className = 'gc-cloud-vault';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="gc-cloud-vault-card" role="dialog" aria-modal="true" aria-labelledby="gc-cloud-vault-title">
      <header><div><small>YOUR ACCOUNT</small><h2 id="gc-cloud-vault-title">Cloud Game Vault</h2><p id="gc-cloud-vault-count">0 saved matches</p></div><button type="button" id="gc-cloud-vault-close" aria-label="Close Cloud Game Vault">×</button></header>
      <div class="gc-cloud-vault-scroll">
        <div id="gc-cloud-vault-profile"></div>
        <h3>Saved matches</h3>
        <div id="gc-cloud-vault-list"></div>
        <details class="gc-cloud-chat-archive"><summary>King Pawn chat archive</summary><div id="gc-cloud-vault-chat"></div></details>
      </div>
      <footer>Your cloud games, board themes, player pictures and King Pawn chats follow your Google account.</footer>
    </div>`;
  document.body.appendChild(modal);
  $('gc-cloud-vault-close').addEventListener('click', closeVault);
  modal.addEventListener('click', event => { if (event.target === modal) closeVault(); });
  renderVault();
}
function openVault() {
  mountVault();
  $('gc-cloud-vault').hidden = false;
  renderVault();
  if (!activeUser) toast('Sign in with Google to open your Cloud Game Vault.', true);
}
function closeVault() {
  if ($('gc-cloud-vault')) $('gc-cloud-vault').hidden = true;
}

async function attachRealtimeSync(user) {
  stopCloudObservers();
  const profileDocument = profileRef(user.uid);
  stopProfileObserver = firestoreSdk.onSnapshot(profileDocument, snapshot => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    if (data.ownerUid !== user.uid) return;
    cloudProfile = data;
    renderVault();
    applyCloudProfileToApp(data);
    const localStorageValues = data.localStorage || {};
    for (const [key, value] of Object.entries(localStorageValues)) {
      if (String(key).startsWith('glass-chess-') && !/(token|secret|auth)/i.test(key)) {
        try { localStorage.setItem(key, String(value)); } catch {}
      }
    }
  }, error => {
    console.warn('Glass Chess profile listener:', error);
    setSyncStatus('Cloud connection paused', 'error');
  });
  stopGamesObserver = firestoreSdk.onSnapshot(gamesRef(user.uid), snapshot => {
    cloudGames = snapshot.docs.map(item => item.data());
    renderVault();
    const sorted = cloudGames.slice().sort((a, b) => String(a.savedAtIso || '').localeCompare(String(b.savedAtIso || '')));
    void saveEngine.saveData({ games: sorted.slice(-150) }).catch(error => console.warn('Cloud vault cache update failed:', error));
  }, error => {
    console.warn('Glass Chess games listener:', error);
    setSyncStatus('Cloud connection paused', 'error');
  });
}

async function syncOnSignIn(user) {
  activeUser = user;
  profileAvatarUrl = '';
  renderAuth();
  setSyncStatus('Syncing...', 'syncing');
  saveEngine.setCloudAdapter(cloudAdapter);
  try {
    const [remote, local] = await Promise.all([cloudAdapter.pull(), saveEngine.loadData()]);
    cloudProfile = remote.profileData || {};
    cloudGames = remote.games.slice();
    renderVault();
    const remoteHasContent = remote.games.length || remote.chatLog.length ||
      Object.keys(remote.localStorage || {}).length || remote.backgroundImage || remote.activePgn ||
      remote.profileAvatarUrl || remote.avatars?.player || remote.avatars?.opponent;
    if (remoteHasContent) {
      const merged = mergeCloudAndLocal(remote, local);
      await saveEngine.replaceData(merged);
      await window.GlassChessKingPawn?.applyCloudProfile?.({
        backgroundImageUrl: merged.backgroundImage,
        backgroundUrl: merged.backgroundUrl,
        backgroundDimmer: merged.backgroundDimmer,
        avatars: merged.avatars,
        chatLog: merged.chatLog,
        localStorage: merged.localStorage,
        avatarUrl: remote.profileAvatarUrl
      });
      profileAvatarUrl = remote.profileAvatarUrl || user.photoURL || '';
      cloudGames = remote.games.slice();
      await saveEngine.saveToCloud();
    } else {
      await saveEngine.saveToCloud();
    }
    await attachRealtimeSync(user);
    setSyncStatus('Synced to Cloud', 'synced');
  } catch (error) {
    console.warn('Initial Cloud sync failed:', error);
    setSyncStatus('Sync paused · retry', 'error');
    toast('Signed in, but cloud sync failed: ' + (error.message || 'Check Firebase setup and rules.'), true);
  }
}

async function syncNow() {
  if (!activeUser) throw new Error('Sign in with Google to sync your games.');
  if (syncInProgress) return;
  syncInProgress = true;
  setSyncStatus('Syncing...', 'syncing');
  try {
    clearTimeout(syncTimer);
    await saveEngine.saveToCloud();
    setSyncStatus('Synced to Cloud', 'synced');
    toast('Glass Chess is synced to your Google account.');
    const refreshed = await pullCloudState();
    cloudGames = refreshed.games;
    cloudProfile = refreshed.profileData || cloudProfile;
    renderVault();
  } catch (error) {
    setSyncStatus('Sync failed', 'error');
    toast('Cloud sync failed: ' + error.message, true);
    throw error;
  } finally {
    syncInProgress = false;
  }
}

function queueCloudSync() {
  if (!activeUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (!activeUser || syncInProgress) return;
    syncInProgress = true;
    setSyncStatus('Syncing...', 'syncing');
    saveEngine.saveToCloud().then(() => {
      setSyncStatus('Synced to Cloud', 'synced');
    }).catch(error => {
      console.warn('Automatic Cloud sync failed:', error);
      setSyncStatus('Sync paused · retry', 'error');
    }).finally(() => { syncInProgress = false; });
  }, 900);
}

function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) return reject(new Error('Choose a JPG, PNG, or WebP image.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Choose an image smaller than 8 MB.'));
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('The avatar image could not be compressed.'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The avatar image could not be read.'));
        reader.readAsDataURL(blob);
      }, file.type === 'image/png' ? 'image/png' : 'image/webp', 0.82);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The avatar image could not be opened.')); };
    image.src = url;
  });
}

async function uploadProfileAvatar(file) {
  if (!file) return;
  if (!activeUser) {
    toast('Sign in first to sync a custom account picture.', true);
    return;
  }
  try {
    const image = await compressAvatar(file);
    profileAvatarUrl = await uploadProfileAsset(activeUser.uid, 'account-avatar', image);
    await firestoreSdk.setDoc(profileRef(activeUser.uid), {
      ownerUid: activeUser.uid,
      avatarUrl: profileAvatarUrl,
      updatedAtIso: new Date().toISOString(),
      updatedAt: firestoreSdk.serverTimestamp()
    }, { merge: true });
    renderAuth();
    toast('Your Google profile pill picture was updated.');
  } catch (error) {
    toast('Profile picture upload failed: ' + error.message, true);
  } finally {
    $('gc-auth-avatar-file').value = '';
  }
}

function onAuthState(user) {
  if (user) {
    void syncOnSignIn(user);
    return;
  }
  activeUser = null;
  profileAvatarUrl = '';
  stopCloudObservers();
  saveEngine.setCloudAdapter(null);
  setSyncStatus('Guest mode · saved on this device', 'idle');
  renderAuth();
}

async function initializeAuth() {
  mountAuthWidget();
  mountVault();
  if (!hasFirebaseConfig) {
    setSyncStatus('Guest mode · cloud setup needed', 'idle');
    return;
  }
  try {
    await loadFirebaseSdk();
    await authSdk.getRedirectResult(auth).catch(error => {
      console.warn('Google redirect sign-in:', error);
      toast('Google sign-in did not complete: ' + error.message, true);
    });
    stopAuthObserver = authSdk.onAuthStateChanged(auth, onAuthState);
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
    setSyncStatus('Guest mode · cloud unavailable', 'error');
  }
}

document.addEventListener('click', event => {
  const menu = $('gc-auth-menu');
  if (!menu || menu.hidden) return;
  if (event.target.closest('#gc-auth-menu') || event.target.closest('#gc-user-pill')) return;
  menu.hidden = true;
  authMenuOpen = false;
  $('gc-user-pill')?.setAttribute('aria-expanded', 'false');
});
window.addEventListener('resize', () => {
  const menu = $('gc-auth-menu');
  if (menu && !menu.hidden) menu.hidden = true;
});

window.GlassChessCloud = {
  get user() { return activeUser; },
  get configured() { return hasFirebaseConfig; },
  get status() { return activeUser ? 'signed-in' : 'guest'; },
  queueSync: queueCloudSync,
  syncNow,
  openVault,
  signIn
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initializeAuth(), { once: true });
} else {
  void initializeAuth();
}
 + Number(customAmount).toFixed(2) : selectedAmount,
    message,
    cashapp_tag: CASHAPP_TAG,
    submitted_at: new Date().toLocaleString(),
    source_url: window.location.origin
  };
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: templateParams
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail.slice(0, 300) || 'The email service rejected the message.');
    }
    status.textContent = 'Message sent! Thank you for supporting Glass Chess.';
    toast('Your message was sent to the Glass Chess creator.');
    form.reset();
  } catch (error) {
    status.textContent = 'Your message could not be sent: ' + (error.message || 'Email service error') + '. Please try again.';
    status.classList.add('is-error');
    toast('Donation message could not be emailed.', true);
  } finally {
    send.disabled = false;
    send.textContent = 'Send message';
  }
}

function authErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/unauthorized-domain': 'This website address is not authorized in Firebase Authentication. Add glass-chess-pro.onrender.com under Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Google sign-in is disabled in Firebase. Enable Google under Authentication → Sign-in method.',
    'auth/invalid-api-key': 'The Firebase API key is missing or incorrect. Copy the Web app config from Firebase Project settings.',
    'auth/popup-blocked': 'The browser blocked the Google sign-in popup. Allow popups for this site and try again.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.',
    'auth/network-request-failed': 'Google sign-in could not reach Firebase. Check your internet connection or browser privacy extensions.',
    'auth/web-storage-unsupported': 'This browser blocked the storage needed for Google sign-in. Try allowing site data or using another browser.',
    'auth/invalid-oauth-client-id': 'The Google OAuth client is not configured correctly. Re-enable Google in Firebase Authentication and check its Web client in Google Cloud.'
  };
  return messages[code] || error?.message || 'Google sign-in could not be completed.';
}

function renderAuth() {
  const signInButton = $('gc-google-signin');
  const pill = $('gc-user-pill');
  if (!signInButton || !pill) return;
  signInButton.hidden = Boolean(activeUser);
  pill.hidden = !activeUser;
  if (!activeUser) return;
  const image = profileAvatarUrl || activeUser.photoURL || '';
  const avatar = $('gc-user-avatar');
  if (image) {
    avatar.src = image;
    avatar.hidden = false;
  } else {
    avatar.removeAttribute('src');
    avatar.hidden = true;
  }
  $('gc-user-name').textContent = activeUser.displayName || activeUser.email?.split('@')[0] || 'Glass Chess player';
}

async function loadFirebaseSdk() {
  if (firebaseReady) return;
  if (!hasFirebaseConfig) {
    throw new Error('Google sign-in is not configured yet. Missing Firebase web-app values: ' +
      missingFirebaseFields.map(key => 'VITE_FIREBASE_' + key.replace(/[A-Z]/g, letter => '_' + letter).toUpperCase()).join(', ') +
      '. Copy them from Firebase Console → Project settings → Your apps → Web app, then add them to Render and redeploy.');
  }
  const [appModule, authModule, firestoreModule, storageModule] = await Promise.all([
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-app.js'),
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-auth.js'),
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-firestore.js'),
    import(/* @vite-ignore */ FIREBASE_CDN + 'firebase-storage.js')
  ]);
  appSdk = appModule;
  authSdk = authModule;
  firestoreSdk = firestoreModule;
  storageSdk = storageModule;
  app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
  auth = authSdk.getAuth(app);
  storage = firebaseConfig.storageBucket ? storageSdk.getStorage(app) : null;

  // Keep Firestore's IndexedDB offline persistence enabled. Firebase currently
  // marks this function obsolete but still exports it; the cache continues to
  // work when the browser supports it. Failure is non-fatal (multi-tab/browser limits).
  db = firestoreSdk.getFirestore(app);
  if (typeof firestoreSdk.enableIndexedDbPersistence === 'function') {
    try {
      await firestoreSdk.enableIndexedDbPersistence(db);
    } catch (error) {
      console.info('Firestore IndexedDB persistence was not enabled:', error.code || error.message);
    }
  }
  firebaseReady = true;
}

function mobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia?.('(max-width: 700px)').matches;
}

async function signIn() {
  const button = $('gc-google-signin');
  if (button) {
    button.disabled = true;
    button.querySelector('span').textContent = 'Connecting…';
  }
  try {
    await loadFirebaseSdk();
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (mobileBrowser()) {
      await authSdk.signInWithRedirect(auth, provider);
      return;
    }
    try {
      await authSdk.signInWithPopup(auth, provider);
    } catch (error) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(error.code)) {
        await authSdk.signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('Glass Chess Google sign-in failed:', error);
    toast(authErrorMessage(error), true);
  } finally {
    if (button) {
      button.disabled = false;
      const span = button.querySelector('span');
      if (span) span.textContent = 'Sign in with Google';
    }
  }
}

function profileRef(uid) {
  return firestoreSdk.doc(db, 'users', uid, 'profile', 'settings');
}
function gamesRef(uid) {
  return firestoreSdk.collection(db, 'users', uid, 'games');
}

function hashId(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function uploadProfileAsset(uid, name, value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (!storage) return '';
  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(value)) return '';
  const cacheKey = uid + ':' + name;
  const previous = uploadedAssets.get(cacheKey);
  if (previous?.data === value) return previous.url;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,/i);
  const contentType = match?.[1] || 'image/webp';
  const object = storageSdk.ref(storage, 'users/' + uid + '/profile/' + name);
  await storageSdk.uploadString(object, value, 'data_url', { contentType });
  const url = await storageSdk.getDownloadURL(object);
  uploadedAssets.set(cacheKey, { data: value, url });
  return url;
}

function gameDocumentId(user, game) {
  const base = String(game.id || 'g_' + hashId(String(game.pgn || '') + '|' + String(game.fen || '')));
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 110);
  return user.uid.slice(0, 12) + '_' + safe;
}

async function pushCloudState(state) {
  if (!activeUser || !db) throw new Error('Sign in to sync your Glass Chess profile.');
  const user = activeUser;
  const [backgroundImageUrl, playerAvatarUrl, opponentAvatarUrl] = await Promise.all([
    uploadProfileAsset(user.uid, 'background', state.backgroundImage || state.backgroundUrl || ''),
    uploadProfileAsset(user.uid, 'avatar-player', state.avatars?.player || ''),
    uploadProfileAsset(user.uid, 'avatar-opponent', state.avatars?.opponent || '')
  ]);
  const games = Array.isArray(state.games) ? state.games.slice(-150) : [];
  if (state.activePgn && !games.some(game => game.pgn === state.activePgn)) {
    games.push({ id: 'active_' + hashId(state.activePgn), pgn: state.activePgn, fen: state.activeFen || '', savedAt: new Date().toISOString(), status: 'in-progress' });
  }
  const cleanGames = games.filter(game => typeof game?.pgn === 'string' && game.pgn.trim()).slice(-150);
  const profileData = {
    ownerUid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    avatarUrl: profileAvatarUrl || '',
    backgroundImageUrl,
    backgroundUrl: state.backgroundUrl || '',
    backgroundDimmer: Math.max(0, Math.min(88, Number(state.backgroundDimmer ?? 56))),
    avatars: { player: playerAvatarUrl, opponent: opponentAvatarUrl },
    chatLog: (Array.isArray(state.chatLog) ? state.chatLog : []).slice(-30).map(item => ({
      role: String(item.role || '').slice(0, 20),
      content: String(item.content || '').slice(0, 3000),
      fen: String(item.fen || '').slice(0, 120),
      pgn: String(item.pgn || '').slice(0, 10000),
      turn: item.turn === 'b' ? 'b' : 'w',
      inCheck: Boolean(item.inCheck),
      checkState: String(item.checkState || '').slice(0, 80),
      material: item.material && typeof item.material === 'object' ? item.material : {},
      at: String(item.at || '')
    })),
    localStorage: state.localStorage || {},
    activePgn: String(state.activePgn || ''),
    activeFen: String(state.activeFen || ''),
    updatedAtIso: new Date().toISOString(),
    updatedAt: firestoreSdk.serverTimestamp()
  };

  const batch = firestoreSdk.writeBatch(db);
  batch.set(profileRef(user.uid), profileData, { merge: true });
  for (const game of cleanGames) {
    const id = gameDocumentId(user, game);
    const gameData = {
      id,
      ownerUid: user.uid,
      pgn: game.pgn,
      fen: String(game.fen || ''),
      opponent: String(game.opponent || 'Glass Chess').slice(0, 120),
      result: String(game.result || game.status || 'saved').slice(0, 60),
      savedAtIso: String(game.savedAt || game.date || new Date().toISOString()),
      updatedAtIso: new Date().toISOString()
    };
    batch.set(firestoreSdk.doc(db, 'users', user.uid, 'games', id), gameData, { merge: true });
    batch.set(firestoreSdk.doc(db, 'global_matches', id), gameData, { merge: true });
  }
  await batch.commit();
  return { syncedAt: new Date().toISOString(), gameCount: cleanGames.length };
}

async function pullCloudState() {
  if (!activeUser || !db) throw new Error('Sign in to load your cloud profile.');
  const user = activeUser;
  const [profileSnapshot, gamesSnapshot] = await Promise.all([
    firestoreSdk.getDoc(profileRef(user.uid)),
    firestoreSdk.getDocs(gamesRef(user.uid))
  ]);
  const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
  const games = gamesSnapshot.docs.map(snapshot => snapshot.data())
    .sort((a, b) => String(a.savedAtIso || '').localeCompare(String(b.savedAtIso || '')));
  return {
    schema: 1,
    backgroundImage: profile.backgroundImageUrl || profile.backgroundUrl || '',
    backgroundUrl: profile.backgroundUrl || '',
    backgroundDimmer: Number(profile.backgroundDimmer ?? 56),
    avatars: profile.avatars || { player: '', opponent: '' },
    chatLog: Array.isArray(profile.chatLog) ? profile.chatLog : [],
    games,
    activePgn: profile.activePgn || '',
    activeFen: profile.activeFen || '',
    localStorage: profile.localStorage || {},
    profileAvatarUrl: profile.avatarUrl || '',
    profileData: profile,
    updatedAt: profile.updatedAtIso || ''
  };
}

const cloudAdapter = {
  push: pushCloudState,
  pull: pullCloudState
};

function mergeCloudAndLocal(remote, local) {
  const byId = new Map();
  for (const game of [...(local.games || []), ...(remote.games || [])]) {
    const key = game.id || game.pgn;
    if (key) byId.set(key, game);
  }
  const chat = new Map();
  for (const item of [...(local.chatLog || []), ...(remote.chatLog || [])]) {
    const key = [item.at, item.role, item.content].join('|');
    chat.set(key, item);
  }
  return {
    ...local,
    ...remote,
    backgroundImage: remote.backgroundImage || local.backgroundImage || '',
    backgroundUrl: remote.backgroundUrl || local.backgroundUrl || '',
    backgroundDimmer: remote.backgroundDimmer ?? local.backgroundDimmer ?? 56,
    avatars: { ...(local.avatars || {}), ...(remote.avatars || {}) },
    chatLog: Array.from(chat.values()).slice(-300),
    games: Array.from(byId.values()).slice(-150),
    activePgn: remote.activePgn || local.activePgn || '',
    activeFen: remote.activeFen || local.activeFen || '',
    localStorage: { ...(local.localStorage || {}), ...(remote.localStorage || {}) }
  };
}

function applyCloudProfileToApp(profile) {
  profileAvatarUrl = profile.avatarUrl || profile.photoURL || profileAvatarUrl;
  renderAuth();
  Promise.resolve(window.GlassChessKingPawn?.applyCloudProfile?.(profile))
    .catch(error => console.warn('Cloud profile could not be applied to the local workspace:', error));
}

function stopCloudObservers() {
  stopProfileObserver?.();
  stopGamesObserver?.();
  stopProfileObserver = null;
  stopGamesObserver = null;
}

function renderVault() {
  const host = $('gc-cloud-vault-list');
  const count = $('gc-cloud-vault-count');
  if (!host || !count) return;
  count.textContent = cloudGames.length + (cloudGames.length === 1 ? ' saved match' : ' saved matches');
  host.replaceChildren();
  const summary = $('gc-cloud-vault-profile');
  const chats = $('gc-cloud-vault-chat');
  if (summary) {
    let preferences = {};
    try { preferences = JSON.parse(cloudProfile.localStorage?.['glass-chess-settings'] || '{}'); } catch {}
    const theme = String(preferences.theme || 'midnight').replace(/[-_]/g, ' ');
    const bg = cloudProfile.backgroundImageUrl || cloudProfile.backgroundUrl ? 'Custom background' : String(preferences.background || 'midnight').replace(/[-_]/g, ' ');
    const avatarCount = Object.values(cloudProfile.avatars || {}).filter(Boolean).length;
    summary.replaceChildren();
    const description = document.createElement('p');
    description.textContent = 'Theme: ' + theme + ' · Background: ' + bg + ' · Custom player pictures: ' + avatarCount + ' · King Pawn messages: ' + (cloudProfile.chatLog || []).length;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore Cloud Profile';
    restore.addEventListener('click', async () => {
      try {
        await window.GlassChessKingPawn?.applyCloudProfile?.(cloudProfile);
        toast('Cloud profile, theme, player pictures, and King Pawn chat restored.');
      } catch (error) { toast('Profile restore failed: ' + error.message, true); }
    });
    summary.append(description, restore);
  }
  if (chats) {
    chats.replaceChildren();
    const messages = Array.isArray(cloudProfile.chatLog) ? cloudProfile.chatLog : [];
    if (!messages.length) {
      const empty = document.createElement('p');
      empty.className = 'gc-cloud-empty';
      empty.textContent = 'No King Pawn messages are saved in the cloud yet.';
      chats.appendChild(empty);
    } else {
      for (const message of messages.slice(-30)) {
        const item = document.createElement('article');
        item.className = 'gc-cloud-chat-entry';
        const heading = document.createElement('strong');
        heading.textContent = message.role === 'user' ? 'You' : 'King Pawn';
        const body = document.createElement('p');
        body.textContent = String(message.content || '');
        const context = document.createElement('small');
        context.textContent = (message.at ? new Date(message.at).toLocaleString() : 'Saved message') +
          ' · ' + (message.turn === 'b' ? 'Black' : 'White') + ' to move' +
          (message.inCheck ? ' · Check' : '');
        item.append(heading, body, context);
        chats.appendChild(item);
      }
    }
  }
  if (!cloudGames.length) {
    const empty = document.createElement('p');
    empty.className = 'gc-cloud-empty';
    empty.textContent = 'No matches are saved to this account yet. Your games will appear here as you play.';
    host.appendChild(empty);
    return;
  }
  for (const game of cloudGames.slice().sort((a, b) => String(b.savedAtIso || '').localeCompare(String(a.savedAtIso || '')))) {
    const card = document.createElement('article');
    card.className = 'gc-cloud-game';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = game.opponent || 'Glass Chess match';
    const meta = document.createElement('small');
    const date = game.savedAtIso ? new Date(game.savedAtIso).toLocaleString() : 'Saved match';
    const plies = game.pgn ? (game.pgn.match(/\d+\./g) || []).length : 0;
    meta.textContent = date + ' · ' + plies + ' moves · ' + (game.result || 'saved');
    info.append(title, meta);
    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = 'Load Game';
    load.addEventListener('click', () => {
      try {
        window.GlassChess?.setMode?.('analysis', false);
        window.GlassChess?.loadPgn?.(game.pgn);
        closeVault();
        toast('Cloud match loaded into Analysis Studio.');
      } catch (error) {
        toast('This saved game could not be loaded: ' + error.message, true);
      }
    });
    card.append(info, load);
    host.appendChild(card);
  }
}

function mountVault() {
  if ($('gc-cloud-vault')) return;
  const modal = document.createElement('section');
  modal.id = 'gc-cloud-vault';
  modal.className = 'gc-cloud-vault';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="gc-cloud-vault-card" role="dialog" aria-modal="true" aria-labelledby="gc-cloud-vault-title">
      <header><div><small>YOUR ACCOUNT</small><h2 id="gc-cloud-vault-title">Cloud Game Vault</h2><p id="gc-cloud-vault-count">0 saved matches</p></div><button type="button" id="gc-cloud-vault-close" aria-label="Close Cloud Game Vault">×</button></header>
      <div class="gc-cloud-vault-scroll">
        <div id="gc-cloud-vault-profile"></div>
        <h3>Saved matches</h3>
        <div id="gc-cloud-vault-list"></div>
        <details class="gc-cloud-chat-archive"><summary>King Pawn chat archive</summary><div id="gc-cloud-vault-chat"></div></details>
      </div>
      <footer>Your cloud games, board themes, player pictures and King Pawn chats follow your Google account.</footer>
    </div>`;
  document.body.appendChild(modal);
  $('gc-cloud-vault-close').addEventListener('click', closeVault);
  modal.addEventListener('click', event => { if (event.target === modal) closeVault(); });
  renderVault();
}
function openVault() {
  mountVault();
  $('gc-cloud-vault').hidden = false;
  renderVault();
  if (!activeUser) toast('Sign in with Google to open your Cloud Game Vault.', true);
}
function closeVault() {
  if ($('gc-cloud-vault')) $('gc-cloud-vault').hidden = true;
}

async function attachRealtimeSync(user) {
  stopCloudObservers();
  const profileDocument = profileRef(user.uid);
  stopProfileObserver = firestoreSdk.onSnapshot(profileDocument, snapshot => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    if (data.ownerUid !== user.uid) return;
    cloudProfile = data;
    renderVault();
    applyCloudProfileToApp(data);
    const localStorageValues = data.localStorage || {};
    for (const [key, value] of Object.entries(localStorageValues)) {
      if (String(key).startsWith('glass-chess-') && !/(token|secret|auth)/i.test(key)) {
        try { localStorage.setItem(key, String(value)); } catch {}
      }
    }
  }, error => {
    console.warn('Glass Chess profile listener:', error);
    setSyncStatus('Cloud connection paused', 'error');
  });
  stopGamesObserver = firestoreSdk.onSnapshot(gamesRef(user.uid), snapshot => {
    cloudGames = snapshot.docs.map(item => item.data());
    renderVault();
    const sorted = cloudGames.slice().sort((a, b) => String(a.savedAtIso || '').localeCompare(String(b.savedAtIso || '')));
    void saveEngine.saveData({ games: sorted.slice(-150) }).catch(error => console.warn('Cloud vault cache update failed:', error));
  }, error => {
    console.warn('Glass Chess games listener:', error);
    setSyncStatus('Cloud connection paused', 'error');
  });
}

async function syncOnSignIn(user) {
  activeUser = user;
  profileAvatarUrl = '';
  renderAuth();
  setSyncStatus('Syncing...', 'syncing');
  saveEngine.setCloudAdapter(cloudAdapter);
  try {
    const [remote, local] = await Promise.all([cloudAdapter.pull(), saveEngine.loadData()]);
    cloudProfile = remote.profileData || {};
    cloudGames = remote.games.slice();
    renderVault();
    const remoteHasContent = remote.games.length || remote.chatLog.length ||
      Object.keys(remote.localStorage || {}).length || remote.backgroundImage || remote.activePgn ||
      remote.profileAvatarUrl || remote.avatars?.player || remote.avatars?.opponent;
    if (remoteHasContent) {
      const merged = mergeCloudAndLocal(remote, local);
      await saveEngine.replaceData(merged);
      await window.GlassChessKingPawn?.applyCloudProfile?.({
        backgroundImageUrl: merged.backgroundImage,
        backgroundUrl: merged.backgroundUrl,
        backgroundDimmer: merged.backgroundDimmer,
        avatars: merged.avatars,
        chatLog: merged.chatLog,
        localStorage: merged.localStorage,
        avatarUrl: remote.profileAvatarUrl
      });
      profileAvatarUrl = remote.profileAvatarUrl || user.photoURL || '';
      cloudGames = remote.games.slice();
      await saveEngine.saveToCloud();
    } else {
      await saveEngine.saveToCloud();
    }
    await attachRealtimeSync(user);
    setSyncStatus('Synced to Cloud', 'synced');
  } catch (error) {
    console.warn('Initial Cloud sync failed:', error);
    setSyncStatus('Sync paused · retry', 'error');
    toast('Signed in, but cloud sync failed: ' + (error.message || 'Check Firebase setup and rules.'), true);
  }
}

async function syncNow() {
  if (!activeUser) throw new Error('Sign in with Google to sync your games.');
  if (syncInProgress) return;
  syncInProgress = true;
  setSyncStatus('Syncing...', 'syncing');
  try {
    clearTimeout(syncTimer);
    await saveEngine.saveToCloud();
    setSyncStatus('Synced to Cloud', 'synced');
    toast('Glass Chess is synced to your Google account.');
    const refreshed = await pullCloudState();
    cloudGames = refreshed.games;
    cloudProfile = refreshed.profileData || cloudProfile;
    renderVault();
  } catch (error) {
    setSyncStatus('Sync failed', 'error');
    toast('Cloud sync failed: ' + error.message, true);
    throw error;
  } finally {
    syncInProgress = false;
  }
}

function queueCloudSync() {
  if (!activeUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (!activeUser || syncInProgress) return;
    syncInProgress = true;
    setSyncStatus('Syncing...', 'syncing');
    saveEngine.saveToCloud().then(() => {
      setSyncStatus('Synced to Cloud', 'synced');
    }).catch(error => {
      console.warn('Automatic Cloud sync failed:', error);
      setSyncStatus('Sync paused · retry', 'error');
    }).finally(() => { syncInProgress = false; });
  }, 900);
}

function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) return reject(new Error('Choose a JPG, PNG, or WebP image.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Choose an image smaller than 8 MB.'));
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('The avatar image could not be compressed.'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The avatar image could not be read.'));
        reader.readAsDataURL(blob);
      }, file.type === 'image/png' ? 'image/png' : 'image/webp', 0.82);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The avatar image could not be opened.')); };
    image.src = url;
  });
}

async function uploadProfileAvatar(file) {
  if (!file) return;
  if (!activeUser) {
    toast('Sign in first to sync a custom account picture.', true);
    return;
  }
  try {
    const image = await compressAvatar(file);
    profileAvatarUrl = await uploadProfileAsset(activeUser.uid, 'account-avatar', image);
    await firestoreSdk.setDoc(profileRef(activeUser.uid), {
      ownerUid: activeUser.uid,
      avatarUrl: profileAvatarUrl,
      updatedAtIso: new Date().toISOString(),
      updatedAt: firestoreSdk.serverTimestamp()
    }, { merge: true });
    renderAuth();
    toast('Your Google profile pill picture was updated.');
  } catch (error) {
    toast('Profile picture upload failed: ' + error.message, true);
  } finally {
    $('gc-auth-avatar-file').value = '';
  }
}

function onAuthState(user) {
  if (user) {
    void syncOnSignIn(user);
    return;
  }
  activeUser = null;
  profileAvatarUrl = '';
  stopCloudObservers();
  saveEngine.setCloudAdapter(null);
  setSyncStatus('Guest mode · saved on this device', 'idle');
  renderAuth();
}

async function initializeAuth() {
  mountAuthWidget();
  mountVault();
  if (!hasFirebaseConfig) {
    setSyncStatus('Guest mode · cloud setup needed', 'idle');
    return;
  }
  try {
    await loadFirebaseSdk();
    await authSdk.getRedirectResult(auth).catch(error => {
      console.warn('Google redirect sign-in:', error);
      toast('Google sign-in did not complete: ' + error.message, true);
    });
    stopAuthObserver = authSdk.onAuthStateChanged(auth, onAuthState);
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
    setSyncStatus('Guest mode · cloud unavailable', 'error');
  }
}

document.addEventListener('click', event => {
  const menu = $('gc-auth-menu');
  if (!menu || menu.hidden) return;
  if (event.target.closest('#gc-auth-menu') || event.target.closest('#gc-user-pill')) return;
  menu.hidden = true;
  authMenuOpen = false;
  $('gc-user-pill')?.setAttribute('aria-expanded', 'false');
});
window.addEventListener('resize', () => {
  const menu = $('gc-auth-menu');
  if (menu && !menu.hidden) menu.hidden = true;
});

window.GlassChessCloud = {
  get user() { return activeUser; },
  get configured() { return hasFirebaseConfig; },
  get status() { return activeUser ? 'signed-in' : 'guest'; },
  queueSync: queueCloudSync,
  syncNow,
  openVault,
  signIn
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initializeAuth(), { once: true });
} else {
  void initializeAuth();
}
