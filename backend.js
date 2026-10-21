'use strict';

// All reads and writes use the signed-in user's JWT. No administrative key.
(function () {
  const config = window.SOMMA_CONFIG;
  if (!config || !window.supabase?.createClient) {
    window.SommaBackend = { initializationError: 'Não foi possível carregar o acesso à Somma. Atualize a página.' };
    return;
  }

  async function timedFetch(input, init = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    else init.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 25000);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener('abort', abort);
    }
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
      storageKey: 'somma_backend_v1_auth'
    },
    global: { fetch: timedFetch }
  });

  const COLUMNS = Object.freeze({
    profiles: 'id,full_name,public_name,level,request_limit_cents,period_limit_cents,account_status,created_at,updated_at',
    public_profiles: 'id,public_name,level,created_at',
    requests: 'id,user_id,category,description,goal_cents,raised_cents,status,starts_at,expires_at,created_at,helper_count,duration_hours',
    contributions: 'id,request_id,contributor_user_id,amount_cents,platform_fee_cents,status,created_at,idempotency_key',
    notifications: 'id,user_id,type,title,body,read_at,created_at',
    user_levels: 'code,display_name,request_limit_cents,period_limit_cents,sort_order,rules'
  });

  async function unwrap(query) {
    const result = await query;
    if (result.error) throw result.error;
    return result.data;
  }

  const PAGE_SIZE = 24;

  async function feedPage(offset = 0) {
    const now = new Date().toISOString();
    const rows = await unwrap(client.from('requests').select(COLUMNS.requests)
      .eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1));
    return { rows, hasMore: rows.length === PAGE_SIZE, nextOffset: offset + rows.length };
  }

  async function notificationPage(offset = 0) {
    const result = await client.from('notifications').select(COLUMNS.notifications, { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    return { rows: result.data || [], total: result.count || 0, hasMore: offset + (result.data || []).length < (result.count || 0), nextOffset: offset + (result.data || []).length };
  }

  async function historyPage(kind = 'all', cursor = null) {
    return unwrap(client.rpc('somma_history_page', {
      p_kind: kind, p_before_at: cursor?.at || null, p_before_id: cursor?.id || null, p_limit: PAGE_SIZE
    }));
  }

  async function publicProfiles(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    const chunks = [];
    for (let i = 0; i < unique.length; i += 150) chunks.push(unique.slice(i, i + 150));
    const pages = await Promise.all(chunks.map(chunk => unwrap(client.from('public_profiles').select(COLUMNS.public_profiles).in('id', chunk))));
    return pages.flat();
  }

  async function snapshot(userId) {
    const [profile, levels, requestsPage, feedSummary, metrics, activeOwn, notificationsPage, unreadResult] = await Promise.all([
      unwrap(client.from('profiles').select(COLUMNS.profiles).eq('id', userId).single()),
      unwrap(client.from('user_levels').select(COLUMNS.user_levels).order('sort_order')),
      feedPage(0),
      unwrap(client.rpc('somma_feed_summary')),
      unwrap(client.rpc('somma_user_summary')),
      unwrap(client.from('requests').select(COLUMNS.requests).eq('user_id', userId).eq('status', 'active')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()),
      notificationPage(0),
      client.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
    ]);
    if (unreadResult.error) throw unreadResult.error;
    const requests = requestsPage.rows;
    const profiles = await publicProfiles([...requests.map(request => request.user_id), feedSummary?.closest?.user_id, activeOwn?.user_id]);
    return {
      profile, levels, requests, activeOwn, feedSummary: feedSummary || { active_count: 0, closest: null },
      metrics: metrics || {}, feedHasMore: requestsPage.hasMore, feedOffset: requestsPage.nextOffset,
      notifications: notificationsPage.rows, notificationsTotal: notificationsPage.total,
      notificationsHasMore: notificationsPage.hasMore, notificationsOffset: notificationsPage.nextOffset,
      unreadCount: unreadResult.count || 0, history: null, publicProfiles: profiles
    };
  }

  async function findContribution(intent) {
    const contribution = await unwrap(client.from('contributions').select(COLUMNS.contributions)
      .eq('contributor_user_id', intent.userId).eq('idempotency_key', intent.key).maybeSingle());
    if (!contribution) return null;
    if (contribution.request_id !== intent.requestId || contribution.amount_cents !== intent.amountCents) {
      throw { code: 'intent_conflict', message: 'intent_conflict' };
    }
    return contribution;
  }

  async function contribute(intent) {
    try {
      return await unwrap(client.from('contributions').insert({
        request_id: intent.requestId,
        contributor_user_id: intent.userId,
        amount_cents: intent.amountCents,
        idempotency_key: intent.key
      }).select(COLUMNS.contributions).single());
    } catch (error) {
      // A response can be lost after the transaction commits. Read the exact
      // original intention before reporting failure; never generate a new key.
      let checked = false;
      try {
        const existing = await findContribution(intent);
        if (existing) return existing;
        checked = true;
      } catch (lookupError) {
        if (lookupError.code === 'intent_conflict') throw lookupError;
      }
      if (checked && /^(P0001|23514|23503|42501)$/.test(error.code || '')) {
        throw Object.assign(new Error(error.message), error, { outcomeKnown: true });
      }
      throw error;
    }
  }

  window.SommaBackend = Object.freeze({
    client,
    snapshot,
    feedPage,
    notificationPage,
    historyPage,
    publicProfiles,
    getRequest: id => unwrap(client.from('requests').select(COLUMNS.requests).eq('id', id).maybeSingle()),
    findContribution,
    contribute,
    createRequest: values => unwrap(client.from('requests').insert({
      user_id: values.userId,
      category: values.category,
      description: values.description,
      goal_cents: values.goalCents,
      duration_hours: values.durationHours
    }).select(COLUMNS.requests).single()),
    saveName: (userId, name) => unwrap(client.from('profiles').update({ full_name: name })
      .eq('id', userId).select(COLUMNS.profiles).single()),
    markNotificationsRead: userId => unwrap(client.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', userId).is('read_at', null))
  });
})();
