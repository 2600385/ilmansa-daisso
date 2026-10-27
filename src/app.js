(function(){
"use strict";

/* =====================================================================
   연결 설정: Supabase의 Project URL과 Publishable key를 넣으세요.
   비워두면 저장되지 않는 미리보기 모드로 돌아갑니다.
   ===================================================================== */
var SUPABASE_URL = 'https://ahyeaqwdwawnxfssokuv.supabase.co';
var SUPABASE_KEY = 'sb_publishable_OUtfwHh2ROmroJP-YrBh0Q_JZZFfQtg';

var LIVE = !!(SUPABASE_URL && SUPABASE_KEY && window.supabase);
var EMAIL_DOMAIN = '@daisso.internal';

/* ---------- 고정 분류 ---------- */
var PLACES=[{id:'new',label:'신규처 제안',c:'#C77D9B'},{id:'keep',label:'기존처 관리',c:'#4C9F86'}];
var NEEDS=[{id:'all',label:'전체',c:'#8C99B3'},{id:'brochure',label:'브로셔',c:'#E0A15E'},{id:'site',label:'URL',c:'#4FA3B8'},{id:'edu',label:'교육자료',c:'#4C9F86'},{id:'notice',label:'공문',c:'#8D72C9'},{id:'tool',label:'툴',c:'#5C7FC4'},{id:'contact',label:'문의처',c:'#C77D9B',phone:true}];
/* MR은 사번만으로 로그인: 내부 비밀번호를 사번에서 만들어 씀. 관리자는 따로 비밀번호를 둠 */
function mrPw(emp){return 'daisso-'+String(emp||'').trim().toLowerCase();}
var KIND={tool:'툴',site:'URL',brochure:'브로셔',notice:'공문',edu:'교육자료'};
var STAGES=[{id:'s1',label:'초기 제안',no:'1단계'},{id:'s2',label:'기초 셋팅',no:'2단계'},{id:'s3',label:'일만사 시작·청구',no:'3단계'}];
var REQ_STATUS=['접수','만드는 중','올림'];

/* =====================================================================
   데이터 창구: 운영(Supabase) / 미리보기(메모리) 두 가지가 같은 모양
   ===================================================================== */
/* 교육자료는 DB의 종류 목록을 바꾸지 않으려고 kind='notice' + places에 '_edu'로 저장합니다 */
var EDU_TAG='_edu';
function toTool(r){var pl=r.places||[],edu=pl.indexOf(EDU_TAG)>=0;return {id:r.id,name:r.name,kind:edu?'edu':r.kind,tags:pl.filter(function(x){return x!==EDU_TAG;}),month:!!r.is_month,doctor:!!r.for_doctor,url:r.url||'',file:r.file_path||'',desc:r.description||'',pub:r.doctor_desc||'',by:r.made_by||'',sort:r.sort||0,active:r.active!==false};}
function fromTool(t){var edu=t.kind==='edu';return {name:t.name,kind:edu?'notice':t.kind,places:edu?t.tags.concat([EDU_TAG]):t.tags,is_month:t.month,for_doctor:t.doctor,url:t.url||null,file_path:t.file||null,description:t.desc,doctor_desc:t.pub,made_by:t.by,sort:t.sort||0,active:t.active!==false,updated_at:new Date().toISOString()};}
function toScript(r){return {id:r.id,stage:r.stage,type:r.type,title:r.title,text:r.body||'',tool:r.tool_id||null,sort:r.sort||0};}
function toContact(r){return {id:r.id,topic:r.topic,dept:r.dept||'',tel:r.tel||'',tags:r.places||[],sort:r.sort||0};}
function must(res){if(res.error)throw res.error;return res.data;}

var live={
  sb:null,
  init:function(){
    var store={
      getItem:function(k){try{return sessionStorage.getItem(k)||localStorage.getItem(k);}catch(e){return null;}},
      setItem:function(k,v){try{(live.keep?localStorage:sessionStorage).setItem(k,v);}catch(e){}},
      removeItem:function(k){try{localStorage.removeItem(k);sessionStorage.removeItem(k);}catch(e){}}
    };
    try{live.keep=localStorage.getItem('daisso_keep')==='1';}catch(e){live.keep=false;}
    live.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{storage:store,persistSession:true,autoRefreshToken:true}});
  },
  session:async function(){var r=await live.sb.auth.getSession();return r.data.session?r.data.session.user.id:null;},
  signIn:async function(emp,pw,keep){
    live.keep=!!keep;try{localStorage.setItem('daisso_keep',keep?'1':'0');}catch(e){}
    var r=await live.sb.auth.signInWithPassword({email:emp.trim().toLowerCase()+EMAIL_DOMAIN,password:pw});
    if(r.error){var bad=r.error.status===400||/invalid/i.test(r.error.message||'');var er=new Error(bad?'bad':'down');er.code=bad?'bad':'down';throw er;}
    return r.data.user.id;
  },
  signOut:async function(){await live.sb.auth.signOut();},
  profile:async function(uid){return must(await live.sb.from('profiles').select('*').eq('id',uid).single());},
  loadAll:async function(){
    var r=await Promise.all([
      live.sb.from('tools').select('*').order('sort').order('created_at'),
      live.sb.from('scripts').select('*').order('stage').order('sort'),
      live.sb.from('contacts').select('*').order('sort'),
      live.sb.from('favorites').select('tool_id')
    ]);
    return {tools:must(r[0]).map(toTool),scripts:must(r[1]).map(toScript),contacts:must(r[2]).map(toContact),favs:must(r[3]).map(function(x){return x.tool_id;})};
  },
  setFav:async function(id,on){if(on)must(await live.sb.from('favorites').insert({tool_id:id}));else must(await live.sb.from('favorites').delete().eq('tool_id',id));},
  track:function(type,target){live.sb.from('events').insert({type:type,target:target||null}).then(function(){});},
  sendRequest:async function(body,place){must(await live.sb.from('requests').insert({body:body,place:place}));},
  fileUrl:async function(path){var r=must(await live.sb.storage.from('files').createSignedUrl(path,3600));return r.signedUrl;},
  saveTool:async function(id,t,file){
    if(file){var path=Date.now()+'-'+file.name.replace(/[^\w.\-]+/g,'_');must(await live.sb.storage.from('files').upload(path,file,{upsert:false}));t.file=path;t.url='';}
    var row=fromTool(t);
    if(id)return toTool(must(await live.sb.from('tools').update(row).eq('id',id).select().single()));
    return toTool(must(await live.sb.from('tools').insert(row).select().single()));
  },
  deleteTool:async function(id){must(await live.sb.from('tools').delete().eq('id',id));},
  saveScript:async function(id,m){var row={stage:m.stage,type:m.type,title:m.title,body:m.text,tool_id:m.tool||null,sort:m.sort||0};
    if(id)return toScript(must(await live.sb.from('scripts').update(row).eq('id',id).select().single()));
    return toScript(must(await live.sb.from('scripts').insert(row).select().single()));},
  deleteScript:async function(id){must(await live.sb.from('scripts').delete().eq('id',id));},
  saveContact:async function(id,c){var row={topic:c.topic,dept:c.dept,tel:c.tel,places:c.tags,sort:c.sort||0};
    if(id)return toContact(must(await live.sb.from('contacts').update(row).eq('id',id).select().single()));
    return toContact(must(await live.sb.from('contacts').insert(row).select().single()));},
  deleteContact:async function(id){must(await live.sb.from('contacts').delete().eq('id',id));},
  stats:async function(){return must(await live.sb.rpc('admin_stats',{p_from:null}));},
  requests:async function(){return must(await live.sb.from('requests').select('id,body,place,status,office,division,created_at').order('created_at',{ascending:false}));},
  setReqStatus:async function(id,s){must(await live.sb.from('requests').update({status:s}).eq('id',id));},
  members:async function(){return must(await live.sb.from('profiles').select('emp_no,name,division,office,role').order('office').order('name'));},
  upsertMember:async function(m){must(await live.sb.rpc('admin_upsert_member',{p_emp_no:m.emp_no,p_name:m.name,p_division:m.division,p_office:m.office,p_role:m.role,p_password:m.password||null}));},
  deleteMember:async function(emp){must(await live.sb.rpc('admin_delete_member',{p_emp_no:emp}));},
  changePassword:async function(pw){var r=await live.sb.auth.updateUser({password:pw});if(r.error)throw r.error;}
};

