const STORAGE_KEY='somma_mvp_v35_state';
const LEGACY_STORAGE_KEY='somma_mvp_v34_state';
const LEGACY_STORAGE_KEY_SOMMA_V34='apoio_mvp_v33_state';
const LEGACY_STORAGE_KEY_2='apoio_mvp_v32_state';
const LEGACY_STORAGE_KEY_OLD='apoio_mvp_v3_state';
const LEGACY_STORAGE_KEY_V2='apoio_mvp_v2_state';
const SESSION_KEY='somma_mvp_v35_session';
const LEGACY_SESSION_KEY='somma_mvp_v34_session';
const LEGACY_SESSION_KEY_SOMMA_V34='apoio_mvp_v33_session';
const LEGACY_SESSION_KEY_2='apoio_mvp_v32_session';
const LEGACY_SESSION_KEY_OLD='apoio_mvp_v3_session';
const LEGACY_SESSION_KEY_V2='apoio_mvp_v2_session';

const defaultState={
  view:'home',
  historyTab:'all',
  requestStep:1,
  requestDraft:{value:'',category:'',description:'',time:'48 horas'},
  users:[],
  user:null,
  requests:[
    {id:1,name:'Lucas M.',category:'Combustível',description:'Preciso completar o combustível para trabalhar amanhã.',goal:50,raised:37,helpers:14,verified:true,time:'8h restantes',createdBy:'demo-lucas',createdAt:'Hoje'},
    {id:2,name:'Ana C.',category:'Transporte',description:'Preciso de transporte para uma consulta amanhã cedo.',goal:40,raised:24,helpers:9,verified:true,time:'15h restantes',createdBy:'demo-ana',createdAt:'Hoje'},
    {id:3,name:'Rafael S.',category:'Alimentação',description:'Preciso completar uma compra básica para hoje.',goal:60,raised:49,helpers:22,verified:true,time:'23h restantes',createdBy:'demo-rafael',createdAt:'Hoje'}
  ],
  history:[],
  notifications:[
    {id:1,title:'Bem-vindo à comunidade',text:'Este é um protótipo. Nenhum pagamento real será processado.',time:'Agora',read:false},
    {id:2,title:'Regra importante',text:'Contribuições são voluntárias e não constituem empréstimo.',time:'Hoje',read:false}
  ],
  activeRequest:null,
  selectedAmount:0
};

let state=loadState();
const app=document.querySelector('#app');
const pageTitle=document.querySelector('#page-title');
const appShell=document.querySelector('#app-shell');
const authScreen=document.querySelector('#auth-screen');
const dlg=document.querySelector('#contribute-dialog');
const detailsDlg=document.querySelector('#details-dialog');
const notificationsDlg=document.querySelector('#notifications-dialog');
const toastEl=document.querySelector('#toast');
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const feeFor=v=>Math.round((0.20+Number(v)*0.05)*100)/100;

function cloneDefault(){return JSON.parse(JSON.stringify(defaultState));}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY_SOMMA_V34)||localStorage.getItem(LEGACY_STORAGE_KEY_2)||localStorage.getItem(LEGACY_STORAGE_KEY_OLD)||localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    const saved=raw?JSON.parse(raw):null;
    if(saved && saved.requests){
      if(saved.user && saved.user.email==='demo@apoio.local') saved.user.email='demo@somma.local';
      if(Array.isArray(saved.users)) saved.users.forEach(u=>{if(u.email==='demo@apoio.local') u.email='demo@somma.local';});
      return {...cloneDefault(),...saved,historyTab:'all',requestStep:1,requestDraft:{value:'',category:'',description:'',time:'48 horas'},activeRequest:null,selectedAmount:0};
    }
  }catch(e){}
  return cloneDefault();
}
function saveState(){
  const safe={...state,activeRequest:null,selectedAmount:0};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(safe));
}
function setSession(email){localStorage.setItem(SESSION_KEY,email||'');}
function getSession(){return localStorage.getItem(SESSION_KEY)||localStorage.getItem(LEGACY_SESSION_KEY)||localStorage.getItem(LEGACY_SESSION_KEY_SOMMA_V34)||localStorage.getItem(LEGACY_SESSION_KEY_2)||localStorage.getItem(LEGACY_SESSION_KEY_OLD)||localStorage.getItem(LEGACY_SESSION_KEY_V2)||'';}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(message){
  if(!toastEl)return;
  toastEl.textContent=message;toastEl.classList.remove('hidden');
  clearTimeout(toastEl._t);toastEl._t=setTimeout(()=>toastEl.classList.add('hidden'),2800);
}

