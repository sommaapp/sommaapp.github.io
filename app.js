const STORAGE_KEY='apoio_mvp_v2_state';
const SESSION_KEY='apoio_mvp_v2_session';
const defaultState={
  view:'home',
  users:[],
  user:null,
  requests:[
    {id:1,name:'Lucas M.',category:'Combustível',description:'Preciso completar o combustível para trabalhar amanhã.',goal:50,raised:37,helpers:14,verified:true,time:'8h restantes',createdBy:'demo-lucas'},
    {id:2,name:'Ana C.',category:'Transporte',description:'Preciso de transporte para uma consulta amanhã cedo.',goal:40,raised:24,helpers:9,verified:true,time:'15h restantes',createdBy:'demo-ana'},
    {id:3,name:'Rafael S.',category:'Alimentação',description:'Preciso completar uma compra básica para hoje.',goal:60,raised:49,helpers:22,verified:true,time:'23h restantes',createdBy:'demo-rafael'}
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
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const feeFor=v=>Math.round((0.20+Number(v)*0.05)*100)/100;

function cloneDefault(){return JSON.parse(JSON.stringify(defaultState));}
function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved && saved.requests) return {...cloneDefault(),...saved,activeRequest:null,selectedAmount:0};
  }catch(e){}
  return cloneDefault();
}
function saveState(){
  const safe={...state,activeRequest:null,selectedAmount:0};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(safe));
}
function setSession(email){localStorage.setItem(SESSION_KEY,email||'');}
function getSession(){return localStorage.getItem(SESSION_KEY)||'';}

function init(){
  const session=getSession();
  if(session){
    const found=state.users.find(u=>u.email===session);
    if(found) state.user=found;
    if(session==='demo@apoio.local' && !found) state.user=makeDemoUser();
  }
  if(state.user) showApp(); else showAuth();
  updateBadge();
}

function makeDemoUser(){
  let demo=state.users.find(u=>u.email==='demo@apoio.local');
  if(!demo){
    demo={id:'demo-user',name:'Paula',email:'demo@apoio.local',password:'demo',verified:true,helped:18,received:2,contributed:74,receivedMonth:50,limitPerRequest:100,monthlyLimit:300,nextRequestDays:3,joined:'Outubro de 2026'};
    state.users.push(demo);saveState();
  }
  return demo;
}
function currentUser(){
  if(!state.user) return null;
  const stored=state.users.find(u=>u.id===state.user.id);
  if(stored) state.user=stored;
  return state.user;
}
function userInitial(){return (currentUser()?.name||'U').trim().charAt(0).toUpperCase();}

function showAuth(){authScreen.classList.remove('hidden');appShell.classList.add('hidden');}
function showApp(){authScreen.classList.add('hidden');appShell.classList.remove('hidden');render();}
function logout(){state.user=null;setSession('');state.view='home';showAuth();}

function requestCard(r){
  const pct=Math.min(100,(r.raised/r.goal)*100);
  const remaining=Math.max(0,r.goal-r.raised);
  return `<article class="card">
    <div class="row between">
      <div class="row"><div class="avatar">${escapeHtml(r.name[0])}</div><div><strong>${escapeHtml(r.name)}</strong><div class="tiny muted">${r.verified?'✓ Verificado · ':''}${escapeHtml(r.time)}</div></div></div>
      <span class="pill">${escapeHtml(r.category)}</span>
    </div>
    <p>${escapeHtml(r.description)}</p>
    <div class="progress" aria-label="${Math.round(pct)}% da meta"><div style="width:${pct}%"></div></div>
    <div class="money-row"><strong>${brl(r.raised)} arrecadados</strong><span class="muted">Meta ${brl(r.goal)}</span></div>
    <div class="tiny muted top-mini">${r.helpers} pessoas ajudaram · faltam ${brl(remaining)}</div>
    <div class="actions"><button class="btn btn-primary contribute" data-id="${r.id}" ${remaining<=0?'disabled':''}>${remaining<=0?'Meta atingida':'Ajudar agora'}</button><button class="btn btn-secondary details" data-id="${r.id}">Ver pedido</button></div>
  </article>`;
}