/* 미리보기: 저장하지 않고 메모리에서만 동작 */
var demo=(function(){
  var n=0;function nid(){return 'd'+(++n);}
  var tools=[
    {name:'일만사 수익 시뮬레이터',kind:'tool',tags:['new'],month:true,doctor:true,by:'이혜선 CM',desc:'환자 수를 넣으면 일만사 예상 수익과 혈액검사 패키지 금액을 바로 계산합니다.',pub:'우리 병원 환자 수로 일만사 예상 수익을 계산해 봅니다.'},
    {name:'일만사 등록 이지플래너',kind:'tool',tags:['new','keep'],doctor:true,by:'이혜선 CM',desc:'원장님께 일만사 수가 수입을 한눈에 보여주는 상담용 화면입니다.',pub:'일만사 수가와 등록 절차를 한눈에 확인합니다.'},
    {name:'검진센터 제안 브로셔',kind:'brochure',tags:['new'],month:true,doctor:true,by:'이혜선 CM',desc:'병원명과 담당자명을 넣으면 거래처 맞춤 제안 포스터가 만들어집니다.',pub:'병원에 맞춘 일만사 제안서입니다.'},
    {name:'AX004 청구증대 툴',kind:'tool',tags:['keep'],doctor:false,by:'이혜선 CM',desc:'환자는 많은데 교육상담 청구가 낮은 거래처를 찾아냅니다.',pub:''},
    {name:'청구현황 대시보드',kind:'tool',tags:['keep'],doctor:false,by:'이혜선 CM',desc:'사무소별 청구 순위와 월별 추이를 봅니다.',pub:''},
    {name:'예시 · 일만사란? (신규 입사자용)',kind:'edu',tags:[],doctor:true,by:'[작성자]',desc:'교육 슬라이드(PPT·PDF)가 들어가는 자리 예시입니다.',pub:'일만사가 무엇인지 한눈에 정리한 자료입니다.'}
  ].map(function(t,i){t.id=nid();t.sort=i;t.url='';t.file='';t.active=true;return t;});
  function tid(name){for(var i=0;i<tools.length;i++)if(tools[i].name===name)return tools[i].id;return null;}
  var scripts=[['s1','base','첫 인사와 일만사 소개','검진센터 제안 브로셔'],['s1','base','예상 수익 보여드리기','일만사 수익 시뮬레이터'],['s1','obj','인력이 없어요',null],['s1','obj','수익이 얼마나 돼요?','일만사 수익 시뮬레이터'],['s1','obj','환자들이 싫어해요',null],
    ['s2','base','등록 절차 안내','일만사 등록 이지플래너'],['s2','base','웰체크 셋팅 안내',null],['s2','obj','절차가 복잡해 보여요','일만사 등록 이지플래너'],
    ['s3','base','첫 청구 안내',null],['s3','base','공복검사 루틴 안내',null],['s3','obj','청구가 잘 안 돼요','AX004 청구증대 툴']]
    .map(function(x,i){return {id:nid(),stage:x[0],type:x[1],title:x[2],text:'[문구 입력]',tool:x[3]?tid(x[3]):null,sort:i};});
  var contacts=[['청구 기준·수가 문의',['keep']],['일만사 사업 운영 문의',['new','keep']],['웰체크 셋팅·시스템 문의',['new']]]
    .map(function(x,i){return {id:nid(),topic:x[0],dept:'[부서명]',tel:'[대표번호]',tags:x[1],sort:i};});
  var favs={},log=[],reqs=[],me=null;
  var members=[];
  function ok(v){return Promise.resolve(v);}
  function upd(list,id,v){for(var i=0;i<list.length;i++)if(list[i].id===id){Object.assign(list[i],v);return list[i];}v.id=nid();list.push(v);return v;}
  return {
    init:function(){},
    session:function(){return ok(null);},
    signIn:function(emp,pw,keep,asAdmin){me={emp_no:emp||'000000',name:'[이름]',division:'[사업부]',office:'경인1사무소',role:asAdmin?'admin':'mr'};members=[me];return ok('demo');},
    signOut:function(){return ok();},
    profile:function(){return ok(me);},
    loadAll:function(){return ok({tools:tools.slice(),scripts:scripts.slice(),contacts:contacts.slice(),favs:Object.keys(favs)});},
    setFav:function(id,on){if(on)favs[id]=1;else delete favs[id];return ok();},
    track:function(type,target){log.push({type:type,target:target});},
    sendRequest:function(body,place){reqs.unshift({id:nid(),body:body,place:place,status:'접수',office:'경인1사무소',division:'[사업부]',created_at:new Date().toISOString()});return ok();},
    fileUrl:function(){return ok('');},
    saveTool:function(id,t){if(!id)t.sort=tools.length;return ok(upd(tools,id,t));},
    deleteTool:function(id){tools=tools.filter(function(t){return t.id!==id;});return ok();},
    saveScript:function(id,m){return ok(upd(scripts,id,m));},
    deleteScript:function(id){scripts=scripts.filter(function(m){return m.id!==id;});return ok();},
    saveContact:function(id,c){return ok(upd(contacts,id,c));},
    deleteContact:function(id){contacts=contacts.filter(function(c){return c.id!==id;});return ok();},
    stats:function(){
      var agg={};
      log.forEach(function(e){var k=e.type+'|'+(e.target||'');agg[k]=agg[k]||{target:e.target||null,type:e.type,division:'[사업부]',office:'경인1사무소',cnt:0,people:1};agg[k].cnt++;});
      var rows=Object.keys(agg).map(function(k){return agg[k];});
      if(log.length)rows.push({target:null,type:'any',division:'[사업부]',office:'경인1사무소',cnt:log.length,people:1});
      Object.keys(favs).forEach(function(id){rows.push({target:id,type:'fav_now',division:'[사업부]',office:'경인1사무소',cnt:1,people:1});});
      return ok(rows);
    },
    requests:function(){return ok(reqs);},
    setReqStatus:function(id,s){reqs.forEach(function(r){if(r.id===id)r.status=s;});return ok();},
    members:function(){return ok(members);},
    upsertMember:function(m){var f=members.filter(function(x){return x.emp_no===m.emp_no;})[0];if(f)Object.assign(f,m);else members.push({emp_no:m.emp_no,name:m.name,division:m.division,office:m.office,role:m.role});return ok();},
    deleteMember:function(emp){members=members.filter(function(x){return x.emp_no!==emp;});return ok();},
    changePassword:function(){return ok();}
  };
})();
var api=LIVE?live:demo;

/* =====================================================================
   상태
   ===================================================================== */
var S={printSel:{},printUrl:'',simple:false,boot:true,uid:null,me:null,mode:'prep',page:'tools',place:'none',need:'none',q:'',favOnly:false,
  tools:[],scripts:[],contacts:[],favs:{},basket:[],basketOpen:false,hospital:'',present:-1,stage:'s1',
  adminTab:'tools',adminArea:'stats',scope:'all',stats:null,reqs:null,members:null,modal:null,edit:null,toast:'',busy:false,loginErr:''};
var toastTimer=null;
function isAdmin(){return !!(S.me&&S.me.role==='admin');}
function track(type,target){try{api.track(type,target);}catch(e){}}

/* ---------- 도우미 ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function byId(id){for(var i=0;i<S.tools.length;i++){if(S.tools[i].id===id)return S.tools[i];}return null;}
function areaLabel(id){if(id==='month')return '이달의 주요 이슈';for(var i=0;i<PLACES.length;i++){if(PLACES[i].id===id)return PLACES[i].label;}return '';}
function inPlace(t,p){if(p==='month')return !!t.month;return p==='none'||p==='all'||t.kind==='edu'||t.tags.indexOf(p)>=0;}
function inNeed(t,n){return n==='none'||n==='all'||t.kind===n;}
function say(msg){S.toast=msg;clearTimeout(toastTimer);toastTimer=setTimeout(function(){S.toast='';render();},2800);}
function fail(e){console.error(e);say((e&&e.message)||'처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');render();}
function activeTools(){return S.tools.filter(function(t){return t.active;});}
function cleanName(n){return n.replace(/^예시 · /,'');}
var I={
  search:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5A6480" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>',
  star:'<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  bag:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  lock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  screen:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  up:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  x:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  arrow:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  phone:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  print:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
  copy:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>'
};
/* 시그니처 마크: 주황 네모 + 熊 (현황판과 같은 모양) */
function signMark(){return '<svg width="40" height="40" viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="22" fill="#FFFFFF" stroke="#C9D2E3" stroke-width="6"/><text x="50" y="68" text-anchor="middle" font-family="serif" font-size="54" font-weight="900" fill="#F47920">熊</text></svg>';}
function logo(){return '<span aria-hidden="true">일만사 다<span class="ss"><span class="top">있</span><span class="bot">있</span></span>소</span>';}
function audTag(t){return t.doctor?'<span class="tag a-doc">'+I.screen+'원장님 화면용</span>':'<span class="tag a-in">'+I.lock+'내부용</span>';}
function placeOptions(sel){return PLACES.filter(function(p){return p.id!=='all';}).map(function(a){return '<label class="chk"><input type="checkbox" name="tg" value="'+a.id+'"'+(sel.indexOf(a.id)>=0?' checked':'')+'> '+a.label+'</label>';}).join('');}

/* =====================================================================
   화면
   ===================================================================== */
function vLogin(){
  return '<div class="login wrap"><form id="loginForm" novalidate>'+
    '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:6px">'+
      '<h1 class="logo" aria-label="일만사 다있소">'+logo()+'</h1><div class="rainbow" aria-hidden="true"></div>'+
      '<p style="margin:0;font-size:15px;color:var(--muted)"><span class="hl">툴</span> 찾느라 <span class="hl">툴툴</span>대던 날은 이제 끝!</p></div>'+
    '<div class="fg"><label class="lb" for="empId">사번</label><input id="empId" class="field" inputmode="numeric" autocomplete="username" placeholder="사번을 입력하세요"></div>'+
    '<label class="chk"><input id="keep" type="checkbox" checked> 이 기기에서 로그인 유지</label>'+
    (LIVE?'':'<label class="chk"><input id="asAdmin" type="checkbox"> 관리자 화면까지 미리보기 <span class="preview-flag">미리보기 전용</span></label>')+
    (S.loginErr?'<div role="alert" style="color:var(--warn);font-size:14px;font-weight:700;text-align:center">'+esc(S.loginErr)+'</div>':'')+
    '<button class="btn btn-primary" type="submit" style="min-height:54px;font-size:19px"'+(S.busy?' disabled':'')+'>'+(S.busy?'들어가는 중…':'들어가기')+'</button>'+
    '<p style="margin:4px 0 0;font-size:14px;color:var(--sub);text-align:center">일만사·웰체크 업무에 필요한 자료, 여기서 바로 찾아 쓰세요.</p>'+
    (LIVE?'':'<div style="font-size:12px;color:var(--warn);text-align:center">미리보기 모드: 아무 사번이나 넣어도 들어가지고, 저장되지 않습니다.</div>')+
  '</form></div>';
}

function vHeader(){
  var clinic=S.mode==='clinic',onAdmin=S.page==='admin';
  var h='<header class="top"><div class="wrap"><div class="top-in">';
  h+='<button type="button" class="brand" data-act="home" aria-label="처음 화면으로">'+signMark()+'<span><span class="bt">'+'일만사 다있소'+'</span><span class="bs">Daewoong</span></span></button>';
  h+='<div class="top-r">'+(onAdmin?'':clinic?clinicCtrls():modeSwitch());
  if(!clinic){
    h+='<span class="who"><span style="font-size:15px;font-weight:700;margin:0 4px">'+esc(S.me&&S.me.name||'')+' 님</span>'+
       (isAdmin()?'<button type="button" class="btn '+(onAdmin?'btn-primary':'btn-line')+'" data-act="page" data-v="'+(onAdmin?'tools':'admin')+'" style="min-height:38px">'+(onAdmin?'관리자 페이지 닫기':'관리자')+'</button>':'')+
       '<button type="button" class="btn btn-ghost" data-act="logout">로그아웃</button></span>';
  }
  return h+'</div></div></div></header>';
}
/* 거래처 제안서 모드의 위쪽 버튼 */
function clinicCtrls(){
  return '<div class="cl-ctrls">'+
    '<button type="button" class="btn btn-line'+(S.simple?' sw-on':'')+'" data-act="simple" aria-pressed="'+S.simple+'"><span class="knob" aria-hidden="true"></span>심플 모드</button>'+
    '<button type="button" class="btn btn-line" data-act="bkEdit">제안서 수정</button>'+
    '<button type="button" class="btn btn-primary" data-act="endVisit">제안 마치기</button></div>';
}
function modeSwitch(){
  var clinic=S.mode==='clinic';
  return '<div class="mode" role="group" aria-label="화면 모드">'+
    '<button type="button" data-act="mode" data-v="prep" class="'+(clinic?'':'on')+'" aria-pressed="'+!clinic+'">혼자 자료 찾는 중</button>'+
    '<button type="button" data-act="mode" data-v="clinic" class="'+(clinic?'on':'')+'" aria-pressed="'+clinic+'">거래처 제안서 모드</button></div>';
}
function navBtn(id,label){return '<button type="button" data-act="page" data-v="'+id+'" class="'+(S.page===id?'on':'')+'" aria-current="'+(S.page===id?'page':'false')+'">'+label+'</button>';}