function init(){
  const session=getSession();
  if(session){
    const found=state.users.find(u=>u.email===session);
    if(found)state.user=found;
    if(session==='demo@somma.local'&&!found)state.user=makeDemoUser();
  }
  if(state.user)showApp();else showAuth();
  updateBadge();
}

function makeDemoUser(){
  let demo=state.users.find(u=>u.email==='demo@somma.local');
  if(!demo){
    demo={id:'demo-user',name:'Paula',email:'demo@somma.local',password:'demo',verified:true,helped:18,received:2,contributed:74,receivedMonth:50,limitPerRequest:100,monthlyLimit:300,nextRequestDays:3,joined:'Outubro de 2026'};
    state.users.push(demo);saveState();
  }
  return demo;
}
function currentUser(){
  if(!state.user)return null;
  const stored=state.users.find(u=>u.id===state.user.id);
  if(stored)state.user=stored;
  return state.user;
}
function syncUser(){
  const i=state.users.findIndex(u=>u.id===state.user.id);
  if(i>=0)state.users[i]=state.user;else state.users.push(state.user);
  saveState();
}
function firstName(name){return String(name||'').trim().split(/\s+/)[0]||'Usuário';}
function userInitial(){return firstName(currentUser()?.name).charAt(0).toUpperCase();}
function showAuth(){authScreen.classList.remove('hidden');appShell.classList.add('hidden');}
function showApp(){authScreen.classList.add('hidden');appShell.classList.remove('hidden');render();}
function logout(){state.user=null;setSession('');localStorage.removeItem(LEGACY_SESSION_KEY);state.view='home';showAuth();}
function notify(title,text){state.notifications.unshift({id:Date.now(),title,text,time:'Agora',read:false});saveState();updateBadge();}

function requestCard(r){
  const pct=Math.min(100,(r.raised/r.goal)*100);
  const remaining=Math.max(0,r.goal-r.raised);
  const own=r.createdBy===currentUser()?.id;
  return `<article class="card">
    <div class="row between">
      <div class="row"><div class="avatar">${escapeHtml((r.name||'U')[0])}</div><div><strong>${escapeHtml(r.name)}</strong><div class="tiny muted">${r.verified?'✓ Verificado · ':''}${escapeHtml(r.time)}</div></div></div>
      <div class="row mini-gap">${own?'<span class="pill own-pill">Seu pedido</span>':''}<span class="pill">${escapeHtml(r.category)}</span></div>
    </div>
    <p>${escapeHtml(r.description)}</p>
    <div class="progress" aria-label="${Math.round(pct)}% da meta"><div style="width:${pct}%"></div></div>
    <div class="money-row"><strong>${brl(r.raised)} arrecadados</strong><span class="muted">Meta ${brl(r.goal)}</span></div>
    <div class="tiny muted top-mini">${r.helpers} pessoas ajudaram · faltam ${brl(remaining)}</div>
    <div class="actions"><button type="button" class="btn btn-primary contribute" data-id="${r.id}" onclick="window.Somma.openContribution(${r.id})" ${remaining<=0||own?'disabled':''}>${own?'Seu pedido':remaining<=0?'Meta atingida':'Ajudar agora'}</button><button type="button" class="btn btn-secondary details" data-id="${r.id}" onclick="window.Somma.openDetails(${r.id})">Ver pedido</button></div>
  </article>`;
}