function renderHome(){
  const user=currentUser();pageTitle.textContent='Início';
  app.innerHTML=`<div class="content">
    <section class="hero"><p class="eyebrow hero-eyebrow">Olá, ${escapeHtml(user.name)}</p><h2>Uma pequena ajuda pode resolver o dia de alguém.</h2><p>Contribuições voluntárias para necessidades pontuais.</p></section>
    <div class="stats"><div class="stat"><strong>247</strong><span>ajudas hoje</span></div><div class="stat"><strong>81%</strong><span>metas concluídas</span></div><div class="stat"><strong>${brl(1)}</strong><span>para começar</span></div></div>
    <div class="legal-banner"><strong>Importante:</strong> toda contribuição é voluntária e não constitui empréstimo, crédito ou investimento.</div>
    <div class="section-head"><h2>Alguém precisa da sua ajuda</h2><button class="link-btn" data-go="help">Ver todos</button></div>
    ${requestCard(state.requests[0])}
    <div class="section-head"><h2>Quase lá</h2></div>
    ${requestCard(state.requests.slice().sort((a,b)=>(a.goal-a.raised)-(b.goal-b.raised))[0])}
  </div>`;
}
function renderHelp(){
  pageTitle.textContent='Ajudar';
  app.innerHTML=`<div class="content"><div class="section-head"><div><h2>Pedidos ativos</h2><p class="muted tiny">Escolha livremente quem você quer apoiar.</p></div></div><div class="legal-banner compact"><strong>Sem obrigação de retorno.</strong> Ajudar hoje não cria direito automático de receber amanhã.</div>${state.requests.map(requestCard).join('')}</div>`;
}
function renderRequest(){
  const u=currentUser();pageTitle.textContent='Pedir apoio';
  if(Number(u.nextRequestDays)>0){
    app.innerHTML=`<div class="content"><section class="empty-state"><div class="empty-icon">⏳</div><h2>Seu próximo pedido ainda não está disponível</h2><p>Para este protótipo, existe um intervalo mínimo entre pedidos.</p><div class="limit-card"><span>Disponível em</span><strong>${u.nextRequestDays} dias</strong></div><button class="btn btn-secondary full" data-go="profile">Ver meus limites</button></section></div>`;return;
  }
  app.innerHTML=`<div class="content">
    <div class="notice">Limites do MVP: mínimo de R$ 20, máximo de ${brl(u.limitPerRequest)}, um pedido ativo por vez e limite mensal de ${brl(u.monthlyLimit)}.</div>
    <form class="form-card" id="request-form">
      <label class="field">Quanto você precisa?<input id="req-value" type="number" min="20" max="${u.limitPerRequest}" step="1" inputmode="decimal" placeholder="Ex.: 50" required></label>
      <label class="field">Categoria<select id="req-category" required><option value="">Selecione</option><option>Combustível</option><option>Alimentação</option><option>Transporte</option><option>Medicamentos</option><option>Conta essencial</option><option>Emergência</option><option>Outro</option></select></label>
      <label class="field">Conte brevemente o que aconteceu<textarea id="req-description" maxlength="180" placeholder="Explique sua necessidade de forma objetiva." required></textarea><span class="tiny muted">Evite dados pessoais, endereço ou documentos.</span></label>
      <label class="field">Prazo<select id="req-time"><option>24 horas</option><option selected>48 horas</option></select></label>
      <label class="check-row"><input id="req-confirm" type="checkbox" required><span>Confirmo que as informações são verdadeiras e entendo que a plataforma poderá suspender pedidos suspeitos.</span></label>
      <button class="btn btn-primary full">Publicar pedido</button>
    </form>
  </div>`;
}
function renderHistory(){
  const u=currentUser();pageTitle.textContent='Histórico';
  const items=state.history.filter(h=>!h.userId||h.userId===u.id);
  app.innerHTML=`<div class="content"><div class="stats"><div class="stat"><strong>${u.helped}</strong><span>pessoas ajudadas</span></div><div class="stat"><strong>${brl(u.contributed)}</strong><span>contribuído</span></div><div class="stat"><strong>${u.received}</strong><span>apoios recebidos</span></div></div><div class="section-head"><h2>Movimentações</h2></div>${items.length?`<div class="list">${items.map(h=>`<div class="list-item"><div><strong>${escapeHtml(h.type)}</strong><div class="tiny muted">${escapeHtml(h.person)} · ${escapeHtml(h.date)}</div></div><strong>${brl(h.value)}</strong></div>`).join('')}</div>`:`<section class="empty-state small"><div class="empty-icon">◷</div><h2>Nenhuma movimentação ainda</h2><p>Suas contribuições e apoios recebidos aparecerão aqui.</p></section>`}</div>`;
}
function renderProfile(){
  const u=currentUser();pageTitle.textContent='Perfil';
  const available=Math.max(0,u.monthlyLimit-(u.receivedMonth||0));
  const pct=Math.min(100,((u.receivedMonth||0)/u.monthlyLimit)*100);
  app.innerHTML=`<div class="content">
    <section class="card profile-hero"><div class="profile-avatar">${userInitial()}</div><h2>${escapeHtml(u.name)}</h2><p class="success">${u.verified?'✓ Identidade verificada':'○ Verificação pendente'}</p><p class="muted">Membro desde ${escapeHtml(u.joined||'2026')}</p></section>
    <div class="stats"><div class="stat"><strong>${u.helped}</strong><span>ajudou</span></div><div class="stat"><strong>${u.received}</strong><span>recebeu</span></div><div class="stat"><strong>${brl(u.contributed)}</strong><span>contribuiu</span></div></div>
    <section class="card"><div class="section-head no-margin"><h2>Seus limites</h2></div><div class="limit-row"><span>Por pedido</span><strong>${brl(u.limitPerRequest)}</strong></div><div class="limit-row"><span>Recebido no mês</span><strong>${brl(u.receivedMonth||0)} / ${brl(u.monthlyLimit)}</strong></div><div class="progress"><div style="width:${pct}%"></div></div><div class="tiny muted">Ainda disponível no período: ${brl(available)}</div><div class="limit-row divider"><span>Próximo pedido</span><strong>${u.nextRequestDays>0?`Em ${u.nextRequestDays} dias`:'Disponível'}</strong></div></section>
    <div class="list"><button class="list-button" id="profile-notifications"><span>Notificações</span><strong>›</strong></button><button class="list-button" id="logout-btn"><span>Sair do protótipo</span><strong>›</strong></button><button class="list-button danger" id="reset-btn"><span>Apagar dados locais do MVP</span><strong>›</strong></button></div>
  </div>`;
}
function render(){
  if(!state.user)return;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  const views={home:renderHome,help:renderHelp,request:renderRequest,history:renderHistory,profile:renderProfile};
  (views[state.view]||renderHome)();updateBadge();
}