function vTools(){
  var q=S.q.trim().toLowerCase();
  var idle=S.place==='none'&&S.need==='none'&&!q&&!S.favOnly;
  var h='<div class="page wrap">';
  h+='<section class="hero"><h1 class="logo" aria-label="일만사 다있소">'+logo()+'</h1><div class="rainbow" aria-hidden="true"></div>'+
     '<p><strong style="color:var(--ink)"><span class="hl">툴</span> 찾느라 <span class="hl">툴툴</span>대던 날은 이제 끝!</strong><span class="sub"><br>신규처 어프로치부터 기존처 관리까지, 매달 업데이트되는 일만사·웰체크 자료를 한곳에 모았습니다.<br>필요할 때 바로 꺼내 쓰세요.</span></p>'+
     '<div class="search"><label for="q" class="sr">툴 검색</label>'+I.search+'<input id="q" type="search" value="'+esc(S.q)+'" placeholder="툴 이름이나 키워드 (예: 시뮬레이션, 검체위수탁, 기관신고)"></div></section>';
  h+='<section class="blk"><div class="filters"><div class="fgroup place" role="group" aria-label="어디 가세요?"><span class="flab">어디 가세요?</span>';
  PLACES.forEach(function(p){var on=p.id===S.place&&!S.favOnly;
    var n=activeTools().filter(function(t){return inPlace(t,p.id);}).length;
    h+='<button type="button" class="tab'+(on?' on':'')+'" data-act="place" data-v="'+p.id+'" aria-pressed="'+on+'"><span class="dot" style="background:'+p.c+'" aria-hidden="true"></span>'+p.label+'<span class="n">'+n+'</span></button>';});
  var mOn=S.place==='month'&&!S.favOnly,mN=activeTools().filter(function(t){return t.month;}).length;
  h+='</div><button type="button" class="issue-chip'+(mOn?' on':'')+'" data-act="place" data-v="month" aria-pressed="'+mOn+'"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg>이달의 주요 이슈<span class="n">'+mN+'</span></button>';
  h+='<div class="fgroup" role="group" aria-label="뭐가 필요하세요?"><span class="flab">뭐가 필요하세요?</span>';
  NEEDS.forEach(function(n){var on=n.id===S.need&&!S.favOnly;
    var cnt=n.id==='script'?S.scripts.length:n.id==='contact'?S.contacts.length:activeTools().filter(function(t){return inNeed(t,n.id)&&inPlace(t,S.place);}).length;
    h+='<button type="button" class="tab'+(on?' on':'')+'" data-act="need" data-v="'+n.id+'" aria-pressed="'+on+'">'+(n.phone?I.phone:'<span class="dot" style="background:'+n.c+'" aria-hidden="true"></span>')+n.label+'<span class="n">'+cnt+'</span></button>';});
  h+='</div></div>';
  h+='<div id="results" class="results">'+vResults()+'</div>';
  h+='</section>';
  h+='<section class="req"><div><div style="font-weight:700">찾는 툴이 없나요?</div><div class="muted" style="font-size:14px">필요한 툴이나 자료를 알려주시면 다음 달 공략 툴로 만들어 올려드립니다.</div></div>'+
     '<button type="button" class="btn btn-primary" data-act="openReq">툴 요청하기</button></section>';
  h+='</div>';
  return h+vBasketBar();
}
function vResults(){
  var q=S.q.trim().toLowerCase(),h='';
  var idle=S.place==='none'&&S.need==='none'&&!q&&!S.favOnly;
  var list=null,label='';
  if(!idle&&!(!S.favOnly&&(S.need==='script'||S.need==='contact'))){
    list=activeTools().filter(function(t){
      var hit=!q||(t.name+' '+t.desc+' '+t.by).toLowerCase().indexOf(q)>=0;
      if(S.favOnly)return !!S.favs[t.id]&&hit;
      return inPlace(t,S.place)&&inNeed(t,S.need)&&hit;
    }).sort(function(a,b){return (b.month?1:0)-(a.month?1:0)||a.sort-b.sort;});
    var parts=[];
    if(S.favOnly)parts.push('즐겨찾기한 툴');
    else{if(S.place!=='none')parts.push(areaLabel(S.place));if(S.need!=='none')parts.push(S.need==='all'?'전체':KIND[S.need]);if(!parts.length)parts.push('검색 결과');}
    label=esc(parts.join(' · '))+(q?' · "'+esc(S.q.trim())+'" 검색':'')+' · '+list.length+'개';
  }
  h+='<div class="list-h"><span class="muted" style="font-size:14px">'+label+'</span>'+
     '<button type="button" class="simple-sw fav'+(S.favOnly?' on':'')+'" data-act="favOnly" aria-pressed="'+S.favOnly+'"><span class="st" aria-hidden="true">★</span>즐겨찾기만<span class="knob" aria-hidden="true"></span></button></div>';
  if(idle){
    h+='<div class="prompt"><b>가는 곳이나 필요한 걸 골라주세요</b><span class="muted">하나만 골라도 되고, 둘 다 고르면 딱 맞는 것만 꺼내드려요.</span></div>';
  }else if(!S.favOnly&&S.need==='script'){
    h+=vScripts();
  }else if(!S.favOnly&&S.need==='contact'){
    h+=vContacts();
  }else if(list.length){h+='<div class="grid">'+list.map(vCard).join('')+'</div>';}
  else{h+='<div class="prompt"><span>'+(S.favOnly?'아직 즐겨찾기한 툴이 없어요. 카드의 별을 눌러 담아보세요.':'찾는 툴이 아직 없네요. 아래에서 요청해 주세요.')+'</span></div>';}
  return h;
}
function vCard(t){
  var fav=!!S.favs[t.id],inB=S.basket.indexOf(t.id)>=0;
  var h='<article class="card"><div class="card-h"><div class="tags"><span class="tag k-'+t.kind+'">'+KIND[t.kind]+'</span>'+audTag(t)+(t.month?'<span class="tag a-issue">이달의 주요 이슈</span>':'')+'</div>'+
    '<button type="button" class="star'+(fav?' on':'')+'" data-act="fav" data-v="'+t.id+'" aria-pressed="'+fav+'" aria-label="'+esc(t.name)+' 즐겨찾기">'+I.star+'</button></div>'+
    '<h3>'+esc(t.name)+'</h3><p>'+esc(t.desc)+'</p><div class="meta">'+esc(t.tags.map(areaLabel).join(' · '))+' · 만든 사람 '+esc(t.by)+'</div><div class="acts">'+
    '<button type="button" class="btn btn-primary" data-act="open" data-v="'+t.id+'">꺼내 쓰기</button>';
  if(t.doctor){h+='<button type="button" class="btn '+(inB?'btn-gold on':'btn-line')+'" data-act="basket" data-v="'+t.id+'" aria-pressed="'+inB+'">'+I.bag+(inB?'담았어요':'제안서에 담기')+'</button>';}
  h+='</div>';
  if(!t.doctor){h+='<div class="note-in">내부용 자료라 거래처 모드에는 나오지 않아요</div>';}
  return h+'</article>';
}
/* 제안서: 담았을 때만 아래 막대로 나타남. ① 이름 ② 이름 … */
function vBasketBar(){
  var n=S.basket.length;if(!n)return '';
  var h='<div class="basket-bar"><div class="wrap"><div class="bk-line">'+
    '<span class="bk-title">'+I.bag+'제안 바구니 <span class="bk-cnt">'+n+'</span></span><ol class="bk-items">';
  S.basket.forEach(function(id,i){var t=byId(id);if(!t)return;
    h+='<li class="bk-item"><span class="num">'+(i+1)+'</span><span class="nm">'+esc(cleanName(t.name))+'</span>'+
      (i>0?'<button type="button" class="mini" data-act="bkUp" data-v="'+i+'" aria-label="앞으로">'+I.up+'</button>':'')+
      '<button type="button" class="mini" data-act="basket" data-v="'+id+'" aria-label="빼기">'+I.x+'</button></li>';});
  h+='</ol><div class="bk-acts"><button type="button" class="btn btn-ghost" data-act="basketClear">비우기</button>'+
    '<button type="button" class="btn btn-ghost" data-act="printOpen">'+I.print+'인쇄</button>'+
    '<button type="button" class="go-link" data-act="mode" data-v="clinic">제안하러 가기 '+I.arrow+'</button></div></div></div></div>';
  return h;
}
function vContacts(){
  var list=S.contacts.filter(function(c){return inPlace(c,S.place);});
  var h='<div class="inbanner">'+I.lock+'내부용 · 담당자 개인 번호 대신 부서와 대표번호만 넣습니다.</div>';
  if(!list.length)return h+'<div class="prompt muted">등록된 문의처가 없어요.</div>';
  h+='<div class="tbl-box"><table style="min-width:520px"><thead><tr><th>이럴 때</th><th>부서</th><th>연락처</th></tr></thead><tbody>';
  list.forEach(function(c){h+='<tr><td style="font-weight:700">'+esc(c.topic)+'</td><td>'+esc(c.dept)+'</td><td style="user-select:all">'+esc(c.tel)+'</td></tr>';});
  return h+'</tbody></table></div>';
}
function vScripts(){
  var stages=STAGES.filter(function(s){return S.place==='new'?s.id!=='s3':S.place==='keep'?s.id==='s3':true;});
  var st=stages.some(function(s){return s.id===S.stage;})?S.stage:stages[0].id;
  var base=S.scripts.filter(function(m){return m.stage===st&&m.type==='base';});
  var obj=S.scripts.filter(function(m){return m.stage===st&&m.type==='obj';});
  var h='<div class="inbanner">'+I.lock+'내부용 · 거래처 모드에서는 보이지 않아요. 단계를 고르면 그 단계의 멘트와 원장님 반응별 대응 멘트가 나옵니다.</div>'+
    '<div class="stage" role="group" aria-label="단계" style="grid-template-columns:repeat('+stages.length+',minmax(0,1fr))">';
  stages.forEach(function(s){h+='<button type="button" data-act="stage" data-v="'+s.id+'" class="'+(s.id===st?'on':'')+'" aria-pressed="'+(s.id===st)+'"><small>'+s.no+'</small>'+s.label+'</button>';});
  h+='</div>';
  h+='<h3 style="margin:8px 0 0;font-size:18px">이 단계에서 하는 말</h3><div class="sc-list">'+(base.length?base.map(vScript).join(''):'<div class="prompt muted">이 단계의 멘트는 아직 없어요.</div>')+'</div>';
  h+='<h3 style="margin:8px 0 0;font-size:18px">원장님이 이렇게 말하면</h3><div class="sc-list">'+(obj.length?obj.map(vScript).join(''):'<div class="prompt muted">이 단계의 대응 멘트는 아직 없어요.</div>')+'</div>';
  return h;
}
function vScript(m){
  var t=m.tool?byId(m.tool):null;
  return '<article class="sc">'+(m.type==='obj'?'<div class="q">"'+esc(m.title)+'"</div>':'<h3>'+esc(m.title)+'</h3>')+
    '<blockquote id="sc-'+m.id+'">'+esc(m.text)+'</blockquote><div class="acts">'+
    '<button type="button" class="btn btn-line" data-act="copy" data-v="'+m.id+'">'+I.copy+'복사</button>'+
    (t&&t.active?'<button type="button" class="btn btn-primary" data-act="open" data-v="'+t.id+'">'+esc(t.name)+' 열기</button>':'')+
    '</div></article>';
}