function renderHome(){
  const user=currentUser();pageTitle.textContent='Início';
  const active=state.requests.filter(r=>r.goal>r.raised);
  const primary=active[0]||state.requests[0];
  const almost=active.slice().sort((a,b)=>(a.goal-a.raised)-(b.goal-b.raised)).find(r=>r.id!==primary?.id)||active[0];
  app.innerHTML=`<div class="content">
    <section class="hero"><p class="eyebrow hero-eyebrow">Olá, ${escapeHtml(firstName(user.name))}</p><h2>Uma pequena ajuda pode resolver o dia de alguém.</h2><p>Contribuições voluntárias para necessidades pontuais.</p></section>
    <div class="stats"><div class="stat"><strong>247</strong><span>ajudas hoje</span></div><div class="stat"><strong>81%</strong><span>metas concluídas</span></div><div class="stat"><strong>${brl(1)}</strong><span>para começar</span></div></div>
    <div class="legal-banner"><strong>Importante:</strong> toda contribuição é voluntária e não constitui empréstimo, crédito ou investimento.</div>
    <div class="section-head"><h2>Alguém precisa da sua ajuda</h2><button type="button" class="link-btn" data-go="help" onclick="window.Somma.go('help')">Ver todos</button></div>
    ${primary?requestCard(primary):''}
    ${almost?`<div class="section-head"><h2>Quase lá</h2></div>${requestCard(almost)}`:''}
  </div>`;
}

function renderHelp(){
  pageTitle.textContent='Ajudar';
  const requests=state.requests.filter(r=>r.goal>r.raised);
  app.innerHTML=`<div class="content"><div class="section-head"><div><h2>Pedidos ativos</h2><p class="muted tiny">Escolha livremente quem você quer apoiar.</p></div></div><div class="legal-banner compact"><strong>Sem obrigação de retorno.</strong> Ajudar hoje não cria direito automático de receber amanhã.</div>${requests.length?requests.map(requestCard).join(''):'<section class="empty-state"><div class="empty-icon">♡</div><h2>Nenhum pedido ativo</h2><p>Novos pedidos aparecerão aqui.</p></section>'}</div>`;
}

function canCreateRequest(u){return Number(u.nextRequestDays||0)<=0;}
function renderRequest(){
  const u=currentUser();pageTitle.textContent='Pedir apoio';
  if(!canCreateRequest(u)){
    app.innerHTML=`<div class="content"><section class="empty-state"><div class="empty-icon">⏳</div><h2>Seu próximo pedido ainda não está disponível</h2><p>Para este protótipo, existe um intervalo mínimo entre pedidos.</p><div class="limit-card"><span>Disponível em</span><strong>${u.nextRequestDays} dias</strong></div>${u.email==='demo@somma.local'?'<button class="btn btn-primary full" id="demo-unlock-request">Liberar pedido para testar</button><button class="btn btn-secondary full top-gap" data-go="profile">Ver meus limites</button>':'<button class="btn btn-secondary full" data-go="profile">Ver meus limites</button>'}</section></div>`;return;
  }
  const d=state.requestDraft||{value:'',category:'',description:'',time:'48 horas'};
  const step=state.requestStep||1;
  const stepLabel=`Etapa ${step} de 3`;
  if(step===1){
    app.innerHTML=`<div class="content"><div class="stepper"><span class="active"></span><span></span><span></span></div><p class="eyebrow">${stepLabel}</p><h2 class="flow-title">Defina sua necessidade</h2><div class="notice">Limites do MVP: mínimo de R$ 20, máximo de ${brl(u.limitPerRequest)} e limite mensal de ${brl(u.monthlyLimit)}.</div><form class="form-card" id="request-step-1"><label class="field">Quanto você precisa?<input id="req-value" type="number" min="20" max="${u.limitPerRequest}" step="1" inputmode="decimal" value="${escapeHtml(d.value)}" placeholder="Ex.: 50" required></label><label class="field">Categoria<select id="req-category" required><option value="">Selecione</option>${['Combustível','Alimentação','Transporte','Medicamentos','Conta essencial','Emergência','Outro'].map(c=>`<option ${d.category===c?'selected':''}>${c}</option>`).join('')}</select></label><button class="btn btn-primary full">Continuar</button></form></div>`;
  }else if(step===2){
    app.innerHTML=`<div class="content"><div class="stepper"><span class="active"></span><span class="active"></span><span></span></div><p class="eyebrow">${stepLabel}</p><h2 class="flow-title">Conte o essencial</h2><form class="form-card" id="request-step-2"><label class="field">Descreva sua necessidade<textarea id="req-description" maxlength="180" placeholder="Explique sua necessidade de forma objetiva." required>${escapeHtml(d.description)}</textarea><span class="tiny muted"><span id="desc-count">${String(d.description||'').length}</span>/180 · Evite dados pessoais, endereço ou documentos.</span></label><label class="field">Prazo<select id="req-time"><option ${d.time==='24 horas'?'selected':''}>24 horas</option><option ${d.time==='48 horas'?'selected':''}>48 horas</option></select></label><div class="two-actions"><button type="button" class="btn btn-secondary" id="request-back-1">Voltar</button><button class="btn btn-primary">Continuar</button></div></form></div>`;
  }else{
    app.innerHTML=`<div class="content"><div class="stepper"><span class="active"></span><span class="active"></span><span class="active"></span></div><p class="eyebrow">${stepLabel}</p><h2 class="flow-title">Revise antes de publicar</h2><section class="card review-card"><div class="review-row"><span>Valor</span><strong>${brl(d.value)}</strong></div><div class="review-row"><span>Categoria</span><strong>${escapeHtml(d.category)}</strong></div><div class="review-row"><span>Prazo</span><strong>${escapeHtml(d.time)}</strong></div><div class="review-description"><span>Descrição</span><p>${escapeHtml(d.description)}</p></div></section><div class="legal-banner"><strong>Atenção:</strong> o pedido é uma solicitação de apoio voluntário. Não há garantia de atingir a meta.</div><form id="request-final-form"><label class="check-row"><input id="req-confirm" type="checkbox" required><span>Confirmo que as informações são verdadeiras e entendo que a plataforma poderá suspender pedidos suspeitos.</span></label><div class="two-actions"><button type="button" class="btn btn-secondary" id="request-back-2">Voltar</button><button class="btn btn-primary">Publicar pedido</button></div></form></div>`;
  }
}

