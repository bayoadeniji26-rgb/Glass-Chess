/*
 * Glass Chess account + private cloud saves.
 * Authentication: Clerk (email/password and verification are configured in Clerk).
 * Data: Supabase Postgres with Clerk third-party authentication and row-level security.
 * Guest play and local IndexedDB saves remain available without either service.
 */
import { saveEngine } from './save-engine.js';
import { CloudSyncQueue } from './cloud-sync-queue.js';
import './cloud-auth.css';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_CDN = 'https://esm.sh/@supabase/supabase-js@2';
const $ = id => document.getElementById(id);

let clerk = null;
let supabase = null;
let activeUser = null;
let authStateKey = '';
let profileAvatarUrl = '';
let authMenuOpen = false;
let cloudGames = [];
let cloudProfile = {};
let authGeneration = 0;
let supabaseLoadPromise = null;
const cloudSyncQueue = new CloudSyncQueue({
  canRun: () => Boolean(activeUser?.emailVerified && SUPABASE_URL && SUPABASE_KEY),
  delayMs: 900,
  retryDelayMs: 250,
  run: async () => {
    const ownerId = activeUser?.id;
    if (!ownerId || !activeUser?.emailVerified) return;
    const snapshot = await saveEngine.loadData();
    if (activeUser?.id !== ownerId || !activeUser.emailVerified) return;
    try { await cloudAdapter.push(snapshot); }
    catch (error) { if (activeUser?.id !== ownerId) return; throw error; }
    if (activeUser?.id !== ownerId) return;
    cloudProfile = snapshot;
    cloudGames = Array.isArray(snapshot.games) ? snapshot.games.slice(-150) : [];
    renderVault();
    setSyncStatus('Synced to Cloud', 'synced');
  },
  onError: error => {
    console.warn('Automatic Glass Chess cloud sync failed:', error);
    if (activeUser?.emailVerified) setSyncStatus('Sync paused · retry', 'error');
  }
});

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
  node._hideTimer = setTimeout(() => node.classList.remove('gc-toast-visible'), 3200);
}

function setSyncStatus(message, kind = 'idle') {
  const label = $('gc-auth-sync-text');
  const dot = $('gc-auth-sync-dot');
  if (label) label.textContent = message;
  if (dot) {
    dot.dataset.state = kind;
    dot.setAttribute('aria-label', message);
  }
}

function clerkFrontendDomain() {
  if (!CLERK_KEY.startsWith('pk_')) throw new Error('The Clerk publishable key is missing or invalid.');
  const segment = CLERK_KEY.split('_')[2];
  if (!segment) throw new Error('The Clerk publishable key is malformed.');
  const decoded = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
  const domain = decoded.replace(/[\$\s]+$/g, '').replace(/\/$/, '');
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('The Clerk frontend domain in the publishable key is invalid.');
  return domain;
}

function loadScript(src, marker, publishableKey = '') {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[' + marker + ']');
    if (existing?.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.setAttribute(marker, 'true');
      if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error('A required secure sign-in script could not be loaded.'));
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
      script.addEventListener('error', () => reject(new Error('A required secure sign-in script could not be loaded.')), { once: true });
    }
  });
}

async function loadClerk() {
  if (clerk) return clerk;
  if (!CLERK_KEY) throw new Error('Clerk is not configured. Add VITE_CLERK_PUBLISHABLE_KEY to the site environment.');
  const domain = clerkFrontendDomain();
  await loadScript('https://' + domain + '/npm/@clerk/ui@1/dist/ui.browser.js', 'data-glass-clerk-ui');
  await loadScript('https://' + domain + '/npm/@clerk/clerk-js@6/dist/clerk.browser.js', 'data-glass-clerk-js', CLERK_KEY);
  if (!window.Clerk?.load) throw new Error('Clerk loaded without its browser SDK. Check the Clerk domain and publishable key.');
  clerk = window.Clerk;
  await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
  clerk.addListener(({ user }) => {
    if (typeof user === 'undefined') return;
    handleClerkUser(user);
  });
  handleClerkUser(clerk.user || null);
  return clerk;
}