/* 거래처 모드 */
function hospTitle(){return (S.hospital.trim()||'OOO의원')+' 원장님께 드리는 제안';}
function clinicList(){
  var ids=S.basket.length?S.basket:activeTools().filter(function(t){return t.doctor;}).map(function(t){return t.id;});
  return ids.map(byId).filter(function(t){return t&&t.doctor&&t.active;});
}
function vClinic(){
  var list=clinicList();
  var h='<div class="clinic"><div class="wrap">';
  if(!S.simple)h+='<div class="clinic-hero">'+
    '<div class="title-row"><h1 id="hosp-title">'+esc(hospTitle())+'</h1><button type="button" class="btn btn-line" data-act="printOpen">'+I.print+'인쇄</button></div>'+
    '<div class="hosp"><label for="hosp" class="muted" style="font-size:14px">병원명</label><input id="hosp" value="'+esc(S.hospital)+'" placeholder="병원명을 입력하세요" autocomplete="off"><span class="muted" style="font-size:13px">이 화면에만 보이고 저장되지 않아요</span></div>'+
    '</div>';
  if(!S.basket.length&&!S.simple){h+='<p class="muted" style="margin:20px 0 0;font-size:14px">담은 툴이 없어서 원장님 화면용 자료를 모두 보여드려요. 준비 화면에서 "제안서에 담기"를 누르면 그 순서대로 나옵니다.</p>';}
  h+='<div class="steps">';
  list.forEach(function(t,i){
    h+='<button type="button" class="step" data-act="present" data-v="'+i+'"><span class="no">'+String(i+1).padStart(2,'0')+'</span><h2>'+esc(cleanName(t.name))+'</h2><p>'+esc(t.pub||t.desc)+'</p><span class="go">열기 '+I.arrow+'</span></button>';
  });
  h+='</div>';
  if(list.length)h+='<p class="cl-hint">진료실에 들어가기 전, 01번 자료를 눌러 제안 화면을 열어두세요. 다음 자료는 "다음"으로 넘기면 됩니다.</p>';
  h+='</div></div>';
  if(S.present>=0&&list[S.present]){
    var t=list[S.present],i=S.present;
    h+='<div class="present" role="dialog" aria-modal="true" aria-label="'+esc(t.name)+'"><div class="wrap"><div class="present-bar">'+
      '<div style="font-weight:700;min-width:0">'+(i+1)+' / '+list.length+' · '+esc(cleanName(t.name))+'</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      (S.presentUrl?'<a class="btn btn-line" href="'+esc(S.presentUrl)+'" target="_blank" rel="noopener">새 창으로</a>':'')+
      '<button type="button" class="btn btn-line" data-act="prev"'+(i===0?' disabled':'')+'>이전</button>'+
      '<button type="button" class="btn btn-primary" data-act="next"'+(i===list.length-1?' disabled':'')+'>다음</button>'+
      '<button type="button" class="icon-btn" data-act="closePresent" aria-label="닫기">'+I.x+'</button></div></div></div>';
    h+='<div class="pv"><nav class="rail" aria-label="제안 순서">';
    list.forEach(function(x,j){h+='<button type="button" class="rail-i'+(j===i?' on':'')+'" data-act="jump" data-v="'+j+'" aria-current="'+(j===i?'step':'false')+'"><span class="rn">'+(j+1)+'</span><span class="rl">'+esc(cleanName(x.name))+'</span></button>';});
    h+='</nav><div class="page-turn '+(S.flip==='prev'?'from-r':'from-l')+(S.flipAnim?' anim':'')+'">';
    if(S.presentUrl){h+='<iframe class="present-frame" src="'+esc(S.presentUrl)+'" title="'+esc(t.name)+'"></iframe>';}
    else{h+='<div class="present-body"><div class="present-ph"><b style="font-size:20px;color:var(--navy)">'+esc(t.name)+'</b>'+
      '<span class="muted">'+(S.presentLoading?'여는 중…':LIVE?'아직 주소나 파일이 등록되지 않은 자료예요. 관리자 화면에서 등록해 주세요.':'미리보기 모드라 실제 툴은 열리지 않아요. 운영 버전에서는 이 자리에 툴이 화면 가득 열립니다.')+'</span></div></div>';}
    h+='</div></div></div>';
  }
  return h;
}