function renderHistory(){
  const u=currentUser();pageTitle.textContent='Histórico';
  const all=state.history.filter(h=>!h.userId||h.userId===u.id);
  const filter=state.historyTab||'all';
  const items=all.filter(h=>filter==='all'||(filter==='helped'&&h.type==='Ajudou')||(filter==='received'&&h.type==='Recebeu apoio'));
  app.innerHTML=`<div class="content"><div class="stats"><div class="stat"><strong>${u.helped}</strong><span>pessoas ajudadas</span></div><div class="stat"><strong>${brl(u.contributed)}</strong><span>contribuído</span></div><div class="stat"><strong>${u.received}</strong><span>apoios recebidos</span></div></div><div class="segmented"><button class="${filter==='all'?'active':''}" data-history-tab="all">Todos</button><button class="${filter==='helped'?'active':''}" data-history-tab="helped">Ajudei</button><button class="${filter==='received'?'active':''}" data-history-tab="received">Recebi</button></div><div class="section-head history-head"><div><h2>Movimentações</h2><p class="tiny muted">Seu histórico de participação na Somma.</p></div></div>${items.length?`<div class="history-list">${items.map(h=>{const helped=h.type==='Ajudou';const amount=Number(h.value||0);return `<div class="history-item ${helped?'history-helped':'history-received'}"><div class="history-icon">${helped?'♡':'↓'}</div><div class="history-main"><div class="history-title-row"><strong>${helped?'Você ajudou':'Você recebeu apoio'}</strong><span class="history-badge">${helped?'Ajudei':'Recebi'}</span></div><div class="tiny muted">${escapeHtml(h.person)} · ${escapeHtml(h.date)}</div></div><strong class="history-value">${amount>0?brl(amount):'—'}</strong></div>`}).join('')}</div>`:`<section class="empty-state small"><div class="empty-icon">◷</div><h2>Nenhuma movimentação</h2><p>Não há registros para este filtro.</p></section>`}</div>`;
}