function openContribution(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
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
function openDetails(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  const remaining=Math.max(0,r.goal-r.raised),pct=Math.min(100,(r.raised/r.goal)*100);
  document.querySelector('#details-content').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">Pedido de apoio</p><h2>${escapeHtml(r.name)}</h2></div><button class="icon-btn close-dialog" data-dialog="details-dialog" aria-label="Fechar">✕</button></div><div class="detail-meta"><span class="pill">${escapeHtml(r.category)}</span><span class="tiny muted">${r.verified?'✓ Identidade verificada · ':''}${escapeHtml(r.time)}</span></div><p class="detail-description">${escapeHtml(r.description)}</p><div class="progress"><div style="width:${pct}%"></div></div><div class="money-row"><strong>${brl(r.raised)} arrecadados</strong><span class="muted">Meta ${brl(r.goal)}</span></div><div class="detail-grid"><div><span>Pessoas que ajudaram</span><strong>${r.helpers}</strong></div><div><span>Falta</span><strong>${brl(remaining)}</strong></div></div><div class="legal-banner compact"><strong>Contribuição voluntária:</strong> não há obrigação de restituição, juros ou retorno financeiro.</div><button class="btn btn-primary full contribute" data-id="${r.id}" ${remaining<=0?'disabled':''}>${remaining<=0?'Meta atingida':'Ajudar este pedido'}</button>`;
  detailsDlg.showModal();
}
function openNotifications(){
  const list=document.querySelector('#notifications-list');
  list.innerHTML=state.notifications.length?state.notifications.map(n=>`<div class="notification-item ${n.read?'':'unread'}"><div><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.text)}</p><span class="tiny muted">${escapeHtml(n.time)}</span></div></div>`).join(''):'<p class="muted">Nenhuma notificação.</p>';
  notificationsDlg.showModal();
}
function updateBadge(){
  const unread=state.notifications.filter(n=>!n.read).length,b=document.querySelector('#notify-badge');
  if(!b)return;b.textContent=unread;b.classList.toggle('hidden',unread===0);
}
function notify(title,text){state.notifications.unshift({id:Date.now(),title,text,time:'Agora',read:false});saveState();updateBadge();}
function syncUser(){
  const i=state.users.findIndex(u=>u.id===state.user.id);
  if(i>=0)state.users[i]=state.user;else state.users.push(state.user);
  saveState();
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

// Authentication tabs
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-auth-tab]');
  if(tab){document.querySelectorAll('.auth-tab').forEach(x=>x.classList.toggle('active',x===tab));document.querySelector('#login-form').classList.toggle('hidden',tab.dataset.authTab!=='login');document.querySelector('#signup-form').classList.toggle('hidden',tab.dataset.authTab!=='signup');return;}
  const nav=e.target.closest('[data-view]');if(nav){state.view=nav.dataset.view;render();return;}
  const go=e.target.closest('[data-go]');if(go){state.view=go.dataset.go;render();return;}
  const c=e.target.closest('.contribute');if(c){if(detailsDlg.open)detailsDlg.close();openContribution(Number(c.dataset.id));return;}
  const d=e.target.closest('.details');if(d){openDetails(Number(d.dataset.id));return;}
  const a=e.target.closest('.amount-btn');if(a){state.selectedAmount=Number(a.dataset.amount);document.querySelectorAll('.amount-btn').forEach(b=>b.classList.toggle('selected',b===a));document.querySelector('#custom-amount').value='';updateContributionSummary();return;}
  const close=e.target.closest('.close-dialog');if(close){document.querySelector('#'+close.dataset.dialog)?.close();return;}
  if(e.target.closest('#notify-btn')||e.target.closest('#profile-notifications')){openNotifications();return;}
  if(e.target.closest('#mark-read')){state.notifications.forEach(n=>n.read=true);saveState();updateBadge();openNotifications();return;}
  if(e.target.closest('#logout-btn')){logout();return;}
  if(e.target.closest('#reset-btn')){if(confirm('Apagar todos os dados locais deste protótipo neste aparelho?')){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SESSION_KEY);state=cloneDefault();showAuth();}return;}
  if(e.target.closest('#demo-access')){state.user=makeDemoUser();setSession(state.user.email);state.history=state.history.length?state.history:[{type:'Ajudou',person:'Camila R.',value:5,date:'Hoje',userId:state.user.id},{type:'Recebeu apoio',person:'Comunidade',value:50,date:'12/10/2026',userId:state.user.id},{type:'Ajudou',person:'João P.',value:2,date:'10/10/2026',userId:state.user.id}];saveState();showApp();return;}
});