/* 관리자 */
function vAdmin(){
  var area=S.adminArea||'stats';
  var h='<div class="page wrap"><section class="adm-band"><div><h1>관리자 페이지</h1><div class="sub2">'+(area==='stats'?'어떤 자료가 쓰이는지 보고, 다음에 만들 자료를 정합니다':'자료를 올리고 고치고, MR 요청을 확인합니다')+'</div></div>'+
    '<div class="seg" role="group" aria-label="관리 영역"><button type="button" class="'+(area==='stats'?'on':'')+'" data-act="adminArea" data-v="stats" aria-pressed="'+(area==='stats')+'">사용 통계</button><button type="button" class="'+(area==='manage'?'on':'')+'" data-act="adminArea" data-v="manage" aria-pressed="'+(area==='manage')+'">자료 관리</button></div></section>';
  if(area==='stats')h+=vStats();
  else{
    var rq=(S.reqs||[]).filter(function(r){return r.status!=='올림';}).length;
    h+='<div class="subtabs" role="group" aria-label="자료 관리 메뉴">'+sub('tools','자료 '+S.tools.length)+sub('contacts','문의처 '+S.contacts.length)+sub('users','계정'+(S.members?' '+S.members.length:''))+sub('reqs','자료 요청 확인하기'+(rq?' <span class="bk-cnt" style="background:#C2410C">'+rq+'</span>':''))+'</div>';
    if(S.adminTab==='tools')h+=vToolAdmin();
    if(S.adminTab==='contacts')h+=vContactAdmin();
    if(S.adminTab==='reqs')h+=vReqs();
    if(S.adminTab==='users')h+=vUsers();
  }
  return h+'</div>';
}
function sub(id,l){return '<button type="button" data-act="adminTab" data-v="'+id+'" class="'+(S.adminTab===id?'on':'')+'" aria-pressed="'+(S.adminTab===id)+'">'+l+'</button>';}
function loading(){return '<div class="prompt muted">불러오는 중…</div>';}
function vStats(){
  if(!S.stats)return loading();
  var rows=S.stats,scope=S.scope,mem=S.members||[];
  var divs={},offs={};rows.concat(mem).forEach(function(r){if(r.division)divs[r.division]=1;if(r.office)offs[r.office]=1;});
  function inScope(r){if(scope==='all')return true;var p=scope.split(':');return p[0]==='d'?r.division===p[1]:r.office===p[1];}
  var R=rows.filter(inScope);
  function sum(type,target){return R.filter(function(r){return r.type===type&&(target===undefined||r.target===target);}).reduce(function(a,r){return a+Number(r.cnt);},0);}
  var people=R.filter(function(r){return r.type==='any';}).reduce(function(a,r){return a+Number(r.people);},0);
  var total=mem.filter(inScope).length;
  if(total&&people>total)people=total; /* 소속이 바뀐 사람은 집계 묶음이 둘로 나뉘어 두 번 셀 수 있어 등록 인원으로 맞춤 */
  var pct=total?Math.round(people/total*100):0;
  var reqs=(S.reqs||[]).filter(inScope);
  function chip(v,l){return '<button type="button" class="chip'+(scope===v?' on':'')+'" data-act="scope" data-v="'+esc(v)+'" aria-pressed="'+(scope===v)+'">'+esc(l)+'</button>';}
  var h=(LIVE?'':'<div class="inbanner">미리보기 모드: 지금 이 화면에서 누른 기록이 바로 숫자로 쌓입니다.</div>');
  h+='<div class="chiprow"><span class="lb" style="margin-right:4px">보는 단위</span>'+chip('all','전사')+
    Object.keys(offs).sort().map(function(o){return chip('o:'+o,o);}).join('')+
    Object.keys(divs).sort().map(function(d){return chip('d:'+d,d);}).join('')+
    '<span class="muted" style="font-size:13px;margin-left:8px">개인별 기록은 보지 않습니다</span><button type="button" class="btn btn-ghost" data-act="reloadStats">새로고침</button></div>';
  var tr=S.tools.map(function(t){return {t:t,f:sum('fav_now',t.id),b:sum('basket',t.id)};});
  tr.sort(function(a,b){return (b.b-a.b)||(b.f-a.f);});
  var byKind={};tr.forEach(function(r){byKind[r.t.kind]=(byKind[r.t.kind]||0)+r.b*2+r.f;});
  var topKind=Object.keys(byKind).sort(function(a,b){return byKind[b]-byKind[a];})[0];
  if(topKind&&byKind[topKind]>0)h+='<div class="dir"><b>방향</b><span>"'+KIND[topKind]+'" 자료가 가장 많이 즐겨찾기되고 제안서에 담겼어요. 다음 자료도 이 형태로 만들면 좋습니다.</span></div>';
  h+='<div class="k3"><div class="kc"><div class="lab">사용한 사람</div><div class="big">'+people+'<small>/ '+total+'명'+(total?' · '+pct+'%':'')+'</small></div><div class="prog"><i style="width:'+Math.min(pct,100)+'%"></i></div>'+(total?'':'<div class="muted" style="font-size:13px">계정에 명단을 넣으면 비율이 나옵니다</div>')+'</div>'+
    '<div class="kc"><div class="lab gold">★ 즐겨찾기</div><div class="big">'+sum('fav_now')+'</div><div class="muted" style="font-size:13px">자주 쓰겠다고 표시한 횟수</div></div>'+
    '<div class="kc"><div class="lab red">'+I.bag+' 제안서에 담기</div><div class="big">'+sum('basket')+'</div><div class="muted" style="font-size:13px">원장님께 보여주려고 고른 횟수</div></div></div>';
  var mb=Math.max(1,Math.max.apply(null,tr.map(function(r){return r.b;}).concat([0]))),mf=Math.max(1,Math.max.apply(null,tr.map(function(r){return r.f;}).concat([0])));
  h+='<section class="blk"><h2>자료별 순위 <span class="muted" style="font-size:14px;font-weight:500">· 제안서에 담긴 순</span></h2><div class="rank">';
  tr.forEach(function(r,i){h+='<div class="ri'+(i<3&&(r.b||r.f)?' top':'')+'"><span class="no">'+(i+1)+'</span><div style="min-width:0"><div class="nm">'+esc(r.t.name)+(r.t.active?'':' <span class="muted" style="font-weight:500">(숨김)</span>')+'</div><div class="kd">'+KIND[r.t.kind]+' · '+esc(r.t.tags.map(areaLabel).join('·')||'전체')+'</div></div><div class="bars">'+
    '<div class="bar2"><span class="red">'+I.bag+'</span><span class="t"><i style="width:'+(r.b/mb*100)+'%;background:#C2410C"></i></span><span class="v">'+r.b+'</span></div>'+
    '<div class="bar2"><span class="gold">★</span><span class="t"><i style="width:'+(r.f/mf*100)+'%;background:#D9B25F"></i></span><span class="v">'+r.f+'</span></div></div></div>';});
  h+='</div></section>';
  var spread=tr.filter(function(r){return r.b>=1;}),tidy=tr.filter(function(r){return r.t.active&&!r.f&&!r.b&&rows.length;});
  var ra={};reqs.forEach(function(q){var k=areaLabel(q.place)||'기타';ra[k]=(ra[k]||0)+1;});
  var waiting=reqs.filter(function(q){return q.status==='접수';}).length;
  function names(list){return list.slice(0,3).map(function(r){return esc(cleanName(r.t.name));}).join(' · ')+(list.length>3?' 외 '+(list.length-3)+'개':'');}
  h+='<section class="blk"><h2>다음에 할 일</h2><div class="ins">'+
    '<div class="ic"><h3>확산 <span>'+spread.length+'</span></h3>'+(spread.length?names(spread)+'<small>성공사례로 정리할 후보</small>':'<small>제안서에 담긴 자료가 생기면 여기에 나와요</small>')+'</div>'+
    '<div class="ic"><h3>정리 <span>'+tidy.length+'</span></h3>'+(tidy.length?names(tidy)+'<small>안내가 필요한지, 빼도 되는지 확인</small>':'<small>쓰이지 않는 자료가 없어요</small>')+'</div>'+
    '<div class="ic"><h3>새 자료 <span>'+reqs.length+'</span></h3>'+(reqs.length?Object.keys(ra).map(function(k){return esc(k)+' '+ra[k]+'건';}).join(' · ')+'<small>다음 달 공략 자료 후보</small>':'<small>들어온 자료 요청이 없어요</small>')+'</div>'+
    '<button type="button" class="ic" data-act="goReqs"><h3>요청 대기 <span>'+waiting+'</span></h3>'+(waiting?'접수 상태 요청이 '+waiting+'건 있어요':'기다리는 요청이 없어요')+'<small>자료 관리 → 자료 요청 확인하기</small></button>'+
    '</div></section>';
  return h;
}
function kpi(v,l){return '<div class="kpi"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>';}
function vToolAdmin(){
  var k=S.admKind||'all';
  var list=S.tools.filter(function(t){return k==='all'||t.kind===k;});
  var h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div class="chiprow">';
  [{id:'all',label:'전체'}].concat(NEEDS.filter(function(n){return KIND[n.id];})).forEach(function(n){
    var c=n.id==='all'?S.tools.length:S.tools.filter(function(t){return t.kind===n.id;}).length;
    h+='<button type="button" class="chip'+(k===n.id?' on':'')+'" data-act="admKind" data-v="'+n.id+'" aria-pressed="'+(k===n.id)+'">'+n.label+' '+c+'</button>';});
  h+='</div><button type="button" class="btn btn-primary" data-act="newTool" style="min-height:46px;padding:0 22px">+ 자료 추가</button></div>';
  if(!list.length)return h+'<div class="prompt muted">이 종류로 등록된 자료가 없어요. "+ 자료 추가"로 올려보세요.</div>';
  h+='<div class="grid">';
  list.forEach(function(t){
    var op=t.file?(/\.pdf$/i.test(t.file)?'PDF':'파일'):t.url?'주소':'';
    h+='<article class="card mcard"><div class="card-h"><div class="tags"><span class="tag k-'+t.kind+'">'+KIND[t.kind]+'</span>'+audTag(t)+(t.month?'<span class="tag a-issue">이달의 주요 이슈</span>':'')+'</div></div>'+
      '<h3>'+esc(t.name)+'</h3><div class="meta">'+esc(t.tags.map(areaLabel).join('·')||'전체')+' · 열기: '+(op?'<b>'+op+'</b>':'<b style="color:#8A4B12">주소 미등록</b>')+' · '+esc(t.by)+'</div>'+
      '<button type="button" class="vis-sw'+(t.active?' on':'')+'" data-act="toggleActive" data-v="'+t.id+'" aria-pressed="'+t.active+'"><span class="knob" aria-hidden="true"></span>MR 화면에 보이기</button>'+
      '<div class="acts"><button type="button" class="btn btn-line" data-act="editTool" data-v="'+t.id+'">수정</button><button type="button" class="btn btn-ghost" data-act="delAsk" data-v="tool:'+t.id+'">삭제</button></div></article>';});
  return h+'</div>';
}
function vScriptAdmin(){
  var h='<div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-primary" data-act="newScript">+ 멘트 추가</button></div>';
  h+='<div class="tbl-box"><table><thead><tr><th>단계</th><th>구분</th><th>제목</th><th>문구</th><th>관련 툴</th><th></th></tr></thead><tbody>';
  S.scripts.forEach(function(m){var st=STAGES.filter(function(s){return s.id===m.stage;})[0];var t=m.tool?byId(m.tool):null;
    h+='<tr><td>'+esc(st?st.label:'')+'</td><td>'+(m.type==='obj'?'원장님 반응':'하는 말')+'</td><td>'+esc(m.title)+'</td><td style="max-width:320px;white-space:pre-line">'+esc(m.text.length>60?m.text.slice(0,60)+'…':m.text)+'</td><td>'+esc(t?t.name:'')+'</td>'+
    '<td style="white-space:nowrap"><button type="button" class="btn btn-line" data-act="editScript" data-v="'+m.id+'" style="min-height:36px">수정</button> <button type="button" class="btn btn-ghost" data-act="delAsk" data-v="script:'+m.id+'">삭제</button></td></tr>';});
  return h+'</tbody></table></div>';
}
function vContactAdmin(){
  var h='<div class="inbanner">담당자 개인 이름·휴대폰 대신 부서명과 대표번호만 넣어주세요.</div><div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-primary" data-act="newContact">+ 문의처 추가</button></div>';
  h+='<div class="tbl-box"><table><thead><tr><th>이럴 때</th><th>부서</th><th>연락처</th><th>분류</th><th></th></tr></thead><tbody>';
  S.contacts.forEach(function(c){h+='<tr><td>'+esc(c.topic)+'</td><td>'+esc(c.dept)+'</td><td>'+esc(c.tel)+'</td><td>'+esc(c.tags.map(areaLabel).join(', '))+'</td>'+
    '<td style="white-space:nowrap"><button type="button" class="btn btn-line" data-act="editContact" data-v="'+c.id+'" style="min-height:36px">수정</button> <button type="button" class="btn btn-ghost" data-act="delAsk" data-v="contact:'+c.id+'">삭제</button></td></tr>';});
  return h+'</tbody></table></div>';
}
function vReqs(){
  if(!S.reqs)return loading();
  var h='<div class="kan">';
  REQ_STATUS.forEach(function(st,si){
    var list=S.reqs.filter(function(r){return r.status===st;});
    h+='<div class="kcol"><h3>'+st+' <span>'+list.length+'</span></h3>';
    if(!list.length)h+='<div class="muted" style="font-size:13px;padding:8px 4px">없음</div>';
    list.forEach(function(r){
      h+='<div class="rq"><div style="white-space:pre-line">'+esc(r.body)+'</div><div class="m">'+esc(areaLabel(r.place)||'기타')+' · '+esc(r.office||'')+' · '+esc((r.created_at||'').slice(5,10).replace('-','.'))+'</div>'+
        '<div class="rq-acts">'+(si>0?'<button type="button" class="mini-btn" data-act="reqMove" data-v="'+r.id+':'+REQ_STATUS[si-1]+'">← '+REQ_STATUS[si-1]+'</button>':'<span></span>')+
        (si<REQ_STATUS.length-1?'<button type="button" class="mini-btn on" data-act="reqMove" data-v="'+r.id+':'+REQ_STATUS[si+1]+'">'+REQ_STATUS[si+1]+' →</button>':'')+'</div></div>';});
    h+='</div>';});
  return h+'</div>';
}
function vUsers(){
  var h='<div class="inbanner">사번·이름·소속은 개인정보입니다. 경인1사무소 시범 운영 범위로만 등록하고, 전사 확대는 IT·보안 확인 후 진행합니다.</div>'+
  '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-line" data-act="bulkUsers">명단 한 번에 넣기</button><button type="button" class="btn btn-primary" data-act="newUser">+ 계정 추가</button></div>';
  if(!S.members)return h+loading();
  h+='<div class="tbl-box"><table><thead><tr><th>사번</th><th>이름</th><th>사업부</th><th>사무소</th><th>권한</th><th></th></tr></thead><tbody>';
  S.members.forEach(function(m){h+='<tr><td>'+esc(m.emp_no)+'</td><td>'+esc(m.name)+'</td><td>'+esc(m.division)+'</td><td>'+esc(m.office)+'</td><td>'+(m.role==='admin'?'관리자':'MR')+'</td>'+
    '<td style="white-space:nowrap"><button type="button" class="btn btn-line" data-act="editUser" data-v="'+esc(m.emp_no)+'" style="min-height:36px">수정·비밀번호</button>'+(S.me&&m.emp_no===S.me.emp_no?'':' <button type="button" class="btn btn-ghost" data-act="delAsk" data-v="user:'+esc(m.emp_no)+'">삭제</button>')+'</td></tr>';});
  return h+'</tbody></table></div>';
}