function renderProfile(){
  const u=currentUser();pageTitle.textContent='Perfil';
  const available=Math.max(0,u.monthlyLimit-(u.receivedMonth||0));
  const pct=Math.min(100,((u.receivedMonth||0)/u.monthlyLimit)*100);
  app.innerHTML=`<div class="content">
    <section class="card profile-hero"><div class="profile-avatar">${userInitial()}</div><h2>${escapeHtml(u.name)}</h2><p class="success">${u.verified?'✓ Identidade verificada':'○ Verificação pendente'}</p><p class="muted">Membro desde ${escapeHtml(u.joined||'2026')}</p></section>
    <div class="stats"><div class="stat"><strong>${u.helped}</strong><span>ajudou</span></div><div class="stat"><strong>${u.received}</strong><span>recebeu</span></div><div class="stat"><strong>${brl(u.contributed)}</strong><span>contribuiu</span></div></div>
    <section class="card"><div class="section-head no-margin"><h2>Seus limites</h2></div><div class="limit-row"><span>Por pedido</span><strong>${brl(u.limitPerRequest)}</strong></div><div class="limit-row"><span>Recebido neste período</span><strong>${brl(u.receivedMonth||0)} / ${brl(u.monthlyLimit)}</strong></div><div class="progress"><div style="width:${pct}%"></div></div><div class="tiny muted">Ainda disponível no período: ${brl(available)}</div><div class="limit-row divider"><span>Próximo pedido</span><strong>${u.nextRequestDays>0?`Em ${u.nextRequestDays} dias`:'Disponível agora'}</strong></div></section>
    <section class="card"><div class="section-head no-margin"><h2>Dados do perfil</h2></div><form id="profile-form"><label class="field">Nome<input id="profile-name" maxlength="40" value="${escapeHtml(u.name)}" required></label><label class="field">E-mail<input value="${escapeHtml(u.email)}" disabled></label><button class="btn btn-secondary full">Salvar nome</button></form></section>
    <div class="list"><button class="list-button" id="profile-notifications" onclick="window.Somma.openNotifications()"><span>Notificações</span><strong>›</strong></button><button class="list-button" id="logout-btn"><span>Sair do protótipo</span><strong>›</strong></button><button class="list-button danger" id="reset-btn"><span>Apagar dados locais do MVP</span><strong>›</strong></button></div>
  </div>`;
}

function renderDetailPage(){
  const r=state.requests.find(x=>x.id===Number(state.detailRequestId));
  if(!r){state.view='home';renderHome();return;}
  pageTitle.textContent='Pedido';
  const remaining=Math.max(0,r.goal-r.raised),pct=Math.min(100,(r.raised/r.goal)*100),own=r.createdBy===currentUser()?.id;
  app.innerHTML=`<div class="content">
    <button type="button" class="back-link" onclick="window.Somma.back()">‹ Voltar</button>
    <section class="card detail-page">
      <div class="row between"><div class="row"><div class="avatar large">${escapeHtml((r.name||'U')[0])}</div><div><h2>${escapeHtml(r.name)}</h2><div class="tiny muted">${r.verified?'✓ Identidade verificada · ':''}${escapeHtml(r.time)}</div></div></div><span class="pill">${escapeHtml(r.category)}</span></div>
      <p class="detail-description">${escapeHtml(r.description)}</p>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="money-row"><strong>${brl(r.raised)} arrecadados</strong><span class="muted">Meta ${brl(r.goal)}</span></div>
      <div class="detail-grid"><div><span>Pessoas que ajudaram</span><strong>${r.helpers}</strong></div><div><span>Falta</span><strong>${brl(remaining)}</strong></div><div><span>Criado</span><strong>${escapeHtml(r.createdAt||'Hoje')}</strong></div><div><span>Status</span><strong>${remaining<=0?'Concluído':'Ativo'}</strong></div></div>
      <div class="legal-banner compact"><strong>Contribuição voluntária:</strong> não há obrigação de restituição, juros ou retorno financeiro.</div>
      <button type="button" class="btn btn-primary full" onclick="window.Somma.openContribution(${r.id})" ${remaining<=0||own?'disabled':''}>${own?'Este é o seu pedido':remaining<=0?'Meta atingida':'Ajudar este pedido'}</button>
    </section>
  </div>`;
}

