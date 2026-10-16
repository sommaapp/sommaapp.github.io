const state={
  view:'home',
  user:{name:'Paula',verified:true,helped:18,received:2,contributed:74},
  requests:[
    {id:1,name:'Lucas M.',category:'Combustível',description:'Preciso completar o combustível para trabalhar amanhã.',goal:50,raised:37,helpers:14,verified:true,time:'8h restantes'},
    {id:2,name:'Ana C.',category:'Transporte',description:'Preciso de transporte para uma consulta amanhã cedo.',goal:40,raised:24,helpers:9,verified:true,time:'15h restantes'},
    {id:3,name:'Rafael S.',category:'Alimentação',description:'Preciso completar uma compra básica para hoje.',goal:60,raised:49,helpers:22,verified:true,time:'23h restantes'}
  ],
  history:[
    {type:'Ajudou',person:'Camila R.',value:5,date:'Hoje'},
    {type:'Recebeu apoio',person:'Comunidade',value:50,date:'12/10/2026'},
    {type:'Ajudou',person:'João P.',value:2,date:'10/10/2026'}
  ],
  activeRequest:null,
  selectedAmount:0
};

const app=document.querySelector('#app');
const pageTitle=document.querySelector('#page-title');
const dlg=document.querySelector('#contribute-dialog');
const brl=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const feeFor=v=>Math.round((0.20+v*0.05)*100)/100;

function requestCard(r){
  const pct=Math.min(100,(r.raised/r.goal)*100);
  return `<article class="card">
    <div class="row between">
      <div class="row"><div class="avatar">${r.name[0]}</div><div><strong>${r.name}</strong><div class="tiny muted">${r.verified?'✓ Verificado · ':''}${r.time}</div></div></div>
      <span class="pill">${r.category}</span>
    </div>
    <p>${r.description}</p>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="money-row"><strong>${brl(r.raised)} arrecadados</strong><span class="muted">Meta ${brl(r.goal)}</span></div>
    <div class="tiny muted" style="margin-top:6px">${r.helpers} pessoas ajudaram · faltam ${brl(r.goal-r.raised)}</div>
    <div class="actions"><button class="btn btn-primary contribute" data-id="${r.id}">Ajudar agora</button><button class="btn btn-secondary details" data-id="${r.id}">Ver pedido</button></div>
  </article>`;
}

function renderHome(){
  pageTitle.textContent='Início';
  app.innerHTML=`<div class="content">
    <section class="hero"><p class="eyebrow" style="color:#9ca3af">Olá, ${state.user.name}</p><h2>Uma pequena ajuda pode resolver o dia de alguém.</h2><p>Contribuições voluntárias para necessidades pontuais.</p></section>
    <div class="stats"><div class="stat"><strong>247</strong><span>ajudas hoje</span></div><div class="stat"><strong>81%</strong><span>metas concluídas</span></div><div class="stat"><strong>${brl(1)}</strong><span>para começar</span></div></div>
    <div class="section-head"><h2>Alguém precisa da sua ajuda</h2><button class="link-btn" data-go="help">Ver todos</button></div>
    ${requestCard(state.requests[0])}
    <div class="section-head"><h2>Quase lá</h2></div>
    ${requestCard(state.requests[2])}
  </div>`;
}

function renderHelp(){pageTitle.textContent='Ajudar';app.innerHTML=`<div class="content"><div class="section-head"><div><h2>Pedidos ativos</h2><p class="muted tiny">Escolha quem você quer apoiar.</p></div></div>${state.requests.map(requestCard).join('')}</div>`}

function renderRequest(){pageTitle.textContent='Pedir apoio';app.innerHTML=`<div class="content">
  <div class="notice">MVP: pedido mínimo de R$ 20, máximo de R$ 100, um pedido ativo por vez e intervalo de 7 dias.</div>
  <form class="form-card" id="request-form">
    <label class="field">Quanto você precisa?<input id="req-value" type="number" min="20" max="100" step="1" placeholder="Ex.: 50" required></label>
    <label class="field">Categoria<select id="req-category" required><option value="">Selecione</option><option>Combustível</option><option>Alimentação</option><option>Transporte</option><option>Medicamentos</option><option>Conta essencial</option><option>Emergência</option><option>Outro</option></select></label>
    <label class="field">Conte brevemente o que aconteceu<textarea id="req-description" maxlength="180" placeholder="Explique sua necessidade de forma objetiva." required></textarea></label>
    <label class="field">Prazo<select id="req-time"><option>24 horas</option><option selected>48 horas</option></select></label>
    <button class="btn btn-primary" style="width:100%">Publicar pedido</button>
  </form>
</div>`}

