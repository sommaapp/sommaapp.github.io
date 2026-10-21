'use strict';

(function () {
  const backend = window.SommaBackend;
  const config = window.SOMMA_CONFIG;
  const $ = selector => document.querySelector(selector);
  const app = $('#app');
  const dialog = $('#contribute-dialog');
  const CATEGORIES = ['Combustível', 'Alimentação', 'Transporte', 'Medicamentos', 'Conta essencial', 'Trabalho', 'Emergência', 'Outro'];
  const VIEWS = new Set(['home', 'help', 'request', 'history', 'profile', 'detail', 'notifications']);
  const INTENT_KEY = 'somma_backend_v1_pending_contribution';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const initialHash = location.hash;
  let legacyCredentialsCleaned = false;
  const state = {
    session: null, data: null, publicProfiles: new Map(), view: 'home', detailId: null,
    historyTab: 'all', historyGeneration: 0, history: { items: [], cursor: null, hasMore: true, loading: false, loaded: false }, requestStep: 1,
    draft: { value: '', category: '', description: '', durationHours: 48 },
    loading: false, loadedAt: 0, stale: false, generation: 0, loadPromise: null,
    recovery: false, confirmEmail: '', authMode: 'login',
    modalRequestId: null, selectedCents: 0, contributionIntent: null,
    contributing: false, publishing: false, routeDepth: 0
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const brl = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const firstName = name => String(name || '').trim().split(/\s+/)[0] || 'Membro';
  const feeFor = cents => cents > 0 ? 20 + Math.ceil(cents / 20) : 0;
  const fullDate = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const joinedDate = value => value ? new Date(value).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—';
  const currentUser = () => state.data?.profile;
  const requestById = id => state.data?.requests.find(request => request.id === id) || (state.data?.activeOwn?.id === id ? state.data.activeOwn : null) || (state.data?.feedSummary?.closest?.id === id ? state.data.feedSummary.closest : null) || (state.data?.feedSummary?.almost?.id === id ? state.data.feedSummary.almost : null) || state.history.items.find(item => item.request?.id === id)?.request || null;
  const personName = id => state.publicProfiles.get(id)?.public_name || 'Membro Somma';
  const levelName = code => state.data?.levels.find(level => level.code === code)?.display_name || 'Em análise';
  const hasSession = () => Boolean(state.session?.user?.id);
  const effectiveStatus = request => request.status === 'active' && request.expires_at && Date.parse(request.expires_at) <= Date.now() ? 'expired' : request.status;
  const remainingFor = request => Math.max(0, request.goal_cents - request.raised_cents);

  function parseCents(value) {
    const text = String(value || '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, decimal = ''] = text.split('.');
    const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
    return Number.isSafeInteger(cents) ? cents : null;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function statusLabel(request) {
    return ({ active: 'Em arrecadação', completed: 'Meta atingida', cancelled: 'Cancelado', suspended: 'Suspenso', expired: 'Prazo encerrado' })[effectiveStatus(request)] || 'Em análise';
  }

  function remainingTime(request) {
    if (effectiveStatus(request) !== 'active') return statusLabel(request);
    if (!request.expires_at) return 'Em arrecadação';
    const minutes = Math.max(1, Math.ceil((Date.parse(request.expires_at) - Date.now()) / 60000));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min restantes` : `${minutes}min restantes`;
  }

  function summary() {
    const metrics = state.data.metrics || {};
    const receivedMonth = Number(metrics.received_month_cents || 0);
    const activeOwn = state.data.activeOwn && effectiveStatus(state.data.activeOwn) === 'active' ? state.data.activeOwn : null;
    return {
      receivedCount: Number(metrics.received_count || 0), receivedMonth, activeOwn,
      helped: Number(metrics.helped || 0), contributed: Number(metrics.contributed_cents || 0),
      nextRequestAt: Date.parse(metrics.next_request_at || '') || 0,
      available: currentUser().period_limit_cents === null ? null : Math.max(0, currentUser().period_limit_cents - receivedMonth)
    };
  }
  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.remove('hidden');
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.classList.add('hidden'), 4500);
  }

  function feedback(selector, message, success = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('hidden', !message);
    element.classList.toggle('notice-success', Boolean(success));
  }

  function errorMessage(error) {
    if (!navigator.onLine) return 'Você está sem conexão. Conecte-se à internet e tente novamente.';
    const key = `${error?.code || ''} ${error?.message || ''}`;
    if (/invalid login credentials|invalid credentials/i.test(key)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(key)) return 'Confirme seu e-mail antes de entrar. Verifique também a caixa de spam.';
    const messages = {
      invalid_credentials: 'E-mail ou senha incorretos.',
      email_not_confirmed: 'Confirme seu e-mail antes de entrar. Verifique também a caixa de spam.',
      weak_password: 'Escolha uma senha mais forte, com pelo menos 8 caracteres.',
      same_password: 'Escolha uma senha diferente da senha atual.',
      email_address_invalid: 'Confira o endereço de e-mail informado.',
      email_address_not_authorized: 'O envio de e-mails de acesso ainda precisa ser habilitado para este endereço pela Somma.',
      over_email_send_rate_limit: 'Muitos e-mails foram solicitados. Aguarde um pouco antes de tentar novamente.',
      over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.',
      user_already_exists: 'Não foi possível criar essa conta. Tente entrar ou recuperar sua senha.',
      signup_disabled: 'Novos cadastros estão temporariamente indisponíveis.',
      otp_expired: 'Este link expirou ou já foi usado. Solicite um novo link de acesso.',
      session_not_found: 'Sua sessão expirou. Entre novamente.',
      refresh_token_not_found: 'Sua sessão expirou. Entre novamente.',
      account_not_active: 'Sua conta não está liberada para esta ação.',
      recipient_not_active: 'Este pedido não está disponível para receber contribuições.',
      beneficiary_not_active: 'Este pedido não está disponível para receber contribuições.',
      request_below_minimum: 'O valor mínimo por pedido é R$ 20,00.',
      request_limit_exceeded: 'Esse valor ultrapassa o limite atual da sua conta.',
      active_request_already_exists: 'Você já tem um pedido em arrecadação.',
      request_interval_not_elapsed: 'Ainda não passaram 7 dias desde seu último pedido.',
      period_limit_exceeded: 'Essa ação ultrapassa o limite mensal disponível.',
      period_limit_not_configured: 'Seu limite mensal ainda está em análise.',
      period_limit_pending: 'Seu limite mensal ainda está em análise.',
      recipient_period_limit_exceeded: 'O limite mensal deste beneficiário já foi atingido.',
      request_not_found: 'Este pedido não está disponível.',
      request_not_active: 'Este pedido já não está em arrecadação. Atualize para ver o status.',
      request_expired: 'O prazo deste pedido terminou.',
      self_contribution_not_allowed: 'Você não pode contribuir para seu próprio pedido.',
      contribution_exceeds_remaining_goal: 'O valor restante mudou. Atualize o pedido e confira o novo valor.',
      invalid_category: 'Escolha uma das categorias disponíveis.',
      invalid_duration: 'Escolha um prazo de 24 ou 48 horas.',
      invalid_duration_hours: 'Escolha um prazo de 24 ou 48 horas.',
      invalid_full_name: 'Informe um nome entre 2 e 120 caracteres.',
      intent_conflict: 'Não foi possível conferir esta contribuição. Atualize a página antes de continuar.'
    };
    const codes = new Set(key.split(/[^a-z0-9_]+/i));
    for (const [code, message] of Object.entries(messages)) if (codes.has(code)) return message;
    if (/AbortError|aborted|Failed to fetch|NetworkError|fetch failed|timeout/i.test(key)) return 'A conexão demorou a responder. Confira a internet e tente novamente.';
    if (error?.code === '23505') return 'Esta ação já foi registrada. Atualize para conferir o resultado.';
    if (error?.code === '23514') return 'Confira os valores e o prazo informados.';
    return 'Não foi possível concluir agora. Tente novamente em alguns instantes.';
  }

  function showBoot(message, retry = false) {
    $('#boot-screen').classList.remove('hidden');
    $('#auth-screen').classList.add('hidden');
    $('#app-shell').classList.add('hidden');
    $('#boot-message').textContent = message;
    $('#boot-retry').classList.toggle('hidden', !retry);
    $('#boot-logout').classList.toggle('hidden', !hasSession());
  }

  function authMode(mode, clear = true) {
    state.authMode = mode;
    $('#boot-screen').classList.add('hidden');
    $('#app-shell').classList.add('hidden');
    $('#auth-screen').classList.remove('hidden');
    $('#auth-tabs').classList.toggle('hidden', mode === 'recovery');
    document.querySelectorAll('.auth-form').forEach(form => form.classList.toggle('hidden', form.id !== `${mode}-form`));
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.authTab === mode);
      tab.setAttribute('aria-selected', String(tab.dataset.authTab === mode));
    });
    if (clear) feedback('#auth-feedback', '');
    $('#resend-confirmation').classList.add('hidden');
  }

  function clearAccount() {
    state.generation += 1;
    state.session = null;
    state.data = null;
    state.historyGeneration += 1;
    state.historyReloadPending = false;
    state.history = { items: [], cursor: null, hasMore: true, loading: false, loaded: false };
    state.publicProfiles = new Map();
    state.loadedAt = 0;
    state.loading = false;
    state.loadPromise = null;
    state.recovery = false;
    state.contributionIntent = null;
    state.modalRequestId = null;
    state.selectedCents = 0;
    state.view = 'home';
    state.detailId = null;
    resetDraft();
    closeDialogOnly();
    app.innerHTML = '';
    $('#notify-badge').classList.add('hidden');
    $('#pending-banner').classList.add('hidden');
    document.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
    history.replaceState({ somma: true, view: 'home', depth: 0 }, '', location.pathname + location.search + '#home');
    state.routeDepth = 0;
    authMode('login');
  }

  function restoreIntent() {
    if (state.contributionIntent || !hasSession()) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(INTENT_KEY) || 'null');
      if (saved?.userId === state.session.user.id && UUID.test(saved.key) && UUID.test(saved.requestId) && Number.isSafeInteger(saved.amountCents) && saved.amountCents > 0) state.contributionIntent = saved;
    } catch (_) { /* An unavailable browser store never grants access. */ }
  }

  function saveIntent(intent) {
    state.contributionIntent = intent;
    try {
      if (intent) sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
      else sessionStorage.removeItem(INTENT_KEY);
    } catch (_) { /* Keep the same intention in memory if storage is disabled. */ }
    updatePending();
  }

  function updatePending() {
    const element = $('#pending-banner');
    element.classList.toggle('hidden', !state.contributionIntent);
    if (state.contributionIntent) element.innerHTML = 'Uma simulação aguarda confirmação. <button class="link-btn" type="button" id="resume-contribution">Conferir registro</button>';
  }

  function updateSync() {
    $('#refresh-data').disabled = state.loading || !navigator.onLine;
    $('#sync-label').textContent = state.loading ? 'Atualizando…' : state.stale ? 'Não foi possível atualizar agora' : state.loadedAt ? `Atualizado às ${new Date(state.loadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Aguardando conexão';
    const banner = $('#network-banner');
    banner.classList.toggle('hidden', navigator.onLine);
    banner.textContent = navigator.onLine ? '' : 'Sem conexão. Entre na internet para atualizar ou registrar ações.';
    if (state.modalRequestId) updateContributionSummary();
  }

  async function ensureRequest(id) {
    const existing = requestById(id);
    if (existing) return existing;
    const request = await backend.getRequest(id);
    if (!request || !state.data) return null;
    if (!state.data.requests.some(item => item.id === id)) state.data.requests.push(request);
    (await backend.publicProfiles([request.user_id])).forEach(profile => state.publicProfiles.set(profile.id, profile));
    return request;
  }

  async function loadHistory(reset = false) {
    if (!hasSession() || state.history.loading) return;
    if (reset) {
      state.historyGeneration += 1;
      state.history = { items: [], cursor: null, hasMore: true, loading: false, loaded: false };
    }
    if (state.history.loaded && !state.history.hasMore) return;
    const generation = state.generation, historyGeneration = state.historyGeneration, kind = state.historyTab;
    state.history.loading = true;
    if (state.view === 'history') renderHistory();
    try {
      const page = await backend.historyPage(kind, state.history.cursor);
      if (generation !== state.generation || historyGeneration !== state.historyGeneration || kind !== state.historyTab) return;
      const rows = page.items || [];
      state.history.items.push(...rows);
      rows.forEach(item => {
        if (item.request && !state.data.requests.some(request => request.id === item.request.id)) state.data.requests.push(item.request);
      });
      (await backend.publicProfiles(rows.flatMap(item => [item.person_id, item.request?.user_id, item.contribution?.contributor_user_id]).filter(Boolean)))
        .forEach(profile => state.publicProfiles.set(profile.id, profile));
      state.history.cursor = page.next_at && page.next_id && page.next_kind
        ? { at: page.next_at, id: page.next_id, kind: page.next_kind } : null;
      state.history.hasMore = Boolean(page.has_more);
      state.history.loaded = true;
    } catch (error) {
      if (generation === state.generation) toast(errorMessage(error));
    } finally {
      if (generation === state.generation && historyGeneration === state.historyGeneration) {
        state.history.loading = false;
        if (state.historyReloadPending) {
          state.historyReloadPending = false;
          loadHistory(true);
        } else if (state.view === 'history') {
          renderHistory();
        }
      }
    }
  }

  async function loadMoreFeed() {
    if (!state.data?.feedHasMore || state.loading) return;
    state.loading = true; updateSync();
    try {
      const page = await backend.feedPage(state.session.user.id, state.data.feedCursor);
      page.rows.forEach(request => {
        if (!state.data.requests.some(item => item.id === request.id)) state.data.requests.push(request);
        if (!state.data.feedRequests.some(item => item.id === request.id)) state.data.feedRequests.push(request);
      });
      (await backend.publicProfiles(page.rows.map(request => request.user_id))).forEach(profile => state.publicProfiles.set(profile.id, profile));
      state.data.feedHasMore = page.hasMore; state.data.feedCursor = page.nextCursor;
      if (state.view === 'help') renderHelp();
    } catch (error) { toast(errorMessage(error)); }
    finally { state.loading = false; updateSync(); }
  }

  async function loadMoreNotifications() {
    if (!state.data?.notificationsHasMore || state.loading) return;
    state.loading = true; updateSync();
    try {
      const page = await backend.notificationPage(state.session.user.id, state.data.notificationsCursor);
      const known = new Set(state.data.notifications.map(item => item.id));
      state.data.notifications.push(...page.rows.filter(item => !known.has(item.id)));
      state.data.notificationsHasMore = page.hasMore; state.data.notificationsCursor = page.nextCursor;
      if (state.view === 'notifications') renderNotifications();
    } catch (error) { toast(errorMessage(error)); }
    finally { state.loading = false; updateSync(); }
  }

  async function loadData({ initial = false } = {}) {
    if (!hasSession()) return;
    if (state.loadPromise) return state.loadPromise;
    const userId = state.session.user.id;
    const generation = state.generation;
    state.loading = true;
    if (initial || !state.data) showBoot('Carregando seus pedidos e seu histórico…');
    updateSync();
    const task = (async () => {
      try {
        const data = await backend.snapshot(userId);
        if (generation !== state.generation || state.session?.user.id !== userId) return;
        state.data = data;
        state.data.feedRequests = data.requests.slice();
        state.historyGeneration += 1;
        state.history = { items: [], cursor: null, hasMore: true, loading: false, loaded: false };
        state.publicProfiles = new Map(data.publicProfiles.map(profile => [profile.id, profile]));
        state.publicProfiles.set(userId, { id: userId, public_name: data.profile.public_name, level: data.profile.level });
        state.loadedAt = Date.now();
        state.stale = false;
        restoreIntent();
        if (!state.recovery) {
          $('#boot-screen').classList.add('hidden');
          $('#auth-screen').classList.add('hidden');
          $('#app-shell').classList.remove('hidden');
          render();
          if (state.view === 'history') loadHistory(true);
        }
      } catch (error) {
        if (generation !== state.generation) return;
        state.stale = true;
        if (!state.data) showBoot(errorMessage(error), true);
        else toast(errorMessage(error));
        throw error;
      } finally {
        if (generation === state.generation) {
          state.loading = false;
          state.loadPromise = null;
          updateSync();
        }
      }
    })();
    state.loadPromise = task;
    return task;
  }

  async function receiveSession(session, event = '') {
    if (!session) { clearAccount(); return; }
    const changed = state.session?.user.id !== session.user.id;
    if (changed) {
      state.generation += 1;
      state.loadPromise = null;
      state.data = null;
      state.historyGeneration += 1;
      state.historyReloadPending = false;
      state.history = { items: [], cursor: null, hasMore: true, loading: false, loaded: false };
      state.contributionIntent = null;
      state.publicProfiles = new Map();
    }
    state.session = session;
    if (event === 'PASSWORD_RECOVERY' || state.recovery) {
      state.recovery = true;
      authMode('recovery');
      return;
    }
    if (changed || !state.data) {
      await loadData({ initial: true });
      if (state.data && !state.recovery) applyRoute(readRoute(), changed);
    }
  }

  function removeLegacyPasswords() {
    if (legacyCredentialsCleaned) return;
    legacyCredentialsCleaned = true;
    const keys = [
      'somma_mvp_v37_state', 'somma_mvp_v36_state', 'somma_mvp_v35_state', 'somma_mvp_v34_state',
      'apoio_mvp_v33_state', 'apoio_mvp_v32_state', 'apoio_mvp_v3_state', 'apoio_mvp_v2_state'
    ];
    // Earlier demos stored passwords in their local JSON. Remove those fields
    // without importing demo accounts or changing any other local records.
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') continue;
        let changed = false;
        const users = [data.user, ...(Array.isArray(data.users) ? data.users : [])];
        for (const user of users) {
          if (user && typeof user === 'object' && Object.prototype.hasOwnProperty.call(user, 'password')) {
            delete user.password;
            changed = true;
          }
        }
        if (changed) localStorage.setItem(key, JSON.stringify(data));
      } catch (_) { /* Invalid or unavailable local storage never blocks access. */ }
    }
  }

  async function bootstrap() {
    removeLegacyPasswords();
    if (!backend || backend.initializationError) {
      showBoot(backend?.initializationError || 'Não foi possível iniciar a Somma. Atualize a página.', true);
      return;
    }
    try {
      const { data, error } = await backend.client.auth.getSession();
      if (error) throw error;
      await receiveSession(data.session);
      const authError = new URLSearchParams(initialHash.slice(1)).get('error_code');
      if (authError && !data.session) feedback('#auth-feedback', errorMessage({ code: authError }));
    } catch (error) { showBoot(errorMessage(error), true); }
  }

  function readRoute() {
    if (history.state?.somma && VIEWS.has(history.state.view)) return history.state;
    const [part, id] = location.hash.replace(/^#/, '').split('/');
    if (part === 'detail' && UUID.test(id || '')) return { view: 'detail', requestId: id, depth: 0 };
    if (part === 'contribute' && UUID.test(id || '')) return { view: 'detail', requestId: id, modalRequestId: id, depth: 0 };
    return { view: VIEWS.has(part) && part !== 'detail' ? part : 'home', depth: 0 };
  }

  function routeHash(route) {
    if (route.modalRequestId) return `#contribute/${route.modalRequestId}`;
    return route.view === 'detail' ? `#detail/${route.requestId}` : `#${route.view}`;
  }

  function applyRoute(route, scroll = true) {
    if (!hasSession() || !state.data || state.recovery) return;
    if (state.view === 'request' && route.view !== 'request' && !state.publishing) resetDraft();
    state.view = VIEWS.has(route.view) ? route.view : 'home';
    state.detailId = UUID.test(route.requestId || '') ? route.requestId : null;
    state.routeDepth = Number(route.depth || 0);
    const requestedModal = route.modalRequestId;
    if (!requestedModal) { state.modalRequestId = null; closeDialogOnly(); }
    render();
    if (state.view === 'history' && !state.history.loaded) loadHistory(true);
    if (state.detailId && !requestById(state.detailId)) ensureRequest(state.detailId).then(() => { if (state.view === 'detail' && state.detailId) renderDetail(); }).catch(() => {});
    if (requestedModal) setupContribution(requestedModal);
    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function navigate(view, requestId = null, replace = false, modalRequestId = null) {
    if (!VIEWS.has(view) || !hasSession()) return;
    const route = { somma: true, view, requestId, modalRequestId, depth: replace ? state.routeDepth : state.routeDepth + 1 };
    const current = readRoute();
    if (!replace && routeHash(route) === routeHash(current)) { applyRoute(current); return; }
    history[replace ? 'replaceState' : 'pushState'](route, '', location.pathname + location.search + routeHash(route));
    applyRoute(route);
    if (!modalRequestId && view !== 'request' && view !== 'profile' && Date.now() - state.loadedAt > 30000) loadData().catch(() => {});
  }

  function back() {
    if (state.contributing) { toast('Aguarde a confirmação da simulação.'); return; }
    if (state.routeDepth > 0) history.back();
    else navigate('home', null, true);
  }

  function requestCard(request) {
    const pct = Math.min(100, request.raised_cents / request.goal_cents * 100);
    const remaining = remainingFor(request);
    const own = request.user_id === state.session.user.id;
    const available = effectiveStatus(request) === 'active' && remaining > 0;
    const name = personName(request.user_id);
    return `<article class="card">
      <div class="row between card-heading"><div class="row"><div class="avatar">${escapeHtml(name[0] || 'S')}</div><div><strong>${escapeHtml(name)}</strong><div class="tiny muted">${escapeHtml(remainingTime(request))}</div></div></div><div class="row mini-gap">${own ? '<span class="pill own-pill">Seu pedido</span>' : ''}<span class="pill">${escapeHtml(request.category)}</span></div></div>
      <p>${escapeHtml(request.description)}</p>
      <div class="progress" aria-label="${Math.round(pct)}% da meta simulada"><div style="width:${pct}%"></div></div>
      <div class="money-row"><strong>${brl(request.raised_cents)} simulados</strong><span class="muted">Meta ${brl(request.goal_cents)}</span></div>
      <div class="tiny muted top-mini">${request.helper_count} ${request.helper_count === 1 ? 'pessoa ajudou' : 'pessoas ajudaram'} · faltam ${brl(remaining)}</div>
      <div class="actions"><button type="button" class="btn btn-primary" data-contribute="${escapeHtml(request.id)}" ${own || !available ? 'disabled' : ''}>${own ? 'Seu pedido' : available ? 'Ajudar agora' : escapeHtml(statusLabel(request))}</button><button type="button" class="btn btn-secondary" data-details="${escapeHtml(request.id)}">Ver pedido</button></div>
    </article>`;
  }

  function renderHome() {
    const user = currentUser();
    $('#page-title').textContent = 'Início';
    const active = state.data.feedRequests.filter(request => effectiveStatus(request) === 'active');
    const primary = active[0] || state.data.feedSummary.closest;
    const almost = state.data.feedSummary.almost || null;
    const activeCount = Number(state.data.feedSummary.active_count || 0);
    const supportedRequests = Number(state.data.metrics.supported_requests || 0);
    app.innerHTML = `<div class="content">
      <section class="hero"><p class="eyebrow hero-eyebrow">Olá, ${escapeHtml(firstName(user.full_name))}</p><h2>Uma pequena ajuda pode resolver o dia de alguém.</h2><p>Contribuições voluntárias para necessidades pontuais.</p></section>
      <div class="stats"><div class="stat"><strong>${activeCount}</strong><span>pedidos ativos</span></div><div class="stat"><strong>${supportedRequests}</strong><span>pedidos apoiados</span></div><div class="stat stat-money"><strong>${brl(100).replace(/\s/, ' ')}</strong><span>para começar</span></div></div>
      <div class="legal-banner"><strong>Importante:</strong> toda contribuição é voluntária e não constitui empréstimo, crédito ou investimento.</div>
      <div class="section-head"><h2>Alguém precisa da sua ajuda</h2><button type="button" class="link-btn" data-view="help">Ver todos</button></div>
      ${primary ? requestCard(primary) : '<section class="empty-state"><div class="empty-icon">♡</div><h2>A comunidade começa com pessoas</h2><p>Ainda não há pedidos ativos. Os novos pedidos aparecerão aqui.</p><button type="button" class="btn btn-primary full" data-view="request">Pedir apoio</button></section>'}
      ${almost ? `<div class="section-head"><h2>Quase lá</h2></div>${requestCard(almost)}` : ''}
    </div>`;
  }

  function renderHelp() {
    $('#page-title').textContent = 'Ajudar';
    const requests = state.data.feedRequests.filter(request => effectiveStatus(request) === 'active');
    app.innerHTML = `<div class="content"><div class="section-head"><div><h2>Pedidos ativos</h2><p class="muted tiny">Escolha livremente quem você quer apoiar.</p></div></div><div class="legal-banner compact"><strong>Sem obrigação de retorno.</strong> Ajudar hoje não cria direito automático de receber amanhã.</div>${requests.length ? requests.map(requestCard).join('') : '<section class="empty-state"><div class="empty-icon">♡</div><h2>Nenhum pedido ativo</h2><p>Novos pedidos aparecerão aqui.</p></section>'}${state.data.feedHasMore ? '<button type="button" class="btn btn-secondary full top-gap" id="more-feed">Carregar mais pedidos</button>' : ''}</div>`;
  }

  function resetDraft() {
    state.requestStep = 1;
    state.draft = { value: '', category: '', description: '', durationHours: 48 };
  }

  function renderRequest() {
    $('#page-title').textContent = 'Pedir apoio';
    const user = currentUser();
    const limits = summary();
    let blocked = '';
    if (user.account_status !== 'active') blocked = 'Sua conta não está liberada para criar pedidos.';
    else if (limits.activeOwn) blocked = 'Você já tem um pedido em arrecadação. Acompanhe esse pedido antes de criar outro.';
    else if (user.period_limit_cents === null) blocked = 'Seu limite mensal está pendente de análise. Um novo pedido ficará disponível quando esse limite for definido.';
    else if (limits.nextRequestAt > Date.now()) blocked = `O próximo pedido ficará disponível em ${fullDate(limits.nextRequestAt)}. O intervalo mínimo é de 7 dias.`;
    else if (limits.available < 2000) blocked = 'Seu limite disponível neste mês é menor que o valor mínimo de R$ 20,00.';
    if (blocked) {
      app.innerHTML = `<div class="content"><section class="empty-state"><div class="empty-icon">⏳</div><h2>Vamos acompanhar seus limites</h2><p>${escapeHtml(blocked)}</p>${limits.activeOwn ? `<button class="btn btn-primary full" type="button" data-details="${limits.activeOwn.id}">Ver meu pedido</button>` : ''}<button class="btn btn-secondary full top-gap" type="button" data-view="profile">Ver meus limites</button></section></div>`;
      return;
    }
    const draft = state.draft;
    const step = state.requestStep;
    const stepper = `<div class="stepper">${[1, 2, 3].map(number => `<span class="${number <= step ? 'active' : ''}"></span>`).join('')}</div><p class="eyebrow">Etapa ${step} de 3</p>`;
    if (step === 1) {
      app.innerHTML = `<div class="content">${stepper}<h2 class="flow-title">Defina sua necessidade</h2><div class="request-limit-highlight"><span>Nível ${escapeHtml(levelName(user.level))} · limite por pedido</span><strong>${brl(user.request_limit_cents)}</strong><small>Disponível neste mês: ${brl(limits.available)}</small></div><div class="notice">Valor mínimo de R$ 20,00. Limite mensal: ${brl(user.period_limit_cents)}.</div><p id="request-feedback" class="notice hidden" role="status"></p><form class="form-card" id="request-step-1"><label class="field">Quanto você precisa?<input id="req-value" type="number" min="20" max="${Math.min(user.request_limit_cents, limits.available) / 100}" step="0.01" inputmode="decimal" value="${escapeHtml(draft.value)}" placeholder="Ex.: 50" required></label><label class="field">Categoria<select id="req-category" required><option value="">Selecione</option>${CATEGORIES.map(category => `<option value="${escapeHtml(category)}" ${draft.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label><button type="submit" class="btn btn-primary full">Continuar</button></form></div>`;
    } else if (step === 2) {
      app.innerHTML = `<div class="content">${stepper}<h2 class="flow-title">Conte o essencial</h2><p id="request-feedback" class="notice hidden" role="status"></p><form class="form-card" id="request-step-2"><label class="field">Descreva sua necessidade<textarea id="req-description" maxlength="180" placeholder="Explique sua necessidade de forma objetiva." required>${escapeHtml(draft.description)}</textarea><span class="tiny muted"><span id="desc-count">${draft.description.length}</span>/180 · Evite dados pessoais, endereço ou documentos.</span></label><label class="field">Prazo<select id="req-time"><option value="24" ${draft.durationHours === 24 ? 'selected' : ''}>24 horas</option><option value="48" ${draft.durationHours === 48 ? 'selected' : ''}>48 horas</option></select></label><div class="two-actions"><button type="button" class="btn btn-secondary" data-request-step="1">Voltar</button><button type="submit" class="btn btn-primary">Continuar</button></div></form></div>`;
    } else {
      app.innerHTML = `<div class="content">${stepper}<h2 class="flow-title">Revise antes de publicar</h2><section class="card review-card"><div class="review-row"><span>Valor</span><strong>${brl(parseCents(draft.value))}</strong></div><div class="review-row"><span>Categoria</span><strong>${escapeHtml(draft.category)}</strong></div><div class="review-row"><span>Prazo</span><strong>${draft.durationHours} horas</strong></div><div class="review-description"><span>Descrição</span><p>${escapeHtml(draft.description)}</p></div></section><div class="legal-banner"><strong>Fase de testes:</strong> o pedido será visível para outras contas e receberá apenas contribuições simuladas. Não há garantia de atingir a meta.</div><p id="request-feedback" class="notice hidden" role="status"></p><form id="request-final-form"><label class="check-row"><input id="req-confirm" type="checkbox" required><span>Confirmo que as informações são verdadeiras e entendo que pedidos suspeitos poderão ser suspensos.</span></label><div class="two-actions"><button type="button" class="btn btn-secondary" data-request-step="2">Voltar</button><button type="submit" class="btn btn-primary">Publicar pedido</button></div></form></div>`;
    }
  }

  function renderHistory() {
    $('#page-title').textContent = 'Histórico';
    const totals = summary(), items = state.history.items;
    app.innerHTML = `<div class="content"><div class="stats"><div class="stat"><strong>${totals.helped}</strong><span>pessoas ajudadas</span></div><div class="stat stat-money"><strong>${brl(totals.contributed).replace(/\\s/, ' ')}</strong><span>contribuído em simulações</span></div><div class="stat"><strong>${totals.receivedCount}</strong><span>apoios simulados recebidos</span></div></div><div class="segmented">${[['all', 'Todos'], ['helped', 'Ajudei'], ['received', 'Recebi']].map(([key, title]) => `<button type="button" class="${state.historyTab === key ? 'active' : ''}" data-history-tab="${key}">${title}</button>`).join('')}</div><div class="section-head history-head"><div><h2>Movimentações</h2><p class="tiny muted">Registros sincronizados da sua participação. Sem movimentação de dinheiro.</p></div></div>${items.length ? `<div class="history-list">${items.map(item => {
      if (item.kind === 'request') {
        const request = item.request;
        return `<div class="history-item history-published"><div class="history-icon">○</div><div class="history-main"><div class="history-title-row"><strong>Pedido publicado</strong><span class="history-badge">Pedido</span></div><div class="tiny muted">${escapeHtml(request.category)} · ${fullDate(item.time)}</div><button type="button" class="link-btn history-detail-link" data-details="${request.id}">Ver pedido</button></div><strong class="history-value status-value">${escapeHtml(statusLabel(request))}</strong></div>`;
      }
      const contribution = item.contribution, request = item.request, helped = item.kind === 'helped';
      const name = helped ? personName(request?.user_id) : personName(contribution.contributor_user_id);
      return `<div class="history-item ${helped ? 'history-helped' : 'history-received'}"><div class="history-icon">${helped ? '♡' : '↓'}</div><div class="history-main"><div class="history-title-row"><strong>${helped ? 'Você ajudou' : 'Você recebeu apoio'}</strong><span class="history-badge">${helped ? 'Ajudei' : 'Recebi'}</span></div><div class="tiny muted">${escapeHtml(name)} · ${fullDate(item.time)}</div>${helped ? `<div class="tiny muted">Taxa simulada: ${brl(contribution.platform_fee_cents)}</div>` : ''}<button type="button" class="link-btn history-detail-link" data-details="${request.id}">Ver pedido</button></div><strong class="history-value">${brl(contribution.amount_cents)}</strong></div>`;
    }).join('')}</div>` : state.history.loaded ? '<section class="empty-state small"><div class="empty-icon">◷</div><h2>Nenhuma movimentação</h2><p>Não há registros para este filtro.</p></section>' : '<p class="muted">Carregando histórico…</p>'}${state.history.hasMore ? '<button type="button" class="btn btn-secondary full top-gap" id="more-history" ' + (state.history.loading ? 'disabled' : '') + '>Carregar mais</button>' : ''}</div>`;
  }

  function renderProfile() {
    $('#page-title').textContent = 'Perfil';
    const user = currentUser();
    const totals = summary();
    const levelIndex = state.data.levels.findIndex(level => level.code === user.level);
    const current = state.data.levels[levelIndex];
    const next = state.data.levels[levelIndex + 1];
    const pct = user.period_limit_cents ? Math.min(100, totals.receivedMonth / user.period_limit_cents * 100) : 0;
    const nextRequest = totals.activeOwn ? 'Pedido em arrecadação' : totals.nextRequestAt > Date.now() ? fullDate(totals.nextRequestAt) : 'Disponível agora';
    app.innerHTML = `<div class="content">
      <section class="card profile-hero"><div class="profile-avatar">${escapeHtml(firstName(user.full_name)[0])}</div><h2>${escapeHtml(user.full_name)}</h2><p class="success">${state.session.user.email_confirmed_at ? '✓ E-mail confirmado' : 'Confirmação de e-mail pendente'}</p><p class="muted">Membro desde ${escapeHtml(joinedDate(user.created_at))}</p>${user.account_status !== 'active' ? '<div class="notice">Sua conta não está liberada para novos pedidos ou contribuições.</div>' : ''}</section>
      <div class="stats"><div class="stat"><strong>${totals.helped}</strong><span>pessoas ajudadas</span></div><div class="stat"><strong>${totals.receivedCount}</strong><span>apoios recebidos</span></div><div class="stat stat-money"><strong>${brl(totals.contributed).replace(/\s/, ' ')}</strong><span>contribuído em simulações</span></div></div>
      <section class="card progression-card"><div class="row between progression-head"><div><span class="tiny muted">Seu nível atual</span><h2>${escapeHtml(current?.display_name || levelName(user.level))}</h2></div><span class="level-chip">${brl(user.request_limit_cents)} por pedido</span></div><p class="muted progression-copy">Seus limites são definidos conforme a análise da conta.</p>${next ? `<div class="next-level"><span>Próximo nível</span><strong>${escapeHtml(next.display_name)}</strong><small>Até ${brl(next.request_limit_cents)} por pedido · ${next.period_limit_cents === null ? 'limite mensal sob análise' : brl(next.period_limit_cents) + ' por mês'}</small></div>` : ''}<p class="legal-note top-mini">A progressão considera identidade, tempo de uso, histórico e segurança. Contribuir não cria obrigação de receber nem garante mudança de nível. Confirmar o e-mail não equivale à verificação de identidade.</p></section>
      <section class="card"><div class="section-head no-margin"><h2>Seus limites</h2></div><div class="limit-row"><span>Por pedido</span><strong>${brl(user.request_limit_cents)}</strong></div><div class="limit-row"><span>Apoios simulados neste mês</span><strong>${brl(totals.receivedMonth)} / ${user.period_limit_cents === null ? 'Sob análise' : brl(user.period_limit_cents)}</strong></div><div class="progress"><div style="width:${pct}%"></div></div><div class="tiny muted">${totals.available === null ? 'Limite mensal pendente de análise.' : 'Ainda disponível neste mês: ' + brl(totals.available)}</div><div class="limit-row divider"><span>Próximo pedido</span><strong>${escapeHtml(nextRequest)}</strong></div><p class="legal-note">O período mensal vai do primeiro ao último dia do mês, pelo horário UTC. Os valores desta fase são simulados.</p></section>
      <section class="card level-map-card"><div class="section-head no-margin"><div><h2>Progressão da Somma</h2><p class="tiny muted">Limites crescem gradualmente conforme a confiança na conta.</p></div></div><div class="level-list">${state.data.levels.map(level => `<div class="level-row ${level.code === user.level ? 'active' : ''}"><div><strong>${escapeHtml(level.display_name)}</strong><span>${level.code === 'special' ? 'Faixa sujeita a análise individual.' : 'Progressão sujeita à análise da conta.'}</span></div><div class="level-values"><strong>${level.code === 'special' ? 'Até ' : ''}${brl(level.request_limit_cents)}</strong><span>${level.period_limit_cents === null ? 'Limite mensal sob análise' : brl(level.period_limit_cents) + '/mês'}</span></div></div>`).join('')}</div></section>
      <section class="card"><div class="section-head no-margin"><h2>Dados do perfil</h2></div><p id="profile-feedback" class="notice hidden" role="status"></p><form id="profile-form"><label class="field">Nome<input id="profile-name" minlength="2" maxlength="120" value="${escapeHtml(user.full_name)}" required></label><label class="field">E-mail<input value="${escapeHtml(state.session.user.email || '')}" disabled></label><p class="tiny muted">Nos pedidos, o nome público é ${escapeHtml(user.public_name)}</p><button class="btn btn-secondary full" type="submit">Salvar nome</button></form></section>
      <div class="list"><button type="button" class="list-button" data-view="notifications"><span>Notificações</span><strong>›</strong></button><button type="button" class="list-button" id="logout-btn"><span>Sair da conta neste aparelho</span><strong>›</strong></button></div>
    </div>`;
  }

  function renderDetail() {
    $('#page-title').textContent = 'Pedido';
    const request = requestById(state.detailId);
    if (!request) {
      app.innerHTML = '<div class="content"><button type="button" class="back-link" data-back>‹ Voltar</button><section class="empty-state"><h2>Pedido indisponível</h2><p>Este pedido não está disponível para esta conta.</p><button class="btn btn-secondary" type="button" id="detail-refresh">Atualizar</button></section></div>';
      return;
    }
    const remaining = remainingFor(request);
    const own = request.user_id === state.session.user.id;
    const available = effectiveStatus(request) === 'active' && remaining > 0;
    const name = personName(request.user_id);
    const pct = Math.min(100, request.raised_cents / request.goal_cents * 100);
    app.innerHTML = `<div class="content"><button type="button" class="back-link" data-back>‹ Voltar</button><section class="card detail-page"><div class="row between card-heading"><div class="row"><div class="avatar large">${escapeHtml(name[0] || 'S')}</div><div><h2>${escapeHtml(name)}</h2><div class="tiny muted">${escapeHtml(remainingTime(request))}</div></div></div><span class="pill">${escapeHtml(request.category)}</span></div><p class="detail-description">${escapeHtml(request.description)}</p><div class="progress"><div style="width:${pct}%"></div></div><div class="money-row"><strong>${brl(request.raised_cents)} simulados</strong><span class="muted">Meta ${brl(request.goal_cents)}</span></div><div class="detail-grid"><div><span>Pessoas que ajudaram</span><strong>${request.helper_count}</strong></div><div><span>Falta</span><strong>${brl(remaining)}</strong></div><div><span>Criado</span><strong>${fullDate(request.created_at)}</strong></div><div><span>Status</span><strong>${escapeHtml(statusLabel(request))}</strong></div></div><div class="legal-banner compact"><strong>Contribuição voluntária:</strong> não há obrigação de restituição, juros ou retorno financeiro. Nesta fase, todos os valores são simulados.</div><button type="button" class="btn btn-primary full" data-contribute="${request.id}" ${own || !available ? 'disabled' : ''}>${own ? 'Este é o seu pedido' : available ? 'Ajudar este pedido' : escapeHtml(statusLabel(request))}</button></section></div>`;
  }

  function renderNotifications() {
    $('#page-title').textContent = 'Notificações';
    const unread = state.data.unreadCount || 0;
    app.innerHTML = `<div class="content"><button type="button" class="back-link" data-back>‹ Voltar</button><div class="section-head"><div><h2>Central de notificações</h2><p class="muted tiny">Avisos sobre pedidos, contribuições e sua conta.</p></div></div><div class="notification-list">${state.data.notifications.length ? state.data.notifications.map(item => `<div class="notification-item ${item.read_at ? '' : 'unread'}"><span class="notification-dot" aria-hidden="true"></span><div class="notification-copy"><div class="notification-title-row"><strong>${escapeHtml(item.title)}</strong>${item.read_at ? '' : '<span class="new-label">Nova</span>'}</div><p>${escapeHtml(item.body)}</p><span class="tiny muted">${fullDate(item.created_at)}</span></div></div>`).join('') : '<section class="empty-state small"><div class="empty-icon">◌</div><h2>Nenhuma notificação</h2><p>Novidades aparecerão aqui.</p></section>'}</div>${state.data.notificationsHasMore ? '<button type="button" id="more-notifications" class="btn btn-secondary full top-gap">Carregar mais notificações</button>' : ''}<button type="button" id="mark-read" class="btn btn-secondary full top-gap" ${unread ? '' : 'disabled'}>Marcar todas como lidas</button></div>`;
  }

  function render() {
    if (!state.data || !hasSession()) return;
    const views = { home: renderHome, help: renderHelp, request: renderRequest, history: renderHistory, profile: renderProfile, detail: renderDetail, notifications: renderNotifications };
    (views[state.view] || renderHome)();
    document.querySelectorAll('.nav-item').forEach(button => {
      button.classList.toggle('active', button.dataset.view === state.view);
      if (button.dataset.view === state.view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const unread = state.data.unreadCount || 0;
    $('#notify-badge').textContent = unread > 99 ? '99+' : String(unread);
    $('#notify-badge').classList.toggle('hidden', !unread);
    updatePending();
    updateSync();
  }

  function closeDialogOnly() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    dialog.classList.remove('dialog-fallback-open');
    $('#app-shell').inert = false;
  }

  function openContribution(id) {
    if (!UUID.test(id)) return;
    if (state.contributionIntent) id = state.contributionIntent.requestId;
    const request = requestById(id);
    if (!request) { toast('Atualize para conferir este pedido.'); return; }
    if (request.user_id === state.session.user.id) { toast('Você não pode contribuir para seu próprio pedido.'); return; }
    if (currentUser().account_status !== 'active') { toast('Sua conta não está liberada para contribuir.'); return; }
    if (effectiveStatus(request) !== 'active' && !state.contributionIntent) { toast('Este pedido já não está em arrecadação.'); return; }
    navigate(state.view, state.detailId, false, id);
  }

  function setupContribution(id) {
    const request = requestById(id);
    if (!request) {
      ensureRequest(id).then(found => { if (found && state.modalRequestId === id) setupContribution(id); }).catch(error => toast(errorMessage(error)));
      return;
    }
    if (request.user_id === state.session.user.id) { state.modalRequestId = null; closeDialogOnly(); return; }
    const pending = state.contributionIntent?.requestId === id ? state.contributionIntent : null;
    state.modalRequestId = id;
    state.selectedCents = pending ? pending.amountCents : 0;
    $('#dialog-person').textContent = `Ajudar ${personName(request.user_id)}`;
    const remaining = remainingFor(request);
    $('#amount-options').innerHTML = [100, 200, 500, 1000].filter(value => value <= remaining).map(value => `<button type="button" class="amount-btn ${value === state.selectedCents ? 'selected' : ''}" data-amount="${value}" ${pending ? 'disabled' : ''}>${brl(value)}</button>`).join('');
    $('#custom-amount').max = String(Math.max(remaining, pending?.amountCents || 0) / 100);
    $('#custom-amount').value = pending ? String(pending.amountCents / 100) : '';
    $('#custom-amount').disabled = Boolean(pending);
    feedback('#contribution-feedback', pending ? 'Esta simulação aguarda confirmação. Confira novamente para consultar ou concluir o mesmo registro, sem duplicá-lo.' : '');
    updateContributionSummary();
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else { dialog.setAttribute('open', ''); dialog.classList.add('dialog-fallback-open'); $('#app-shell').inert = true; }
  }

  function updateContributionSummary() {
    const value = state.selectedCents || 0;
    $('#summary-contribution').textContent = brl(value);
    $('#summary-fee').textContent = brl(feeFor(value));
    $('#summary-total').textContent = brl(value + feeFor(value));
    const request = requestById(state.modalRequestId);
    const pending = Boolean(state.contributionIntent);
    const valid = pending || request && effectiveStatus(request) === 'active' && value > 0 && value <= remainingFor(request);
    $('#confirm-contribution').disabled = !valid || state.contributing || !navigator.onLine;
    $('#confirm-contribution').textContent = state.contributing ? 'Conferindo…' : pending ? 'Conferir esta simulação' : 'Confirmar simulação';
  }

  function formBusy(form, busy) {
    form.setAttribute('aria-busy', String(busy));
    if (busy) {
      form._disabled = [...form.elements].map(element => [element, element.disabled]);
      form._disabled.forEach(([element]) => { element.disabled = true; });
    } else {
      form._disabled?.forEach(([element, wasDisabled]) => { element.disabled = wasDisabled; });
      form._disabled = null;
    }
  }

  async function withForm(form, selector, action) {
    if (form.getAttribute('aria-busy') === 'true') return;
    feedback(selector, '');
    formBusy(form, true);
    try { await action(); }
    catch (error) { feedback(selector, errorMessage(error)); }
    finally { formBusy(form, false); }
  }

  async function logout() {
    if (!backend?.client) { clearAccount(); return; }
    try {
      const { error } = await backend.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      clearAccount();
      toast('Você saiu da conta neste aparelho.');
    } catch (error) { toast(errorMessage(error)); }
  }

  async function submitAuth(form) {
    await withForm(form, '#auth-feedback', async () => {
      const auth = backend.client.auth;
      if (form.id === 'login-form') {
        const { data, error } = await auth.signInWithPassword({ email: $('#login-email').value.trim().toLowerCase(), password: $('#login-password').value });
        $('#login-password').value = '';
        if (error) throw error;
        await receiveSession(data.session);
      } else if (form.id === 'signup-form') {
        const name = $('#signup-name').value.trim();
        if (name.length < 2) throw { code: 'invalid_full_name' };
        const email = $('#signup-email').value.trim().toLowerCase();
        const { data, error } = await auth.signUp({ email, password: $('#signup-password').value, options: { data: { full_name: name }, emailRedirectTo: config.siteUrl } });
        $('#signup-password').value = '';
        if (error) throw error;
        state.confirmEmail = email;
        if (data.session) await receiveSession(data.session);
        else {
          feedback('#auth-feedback', 'Confira seu e-mail para confirmar o cadastro. Depois, entre com seu e-mail e sua senha. Verifique também a caixa de spam.', true);
          $('#login-email').value = email;
          $('#resend-confirmation').classList.remove('hidden');
        }
      } else if (form.id === 'forgot-form') {
        const { error } = await auth.resetPasswordForEmail($('#forgot-email').value.trim().toLowerCase(), { redirectTo: config.siteUrl });
        if (error) throw error;
        feedback('#auth-feedback', 'Se houver uma conta para este e-mail, você receberá um link para definir uma nova senha.', true);
      } else if (form.id === 'recovery-form') {
        const password = $('#recovery-password').value;
        if (password !== $('#recovery-confirm').value) { feedback('#auth-feedback', 'As senhas precisam ser iguais.'); return; }
        const { error } = await auth.updateUser({ password });
        $('#recovery-password').value = '';
        $('#recovery-confirm').value = '';
        if (error) throw error;
        state.recovery = false;
        await loadData({ initial: true });
        navigate('home', null, true);
        toast('Sua senha foi atualizada.');
      }
    });
  }

  async function publishRequest(form) {
    if (state.publishing) return;
    await withForm(form, '#request-feedback', async () => {
      const values = {
        userId: state.session.user.id, goalCents: parseCents(state.draft.value),
        category: state.draft.category, description: state.draft.description.trim(), durationHours: state.draft.durationHours
      };
      if (!values.goalCents || values.goalCents < 2000 || !CATEGORIES.includes(values.category) || !values.description) throw { code: 'request_below_minimum' };
      const existingIds = new Set(state.data.requests.map(request => request.id));
      state.publishing = true;
      try {
        let published;
        try { published = await backend.createRequest(values); }
        catch (error) {
          // The unique active-request rule also protects a lost response.
          // Recover only a newly observed matching row for this submission.
          await loadData();
          const created = state.data.requests.find(request => !existingIds.has(request.id) && request.user_id === values.userId && request.goal_cents === values.goalCents && request.category === values.category && request.description === values.description && request.duration_hours === values.durationHours);
          if (!created) throw error;
          published = created;
        }
        if (state.session?.user.id !== values.userId) return;
        if (!state.data.requests.some(request => request.id === published.id)) state.data.requests.unshift(published);
        if (!state.data.feedRequests.some(request => request.id === published.id)) state.data.feedRequests.unshift(published);
        resetDraft();
        navigate('home');
        toast('Pedido publicado. Ele já pode receber contribuições simuladas.');
        await loadData().catch(() => {});
      } finally { state.publishing = false; }
    });
  }

  async function confirmContribution(form) {
    if (state.contributing || !hasSession() || !navigator.onLine) return;
    const request = requestById(state.modalRequestId);
    if (!request) return;
    let intent = state.contributionIntent;
    if (!intent) {
      const amountCents = state.selectedCents;
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > remainingFor(request)) return;
      intent = { key: uuid(), userId: state.session.user.id, requestId: request.id, amountCents };
      saveIntent(intent);
    }
    state.contributing = true;
    formBusy(form, true);
    feedback('#contribution-feedback', 'Conferindo o registro da simulação…');
    updateContributionSummary();
    try {
      const result = await backend.contribute(intent);
      if (state.session?.user.id !== intent.userId) return;
      saveIntent(null);
      state.contributing = false;
      closeDialogOnly();
      state.modalRequestId = null;
      if (state.routeDepth > 0) history.back();
      else navigate('detail', intent.requestId, true);
      toast(`Simulação de ${brl(result.amount_cents)} registrada. Nenhum valor foi cobrado.`);
      await loadData().catch(() => {});
    } catch (error) {
      if (error.outcomeKnown) {
        saveIntent(null);
        feedback('#contribution-feedback', errorMessage(error));
        loadData().catch(() => {});
      } else {
        // Keep this intent and amount unchanged after an uncertain response.
        feedback('#contribution-feedback', `${errorMessage(error)} Use “Conferir esta simulação” para consultar o mesmo registro.`);
      }
    } finally {
      state.contributing = false;
      formBusy(form, false);
      if (state.contributionIntent) {
        $('#custom-amount').disabled = true;
        document.querySelectorAll('.amount-btn').forEach(button => { button.disabled = true; });
      } else {
        $('#custom-amount').disabled = false;
        document.querySelectorAll('.amount-btn').forEach(button => { button.disabled = false; });
      }
      updateContributionSummary();
    }
  }

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (!navigator.onLine) { feedback(form.closest('#auth-screen') ? '#auth-feedback' : form.id === 'contribute-form' ? '#contribution-feedback' : '#request-feedback', 'Você está sem conexão. Conecte-se à internet para continuar.'); return; }
    if (['login-form', 'signup-form', 'forgot-form', 'recovery-form'].includes(form.id)) { submitAuth(form).catch(() => {}); return; }
    if (!state.data || !hasSession()) return;
    if (form.id === 'request-step-1') {
      const cents = parseCents($('#req-value').value);
      const totals = summary();
      if (cents === null || cents < 2000 || cents > currentUser().request_limit_cents || cents > totals.available) { feedback('#request-feedback', 'Confira o valor mínimo de R$ 20,00 e os limites disponíveis.'); return; }
      state.draft.value = $('#req-value').value;
      state.draft.category = $('#req-category').value;
      state.requestStep = 2;
      renderRequest();
    } else if (form.id === 'request-step-2') {
      const description = $('#req-description').value.trim();
      if (!description) { feedback('#request-feedback', 'Descreva sua necessidade.'); return; }
      state.draft.description = description;
      state.draft.durationHours = Number($('#req-time').value);
      state.requestStep = 3;
      renderRequest();
    } else if (form.id === 'request-final-form') publishRequest(form).catch(() => {});
    else if (form.id === 'contribute-form') confirmContribution(form).catch(() => {});
    else if (form.id === 'profile-form') withForm(form, '#profile-feedback', async () => {
      const name = $('#profile-name').value.trim();
      if (name.length < 2 || name.length > 120) throw { code: 'invalid_full_name' };
      const userId = state.session.user.id;
      const updated = await backend.saveName(userId, name);
      if (state.session?.user.id !== userId || !state.data) return;
      state.data.profile = updated;
      state.publicProfiles.set(updated.id, { id: updated.id, public_name: updated.public_name, level: updated.level });
      renderProfile();
      toast('Seu nome foi atualizado.');
    }).catch(() => {});
  });

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    const button = target?.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.authTab) { authMode(button.dataset.authTab); return; }
    if (button.id === 'boot-retry') { if (!backend?.client) location.reload(); else if (hasSession()) loadData({ initial: true }).catch(() => {}); else bootstrap(); return; }
    if (button.id === 'boot-logout' || button.id === 'logout-btn' || button.id === 'cancel-recovery') { logout(); return; }
    if (button.id === 'resend-confirmation') {
      button.disabled = true;
      backend.client.auth.resend({ type: 'signup', email: state.confirmEmail, options: { emailRedirectTo: config.siteUrl } }).then(({ error }) => {
        feedback('#auth-feedback', error ? errorMessage(error) : 'E-mail de confirmação reenviado. Confira sua caixa de entrada e o spam.', !error);
      }).catch(error => feedback('#auth-feedback', errorMessage(error))).finally(() => { button.disabled = false; });
      return;
    }
    if (!state.data || !hasSession()) return;
    if (button.dataset.view) { navigate(button.dataset.view); return; }
    if (button.dataset.details) { navigate('detail', button.dataset.details); return; }
    if (button.dataset.contribute) { openContribution(button.dataset.contribute); return; }
    if (button.hasAttribute('data-back') || button.id === 'close-contribution') { back(); return; }
    if (button.id === 'notify-btn') { navigate('notifications'); return; }
    if (button.id === 'resume-contribution' && state.contributionIntent) { openContribution(state.contributionIntent.requestId); return; }
    if (button.id === 'refresh-data') { loadData().catch(() => {}); return; }
    if (button.id === 'detail-refresh') { ensureRequest(state.detailId).then(() => renderDetail()).catch(error => toast(errorMessage(error))); return; }
    if (button.dataset.historyTab) {
      if (state.historyTab !== button.dataset.historyTab) {
        state.historyTab = button.dataset.historyTab;
        if (state.history.loading) state.historyReloadPending = true;
        else loadHistory(true);
      }
      return;
    }
    if (button.id === 'more-history') { loadHistory(); return; }
    if (button.id === 'more-feed') { loadMoreFeed(); return; }
    if (button.id === 'more-notifications') { loadMoreNotifications(); return; }
    if (button.dataset.requestStep) { state.requestStep = Number(button.dataset.requestStep); renderRequest(); return; }
    if (button.dataset.amount && !state.contributionIntent) {
      state.selectedCents = Number(button.dataset.amount);
      document.querySelectorAll('.amount-btn').forEach(item => item.classList.toggle('selected', item === button));
      $('#custom-amount').value = '';
      updateContributionSummary();
      return;
    }
    if (button.id === 'mark-read') {
      button.disabled = true;
      const userId = state.session.user.id;
      backend.markNotificationsRead(userId).then(() => {
        if (state.session?.user.id !== userId || !state.data) return;
        const readAt = new Date().toISOString();
        state.data.notifications.forEach(item => { item.read_at = item.read_at || readAt; });
        state.data.unreadCount = 0;
        render();
        toast('Notificações marcadas como lidas.');
      }).catch(error => { button.disabled = false; toast(errorMessage(error)); });
    }
  });

  document.addEventListener('input', event => {
    const input = event.target;
    if (input.id === 'custom-amount' && !state.contributionIntent) {
      state.selectedCents = parseCents(input.value) || 0;
      document.querySelectorAll('.amount-btn').forEach(button => button.classList.remove('selected'));
      updateContributionSummary();
    }
    if (input.id === 'req-value') state.draft.value = input.value;
    if (input.id === 'req-category') state.draft.category = input.value;
    if (input.id === 'req-description') { state.draft.description = input.value; $('#desc-count').textContent = input.value.length; }
    if (input.id === 'req-time') state.draft.durationHours = Number(input.value);
  });

  dialog.addEventListener('cancel', event => { event.preventDefault(); back(); });
  window.addEventListener('popstate', () => applyRoute(readRoute()));
  window.addEventListener('online', () => { updateSync(); if (hasSession() && state.view !== 'request' && state.view !== 'profile' && !state.modalRequestId) loadData().catch(() => {}); });
  window.addEventListener('offline', updateSync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && hasSession() && !state.recovery && state.view !== 'request' && state.view !== 'profile' && !state.modalRequestId && Date.now() - state.loadedAt > 30000) loadData().catch(() => {});
  });
  setInterval(() => {
    if (!document.hidden && navigator.onLine && hasSession() && !state.recovery && state.view !== 'request' && state.view !== 'profile' && !state.modalRequestId && Date.now() - state.loadedAt >= 60000) loadData().catch(() => {});
  }, 15000);

  // Keep the callback synchronous. Supabase operations run in the next task,
  // outside the Auth lock held while onAuthStateChange notifies listeners.
  if (backend?.client) backend.client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') state.recovery = true;
    if (event === 'SIGNED_OUT') { clearAccount(); return; }
    setTimeout(() => receiveSession(session, event).catch(() => {}), 0);
  });

  // Small navigation API retained for integrations; buttons use one delegated
  // click handler to avoid the duplicate Safari navigation of the prototype.
  window.Somma = Object.freeze({ go: view => navigate(view), openDetails: id => navigate('detail', String(id)), openContribution: id => openContribution(String(id)), openNotifications: () => navigate('notifications'), back });
  bootstrap();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