function renderNotificationsPage(){
  pageTitle.textContent='Notificações';
  app.innerHTML=`<div class="content">
    <button type="button" class="back-link" onclick="window.Somma.back()">‹ Voltar</button>
    <div class="section-head"><div><h2>Central de notificações</h2><p class="muted tiny">Avisos sobre pedidos, contribuições e sua conta.</p></div></div>
    <div class="notification-list" id="notifications-page-list">${state.notifications.length?state.notifications.map(n=>`<div class="notification-item ${n.read?'':'unread'}"><span class="notification-dot" aria-hidden="true"></span><div class="notification-copy"><div class="notification-title-row"><strong>${escapeHtml(n.title)}</strong>${n.read?'':'<span class="new-label">Nova</span>'}</div><p>${escapeHtml(n.text)}</p><span class="tiny muted">${escapeHtml(n.time)}</span></div></div>`).join(''):'<section class="empty-state small"><div class="empty-icon bell-icon">◌</div><h2>Nenhuma notificação</h2><p>Novidades aparecerão aqui.</p></section>'}</div>
    <button type="button" id="mark-read-page" class="btn btn-secondary full top-gap">Marcar todas como lidas</button>
  </div>`;
}

function render(){
  if(!state.user)return;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  const views={home:renderHome,help:renderHelp,request:renderRequest,history:renderHistory,profile:renderProfile,detail:renderDetailPage,notifications:renderNotificationsPage};
  (views[state.view]||renderHome)();updateBadge();
}

function openContribution(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  if(r.createdBy===currentUser()?.id){toast('Você não pode contribuir para o próprio pedido.');return;}
  state.activeRequest=r;state.selectedAmount=0;
  document.querySelector('#dialog-person').textContent=`Ajudar ${r.name}`;
  const remaining=Math.max(0,r.goal-r.raised);
  const opts=[1,2,5,10].filter(v=>v<=remaining);
  document.querySelector('#amount-options').innerHTML=opts.length?opts.map(v=>`<button type="button" class="amount-btn" data-amount="${v}">${brl(v)}</button>`).join(''):'<p class="muted tiny">A meta já foi atingida.</p>';
  const custom=document.querySelector('#custom-amount');custom.max=remaining;custom.value='';custom.disabled=remaining<=0;
  updateContributionSummary();dlg.showModal();
}
function updateContributionSummary(){
  const v=Number(state.selectedAmount)||0,fee=v?feeFor(v):0;
  document.querySelector('#summary-contribution').textContent=brl(v);
  document.querySelector('#summary-fee').textContent=brl(fee);
  document.querySelector('#summary-total').textContent=brl(v+fee);
  document.querySelector('#confirm-contribution').disabled=v<=0;
}
function safeShowDialog(el){
  if(!el)return false;
  try{
    if(typeof el.showModal==='function'){
      if(!el.open)el.showModal();
    }else{
      el.setAttribute('open','');
      el.classList.add('dialog-fallback-open');
    }
    return true;
  }catch(err){
    console.error(err);
    try{el.setAttribute('open','');el.classList.add('dialog-fallback-open');return true;}catch(e){return false;}
  }
}
function safeCloseDialog(el){
  if(!el)return;
  try{if(typeof el.close==='function'&&el.open)el.close();else el.removeAttribute('open');}catch(e){el.removeAttribute('open');}
  el.classList.remove('dialog-fallback-open');
}
function openDetails(id){
  const r=state.requests.find(x=>x.id===Number(id));if(!r){toast('Pedido não encontrado.');return;}
  state.returnView=(state.view==='detail'||state.view==='notifications')?'home':state.view;
  state.detailRequestId=Number(id);state.view='detail';saveState();render();window.scrollTo({top:0,behavior:'auto'});
}
function openNotifications(){
  state.returnView=(state.view==='detail'||state.view==='notifications')?'home':state.view;
  state.view='notifications';saveState();render();window.scrollTo({top:0,behavior:'auto'});
}
function updateBadge(){
  const unread=state.notifications.filter(n=>!n.read).length,b=document.querySelector('#notify-badge');
  if(!b)return;b.textContent=unread;b.classList.toggle('hidden',unread===0);
}
function resetRequestFlow(){state.requestStep=1;state.requestDraft={value:'',category:'',description:'',time:'48 horas'};}

