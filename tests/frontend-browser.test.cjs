// Chromium UI checks use the real pinned SDK with local, controlled API fixtures.
// No real users, email deliveries, Supabase writes or external page requests.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const toolingRequire=require('module').createRequire(path.resolve(__dirname,'../tooling/package.json'));
const {chromium}=toolingRequire('playwright');
const projectRoot=path.resolve(__dirname,'..');
const root=process.env.SOMMA_APP_DIR?path.resolve(process.env.SOMMA_APP_DIR):(fs.existsSync(path.join(projectRoot,'frontend','index.html'))?path.join(projectRoot,'frontend'):projectRoot);
const output=path.resolve(process.env.SOMMA_TEST_OUTPUT_DIR||path.join(__dirname,'../test-results'));
fs.mkdirSync(output,{recursive:true});
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',rid='33333333-3333-4333-8333-333333333333';
const at=new Date().toISOString();const exp=Math.floor(Date.now()/1000)+3600;
const user={id:uid,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',email_confirmed_at:at,created_at:at,updated_at:at,app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Pessoa de Teste'},identities:[]};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,aud:'authenticated',role:'authenticated',email:user.email,exp,iat:exp-3600},'test'].map((x,i)=>Buffer.from(i<2?JSON.stringify(x):x).toString('base64url')).join('.');
const session=()=>({access_token:jwt,refresh_token:'qa-refresh-token-only',expires_in:3600,expires_at:exp,token_type:'bearer',user});
const profile={id:uid,full_name:'Pessoa de Teste',public_name:'Pessoa T.',level:'initial',request_limit_cents:5000,period_limit_cents:15000,account_status:'active',created_at:at,updated_at:at};
const levels=[['initial','Inicial',5000,15000],['verified','Verificado',10000,30000],['community','Comunidade',15000,45000],['trusted','Confiável',20000,60000],['special','Especial',30000,null]].map((a,i)=>({code:a[0],display_name:a[1],request_limit_cents:a[2],period_limit_cents:a[3],sort_order:i,rules:{}}));
const db={profiles:[profile],public_profiles:[{id:uid,public_name:'Pessoa T.',level:'initial',created_at:at},{id:other,public_name:'Ana S.',level:'initial',created_at:at}],user_levels:levels,requests:[{id:rid,user_id:other,category:'Trabalho',description:'Preciso completar o transporte para começar no trabalho.',goal_cents:5000,raised_cents:0,status:'active',starts_at:at,expires_at:new Date(Date.now()+48*3600000).toISOString(),created_at:at,helper_count:0,duration_hours:48}],contributions:[],notifications:[]};
let lostResponse=true,postContributions=0,markCount=0,requestPosts=0,recoveryUpdates=0;const errors=[],requests=[];let debugPage;
function freshId(){return require('crypto').randomUUID()}
function matches(row,url){for(const [key,value] of url.searchParams){if(['select','order','offset','limit'].includes(key))continue;if(value.startsWith('eq.')&&String(row[key])!==value.slice(3))return false;if(value==='is.null'&&row[key]!=null)return false;if(value.startsWith('in.(')&&!value.slice(4,-1).split(',').includes(String(row[key])))return false}return true}
async function main(){
 const browser=await chromium.launch({...(process.env.SOMMA_CHROMIUM_EXECUTABLE?{executablePath:process.env.SOMMA_CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(() => { if (location.origin !== 'https://somma.test') return; if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('somma_mvp_v37_state', JSON.stringify({user:{id:'legacy',name:'Legacy Name',password:'legacy-test-only'},users:[{id:'legacy',password:'legacy-test-only'}],requests:[{id:1,goal:50}],history:[]})); localStorage.setItem('qa-other-data','keep-me'); localStorage.setItem('qa-seeded','yes'); } });
 const page=debugPage=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(String(e)));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();
  const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','access-control-expose-headers':'content-range, content-location, preference-applied'};
  const respond=(data,status=200)=>route.fulfill({status,headers,body:status===204?'':JSON.stringify(data)});
  if(url.hostname==='somma.test'){
   let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';
   const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
   return route.fulfill({status:200,contentType:mime,body:fs.readFileSync(file)});
  }
  if(url.hostname!=='sxwsfgotsztetnawofyx.supabase.co')throw Error('Unexpected external request '+url.origin);
  requests.push(method+' '+url.pathname);
  if(method==='OPTIONS')return respond({},204);
  const body=req.postData()?JSON.parse(req.postData()):{};
  if(url.pathname==='/auth/v1/token')return body.password==='wrong-password'?respond({code:'invalid_credentials',msg:'Invalid login credentials'},400):respond(session());
  if(url.pathname==='/auth/v1/signup')return respond({...user,email_confirmed_at:null,confirmation_sent_at:at});
  if(url.pathname==='/auth/v1/recover'||url.pathname==='/auth/v1/resend')return respond({});
  if(url.pathname==='/auth/v1/logout')return respond({},204);
  if(url.pathname==='/auth/v1/user'){if(method==='PUT'){recoveryUpdates++;return respond(user)}return respond(user)}
  if(!url.pathname.startsWith('/rest/v1/'))throw Error('Unexpected API path '+url.pathname);
  const table=url.pathname.split('/').pop();
  if (method === 'POST' && url.pathname === '/rest/v1/rpc/somma_feed_summary') {
   const active=db.requests.filter(r=>r.status==='active'&&r.user_id!==uid&&(!r.expires_at||Date.parse(r.expires_at)>Date.now()));
   active.sort((a,b)=>(a.goal_cents-a.raised_cents)-(b.goal_cents-b.raised_cents)||Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id));
   return respond({active_count:active.length,completed_count:db.requests.filter(r=>r.status==='completed').length,closest:active[0]||null,almost:active[1]||null});
  }
  if (method === 'POST' && url.pathname === '/rest/v1/rpc/somma_user_summary') {
   const given=db.contributions.filter(c=>c.contributor_user_id===uid&&c.status==='simulated_confirmed');
   const ownIds=new Set(db.requests.filter(r=>r.user_id===uid).map(r=>r.id));
   const received=db.contributions.filter(c=>ownIds.has(c.request_id)&&c.status==='simulated_confirmed');
   const monthStart=Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),1);
   const latest=db.requests.filter(r=>r.user_id===uid).reduce((n,r)=>Math.max(n,Date.parse(r.created_at)),0);
   return respond({supported_requests:new Set(given.map(c=>c.request_id)).size,helped:new Set(given.map(c=>db.requests.find(r=>r.id===c.request_id)?.user_id).filter(Boolean)).size,contributed_cents:given.reduce((n,c)=>n+c.amount_cents,0),received_count:received.length,received_month_cents:received.filter(c=>Date.parse(c.created_at)>=monthStart).reduce((n,c)=>n+c.amount_cents,0),next_request_at:latest?new Date(latest+7*86400000).toISOString():null});
  }
  if (method === 'POST' && url.pathname === '/rest/v1/rpc/somma_history_page') {
   const events=[];
   for(const r of db.requests.filter(r=>r.user_id===uid&&['all','request'].includes(body.p_kind||'all')))events.push({kind:'request',time:r.created_at,event_id:r.id,request:r,contribution:null,person_id:null});
   for(const c of db.contributions.filter(c=>c.status==='simulated_confirmed')){
    const r=db.requests.find(r=>r.id===c.request_id);if(!r)continue;
    if(c.contributor_user_id===uid&&['all','helped'].includes(body.p_kind||'all'))events.push({kind:'helped',time:c.created_at,event_id:c.id,request:r,contribution:c,person_id:r.user_id});
    if(r.user_id===uid&&['all','received'].includes(body.p_kind||'all'))events.push({kind:'received',time:c.created_at,event_id:c.id,request:r,contribution:c,person_id:c.contributor_user_id});
   }
   events.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||b.event_id.localeCompare(a.event_id)||b.kind.localeCompare(a.kind));
   const beforeAt=body.p_before_at?Date.parse(body.p_before_at):null,beforeId=body.p_before_id,beforeKind=body.p_before_kind;
   const eligible=beforeAt===null?events:events.filter(e=>{const d=Date.parse(e.time);return d<beforeAt||(d===beforeAt&&(e.event_id<beforeId||(e.event_id===beforeId&&e.kind<beforeKind)))});
   const limit=Math.max(1,Math.min(Number(body.p_limit)||24,50)),items=eligible.slice(0,limit),last=items[items.length-1];
   return respond({items,has_more:eligible.length>limit,next_at:last?.time||null,next_id:last?.event_id||null,next_kind:last?.kind||null});
  }
  if (method === 'HEAD' && table === 'notifications') {
   const unread=db.notifications.filter(n=>n.user_id===uid&&n.read_at==null).length;
   return route.fulfill({status:200,headers:{...headers,'content-range':`*/${unread}`},body:''});
  }
  if(!db[table])return respond({code:'42P01',message:'Unknown table'},400);
  if(method==='GET'){
   let result=db[table].filter(row=>matches(row,url));const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||99999);result=result.slice(offset,offset+limit);
   if(req.headers().accept?.includes('application/vnd.pgrst.object'))return result.length===1?respond(result[0]):respond({code:'PGRST116',message:'No rows'},406);
   return respond(result);
  }
  if(table==='requests'&&method==='POST'){
   requestPosts++;const allowed=['category','description','duration_hours','goal_cents','user_id'];assert.deepEqual(Object.keys(body).sort(),allowed);
   if(db.requests.some(r=>r.user_id===uid&&r.status==='active'))return respond({code:'P0001',message:'active_request_already_exists'},400);
   const row={...body,id:freshId(),raised_cents:0,helper_count:0,status:'active',starts_at:at,created_at:at,expires_at:new Date(Date.now()+body.duration_hours*3600000).toISOString()};db.requests.unshift(row);db.notifications.unshift({id:freshId(),user_id:uid,type:'request_created',title:'Pedido publicado',body:'Seu pedido já pode receber contribuições simuladas.',read_at:null,created_at:at});return respond(row,201);
  }
  if(table==='contributions'&&method==='POST'){
   postContributions++;assert.deepEqual(Object.keys(body).sort(),['amount_cents','contributor_user_id','idempotency_key','request_id']);
   if(db.contributions.some(c=>c.contributor_user_id===uid&&c.idempotency_key===body.idempotency_key))return respond({code:'23505',message:'duplicate'},409);
   const request=db.requests.find(r=>r.id===body.request_id);if(!request||request.raised_cents+body.amount_cents>request.goal_cents)return respond({code:'P0001',message:'contribution_exceeds_remaining_goal'},400);
   const row={...body,id:freshId(),platform_fee_cents:20+Math.ceil(body.amount_cents/20),status:'simulated_confirmed',created_at:new Date().toISOString()};db.contributions.push(row);request.raised_cents+=body.amount_cents;request.helper_count=new Set(db.contributions.filter(c=>c.request_id===request.id).map(c=>c.contributor_user_id)).size;
   if(request.raised_cents===request.goal_cents)request.status='completed';db.notifications.unshift({id:freshId(),user_id:uid,type:'contribution_sent',title:'Contribuição registrada',body:'Sua contribuição simulada foi registrada.',read_at:null,created_at:row.created_at});
   if(lostResponse){lostResponse=false;return route.abort('failed')}
   return respond(row,201);
  }
  if(table==='profiles'&&method==='PATCH'){assert.deepEqual(Object.keys(body),['full_name']);profile.full_name=body.full_name;const p=body.full_name.trim().split(/\s+/);profile.public_name=p[0]+' '+p.at(-1)[0]+'.';db.public_profiles[0].public_name=profile.public_name;return respond(profile)}
  if(table==='notifications'&&method==='PATCH'){markCount++;assert.deepEqual(Object.keys(body),['read_at']);const result=db.notifications.filter(n=>matches(n,url));result.forEach(n=>n.read_at=body.read_at);return respond(result.map(n=>({id:n.id,read_at:n.read_at})))}
  return respond({code:'error',message:'Unknown operation'},400);
 });
 const checks=[];async function pass(name,fn){await fn();checks.push(name);console.log('PASS '+name)}
 await page.goto('https://somma.test/');
 await page.locator('#login-form').waitFor({state:'visible'});
 await pass('SDK loads and initial auth has no fictitious users',async()=>{assert.equal(await page.locator('#demo-access').count(),0);assert.equal(await page.locator('#boot-screen').isVisible(),false)});
 await pass('legacy password fields removed without altering demo data',async()=>{const data=await page.evaluate(()=>({legacy:JSON.parse(localStorage.getItem('somma_mvp_v37_state')),other:localStorage.getItem('qa-other-data')}));assert.equal(data.legacy.user.password,undefined);assert.equal(data.legacy.users[0].password,undefined);assert.equal(data.legacy.user.name,'Legacy Name');assert.equal(data.legacy.requests[0].goal,50);assert.equal(data.other,'keep-me')});
 await page.screenshot({path:path.join(output,'somma_auth_mobile.png'),fullPage:true});
 await pass('signup waits for email confirmation',async()=>{await page.locator('[data-auth-tab="signup"]').click();await page.locator('#signup-name').fill('Pessoa de Teste');await page.locator('#signup-email').fill(user.email);await page.locator('#signup-password').fill('QA-Test-Only-Password!');await page.locator('#signup-terms').check();await page.locator('#signup-form button[type="submit"]').click();await page.locator('#auth-feedback').filter({hasText:'Confira seu e-mail'}).waitFor();assert.equal(await page.locator('#app-shell').isVisible(),false)});
 await pass('login errors are visible without opening private screens',async()=>{await page.locator('[data-auth-tab="login"]').first().click();await page.locator('#login-email').fill(user.email);await page.locator('#login-password').fill('wrong-password');await page.locator('#login-form button[type="submit"]').click();await page.locator('#auth-feedback').filter({hasText:'E-mail ou senha incorretos'}).waitFor()});
 await pass('real SDK sign-in loads names and requests through adapter',async()=>{await page.locator('#login-password').fill('QA-Test-Only-Password!');await page.locator('#login-form button[type="submit"]').click();await page.locator('#app-shell').waitFor({state:'visible'});await page.getByText('Olá, Pessoa',{exact:true}).waitFor();assert.equal(await page.getByText('Ana S.',{exact:true}).count(),1)});
 await page.screenshot({path:path.join(output,'somma_home_mobile.png'),fullPage:true});
 await pass('native history returns from details to Ajudar',async()=>{await page.locator('.nav-item[data-view="help"]').click();await page.locator('[data-details="'+rid+'"]').click();assert.equal(await page.locator('#page-title').textContent(),'Pedido');await page.goBack();assert.equal(await page.locator('#page-title').textContent(),'Ajudar')});
 await pass('contribution fee is displayed before confirming',async()=>{await page.locator('[data-contribute="'+rid+'"]').click();await page.locator('[data-amount="500"]').click();assert.match(await page.locator('#summary-fee').textContent(),/0,45/);assert.match(await page.locator('#summary-total').textContent(),/5,45/)});
 await page.screenshot({path:path.join(output,'somma_contribution_mobile.png'),fullPage:true});
 await pass('lost response recovers one contribution via same key',async()=>{await page.locator('#confirm-contribution').click();await page.locator('#contribute-dialog').waitFor({state:'hidden'});await page.locator('#sync-label').filter({hasText:'Atualizado'}).waitFor();assert.equal(db.contributions.length,1);assert.equal(postContributions,1);assert.equal(await page.locator('#pending-banner').isVisible(),false)});
 await pass('second contribution uses a new intention but one unique helper',async()=>{await page.locator('[data-contribute="'+rid+'"]').click();await page.locator('[data-amount="500"]').click();await page.locator('#confirm-contribution').evaluate(el=>{el.click();el.click()});await page.locator('#contribute-dialog').waitFor({state:'hidden'});assert.equal(db.contributions.length,2);assert.equal(db.requests.find(r=>r.id===rid).helper_count,1);assert.notEqual(db.contributions[0].idempotency_key,db.contributions[1].idempotency_key)});
 await pass('request three-step flow sends controlled fields and 24h duration',async()=>{await page.locator('.nav-item[data-view="request"]').click();await page.locator('#req-value').fill('50');await page.locator('#req-category').selectOption('Trabalho');await page.locator('#request-step-1 button[type="submit"]').click();await page.locator('#req-description').fill('Transporte para trabalhar nesta semana.');await page.locator('#req-time').selectOption('24');await page.locator('#request-step-2 button[type="submit"]').click();await page.screenshot({path:path.join(output,'somma_request_review_mobile.png'),fullPage:true});await page.locator('#req-confirm').check();await page.locator('#request-final-form button[type="submit"]').click();await page.getByText('Olá, Pessoa',{exact:true}).waitFor();assert.equal(requestPosts,1);assert.equal(db.requests.find(r=>r.user_id===uid).duration_hours,24);assert.equal(await page.locator('[data-contribute="'+db.requests.find(r=>r.user_id===uid).id+'"]').isDisabled(),true)});
 await pass('own active request blocks a second request',async()=>{await page.locator('.nav-item[data-view="request"]').click();await page.getByText('Vamos acompanhar seus limites',{exact:true}).waitFor();assert.equal(await page.locator('#req-value').count(),0)});
 await pass('history separates publication from received support',async()=>{await page.locator('.nav-item[data-view="history"]').click();await page.getByText('Pedido publicado',{exact:true}).waitFor();assert.equal(await page.getByText('Você ajudou',{exact:true}).count(),2);await page.locator('[data-history-tab="received"]').click();await page.getByText('Nenhuma movimentação',{exact:true}).waitFor()});
 await pass('profile name update renders abbreviated public name',async()=>{await page.locator('.nav-item[data-view="profile"]').click();await page.locator('#profile-name').fill('Pessoa Nome Atualizado');await page.locator('#profile-form button[type="submit"]').click();await page.getByText('Pessoa Nome Atualizado',{exact:true}).waitFor();await page.getByText('Nos pedidos, o nome público é Pessoa A.',{exact:true}).waitFor()});
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'somma_profile_mobile.png'),fullPage:true});
 await pass('notification marking persists and clears badge',async()=>{await page.locator('#notify-btn').click();await page.locator('#mark-read').click();await page.locator('#notify-badge').waitFor({state:'hidden'});assert.equal(markCount,1);assert.equal(await page.locator('#mark-read').isDisabled(),true)});
 await pass('offline state is communicated',async()=>{await context.setOffline(true);await page.locator('#network-banner').waitFor({state:'visible'});assert.equal(await page.locator('#refresh-data').isDisabled(),true);await context.setOffline(false);await page.locator('#network-banner').waitFor({state:'hidden'})});
 await pass('mobile layout avoids horizontal overflow',async()=>{for(const w of [360,390,430]){await page.setViewportSize({width:w,height:844});for(const view of ['home','help','history','profile']){await page.locator('.nav-item[data-view="'+view+'"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),w+' '+view)}}});
 await page.setViewportSize({width:1365,height:900});await page.locator('.nav-item[data-view="home"]').click();await page.screenshot({path:path.join(output,'somma_home_desktop.png'),fullPage:true});
 await pass('logout remains logged out after refresh',async()=>{await page.locator('.nav-item[data-view="profile"]').click();await page.locator('#logout-btn').click();await page.locator('#login-form').waitFor({state:'visible'});await page.reload();await page.locator('#login-form').waitFor({state:'visible'});assert.equal(await page.locator('#app-shell').isVisible(),false)});
 await pass('recovery link opens dedicated password form without deadlock',async()=>{await page.goto('about:blank');await page.goto('https://somma.test/#access_token='+jwt+'&refresh_token=qa-refresh-token-only&expires_in=3600&token_type=bearer&type=recovery');await page.locator('#recovery-form').waitFor({state:'visible'});await page.locator('#recovery-password').fill('Changed-QA-Only-Password!');await page.locator('#recovery-confirm').fill('Changed-QA-Only-Password!');await page.locator('#recovery-form button[type="submit"]').click();await page.locator('#app-shell').waitFor({state:'visible'});assert.equal(recoveryUpdates,1)});
 await pass('no unhandled JavaScript errors',async()=>assert.deepEqual(errors,[]));
 fs.writeFileSync(path.join(output,'somma_browser_results.json'),JSON.stringify({browser:await browser.version(),checks,errors,requests:requests.length,contributions:db.contributions.length,requestPosts},null,2));
 console.log('TOTAL '+checks.length+' browser checks');await browser.close();
}
main().catch(async e=>{console.error(e);console.error('API requests',requests);console.error('page errors',errors);if(debugPage){console.error('feedback',await debugPage.locator('#auth-feedback').textContent().catch(()=>''));console.error('body',await debugPage.locator('body').innerText().catch(()=>''));await debugPage.screenshot({path:path.join(output,'somma_failure.png'),fullPage:true}).catch(()=>{})}process.exit(1)});
