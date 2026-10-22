// Local logic and API-contract checks. No remote requests or mutations.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const projectRoot=path.resolve(__dirname,'..');
const root=process.env.SOMMA_APP_DIR?path.resolve(process.env.SOMMA_APP_DIR):(fs.existsSync(path.join(projectRoot,'frontend','index.html'))?path.join(projectRoot,'frontend'):projectRoot);
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name)}
function element(id='') { const classes=new Set();return {id,value:'',textContent:'',innerHTML:'',disabled:false,open:false,dataset:{},elements:[],classList:{add(...v){v.forEach(x=>classes.add(x))},remove(...v){v.forEach(x=>classes.delete(x))},toggle(v,flag){flag=flag===undefined?!classes.has(v):flag;flag?classes.add(v):classes.delete(v)},contains:v=>classes.has(v)},setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]},removeAttribute(k){delete this[k]},addEventListener(){},showModal(){this.open=true},close(){this.open=false}};}
const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id)};
const listeners={};const doc={hidden:false,querySelector:s=>get(s.slice(1)),querySelectorAll:()=>[],addEventListener:(n,fn)=>listeners[n]=fn};
const location={hash:'#home',pathname:'/',search:''};const entries=[{somma:true,view:'home',depth:0}];
const history={state:entries[0],replaceState(s,_,url){entries[entries.length-1]=this.state=s;location.hash=url.slice(url.indexOf('#'))},pushState(s,_,url){entries.push(this.state=s);location.hash=url.slice(url.indexOf('#'))},back(){if(entries.length>1)entries.pop();this.state=entries.at(-1);listeners.popstate?.()}};
const storage=new Map();const ctx={document:doc,location,history,navigator:{onLine:true},crypto:require('crypto').webcrypto,URLSearchParams,console,Date,Map,Set,HTMLFormElement:class{},Element:class{},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
let feedPageResolver, notificationPageResolver, profileCalls=0;
const mockBackend={
 feedPage:()=>new Promise(resolve=>{feedPageResolver=resolve}),
 notificationPage:()=>new Promise(resolve=>{notificationPageResolver=resolve}),
  publicProfiles:async ids=>{profileCalls++;return ids.map(id=>({id,public_name:'Old account'}))}
};
ctx.window={SOMMA_CONFIG:{},SommaBackend:mockBackend,scrollTo(){},addEventListener:(n,fn)=>listeners[n]=fn};
let src=fs.readFileSync(root+'/app.js','utf8');src=src.replace('  bootstrap();','  window.__test={state,parseCents,feeFor,summary,render,navigate,back,openContribution,clearAccount,saveIntent,effectiveStatus,errorMessage,readRoute,loadMoreFeed,loadMoreNotifications,loadHistory};');
vm.runInNewContext(src,ctx);const t=ctx.window.__test;
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const reqId='33333333-3333-4333-8333-333333333333',ownId='44444444-4444-4444-8444-444444444444';
const now=new Date().toISOString(),eightDaysAgo=new Date(Date.now()-8*86400000).toISOString();
const profile={id:uid,full_name:'Nome Completo Privado',public_name:'Nome P.',level:'initial',request_limit_cents:5000,period_limit_cents:15000,account_status:'active',created_at:eightDaysAgo};
const levels=[{code:'initial',display_name:'Inicial',request_limit_cents:5000,period_limit_cents:15000},{code:'special',display_name:'Especial',request_limit_cents:30000,period_limit_cents:null}];
t.state.session={user:{id:uid,email:'example@example.invalid',email_confirmed_at:now}};
t.state.data={profile,levels,requests:[],feedRequests:[],feedSummary:{active_count:0,completed_count:0,closest:null,almost:null},feedHasMore:false,feedCursor:null,activeOwn:null,metrics:{helped:0,contributed_cents:0,received_count:0,received_month_cents:0,next_request_at:null},notifications:[],notificationsHasMore:false,notificationsCursor:null,unreadCount:0,history:null};t.state.publicProfiles.set(uid,profile);t.state.publicProfiles.set(other,{public_name:'Pessoa A.',level:'initial'});
check('currency parsing rejects fractional cents and accepts Brazilian decimals',()=>{assert.equal(t.parseCents('5,45'),545);assert.equal(t.parseCents('1.005'),null);assert.equal(t.parseCents('-1'),null);assert.equal(t.parseCents('1e9'),null)});
check('fee matches integer cents ceiling',()=>{assert.equal(t.feeFor(500),45);assert.equal(t.feeFor(101),26);assert.equal(t.feeFor(0),0)});
check('empty home has real zero state without demo names',()=>{t.render();assert.match(get('app').innerHTML,/Ainda não há pedidos ativos/);assert.doesNotMatch(get('app').innerHTML,/Lucas|Paula|Rafael|demo/)});
const req={id:reqId,user_id:other,category:'Trabalho',description:'Uma necessidade de teste',goal_cents:5000,raised_cents:2000,helper_count:1,status:'active',duration_hours:48,created_at:now,expires_at:new Date(Date.now()+86400000).toISOString()};
const own={...req,id:ownId,user_id:uid,status:'completed',raised_cents:5000,created_at:eightDaysAgo};
t.state.data.requests=[req,own];t.state.data.feedRequests=[req];t.state.data.feedSummary={active_count:1,completed_count:1,closest:req,almost:null};t.state.data.metrics={helped:1,contributed_cents:2000,received_count:1,received_month_cents:5000,next_request_at:eightDaysAgo};t.state.data.contributions=[{id:'a',request_id:reqId,contributor_user_id:uid,amount_cents:1000,status:'simulated_confirmed',created_at:now,platform_fee_cents:70},{id:'b',request_id:reqId,contributor_user_id:uid,amount_cents:1000,status:'simulated_confirmed',created_at:now,platform_fee_cents:70},{id:'c',request_id:ownId,contributor_user_id:other,amount_cents:5000,status:'simulated_confirmed',created_at:now,platform_fee_cents:270}];
check('summary counts unique helped people and receipts separately',()=>{const s=t.summary();assert.equal(s.helped,1);assert.equal(s.receivedCount,1);assert.equal(s.contributed,2000);assert.equal(s.receivedMonth,5000);assert.equal(s.available,10000)});
check('expired request is excluded despite stale active status',()=>{assert.equal(t.effectiveStatus({...req,expires_at:eightDaysAgo}),'expired')});
check('all main view renderers and request steps execute',()=>{for(const view of ['home','help','history','profile','detail','notifications','request']){t.state.view=view;t.state.detailId=reqId;t.render();assert.ok(get('app').innerHTML.length>100)}for(const step of [1,2,3]){t.state.view='request';t.state.requestStep=step;t.state.draft={value:'50',category:'Trabalho',description:'Texto de teste',durationHours:24};t.render();assert.match(get('app').innerHTML,new RegExp('Etapa '+step+' de 3'))}});
check('private full name is absent from public card and details',()=>{t.state.view='help';t.render();assert.doesNotMatch(get('app').innerHTML,/Nome Completo Privado/);assert.match(get('app').innerHTML,/Pessoa A\./);t.state.view='detail';t.state.detailId=ownId;t.render();assert.doesNotMatch(get('app').innerHTML,/Nome Completo Privado/)});
check('special limit remains pending instead of unlimited',()=>{t.state.data.profile={...profile,period_limit_cents:null,level:'special'};t.state.view='request';t.render();assert.match(get('app').innerHTML,/limite mensal está pendente de análise/);assert.equal(t.summary().available,null);t.state.data.profile=profile});
check('native history returns to the actual origin with UUID string',()=>{t.navigate('help');t.navigate('detail',reqId);assert.equal(t.state.detailId,reqId);t.back();assert.equal(t.state.view,'help');t.openContribution(reqId);assert.equal(get('contribute-dialog').open,true);t.back();assert.equal(t.state.view,'help');assert.equal(get('contribute-dialog').open,false)});
check('logout clears all private view state',()=>{t.clearAccount();assert.equal(t.state.session,null);assert.equal(t.state.data,null);assert.equal(get('app').innerHTML,'')});

(async()=>{
// Regression: a page response from an old account must not mutate the new account.
const oldData={requests:[],feedRequests:[],feedHasMore:true,feedCursor:null,notifications:[],notificationsHasMore:true,notificationsCursor:null};
const newData={requests:[],feedRequests:[],feedHasMore:true,feedCursor:null,notifications:[],notificationsHasMore:true,notificationsCursor:null};
t.state.session={user:{id:uid}};t.state.generation=20;t.state.data=oldData;t.state.loading=false;
const feedTask=t.loadMoreFeed();
t.state.generation=21;t.state.session={user:{id:other}};t.state.data=newData;t.state.loading=true;
feedPageResolver({rows:[{id:reqId,user_id:uid}],hasMore:false,nextCursor:null});
await feedTask;
assert.equal(oldData.requests.length,0);assert.equal(newData.requests.length,0);assert.equal(profileCalls,0);assert.equal(t.state.loading,true);
checks++;console.log('PASS feed pagination ignores stale account response and preserves current loading state');

const oldNotifications={...oldData,notifications:[]},newNotifications={...newData,notifications:[]};
t.state.generation=30;t.state.session={user:{id:uid}};t.state.data=oldNotifications;t.state.loading=false;
const notificationTask=t.loadMoreNotifications();
t.state.generation=31;t.state.session={user:{id:other}};t.state.data=newNotifications;t.state.loading=true;
notificationPageResolver({rows:[{id:'old-notification',user_id:uid}],hasMore:false,nextCursor:null});
await notificationTask;
assert.equal(oldNotifications.notifications.length,0);assert.equal(newNotifications.notifications.length,0);assert.equal(t.state.loading,true);
checks++;console.log('PASS notification pagination ignores stale account response and preserves current loading state');

const ops=[];let insertError=null,found=null,findError=null;let method='select';
class Query{constructor(table){this.table=table;this.where={};this.kind='select'}select(){return this}insert(v){this.kind='insert';this.values=v;return this}update(v){this.kind='update';this.values=v;return this}eq(k,v){this.where[k]=v;return this}is(k,v){this.where[k]=v;return this}order(){return this}range(){return this}then(a,b){return this.finish().then(a,b)}single(){return this.finish()}maybeSingle(){return this.finish()}async finish(){ops.push({table:this.table,kind:this.kind,values:this.values,where:this.where});if(this.table==='contributions'){if(this.kind==='insert')return {data:insertError?null:found,error:insertError};return {data:found,error:findError}}return {data:this.values,error:null}}}
const client={from:table=>new Query(table)};const win={SOMMA_CONFIG:{supabaseUrl:'https://example.invalid',supabasePublishableKey:'public'},supabase:{createClient:()=>client}};
vm.runInNewContext(fs.readFileSync(root+'/backend.js','utf8'),{window:win,AbortController,fetch,clearTimeout,setTimeout});const api=win.SommaBackend;
const intent={key:'55555555-5555-4555-8555-555555555555',userId:uid,requestId:reqId,amountCents:500};
found={id:'response-id',contributor_user_id:uid,request_id:reqId,amount_cents:500,platform_fee_cents:45,idempotency_key:intent.key};insertError={code:'',message:'Failed to fetch'};
const recovered=await api.contribute(intent);assert.equal(recovered.id,'response-id');checks++;console.log('PASS lost response resolves exact original idempotency key');
assert.deepEqual(Object.keys(ops.find(op=>op.kind==='insert').values).sort(),['amount_cents','contributor_user_id','idempotency_key','request_id']);checks++;console.log('PASS contribution sends only granted fields and no client fee/status');
found={...found,amount_cents:600};await assert.rejects(api.contribute(intent),e=>e.code==='intent_conflict');checks++;console.log('PASS idempotency mismatch is rejected');
found=null;insertError={code:'P0001',message:'request_expired'};await assert.rejects(api.contribute(intent),e=>e.outcomeKnown===true);checks++;console.log('PASS definitive rejection permits correcting the intent');
insertError={code:'',message:'Failed to fetch'};findError={code:'',message:'Failed to fetch'};await assert.rejects(api.contribute(intent),e=>e.outcomeKnown!==true);checks++;console.log('PASS ambiguous response preserves the intent');
await api.createRequest({userId:uid,category:'Trabalho',description:'Teste',goalCents:5000,durationHours:24});const requestOp=ops.find(op=>op.table==='requests');assert.deepEqual(Object.keys(requestOp.values).sort(),['category','description','duration_hours','goal_cents','user_id']);checks++;console.log('PASS request relies on server timestamps and duration hours');
await api.saveName(uid,'Nome Atualizado');const profileOp=ops.find(op=>op.table==='profiles');assert.deepEqual(Object.keys(profileOp.values),['full_name']);checks++;console.log('PASS profile update cannot change level/limits/status');
await api.markNotificationsRead(uid);const notificationOp=ops.find(op=>op.table==='notifications');assert.deepEqual(Object.keys(notificationOp.values),['read_at']);assert.equal(notificationOp.where.user_id,uid);checks++;console.log('PASS notification marking updates only own read timestamp');
console.log('TOTAL '+checks+' checks');
})().catch(error=>{console.error(error);process.exitCode=1});