// API direta para cliques em iPhone/Safari.
window.Somma={
  go(view){
    state.view=view;
    if(view!=='request')resetRequestFlow();
    saveState();
    render();
    window.scrollTo({top:0,behavior:'auto'});
  },
  openDetails(id){openDetails(Number(id));},
  openNotifications(){openNotifications();},
  openContribution(id){openContribution(Number(id));},
  back(){state.view=state.returnView||'home';saveState();render();window.scrollTo({top:0,behavior:'auto'});},
  closeDialog(id){safeCloseDialog(document.getElementById(id));}
};

// Authentication tabs and general clicks
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-auth-tab]');
  if(tab){document.querySelectorAll('.auth-tab').forEach(x=>x.classList.toggle('active',x===tab));document.querySelector('#login-form').classList.toggle('hidden',tab.dataset.authTab!=='login');document.querySelector('#signup-form').classList.toggle('hidden',tab.dataset.authTab!=='signup');return;}
  const nav=e.target.closest('[data-view]');if(nav){state.view=nav.dataset.view;if(state.view!=='request')resetRequestFlow();saveState();render();return;}
  const go=e.target.closest('[data-go]');if(go){state.view=go.dataset.go;saveState();render();return;}
  const hist=e.target.closest('[data-history-tab]');if(hist){state.historyTab=hist.dataset.historyTab;renderHistory();return;}
  const c=e.target.closest('.contribute');if(c){if(detailsDlg?.open)safeCloseDialog(detailsDlg);openContribution(Number(c.dataset.id));return;}
  const d=e.target.closest('.details');if(d){openDetails(Number(d.dataset.id));return;}
  const a=e.target.closest('.amount-btn');if(a){state.selectedAmount=Number(a.dataset.amount);document.querySelectorAll('.amount-btn').forEach(b=>b.classList.toggle('selected',b===a));document.querySelector('#custom-amount').value='';updateContributionSummary();return;}
  const close=e.target.closest('.close-dialog');if(close){safeCloseDialog(document.querySelector('#'+close.dataset.dialog));return;}
  if(e.target.closest('#notify-btn')||e.target.closest('#profile-notifications')){openNotifications();return;}
  if(e.target.closest('#mark-read')||e.target.closest('#mark-read-page')){state.notifications.forEach(n=>n.read=true);saveState();updateBadge();if(state.view==='notifications')renderNotificationsPage();return;}
  if(e.target.closest('#logout-btn')){logout();return;}
  if(e.target.closest('#reset-btn')){if(confirm('Apagar todos os dados locais deste protótipo neste aparelho?')){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY_SOMMA_V34);localStorage.removeItem(LEGACY_STORAGE_KEY_OLD);localStorage.removeItem(LEGACY_STORAGE_KEY_V2);localStorage.removeItem(SESSION_KEY);localStorage.removeItem(LEGACY_SESSION_KEY);localStorage.removeItem(LEGACY_SESSION_KEY_SOMMA_V34);localStorage.removeItem(LEGACY_SESSION_KEY_OLD);localStorage.removeItem(LEGACY_SESSION_KEY_V2);state=cloneDefault();showAuth();}return;}
  if(e.target.closest('#demo-access')){state.user=makeDemoUser();setSession(state.user.email);state.history=state.history.length?state.history:[{type:'Ajudou',person:'Camila R.',value:5,date:'Hoje',userId:state.user.id},{type:'Recebeu apoio',person:'Comunidade',value:50,date:'12/10/2026',userId:state.user.id},{type:'Ajudou',person:'João P.',value:2,date:'10/10/2026',userId:state.user.id}];saveState();showApp();return;}
  if(e.target.closest('#request-back-1')){state.requestStep=1;renderRequest();return;}
  if(e.target.closest('#request-back-2')){state.requestStep=2;renderRequest();return;}
  if(e.target.closest('#demo-unlock-request')){const u=currentUser();u.nextRequestDays=0;syncUser();toast('Pedido liberado para teste.');renderRequest();return;}
});

document.addEventListener('input',e=>{
  if(e.target.id==='custom-amount'){
    const max=Number(e.target.max)||999;state.selectedAmount=Math.max(0,Math.min(max,Number(e.target.value)||0));
    document.querySelectorAll('.amount-btn').forEach(b=>b.classList.remove('selected'));updateContributionSummary();
  }
  if(e.target.id==='req-description'){
    const counter=document.querySelector('#desc-count');if(counter)counter.textContent=e.target.value.length;
  }
});