async function loadSupabase() {
  if (supabase) return supabase;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Your Clerk account is ready, but cloud saves still need a Supabase project. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  if (!supabaseLoadPromise) {
    supabaseLoadPromise = (async () => {
      const { createClient } = await import(/* @vite-ignore */ SUPABASE_CDN);
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        async accessToken() {
          return clerk?.session?.getToken() ?? null;
        }
      });
      return supabase;
    })().catch(error => {
      supabaseLoadPromise = null;
      throw error;
    });
  }
  return supabaseLoadPromise;
}

function emailIsVerified(user) {
  return user?.primaryEmailAddress?.verification?.status === 'verified';
}

function handleClerkUser(user) {
  activeUser = user ? {
    uid: user.id,
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || '',
    emailVerified: emailIsVerified(user),
    displayName: user.fullName || user.username || '',
    photoURL: user.imageUrl || ''
  } : null;
  const nextKey = activeUser ? activeUser.id + ':' + String(activeUser.emailVerified) : 'guest';
  renderAuth();
  window.dispatchEvent(new CustomEvent('glasschess:auth-change'));
  if (nextKey === authStateKey) return;
  authStateKey = nextKey;
  const generation = ++authGeneration;
  if (!activeUser) {
    cloudSyncQueue.cancel();
    saveEngine.setCloudAdapter(null);
    cloudGames = [];
    cloudProfile = {};
    setSyncStatus('Guest mode · saved on this device', 'idle');
    renderVault();
    return;
  }
  if (!activeUser.emailVerified) {
    cloudSyncQueue.cancel();
    saveEngine.setCloudAdapter(null);
    setSyncStatus('Verify email with Clerk to sync', 'pending');
    return;
  }
  void syncOnSignIn(user, generation);
}