document.addEventListener('input',e=>{
  if(e.target.id==='custom-amount'){
    const max=Number(e.target.max)||999;state.selectedAmount=Math.max(0,Math.min(max,Number(e.target.value)||0));
    document.querySelectorAll('.amount-btn').forEach(b=>b.classList.remove('selected'));updateContributionSummary();
  }
});

document.addEventListener('submit',e=>{
  if(e.target.id==='signup-form'){
    e.preventDefault();
    const name=document.querySelector('#signup-name').value.trim(),email=document.querySelector('#signup-email').value.trim().toLowerCase(),password=document.querySelector('#signup-password').value;
    if(state.users.some(u=>u.email===email)){alert('Já existe um cadastro local com este e-mail.');return;}
    const u={id:'u-'+Date.now(),name,email,password,verified:false,helped:0,received:0,contributed:0,receivedMonth:0,limitPerRequest:50,monthlyLimit:300,nextRequestDays:0,joined:'Outubro de 2026'};
    state.users.push(u);state.user=u;state.history=[];notify('Cadastro criado','Seu perfil foi criado neste aparelho. A verificação de identidade ainda é simulada no MVP.');syncUser();setSession(email);showApp();return;
  }
  if(e.target.id==='login-form'){
    e.preventDefault();const email=document.querySelector('#login-email').value.trim().toLowerCase(),password=document.querySelector('#login-password').value;
    const u=state.users.find(x=>x.email===email&&x.password===password);
    if(!u){alert('E-mail ou senha não encontrados neste aparelho. Para testar imediatamente, use o acesso de demonstração.');return;}
    state.user=u;setSession(email);showApp();return;
  }
  if(e.target.id==='request-form'){
    e.preventDefault();const u=currentUser();const val=Number(document.querySelector('#req-value').value);
    if(val<20||val>u.limitPerRequest){alert(`O valor deve ficar entre R$ 20 e ${brl(u.limitPerRequest)}.`);return;}
    if((u.receivedMonth||0)+val>u.monthlyLimit){alert('Este pedido ultrapassaria o limite mensal disponível no protótipo.');return;}
    const category=document.querySelector('#req-category').value,description=document.querySelector('#req-description').value.trim(),time=document.querySelector('#req-time').value;
    state.requests.unshift({id:Date.now(),name:u.name,category,description,goal:val,raised:0,helpers:0,verified:u.verified,time:time==='24 horas'?'24h restantes':'48h restantes',createdBy:u.id});
    u.nextRequestDays=7;syncUser();notify('Pedido publicado',`Seu pedido de ${brl(val)} foi publicado no protótipo.`);alert('Pedido criado no protótipo. Em produção, ele deverá passar por validações antes da publicação.');state.view='home';render();return;
  }
  if(e.target.id==='contribute-form'&&e.submitter?.id==='confirm-contribution'){
    e.preventDefault();const r=state.activeRequest,u=currentUser(),v=Math.min(Number(state.selectedAmount),r.goal-r.raised);if(v<=0)return;
    r.raised=Math.round((r.raised+v)*100)/100;r.helpers+=1;u.helped+=1;u.contributed=Math.round((u.contributed+v)*100)/100;
    state.history.unshift({type:'Ajudou',person:r.name,value:v,date:'Agora',userId:u.id});syncUser();saveState();notify('Contribuição registrada',`Você simulou uma contribuição de ${brl(v)} para ${r.name}.`);dlg.close();alert(`Contribuição simulada de ${brl(v)} registrada. Nenhum pagamento real foi processado.`);render();return;
  }
});

init();
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