document.addEventListener('submit',e=>{
  if(e.target.id==='signup-form'){
    e.preventDefault();
    const name=document.querySelector('#signup-name').value.trim(),email=document.querySelector('#signup-email').value.trim().toLowerCase(),password=document.querySelector('#signup-password').value;
    if(state.users.some(u=>u.email===email)){toast('Já existe um cadastro local com este e-mail.');return;}
    const u={id:'u-'+Date.now(),name,email,password,verified:false,helped:0,received:0,contributed:0,receivedMonth:0,limitPerRequest:50,monthlyLimit:300,nextRequestDays:0,joined:'Outubro de 2026'};
    state.users.push(u);state.user=u;state.history=[];notify('Cadastro criado','Seu perfil foi criado neste aparelho. A verificação de identidade ainda é simulada no MVP.');syncUser();setSession(email);showApp();toast('Cadastro criado com sucesso.');return;
  }
  if(e.target.id==='login-form'){
    e.preventDefault();const email=document.querySelector('#login-email').value.trim().toLowerCase(),password=document.querySelector('#login-password').value;
    const u=state.users.find(x=>x.email===email&&x.password===password);
    if(!u){toast('E-mail ou senha não encontrados neste aparelho.');return;}
    state.user=u;setSession(email);showApp();toast(`Bem-vindo, ${firstName(u.name)}.`);return;
  }
  if(e.target.id==='request-step-1'){
    e.preventDefault();const u=currentUser();const val=Number(document.querySelector('#req-value').value),category=document.querySelector('#req-category').value;
    if(val<20||val>u.limitPerRequest){toast(`O valor deve ficar entre R$ 20 e ${brl(u.limitPerRequest)}.`);return;}
    if((u.receivedMonth||0)+val>u.monthlyLimit){toast('Este pedido ultrapassaria seu limite mensal disponível.');return;}
    state.requestDraft.value=val;state.requestDraft.category=category;state.requestStep=2;renderRequest();return;
  }
  if(e.target.id==='request-step-2'){
    e.preventDefault();state.requestDraft.description=document.querySelector('#req-description').value.trim();state.requestDraft.time=document.querySelector('#req-time').value;state.requestStep=3;renderRequest();return;
  }
  if(e.target.id==='request-final-form'){
    e.preventDefault();const u=currentUser(),d=state.requestDraft,val=Number(d.value);
    state.requests.unshift({id:Date.now(),name:u.name,category:d.category,description:d.description,goal:val,raised:0,helpers:0,verified:u.verified,time:d.time==='24 horas'?'24h restantes':'48h restantes',createdBy:u.id,createdAt:'Agora'});
    u.nextRequestDays=7;u.received=(u.received||0)+1;syncUser();state.history.unshift({type:'Recebeu apoio',person:'Pedido publicado',value:0,date:'Agora',userId:u.id});notify('Pedido publicado',`Seu pedido de ${brl(val)} foi publicado no protótipo.`);resetRequestFlow();state.view='home';saveState();render();toast('Pedido publicado no protótipo.');return;
  }
  if(e.target.id==='profile-form'){
    e.preventDefault();const u=currentUser();const name=document.querySelector('#profile-name').value.trim();if(!name)return;u.name=name;syncUser();renderProfile();toast('Nome atualizado neste aparelho.');return;
  }
  if(e.target.id==='contribute-form'&&e.submitter?.id==='confirm-contribution'){
    e.preventDefault();const r=state.activeRequest,u=currentUser(),v=Math.min(Number(state.selectedAmount),r.goal-r.raised);if(v<=0)return;
    r.raised=Math.round((r.raised+v)*100)/100;r.helpers+=1;u.helped+=1;u.contributed=Math.round((u.contributed+v)*100)/100;
    state.history.unshift({type:'Ajudou',person:r.name,value:v,date:'Agora',userId:u.id});syncUser();notify('Contribuição registrada',`Você simulou uma contribuição de ${brl(v)} para ${r.name}.`);dlg.close();saveState();render();toast(`Contribuição simulada de ${brl(v)} registrada.`);return;
  }
});

init();
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