function mountAuthWidget() {
  const header = document.querySelector('.topbar');
  if (!header || $('gc-auth-widget')) return;
  const widget = document.createElement('div');
  widget.id = 'gc-auth-widget';
  widget.innerHTML = `
    <button id="gc-google-signin" class="gc-google-signin" type="button">
      <span aria-hidden="true" class="gc-email-mark">✉</span>
      <span>Sign in / Create account</span>
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
  renderAuth();
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
        await clerk?.signOut();
        clerk?.openSignIn();
      } else if (action === 'sync') {
        await syncNow();
      } else if (action === 'vault') {
        openVault();
      } else if (action === 'avatar') {
        $('gc-auth-avatar-file')?.click();
      } else if (action === 'signout') {
        await clerk?.signOut();
      }
    } catch (error) {
      toast(error.message || 'That account action could not be completed.', true);
    }
  });
  return menu;
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

async function signIn() {
  try {
    await loadClerk();
    clerk.openSignIn();
  } catch (error) {
    toast(error.message || 'Secure sign-in is not available yet.', true);
    setSyncStatus('Guest mode · account setup needed', 'error');
  }
}

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
    localStorage: { ...(local.localStorage || {}), ...(remote.localStorage || {}) },
    profileAvatarUrl: remote.profileAvatarUrl || local.profileAvatarUrl || ''
  };
}

const cloudAdapter = {
  async push(state) {
    const owner = activeUser ? { ...activeUser } : null;
    if (!owner?.id || !owner.emailVerified) throw new Error('Verify your email before saving to the cloud.');
    const ownerId = owner.id;
    const avatar = profileAvatarUrl;
    const client = await loadSupabase();
    if (activeUser?.id !== ownerId || !activeUser.emailVerified) {
      throw new Error('The signed-in account changed before the cloud save completed. Retry the sync for the current account.');
    }
    const updatedAt = new Date().toISOString();
    const payload = {
      ...state,
      schema: 1,
      games: Array.isArray(state.games) ? state.games.slice(-150) : [],
      chatLog: Array.isArray(state.chatLog) ? state.chatLog.slice(-300) : [],
      profileAvatarUrl: avatar || state.profileAvatarUrl || '',
      profile: {
        id: ownerId,
        email: owner.email || '',
        displayName: owner.displayName || '',
        photoURL: owner.photoURL || ''
      },
      updatedAt
    };
    const { error } = await client.from('glass_chess_saves').upsert({
      user_id: ownerId,
      payload,
      updated_at: updatedAt
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return { syncedAt: payload.updatedAt, gameCount: payload.games.length };
  },
  async pull() {
    const ownerId = activeUser?.id;
    if (!ownerId || !activeUser.emailVerified) throw new Error('Sign in with a verified email to load cloud saves.');
    const client = await loadSupabase();
    if (activeUser?.id !== ownerId || !activeUser.emailVerified) {
      throw new Error('The signed-in account changed before the cloud download completed. Retry the sync for the current account.');
    }
    const { data, error } = await client.from('glass_chess_saves')
      .select('payload')
      .eq('user_id', ownerId)
      .maybeSingle();
    if (error) throw error;
    return data?.payload && typeof data.payload === 'object' ? data.payload : null;
  }
};

async function syncOnSignIn(user, generation) {
  const isCurrentAccount = () => generation === authGeneration && activeUser?.id === user.id;
  if (!isCurrentAccount()) return;
  if (!activeUser.emailVerified) {
    saveEngine.setCloudAdapter(null);
    setSyncStatus('Verify email with Clerk to sync', 'pending');
    renderAuth();
    return;
  }
  renderAuth();
  setSyncStatus('Connecting private saves…', 'syncing');
  try {
    await loadSupabase();
    if (!isCurrentAccount()) return;
    saveEngine.setCloudAdapter(cloudAdapter);
    const [remote, local] = await Promise.all([cloudAdapter.pull(), saveEngine.loadData()]);
    if (!isCurrentAccount()) return;
    if (remote) {
      cloudProfile = remote;
      cloudGames = Array.isArray(remote.games) ? remote.games.slice(-150) : [];
      const merged = mergeCloudAndLocal(remote, local);
      await saveEngine.replaceData(merged);
      if (!isCurrentAccount()) return;
      profileAvatarUrl = merged.profileAvatarUrl || user.imageUrl || '';
      cloudProfile = merged;
      cloudGames = Array.isArray(merged.games) ? merged.games.slice(-150) : [];
      await applyCloudProfile(merged, isCurrentAccount);
      if (!isCurrentAccount()) return;
      await saveEngine.saveToCloud();
    } else {
      cloudProfile = local;
      cloudGames = Array.isArray(local.games) ? local.games.slice(-150) : [];
      await saveEngine.saveToCloud();
    }
    if (!isCurrentAccount()) return;
    cloudSyncQueue.cancel();
    renderVault();
    setSyncStatus('Synced to Cloud', 'synced');
  } catch (error) {
    if (!isCurrentAccount()) return;
    saveEngine.setCloudAdapter(null);
    setSyncStatus('Cloud setup needed', 'error');
    console.warn('Glass Chess cloud sync could not start:', error);
    toast('Account signed in, but private game sync needs its Supabase setup: ' + (error.message || 'check configuration'), true);
  }
}

async function applyCloudProfile(profile, isCurrentAccount = () => true) {
  profileAvatarUrl = profile.profileAvatarUrl || profile.avatarUrl || profileAvatarUrl;
  renderAuth();
  await Promise.resolve(window.GlassChessKingPawn?.applyCloudProfile?.({
    ...profile,
    avatarUrl: profileAvatarUrl
  }));
  if (!isCurrentAccount()) return;
  window.GlassChessDailyPuzzles?.applyCloudProgress?.(profile.localStorage?.dailyPuzzleProgress);
  if (!isCurrentAccount()) return;
  window.dispatchEvent(new CustomEvent('glasschess:cloud-profile', { detail: { profile } }));
}

async function syncNow() {
  if (!activeUser) throw new Error('Sign in to sync your Glass Chess games.');
  if (!activeUser.emailVerified) throw new Error('Verify your email with Clerk before cloud syncing.');
  const ownerId = activeUser.id;
  setSyncStatus('Syncing…', 'syncing');
  try {
    await cloudSyncQueue.flush({ force: true });
    if (activeUser?.id !== ownerId) throw new Error('The signed-in account changed during sync. Try again.');
    const refreshed = await cloudAdapter.pull();
    if (activeUser?.id !== ownerId) throw new Error('The signed-in account changed during sync. Try again.');
    cloudProfile = refreshed || cloudProfile;
    cloudGames = Array.isArray(refreshed?.games) ? refreshed.games : [];
    renderVault();
    setSyncStatus('Synced to Cloud', 'synced');
    toast('Glass Chess is synced to your private account.');
  } catch (error) {
    if (activeUser?.id === ownerId) {
      setSyncStatus('Sync failed', 'error');
      toast('Cloud sync failed: ' + error.message, true);
    }
    throw error;
  }
}

function queueCloudSync() {
  cloudSyncQueue.queue();
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
      <footer>Your verified Clerk account protects your private Glass Chess cloud saves.</footer>
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
  if (!activeUser) toast('Sign in to open your Cloud Game Vault.', true);
  else if (!SUPABASE_URL || !SUPABASE_KEY) toast('Your account works, but the private cloud database still needs setup.', true);
}

function closeVault() {
  if ($('gc-cloud-vault')) $('gc-cloud-vault').hidden = true;
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
    summary.replaceChildren();
    const description = document.createElement('p');
    description.textContent = activeUser
      ? 'Signed in as ' + (activeUser.email || activeUser.displayName || 'Glass Chess player') + ' · ' + (activeUser.emailVerified ? 'email verified' : 'email verification required')
      : 'Guest mode · games are saved on this device';
    summary.append(description);
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore Cloud Profile';
    restore.disabled = !cloudProfile || !Object.keys(cloudProfile).length;
    restore.addEventListener('click', async () => {
      try {
        await saveEngine.replaceData(cloudProfile);
        await applyCloudProfile(cloudProfile);
        toast('Cloud profile and King Pawn chat restored.');
      } catch (error) { toast('Profile restore failed: ' + error.message, true); }
    });
    summary.append(restore);
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
    empty.textContent = activeUser
      ? 'No matches are saved to this account yet. Play a game and sync to add it here.'
      : 'Sign in to sync games between devices. Local guest saves are still available.';
    host.appendChild(empty);
    return;
  }
  for (const game of cloudGames.slice().sort((a, b) => String(b.savedAt || b.savedAtIso || '').localeCompare(String(a.savedAt || a.savedAtIso || '')))) {
    const card = document.createElement('article');
    card.className = 'gc-cloud-game';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = game.opponent || 'Glass Chess match';
    const meta = document.createElement('small');
    const dateValue = game.savedAt || game.savedAtIso;
    const date = dateValue ? new Date(dateValue).toLocaleString() : 'Saved match';
    const plies = game.pgn ? (game.pgn.match(/\d+\./g) || []).length : 0;
    meta.textContent = date + ' · ' + plies + ' moves · ' + (game.result || game.status || 'saved');
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
      } catch (error) { toast('This saved game could not be loaded: ' + error.message, true); }
    });
    card.append(info, load);
    host.appendChild(card);
  }
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
  if (!activeUser) return toast('Sign in first to save an account picture.', true);
  try {
    profileAvatarUrl = await compressAvatar(file);
    await saveEngine.saveData({ profileAvatarUrl });
    renderAuth();
    queueCloudSync();
    toast('Your Glass Chess account picture was updated.');
  } catch (error) {
    toast('Profile picture update failed: ' + error.message, true);
  } finally {
    $('gc-auth-avatar-file').value = '';
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

function initializeAuth() {
  mountAuthWidget();
  mountVault();
  if (!CLERK_KEY) {
    setSyncStatus('Guest mode · Clerk account setup needed', 'idle');
    return;
  }
  void loadClerk().catch(error => {
    console.warn('Clerk initialization failed:', error);
    setSyncStatus('Guest mode · account service unavailable', 'error');
  });
}

window.GlassChessCloud = {
  get user() { return activeUser; },
  get configured() { return Boolean(CLERK_KEY); },
  get databaseConfigured() { return Boolean(SUPABASE_URL && SUPABASE_KEY); },
  get status() { return activeUser ? 'signed-in' : 'guest'; },
  queueSync: queueCloudSync,
  syncNow,
  openVault,
  signIn
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAuth, { once: true });
} else {
  initializeAuth();
}