/* 모달 */
function modalWrap(id,title,body,wide){
  return '<div class="modal-bg" data-act="closeModal"><form class="modal" id="'+id+'" role="dialog" aria-modal="true" aria-labelledby="'+id+'T"'+(wide?' style="max-width:680px"':'')+'><h2 id="'+id+'T">'+title+'</h2>'+body+
    '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-line" data-act="closeModal">취소</button><button type="submit" class="btn btn-primary"'+(S.busy?' disabled':'')+'>'+(S.busy?'저장 중…':'저장')+'</button></div></form></div>';
}
function vModal(){
  var m=S.modal;if(!m)return '';
  if(m==='req'){
    return modalWrap('reqForm','툴 요청하기','<p class="muted" style="margin:0;font-size:14px">요청은 사무소 단위로만 모아 봅니다. 이름은 관리자에게 보이지 않아요.</p>'+
      '<div class="fg"><label class="lb" for="reqText">어떤 툴이나 자료가 필요한가요?</label><textarea id="reqText" class="field" maxlength="1000" placeholder="예: 투석 환자가 많은 의원에 보여줄 수익 계산"></textarea></div>'+
      '<div class="fg"><label class="lb" for="reqArea">어디 갈 때 쓰나요?</label><select id="reqArea" class="field">'+PLACES.filter(function(p){return p.id!=='all';}).map(function(a){return '<option value="'+a.id+'">'+a.label+'</option>';}).join('')+'</select></div>');
  }
  if(m==='print'){
    var pl=clinicList(),okN=pl.filter(isPrintable).length,selN=pl.filter(function(t){return S.printSel[t.id];}).length;
    var ph='<div class="modal-bg" data-act="closeModal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="prT"><h2 id="prT">제안자료 인쇄</h2>'+
      '<p class="muted" style="margin:0;font-size:14px">담긴 자료 중 PDF·이미지 자료를 골라 한 번에 인쇄합니다. 웹 툴은 새 창에서 열어 인쇄해 주세요.</p>';
    if(!pl.length)ph+='<div class="prompt muted">제안서에 담긴 자료가 없어요.</div>';
    else{
      ph+='<div class="pr-list">';
      pl.forEach(function(t,i){var ok=isPrintable(t);
        ph+='<label class="pr-row'+(ok?'':' off')+'"><input type="checkbox" data-print="'+t.id+'"'+(ok&&S.printSel[t.id]?' checked':'')+(ok?'':' disabled')+'><span class="num">'+(i+1)+'</span><span class="nm">'+esc(cleanName(t.name))+'</span><span class="muted" style="font-size:13px;margin-left:auto">'+(ok?(/\.pdf$/i.test(t.file)?'PDF':'이미지'):'웹 툴 · 인쇄 불가')+'</span></label>';});
      ph+='</div>';
    }
    if(S.printUrl)ph+='<p class="muted" style="margin:0;font-size:13px">인쇄 창이 뜨지 않으면 <a href="'+S.printUrl+'" target="_blank" rel="noopener">합친 PDF 열기</a>에서 인쇄하세요.</p>';
    ph+='<div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">'+
      (okN?'<button type="button" class="btn btn-line" data-act="printAll">'+(selN===okN?'전체 해제':'전체 선택')+'</button>':'<span></span>')+
      '<div style="display:flex;gap:8px"><button type="button" class="btn btn-line" data-act="closeModal">닫기</button>'+
      '<button type="button" class="btn btn-primary" data-act="printGo"'+(selN&&!S.busy?'':' disabled')+'>'+I.print+(S.busy?'준비 중…':'선택한 '+selN+'개 인쇄')+'</button></div></div></div></div>';
    return ph;
  }
  if(m==='bkEdit'){
    var bh='<div class="modal-bg" data-act="closeModal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="bkT"><h2 id="bkT">제안서 수정</h2>';
    if(!S.basket.length){bh+='<p class="muted" style="margin:0">담은 자료가 없어서 지금은 원장님 화면용 자료를 모두 보여주고 있어요. "자료 더 담기"로 보여드릴 자료만 골라보세요.</p>';}
    else{bh+='<p class="muted" style="margin:0;font-size:14px">순서를 바꾸거나 뺄 수 있어요. 위에서부터 차례로 나옵니다.</p><div class="basket-list">';
      S.basket.forEach(function(id,i){var t=byId(id);if(!t)return;
        bh+='<div class="bk-row"><span class="num">'+(i+1)+'</span><span class="nm">'+esc(cleanName(t.name))+'</span>'+
          '<button type="button" class="icon-btn" data-act="bkUp" data-v="'+i+'" aria-label="위로"'+(i===0?' disabled':'')+'>'+I.up+'</button>'+
          '<button type="button" class="icon-btn" data-act="bkDown" data-v="'+i+'" aria-label="아래로"'+(i===S.basket.length-1?' disabled':'')+'>'+I.down+'</button>'+
          '<button type="button" class="icon-btn" data-act="basket" data-v="'+id+'" aria-label="빼기">'+I.x+'</button></div>';});
      bh+='</div>';}
    return bh+'<div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button type="button" class="btn btn-line" data-act="addMore">+ 자료 더 담기</button><button type="button" class="btn btn-primary" data-act="closeModal">완료</button></div></div></div>';
  }
  if(m==='pw'){
    return modalWrap('pwForm','비밀번호 변경','<div class="fg"><label class="lb" for="pw1">새 비밀번호 (6자 이상)</label><input id="pw1" class="field" type="password" autocomplete="new-password"></div>'+
      '<div class="fg"><label class="lb" for="pw2">한 번 더</label><input id="pw2" class="field" type="password" autocomplete="new-password"></div>');
  }
  if(m==='tool'){
    var t=S.edit?byId(S.edit):null;
    var v=t||{name:'',kind:'tool',tags:[],month:false,doctor:true,by:'',desc:'',pub:'',url:'',file:'',active:true};
    return modalWrap('toolForm',t?'툴 수정':'새 툴 등록','<div class="form-grid">'+
      '<div class="fg full"><label class="lb" for="fName">이름</label><input id="fName" class="field" value="'+esc(v.name)+'"></div>'+
      '<div class="fg"><label class="lb" for="fKind">종류</label><select id="fKind" class="field">'+Object.keys(KIND).map(function(k){return '<option value="'+k+'"'+(v.kind===k?' selected':'')+'>'+KIND[k]+'</option>';}).join('')+'</select></div>'+
      '<div class="fg"><label class="lb" for="fBy">만든 사람</label><input id="fBy" class="field" value="'+esc(v.by)+'"></div>'+
      '<div class="fg full"><label class="lb" for="fUrl">주소</label><input id="fUrl" class="field" value="'+esc(v.url)+'" placeholder="https:// 로 시작하는 주소"></div>'+
      '<div class="fg full"><label class="lb" for="fFile">또는 파일 올리기 (PDF·이미지)</label><input id="fFile" class="field" type="file" accept=".pdf,image/*" style="padding:10px"'+(LIVE?'':' disabled')+'>'+
        (v.file?'<span class="muted" style="font-size:13px">지금 등록된 파일: '+esc(v.file.replace(/^\d+-/,''))+' · 새 파일을 고르면 바뀝니다</span>':'')+(LIVE?'':'<span class="muted" style="font-size:13px">미리보기 모드에서는 파일을 올릴 수 없어요</span>')+'</div>'+
      '<div class="fg full"><label class="lb" for="fDesc">MR에게 보이는 설명</label><input id="fDesc" class="field" value="'+esc(v.desc)+'"></div>'+
      '<div class="fg full"><span class="lb">어디 갈 때 쓰나요? (여러 개 선택)</span><div class="checks">'+placeOptions(v.tags)+'</div></div>'+
      '<div class="fg full"><div class="checks"><label class="chk"><input id="fMonth" type="checkbox"'+(v.month?' checked':'')+'> 이달의 주요 이슈에 올리기</label>'+
      '<label class="chk"><input id="fDoc" type="checkbox"'+(v.doctor?' checked':'')+'> 원장님께 보여드려도 돼요 (거래처 모드에 나옴)</label>'+
      '<label class="chk"><input id="fActive" type="checkbox"'+(v.active?' checked':'')+'> MR 화면에 보이기</label></div></div>'+
      '<div class="fg full"><label class="lb" for="fPub">원장님께 보이는 설명</label><input id="fPub" class="field" value="'+esc(v.pub)+'" placeholder="거래처 모드 카드에 나오는 문장. 비우면 위 설명을 씁니다"></div></div>',true);
  }
  if(m==='script'){
    var sc=S.edit?S.scripts.filter(function(x){return x.id===S.edit;})[0]:null;
    var w=sc||{stage:'s1',type:'base',title:'',text:'',tool:null};
    return modalWrap('scriptForm',sc?'멘트 수정':'멘트 추가','<div class="form-grid">'+
      '<div class="fg"><label class="lb" for="mStage">단계</label><select id="mStage" class="field">'+STAGES.map(function(s){return '<option value="'+s.id+'"'+(w.stage===s.id?' selected':'')+'>'+s.no+' · '+s.label+'</option>';}).join('')+'</select></div>'+
      '<div class="fg"><label class="lb" for="mType">구분</label><select id="mType" class="field"><option value="base"'+(w.type==='base'?' selected':'')+'>이 단계에서 하는 말</option><option value="obj"'+(w.type==='obj'?' selected':'')+'>원장님이 이렇게 말하면</option></select></div>'+
      '<div class="fg full"><label class="lb" for="mTitle">제목 (원장님 반응이면 원장님 말 그대로)</label><input id="mTitle" class="field" value="'+esc(w.title)+'"></div>'+
      '<div class="fg full"><label class="lb" for="mText">멘트</label><textarea id="mText" class="field" style="min-height:160px">'+esc(w.text)+'</textarea></div>'+
      '<div class="fg full"><label class="lb" for="mTool">같이 열 툴 (선택)</label><select id="mTool" class="field"><option value="">없음</option>'+S.tools.map(function(t){return '<option value="'+t.id+'"'+(w.tool===t.id?' selected':'')+'>'+esc(t.name)+'</option>';}).join('')+'</select></div></div>',true);
  }
  if(m==='contact'){
    var c=S.edit?S.contacts.filter(function(x){return x.id===S.edit;})[0]:null;
    var cv=c||{topic:'',dept:'',tel:'',tags:['new','keep']};
    return modalWrap('contactForm',c?'문의처 수정':'문의처 추가',
      '<div class="fg"><label class="lb" for="cTopic">이럴 때</label><input id="cTopic" class="field" value="'+esc(cv.topic)+'" placeholder="예: 청구 기준·수가 문의"></div>'+
      '<div class="fg"><label class="lb" for="cDept">부서</label><input id="cDept" class="field" value="'+esc(cv.dept)+'"></div>'+
      '<div class="fg"><label class="lb" for="cTel">대표번호</label><input id="cTel" class="field" value="'+esc(cv.tel)+'"></div>'+
      '<div class="fg"><span class="lb">어디 갈 때 필요한가요?</span><div class="checks">'+placeOptions(cv.tags)+'</div></div>');
  }
  if(m==='user'){
    var u=S.edit?(S.members||[]).filter(function(x){return x.emp_no===S.edit;})[0]:null;
    var uv=u||{emp_no:'',name:'',division:'',office:'경인1사무소',role:'mr'};
    return modalWrap('userForm',u?'계정 수정':'계정 추가','<div class="form-grid">'+
      '<div class="fg"><label class="lb" for="uEmp">사번</label><input id="uEmp" class="field" value="'+esc(uv.emp_no)+'"'+(u?' readonly':'')+'></div>'+
      '<div class="fg"><label class="lb" for="uName">이름</label><input id="uName" class="field" value="'+esc(uv.name)+'"></div>'+
      '<div class="fg"><label class="lb" for="uDiv">사업부</label><input id="uDiv" class="field" value="'+esc(uv.division)+'"></div>'+
      '<div class="fg"><label class="lb" for="uOff">사무소</label><input id="uOff" class="field" value="'+esc(uv.office)+'"></div>'+
      '<div class="fg"><label class="lb" for="uRole">권한</label><select id="uRole" class="field"><option value="mr"'+(uv.role==='mr'?' selected':'')+'>MR</option><option value="admin"'+(uv.role==='admin'?' selected':'')+'>관리자</option></select></div>'+
      '<div class="fg"><label class="lb" for="uPw">관리자 비밀번호 (관리자 권한일 때만, 6자 이상)</label><input id="uPw" class="field" type="text" autocomplete="off"></div></div>',true);
  }
  if(m==='bulk'){
    return modalWrap('bulkForm','명단 한 번에 넣기','<p class="muted" style="margin:0;font-size:14px">엑셀에서 <b>사번, 이름, 사업부, 사무소</b> 네 칸을 순서대로 복사해 붙여넣으세요. 한 줄에 한 명입니다.</p>'+
      '<div class="fg"><label class="lb" for="bulkText">명단</label><textarea id="bulkText" class="field" style="min-height:200px;font-family:ui-monospace,monospace" placeholder="1234567	홍길동	[사업부]	경인1사무소"></textarea></div>',true);
  }
  if(m.indexOf('del:')===0){
    var p=m.slice(4).split(':'),kind=p[0],id=p.slice(1).join(':'),name='';
    if(kind==='tool'){var dt=byId(id);name=dt?dt.name:'';}
    if(kind==='script'){var ds=S.scripts.filter(function(x){return x.id===id;})[0];name=ds?ds.title:'';}
    if(kind==='contact'){var dc=S.contacts.filter(function(x){return x.id===id;})[0];name=dc?dc.topic:'';}
    if(kind==='user'){name='사번 '+id;}
    return '<div class="modal-bg" data-act="closeModal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="delT"><h2 id="delT">"'+esc(name)+'"를 지울까요?</h2>'+
      '<p class="muted" style="margin:0">'+(kind==='tool'?'MR 화면에서 바로 사라지고 되돌릴 수 없습니다. 잠시 숨기기만 하려면 수정에서 "MR 화면에 보이기"를 끄세요.':kind==='user'?'이 계정으로 더 이상 로그인할 수 없습니다.':'바로 사라지고 되돌릴 수 없습니다.')+'</p>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-line" data-act="closeModal">취소</button><button type="button" class="btn btn-primary" data-act="delYes" data-v="'+esc(m.slice(4))+'">지우기</button></div></div></div>';
  }
  return '';
}