function renderHistory(){pageTitle.textContent='Histórico';app.innerHTML=`<div class="content"><div class="stats"><div class="stat"><strong>${state.user.helped}</strong><span>pessoas ajudadas</span></div><div class="stat"><strong>${brl(state.user.contributed)}</strong><span>contribuído</span></div><div class="stat"><strong>${state.user.received}</strong><span>apoios recebidos</span></div></div><div class="section-head"><h2>Movimentações</h2></div><div class="list">${state.history.map(h=>`<div class="list-item"><div><strong>${h.type}</strong><div class="tiny muted">${h.person} · ${h.date}</div></div><strong>${brl(h.value)}</strong></div>`).join('')}</div></div>`}

function renderProfile(){pageTitle.textContent='Perfil';app.innerHTML=`<div class="content"><section class="card profile-hero"><div class="profile-avatar">P</div><h2>${state.user.name}</h2><p class="success">✓ Identidade verificada</p><p class="muted">Membro da comunidade</p></section><div class="stats"><div class="stat"><strong>${state.user.helped}</strong><span>ajudou</span></div><div class="stat"><strong>${state.user.received}</strong><span>recebeu</span></div><div class="stat"><strong>${brl(state.user.contributed)}</strong><span>contribuiu</span></div></div><div class="list"><div class="list-item"><span>Limite atual por pedido</span><strong>R$ 100</strong></div><div class="list-item"><span>Limite mensal recebido</span><strong>R$ 300</strong></div><div class="list-item"><span>Próximo pedido disponível</span><strong>Em 3 dias</strong></div></div></div>`}

function render(){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));({home:renderHome,help:renderHelp,request:renderRequest,history:renderHistory,profile:renderProfile}[state.view])()}

function openContribution(id){
  const r=state.requests.find(x=>x.id===id); state.activeRequest=r; state.selectedAmount=0;
  document.querySelector('#dialog-person').textContent=`Ajudar ${r.name}`;
  const remaining=Math.max(0,r.goal-r.raised);
  const opts=[1,2,5,10].filter(v=>v<=remaining);
  document.querySelector('#amount-options').innerHTML=opts.map(v=>`<button type="button" class="amount-btn" data-amount="${v}">${brl(v)}</button>`).join('');
  document.querySelector('#custom-amount').max=remaining;
  document.querySelector('#custom-amount').value='';
  updateContributionSummary();
  dlg.showModal();
}

function updateContributionSummary(){
  const v=Number(state.selectedAmount)||0, fee=v?feeFor(v):0;
  document.querySelector('#summary-contribution').textContent=brl(v);
  document.querySelector('#summary-fee').textContent=brl(fee);
  document.querySelector('#summary-total').textContent=brl(v+fee);
  document.querySelector('#confirm-contribution').disabled=v<=0;
}

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-view]'); if(nav){state.view=nav.dataset.view;render();return}
  const go=e.target.closest('[data-go]'); if(go){state.view=go.dataset.go;render();return}
  const c=e.target.closest('.contribute'); if(c){openContribution(Number(c.dataset.id));return}
  const a=e.target.closest('.amount-btn'); if(a){state.selectedAmount=Number(a.dataset.amount);document.querySelectorAll('.amount-btn').forEach(b=>b.classList.toggle('selected',b===a));document.querySelector('#custom-amount').value='';updateContributionSummary();return}
});

document.addEventListener('input',e=>{if(e.target.id==='custom-amount'){const max=Number(e.target.max)||999;state.selectedAmount=Math.max(0,Math.min(max,Number(e.target.value)||0));document.querySelectorAll('.amount-btn').forEach(b=>b.classList.remove('selected'));updateContributionSummary();}});

document.addEventListener('submit',e=>{
  if(e.target.id==='request-form'){
    e.preventDefault(); const val=Number(document.querySelector('#req-value').value); if(val<20||val>100){alert('O valor deve ficar entre R$ 20 e R$ 100.');return}
    const category=document.querySelector('#req-category').value, description=document.querySelector('#req-description').value.trim();
    state.requests.unshift({id:Date.now(),name:'Paula',category,description,goal:val,raised:0,helpers:0,verified:true,time:'48h restantes'});
    alert('Pedido criado no protótipo. Em produção, ele passará por validações antes da publicação.'); state.view='home'; render();
  }
  if(e.target.id==='contribute-form' && e.submitter?.id==='confirm-contribution'){
    e.preventDefault(); const r=state.activeRequest, v=Math.min(Number(state.selectedAmount),r.goal-r.raised); if(v<=0)return;
    r.raised+=v; r.helpers+=1; state.user.helped+=1; state.user.contributed+=v; state.history.unshift({type:'Ajudou',person:r.name,value:v,date:'Agora'}); dlg.close(); alert(`Contribuição simulada de ${brl(v)} registrada. Nenhum pagamento real foi processado.`); render();
  }
});

render();
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