/* =====================================================================
   렌더
   ===================================================================== */
var app=document.getElementById('app');
function render(){
  var a=document.activeElement,fid=a&&a.id,sel=null;
  try{sel=fid&&a.selectionStart!=null?[a.selectionStart,a.selectionEnd]:null;}catch(e){}
  var h;
  if(S.boot){h='<div class="login wrap"><div class="muted">불러오는 중…</div></div>';}
  else if(!S.uid){h=vLogin();}
  else{
    h=vHeader();
    if(S.mode==='clinic')h+=vClinic();
    else if(S.page==='admin'&&isAdmin())h+=vAdmin();
    else h+=vTools();
  }
  if(S.uid||!S.boot)h+=vModal();
  if(S.toast)h+='<div class="toast" role="status">'+esc(S.toast)+'</div>';
  if(S.modal){var keep={};[].forEach.call(document.querySelectorAll('.modal input,.modal textarea,.modal select'),function(el){if(el.id&&el.type!=='file'&&el.type!=='checkbox')keep[el.id]=el.value;});}
  app.innerHTML=h;
  if(S.modal&&keep){Object.keys(keep).forEach(function(id){var el=document.getElementById(id);if(el)el.value=keep[id];});}
  if(fid){var el=document.getElementById(fid);if(el){el.focus();if(sel){try{el.setSelectionRange(sel[0],sel[1]);}catch(e){}}}}
}

/* ---------- 데이터 불러오기 ---------- */
async function afterLogin(uid){
  S.uid=uid;
  S.me=await api.profile(uid);
  var d=await api.loadAll();
  S.tools=d.tools;S.scripts=d.scripts;S.contacts=d.contacts;
  S.favs={};d.favs.forEach(function(id){S.favs[id]=true;});
  try{var b=JSON.parse(sessionStorage.getItem('daisso_basket')||'[]');S.basket=b.filter(function(id){var t=byId(id);return t&&t.doctor;});}catch(e){}
  S.mode='prep';S.page='tools';
}
function saveBasket(){try{sessionStorage.setItem('daisso_basket',JSON.stringify(S.basket));}catch(e){}}
async function loadAdmin(){
  try{
    if((S.adminArea||'stats')==='stats'){var r=await Promise.all([api.stats(),api.requests(),api.members()]);S.stats=r[0];S.reqs=r[1];S.members=r[2];}
    else{var r2=await Promise.all([api.requests(),api.members()]);S.reqs=r2[0];S.members=r2[1];}
  }catch(e){fail(e);}
  render();
}
async function openTool(t,inPlace){
  track(inPlace?'present':'open',t.id);
  if(!LIVE){if(!inPlace)say('미리보기 모드라 실제 툴은 열리지 않아요. 운영 버전에서는 새 탭에 툴만 열립니다.');return null;}
  if(t.url)return t.url;
  if(t.file)return await api.fileUrl(t.file);
  if(!inPlace)say('아직 주소나 파일이 등록되지 않은 자료예요.');
  return null;
}
async function showPresent(i){
  var t=clinicList()[i];if(!t)return;
  S.present=i;S.presentUrl='';S.presentLoading=true;S.flipAnim=true;render();S.flipAnim=false;
  try{S.presentUrl=(await openTool(t,true))||'';}catch(e){fail(e);}
  S.presentLoading=false;render();
}

/* =====================================================================
   이벤트
   ===================================================================== */
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-act]');if(!el)return;
  var act=el.getAttribute('data-act'),v=el.getAttribute('data-v');
  if(act==='closeModal'&&e.target!==el)return;
  switch(act){
    case 'mode':S.mode=v;S.present=-1;S.basketOpen=false;window.scrollTo(0,0);break;
    case 'page':S.page=v;window.scrollTo(0,0);if(v==='admin')loadAdmin();break;
    case 'home':S.mode='prep';S.page='tools';S.present=-1;window.scrollTo(0,0);break;
    case 'logout':api.signOut();S.uid=null;S.me=null;S.basket=[];saveBasket();S.mode='prep';S.page='tools';S.stats=S.reqs=S.members=null;break;
    case 'pwModal':S.modal='pw';break;
    case 'place':S.place=S.place===v?'none':v;S.favOnly=false;break;
    case 'need':S.need=S.need===v?'none':v;S.favOnly=false;break;
    case 'favOnly':S.favOnly=!S.favOnly;break;
    case 'fav':
      var on=!S.favs[v];if(on)S.favs[v]=true;else delete S.favs[v];track(on?'fav':'unfav',v);
      api.setFav(v,on).catch(function(err){if(on)delete S.favs[v];else S.favs[v]=true;fail(err);});break;
    case 'open':
      var t=byId(v);if(!t)break;
      var win=LIVE&&(t.url||t.file)?window.open('about:blank','_blank'):null;
      openTool(t,false).then(function(url){if(url&&win){win.opener=null;win.location.href=url;}else if(win){win.close();}}).catch(function(err){if(win)win.close();fail(err);});
      break;
    case 'basket':var i=S.basket.indexOf(v);if(i>=0){S.basket.splice(i,1);}else{S.basket.push(v);track('basket',v);}if(!S.basket.length)S.basketOpen=false;saveBasket();break;
    case 'basketOpen':S.basketOpen=!S.basketOpen;break;
    case 'basketClear':S.basket=[];S.basketOpen=false;saveBasket();say('제안서를 비웠어요.');break;
    case 'bkUp':case 'bkDown':var k=+v,j=act==='bkUp'?k-1:k+1;if(j>=0&&j<S.basket.length){var tmp=S.basket[k];S.basket[k]=S.basket[j];S.basket[j]=tmp;saveBasket();}break;
    case 'present':S.flip='next';showPresent(+v);return;
    case 'prev':if(S.present>0){S.flip='prev';showPresent(S.present-1);}return;
    case 'next':if(S.present<clinicList().length-1){S.flip='next';showPresent(S.present+1);}return;
    case 'jump':var jt=+v;if(jt!==S.present){S.flip=jt<S.present?'prev':'next';showPresent(jt);}return;
    case 'closePresent':S.present=-1;S.presentUrl='';break;
    case 'stage':S.stage=v;break;
    case 'simple':S.simple=!S.simple;break;
    case 'bkEdit':S.modal='bkEdit';break;
    case 'printOpen':S.printSel={};S.printUrl='';clinicList().forEach(function(t){if(isPrintable(t))S.printSel[t.id]=true;});S.modal='print';break;
    case 'printAll':var pa=clinicList().filter(isPrintable),allOn=pa.every(function(t){return S.printSel[t.id];});S.printSel={};if(!allOn)pa.forEach(function(t){S.printSel[t.id]=true;});break;
    case 'printGo':doPrint();return;
    case 'addMore':S.modal=null;S.mode='prep';S.page='tools';S.present=-1;window.scrollTo(0,0);say('자료를 더 담은 뒤 아래 "거래처 제안서 모드로"를 누르세요.');break;
    case 'endVisit':S.basket=[];saveBasket();S.hospital='';S.simple=false;S.present=-1;S.presentUrl='';S.mode='prep';S.basketOpen=false;window.scrollTo(0,0);say('제안서를 비웠어요. 다음 병원 준비하세요.');break;
    case 'copy':
      var m=S.scripts.filter(function(x){return x.id===v;})[0];if(!m)break;track('copy',v);
      var fallback=function(){var node=document.getElementById('sc-'+v);if(node){var r=document.createRange();r.selectNodeContents(node);var s=window.getSelection();s.removeAllRanges();s.addRange(r);}say('자동 복사가 막혀서 멘트를 선택해 뒀어요. 길게 눌러 복사하세요.');render();};
      try{navigator.clipboard.writeText(m.text).then(function(){say('멘트를 복사했어요. 문자나 카톡에 붙여넣으세요.');render();},fallback);}catch(err){fallback();}
      return;
    case 'openReq':S.modal='req';break;
    case 'closeModal':S.modal=null;S.edit=null;break;
    case 'adminTab':S.adminTab=v;loadAdmin();break;
    case 'scope':S.scope=v;break;
    case 'admKind':S.admKind=v;break;
    case 'goReqs':S.adminArea='manage';S.adminTab='reqs';loadAdmin();break;
    case 'toggleActive':var ta=byId(v);if(ta){var nd=Object.assign({},ta,{active:!ta.active});api.saveTool(ta.id,nd,null).then(function(sv){S.tools=S.tools.map(function(x){return x.id===sv.id?sv:x;});say(sv.active?'MR 화면에 다시 보여요.':'MR 화면에서 숨겼어요.');render();}).catch(fail);}return;
    case 'reqMove':var rp=v.split(':'),rid=rp[0],rst=rp.slice(1).join(':');api.setReqStatus(rid,rst).then(function(){(S.reqs||[]).forEach(function(r){if(r.id===rid)r.status=rst;});render();}).catch(fail);return;
    case 'adminArea':S.adminArea=v;if(v==='manage'&&['tools','contacts','users','reqs'].indexOf(S.adminTab)<0)S.adminTab='tools';loadAdmin();break;
    case 'reloadStats':S.stats=null;loadAdmin();break;
    case 'newTool':S.modal='tool';S.edit=null;break;
    case 'editTool':S.modal='tool';S.edit=v;break;
    case 'newScript':S.modal='script';S.edit=null;break;
    case 'editScript':S.modal='script';S.edit=v;break;
    case 'newContact':S.modal='contact';S.edit=null;break;
    case 'editContact':S.modal='contact';S.edit=v;break;
    case 'newUser':S.modal='user';S.edit=null;break;
    case 'editUser':S.modal='user';S.edit=v;break;
    case 'bulkUsers':S.modal='bulk';break;
    case 'delAsk':S.modal='del:'+v;break;
    case 'delYes':doDelete(v);return;
    default:return;
  }
  render();
});
/* 인쇄: PDF·이미지 자료를 한 PDF로 합쳐 인쇄 창을 엽니다 (pdf-lib는 처음 쓸 때만 불러옴) */
function isPrintable(t){return !!(t&&t.file&&/\.(pdf|png|jpe?g|webp|gif)$/i.test(t.file));}
function loadScript(src){return new Promise(function(ok,no){var el=document.createElement('script');el.src=src;el.onload=ok;el.onerror=function(){no(new Error('인쇄 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));};document.head.appendChild(el);});}
function imageToPng(bytes){return new Promise(function(ok,no){var url=URL.createObjectURL(new Blob([bytes]));var img=new Image();img.onload=function(){var c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(url);c.toBlob(function(b){b.arrayBuffer().then(ok,no);},'image/png');};img.onerror=function(){no(new Error('이미지를 읽지 못했어요.'));};img.src=url;});}
async function doPrint(){
  var items=clinicList().filter(function(t){return isPrintable(t)&&S.printSel[t.id];});
  if(!items.length)return;
  S.busy=true;render();
  try{
    if(!window.PDFLib)await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
    var out=await PDFLib.PDFDocument.create();
    for(var i=0;i<items.length;i++){
      var t=items[i],url=await api.fileUrl(t.file);
      var bytes=await (await fetch(url)).arrayBuffer();
      if(/\.pdf$/i.test(t.file)){
        var src=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true});
        (await out.copyPages(src,src.getPageIndices())).forEach(function(pg){out.addPage(pg);});
      }else{
        var png=await out.embedPng(await imageToPng(bytes));
        var W=595.28,H=841.89,m=28,sc=Math.min((W-2*m)/png.width,(H-2*m)/png.height,1);
        var page=out.addPage([W,H]);page.drawImage(png,{x:(W-png.width*sc)/2,y:(H-png.height*sc)/2,width:png.width*sc,height:png.height*sc});
      }
    }
    var blobUrl=URL.createObjectURL(new Blob([await out.save()],{type:'application/pdf'}));
    S.printUrl=blobUrl;
    var fr=document.getElementById('print-frame');if(fr)fr.remove();
    fr=document.createElement('iframe');fr.id='print-frame';fr.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';fr.src=blobUrl;
    fr.onload=function(){try{fr.contentWindow.focus();fr.contentWindow.print();}catch(e){}};
    document.body.appendChild(fr);
    say('인쇄 창을 여는 중이에요. 안 뜨면 팝업의 "합친 PDF 열기"를 눌러주세요.');
  }catch(e){S.busy=false;fail(e);return;}
  S.busy=false;render();
}
async function doDelete(key){
  var p=key.split(':'),kind=p[0],id=p.slice(1).join(':');
  try{
    if(kind==='tool'){await api.deleteTool(id);S.tools=S.tools.filter(function(t){return t.id!==id;});S.basket=S.basket.filter(function(x){return x!==id;});saveBasket();}
    if(kind==='script'){await api.deleteScript(id);S.scripts=S.scripts.filter(function(x){return x.id!==id;});}
    if(kind==='contact'){await api.deleteContact(id);S.contacts=S.contacts.filter(function(x){return x.id!==id;});}
    if(kind==='user'){await api.deleteMember(id);S.members=await api.members();}
    S.modal=null;say('지웠어요.');render();
  }catch(e){fail(e);}
}
document.addEventListener('input',function(e){
  var t=e.target;
  /* 입력창은 그대로 두고 결과만 바꿔서 한글 조합이 끊기지 않게 함 */
  if(t.id==='q'){S.q=t.value;var r=document.getElementById('results');if(r)r.innerHTML=vResults();}
  else if(t.id==='hosp'){S.hospital=t.value;var ht=document.getElementById('hosp-title');if(ht)ht.textContent=hospTitle();}
});
document.addEventListener('change',function(e){
  var t=e.target;
  if(t.hasAttribute('data-print')){var pid=t.getAttribute('data-print');if(t.checked)S.printSel[pid]=true;else delete S.printSel[pid];render();return;}
  if(t.id==='scope'){S.scope=t.value;render();}
  else if(t.hasAttribute('data-req')){var id=t.getAttribute('data-req'),val=t.value;api.setReqStatus(id,val).then(function(){(S.reqs||[]).forEach(function(r){if(r.id===id)r.status=val;});say('상태를 바꿨어요.');render();}).catch(fail);}
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){if(S.modal){S.modal=null;S.edit=null;render();}else if(S.present>=0){S.present=-1;S.presentUrl='';render();}}
});
function val(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function checked(id){var el=document.getElementById(id);return !!(el&&el.checked);}
document.addEventListener('submit',async function(e){
  e.preventDefault();
  var f=e.target;if(S.busy)return;
  try{
    if(f.id==='loginForm'){
      var emp=val('empId');
      if(LIVE&&!emp){S.loginErr='사번을 넣어주세요.';render();return;}
      var pw=mrPw(emp);
      var keepOn=checked('keep'),asAdmin=checked('asAdmin');
      S.busy=true;S.loginErr='';render();
      try{var uid=await api.signIn(emp,pw,keepOn,asAdmin);await afterLogin(uid);track('login',null);}
      catch(err){S.loginErr=err&&err.code==='bad'?'등록되지 않은 사번이에요. 담당 CM에게 문의해 주세요.':'지금 서버가 잠시 멈춰 있어요. 담당 CM에게 알려주세요.';S.uid=null;}
      S.busy=false;render();return;
    }
    if(f.id==='reqForm'){
      var txt=val('reqText');if(!txt){say('필요한 툴이나 자료를 한 줄이라도 적어주세요.');render();return;}
      var area=val('reqArea');S.busy=true;render();await api.sendRequest(txt,area);track('request',null);
      S.modal=null;say('요청을 보냈어요. 다음 달 공략 툴 정할 때 반영합니다.');
    }
    if(f.id==='pwForm'){
      var p1=document.getElementById('pw1').value,p2=document.getElementById('pw2').value;
      if(p1.length<6){say('비밀번호는 6자 이상이어야 해요.');render();return;}
      if(p1!==p2){say('두 비밀번호가 달라요.');render();return;}
      S.busy=true;render();await api.changePassword(p1);S.modal=null;say('비밀번호를 바꿨어요.');
    }
    if(f.id==='toolForm'){
      var name=val('fName');if(!name){say('이름을 넣어주세요.');render();return;}
      var url=val('fUrl');if(url&&!/^https?:\/\//i.test(url)){say('주소는 https:// 로 시작해야 해요.');render();return;}
      var fileEl=document.getElementById('fFile'),file=fileEl&&fileEl.files&&fileEl.files[0]||null;
      var old=S.edit?byId(S.edit):null;
      var data={name:name,kind:val('fKind'),by:val('fBy'),url:url,file:old&&!url?old.file:'',desc:val('fDesc'),pub:val('fPub'),
        tags:[].slice.call(f.querySelectorAll('input[name=tg]:checked')).map(function(x){return x.value;}),
        month:checked('fMonth'),doctor:checked('fDoc'),active:checked('fActive'),sort:old?old.sort:S.tools.length+1};
      S.busy=true;render();
      var saved=await api.saveTool(S.edit,data,file);
      if(S.edit){S.tools=S.tools.map(function(t){return t.id===S.edit?saved:t;});}else{S.tools.push(saved);}
      if(!saved.doctor||!saved.active){S.basket=S.basket.filter(function(x){return x!==saved.id;});saveBasket();}
      S.modal=null;S.edit=null;say('저장했어요. MR 화면에 바로 반영됩니다.');
    }
    if(f.id==='scriptForm'){
      var title=val('mTitle');if(!title){say('제목을 넣어주세요.');render();return;}
      var old2=S.edit?S.scripts.filter(function(x){return x.id===S.edit;})[0]:null;
      var sd={stage:val('mStage'),type:val('mType'),title:title,text:document.getElementById('mText').value,tool:val('mTool')||null,sort:old2?old2.sort:S.scripts.length+1};
      S.busy=true;render();
      var ms=await api.saveScript(S.edit,sd);
      if(S.edit){S.scripts=S.scripts.map(function(x){return x.id===S.edit?ms:x;});}else{S.scripts.push(ms);}
      S.modal=null;S.edit=null;say('저장했어요.');
    }
    if(f.id==='contactForm'){
      var topic=val('cTopic');if(!topic){say('어떤 문의인지 적어주세요.');render();return;}
      var old3=S.edit?S.contacts.filter(function(x){return x.id===S.edit;})[0]:null;
      var cd={topic:topic,dept:val('cDept'),tel:val('cTel'),tags:[].slice.call(f.querySelectorAll('input[name=tg]:checked')).map(function(x){return x.value;}),sort:old3?old3.sort:S.contacts.length+1};
      S.busy=true;render();
      var cs=await api.saveContact(S.edit,cd);
      if(S.edit){S.contacts=S.contacts.map(function(x){return x.id===S.edit?cs:x;});}else{S.contacts.push(cs);}
      S.modal=null;S.edit=null;say('저장했어요.');
    }
    if(f.id==='userForm'){
      var u={emp_no:val('uEmp'),name:val('uName'),division:val('uDiv'),office:val('uOff'),role:val('uRole'),password:val('uPw')};
      if(!/^[0-9A-Za-z]{3,20}$/.test(u.emp_no)){say('사번은 영문·숫자 3~20자로 넣어주세요.');render();return;}
      if(u.role==='mr'){u.password=mrPw(u.emp_no);}
      else if(!S.edit&&u.password.length<6){say('관리자는 6자 이상 비밀번호가 필요해요.');render();return;}
      else if(u.password&&u.password.length<6){say('비밀번호는 6자 이상이어야 해요.');render();return;}
      S.busy=true;render();await api.upsertMember(u);S.members=await api.members();
      S.modal=null;S.edit=null;say(u.role==='mr'?'저장했어요. 이제 사번만으로 들어갈 수 있어요.':'저장했어요.');
    }
    if(f.id==='bulkForm'){
      var lines=document.getElementById('bulkText').value.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
      if(!lines.length){say('붙여넣은 명단이 없어요.');render();return;}
      S.busy=true;render();var okN=0,bad=[];
      for(var i=0;i<lines.length;i++){
        var c=lines[i].split(/\t|,/).map(function(x){return x.trim();});
        try{if(!/^[0-9A-Za-z]{3,20}$/.test(c[0]||''))throw new Error('형식');
          await api.upsertMember({emp_no:c[0],name:c[1]||'',division:c[2]||'',office:c[3]||'',role:'mr',password:mrPw(c[0])});okN++;}
        catch(err){bad.push(i+1);}
      }
      S.members=await api.members();S.modal=null;
      say(okN+'명 등록했어요.'+(bad.length?' '+bad.join(', ')+'번째 줄은 형식이 맞지 않아 건너뛰었어요.':''));
    }
  }catch(err){S.busy=false;fail(err);return;}
  S.busy=false;render();
});

/* ---------- 시작 ---------- */
(async function(){
  api.init();
  try{var uid=await api.session();if(uid)await afterLogin(uid);}
  catch(e){console.error(e);S.uid=null;}
  S.boot=false;render();
})();
})();
