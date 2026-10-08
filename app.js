const SUPABASE_URL = "https://pdvwyfolkyuqipfwbggb.supabase.co";
const SUPABASE_KEY = "sb_publishable_wzer9xrRSfmFieTPg-xb1A_kg10P-pF";
const DEVICE_KEY = "eyoklama_v3_device";
const TEACHER_NAME_KEY = "eyoklama_v3_teacher_name";
const TEACHER_WEEK_UNTIL_KEY = "eyoklama_v3_teacher_week_until";
function getDeviceToken(){
  if(typeof localStorage === "undefined") return "0000000000000000000000000000000000000000000000000000000000000000";
  let v=localStorage.getItem(DEVICE_KEY)||"";
  if(!/^[0-9a-f]{64}$/.test(v)){
    const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
    v=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    localStorage.setItem(DEVICE_KEY,v);
  }
  return v;
}
const deviceToken=getDeviceToken();
let sb=null;
async function getSupabaseClient(){
  if(sb)return sb;
  for(let i=0;i<50&&(typeof window === "undefined" || !window.supabase);i++){
    await new Promise(r=>setTimeout(r,100));
  }
  if(typeof window === "undefined" || !window.supabase)throw new Error("Bağlantı modülü yüklenemedi. İnternet bağlantısını kontrol edip tekrar deneyin.");
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
  return sb;
}

let token = "";
if(typeof sessionStorage !== "undefined") sessionStorage.removeItem("eyoklama_v2_session");
let app = { role:null, displayName:"", lists:[], history:[], teacherPin:null, teacherPinDate:null };
let active = null;
let attendanceLockTimer = null;
let importedStudents = [];
let attendanceCache = {};
let historyGroupIndex = {};
let historyGroupCache = {};
let historyDrafts = {};
let historyEditModes = {};
let historyUndoTokens = {};
let showArchived = false;

const $ = id => typeof document !== "undefined" ? document.getElementById(id) : null;
const escapeHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const fullName = s => `${s.firstName || ""} ${s.lastName || ""}`.replace(/\s+/g," ").trim();
const fmt = iso => new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
function dayKey(iso){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));
  const get=t=>parts.find(p=>p.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function todayKey(){return dayKey(new Date().toISOString())}
function formatHistoryDay(day){
  const [y,m,d]=String(day).split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR",{
    timeZone:"Europe/Istanbul",weekday:"long",day:"numeric",month:"long",year:"numeric"
  }).format(new Date(Date.UTC(y,m-1,d,9,0,0)));
}
function todayAttendanceCount(listId){
  const d=todayKey();
  return app.history.filter(h=>!h.archivedAt&&h.listId===listId&&dayKey(h.takenAt)===d).length;
}
function buildHistoryGroups(){
  const map=new Map();
  app.history
    .filter(h=>!h.archivedAt||showArchived)
    .forEach(h=>{
      const archived=!!h.archivedAt;
      const rawKey=`${h.listId||h.listName}|${dayKey(h.takenAt)}|${archived?"a":"n"}`;
      if(!map.has(rawKey))map.set(rawKey,{rawKey,archived,items:[]});
      map.get(rawKey).items.push(h);
    });
  const groups=[...map.values()];
  groups.forEach(g=>g.items.sort((a,b)=>new Date(a.takenAt)-new Date(b.takenAt)));
  groups.sort((a,b)=>new Date(b.items[b.items.length-1].takenAt)-new Date(a.items[a.items.length-1].takenAt));
  return groups;
}
function selectedHistoryItem(key){
  const g=historyGroupCache[key];if(!g)return null;
  const i=Math.min(historyGroupIndex[g.rawKey]||0,g.items.length-1);
  historyGroupIndex[g.rawKey]=Math.max(0,i);
  return {group:g,index:i,item:g.items[i]};
}
function formatCardDate(iso){
  const parts=new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"2-digit",timeZone:"Europe/Istanbul"}).formatToParts(new Date(iso));
  const d=parts.find(p=>p.type==="day")?.value||"";
  const m=parts.find(p=>p.type==="month")?.value||"";
  const y=parts.find(p=>p.type==="year")?.value||"";
  return `${d}.${m}.${y}`;
}
function formatCardTime(iso){
  return new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}).format(new Date(iso));
}
function historyInfoHtml(h,g){
  return `<strong>${escapeHtml(h.listName)}${g.archived?`<span class="archive-tag">ARŞİV</span>`:""}</strong>
    <div class="history-card-meta">
      <span class="history-card-date">${formatCardDate(h.takenAt)}</span>
      <div class="history-card-times">
        ${g.items.map(it=>`<span class="history-time-badge">${formatCardTime(it.takenAt)}</span>`).join("")}
      </div>
      <span class="history-card-teacher">${escapeHtml(h.takenByName)}</span>
    </div>`;
}

const LOGIN_ATTEMPTS_KEY="eyoklama_login_attempts";
function getLoginRateLimitMsg(){
  try{
    const rec=JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY)||"{}");
    const now=Date.now();
    if(rec.blockedUntil&&rec.blockedUntil>now){
      const sec=Math.ceil((rec.blockedUntil-now)/1000);
      return `Çok fazla hatalı deneme yapıldı. Lütfen ${sec} saniye bekleyin.`;
    }
  }catch{}
  return null;
}
function recordFailedAttempt(){
  try{
    const now=Date.now();
    const rec=JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY)||"{}");
    const cnt=(rec.count||0)+1;
    if(cnt>=3){
      rec.blockedUntil=now+30000;
      rec.count=0;
    }else{
      rec.count=cnt;
    }
    localStorage.setItem(LOGIN_ATTEMPTS_KEY,JSON.stringify(rec));
  }catch{}
}
function resetLoginAttempts(){
  try{localStorage.removeItem(LOGIN_ATTEMPTS_KEY)}catch{}
}

function toast(msg){
  const t=$("toast"); t.textContent=msg; t.classList.remove("hidden");
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.add("hidden"),3000);
}
function loginMsg(msg, type="error"){
  const e=$("loginMessage"); e.textContent=msg; e.className=`notice ${type}`; e.classList.remove("hidden");
}
function revealPassword(id){
  const el=$(id);if(!el)return;
  clearTimeout(el._hideTimer);
  el.type="text";
  el._hideTimer=setTimeout(()=>{el.type="password"},1000);
}
function cleanRpcError(err){
  if(typeof navigator!=="undefined"&&!navigator.onLine) return "İnternet bağlantısı yok.";
  let m=err?.message || "İşlem başarısız.";
  m=m.replace(/^.*?P0001[: ]*/i,"").replace(/^.*?message[: ]*/i,"");
  return m;
}
async function rpc(name, params={}){
  const client=await getSupabaseClient();
  const {data,error}=await client.rpc(name,params);
  if(error) throw new Error(cleanRpcError(error));
  return data;
}
function setSession(result){
  token=result.token;
  app.role=result.role; app.displayName=result.displayName;
  if(result.role==="teacher"){
    localStorage.setItem(TEACHER_NAME_KEY,result.displayName||"");
    localStorage.setItem(TEACHER_WEEK_UNTIL_KEY,result.teacherWeekEndsAt||result.expiresAt||"");
  }
}
function rememberedTeacher(){
  const name=localStorage.getItem(TEACHER_NAME_KEY)||"";
  const until=localStorage.getItem(TEACHER_WEEK_UNTIL_KEY)||"";
  const valid=name&&until&&!Number.isNaN(new Date(until).getTime())&&new Date(until).getTime()>Date.now();
  return {name,until,valid};
}
function renderLoginMode(forceCredentials=false){
  const remembered=rememberedTeacher();
  const continueBox=$("continueLogin"),credentials=$("credentialLogin"),msg=$("loginMessage");
  if(!continueBox||!credentials)return;

  if(remembered.valid&&!forceCredentials){
    $("continueTeacherBtn").textContent=`${remembered.name} olarak devam et`;
    continueBox.classList.remove("hidden");
    credentials.classList.add("hidden");
  }else{
    continueBox.classList.add("hidden");
    credentials.classList.remove("hidden");
    if(remembered.name&&!$("loginName").value)$("loginName").value=remembered.name;
  }
  if(msg)msg.classList.add("hidden");
}
async function bootstrap(){
  const data=await rpc("app_bootstrap",{p_token:token});
  app={...app,...data};
  showApp(); renderCurrent();
}
async function logout(){
  if(!confirm("Çıkış yapılsın mı?"))return;
  try{
    if(token&&active?.listId) await rpc("release_attendance",{p_token:token,p_list_id:active.listId});
  }catch{}
  clearInterval(attendanceLockTimer);attendanceLockTimer=null;
  try{ if(token) await rpc("app_logout",{p_token:token}); }catch{}
  token=""; active=null;attendanceCache={};
  sessionStorage.removeItem("eyoklama_active");
  if(typeof window !== "undefined"){
    $("appView")?.classList.add("hidden"); $("loginView")?.classList.remove("hidden");
    if($("loginPin")) $("loginPin").value="";
    renderLoginMode();
  }
}

if(typeof window !== "undefined"){
  $("loginBtn")?.addEventListener("click", async()=>{
    const limit=getLoginRateLimitMsg();
    if(limit){loginMsg(limit);return}
    const btn=$("loginBtn");
    try{
      btn.disabled=true;btn.classList.add("loading");btn.textContent="Giriş yapılıyor…";
      const name=$("loginName").value.trim(), pin=$("loginPin").value.trim();
      if(!name){throw new Error("Hoca adını yazın.")}
      if(!pin){throw new Error("PIN / parolayı yazın.")}
      const r=await rpc("app_login",{p_name:name,p_pin:pin,p_device_token:deviceToken});
      if(!r?.ok){
        recordFailedAttempt();
        throw new Error(r?.error||"Giriş başarısız.");
      }
      resetLoginAttempts();
      setSession(r); await bootstrap();
    }catch(e){
      const l=getLoginRateLimitMsg();
      loginMsg(l||e.message);
    }finally{
      btn.disabled=false;btn.classList.remove("loading");btn.textContent="Giriş yap";
    }
  });

  $("continueTeacherBtn")?.addEventListener("click", async()=>{
    const limit=getLoginRateLimitMsg();
    if(limit){loginMsg(limit);return}
    const btn=$("continueTeacherBtn");
    const remembered=rememberedTeacher();
    try{
      btn.disabled=true;btn.classList.add("loading");btn.textContent="Giriş yapılıyor…";
      const r=await rpc("app_login",{p_name:"",p_pin:"",p_device_token:deviceToken});
      if(!r?.ok){
        recordFailedAttempt();
        if(r?.code==="WEEKLY_PIN_REQUIRED"){
          localStorage.removeItem(TEACHER_WEEK_UNTIL_KEY);
          renderLoginMode(true);
          $("loginName").value=remembered.name||"";
          $("loginPin").focus();
          loginMsg(r.error||"Bu haftanın ilk girişinde PIN gerekli.");
          return;
        }
        throw new Error(r?.error||"Giriş başarısız.");
      }
      resetLoginAttempts();
      setSession(r);await bootstrap();
    }catch(e){
      renderLoginMode(true);
      $("loginName").value=remembered.name||"";
      const l=getLoginRateLimitMsg();
      loginMsg(l||e.message);
    }finally{
      btn.disabled=false;btn.classList.remove("loading");
      const nowRemembered=rememberedTeacher();
      btn.textContent=nowRemembered.name?`${nowRemembered.name} olarak devam et`:"Hoca olarak devam et";
    }
  });

  $("differentTeacherBtn")?.addEventListener("click", ()=>{
    renderLoginMode(true);
    $("loginName").value="";
    $("loginPin").value="";
    $("loginName").focus();
  });

  ["loginName","loginPin"].forEach(id=>$(id)?.addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn")?.click()}));
  if($("logoutBtn")) $("logoutBtn").onclick=logout;
  renderLoginMode();

  window.addEventListener("offline",()=>toast("İnternet bağlantısı kesildi."));
  window.addEventListener("online",()=>toast("İnternet bağlantısı yeniden kuruldu."));
}

function showApp(){
  if(typeof window === "undefined") return;
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("adminTabButton").classList.toggle("hidden",app.role!=="admin");
  window.scrollTo(0,0);
}
if(typeof document !== "undefined"){
  document.querySelectorAll(".tab[data-tab]").forEach(b=>b.onclick=()=>{
    const activeTab=document.querySelector(".tab.active");
    if(activeTab?.dataset.tab===b.dataset.tab && $("attendancePage")?.classList.contains("hidden")){
      window.scrollTo({top:0,behavior:"smooth"});
      return;
    }
    switchTab(b.dataset.tab);
  });
}
function switchTab(tab){
  if(tab!=="history"){historyDrafts={};historyEditModes={}}
  active=null;
  sessionStorage.removeItem("eyoklama_active");
  $("attendancePage").classList.add("hidden");
  $("tabs").classList.remove("hidden");
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  const btn=document.querySelector(`.tab[data-tab="${tab}"]`);if(btn)btn.classList.add("active");
  $(`${tab}Page`).classList.remove("hidden");
  if(tab==="lists")renderLists();
  if(tab==="new")renderNewList();
  if(tab==="history")renderHistory();
  if(tab==="admin")renderAdmin();
  window.scrollTo(0,0);
}
function renderCurrent(){
  try{
    const saved=JSON.parse(sessionStorage.getItem("eyoklama_active")||"null");
    if(saved?.listId&&saved?.students){
      active=saved;
      startAttendanceHeartbeat(active.listId);
      renderAttendance();
      return;
    }
  }catch{}
  switchTab("lists");
}
async function refresh(){
  const data=await rpc("app_bootstrap",{p_token:token});app={...app,...data};attendanceCache={};
}

const TODAY_PERMISSIONS_KEY="eyoklama_v3_today_permissions";
function getTodayPermissions(){
  try{
    const raw=JSON.parse(localStorage.getItem(TODAY_PERMISSIONS_KEY)||"{}");
    return raw[todayKey()]||{};
  }catch{return {}}
}
function saveTodayPermissions(permMap){
  try{
    const raw={[todayKey()]:permMap};
    localStorage.setItem(TODAY_PERMISSIONS_KEY,JSON.stringify(raw));
  }catch{}
}

let tempPrePermissions={};

function openPrePermissionModal(){
  tempPrePermissions={...getTodayPermissions()};
  const modal=$("prePermissionModal");
  if(modal)modal.classList.remove("hidden");
  const input=$("prePermissionSearch");
  if(input)input.value="";
  renderPrePermissionList();
}

function closePrePermissionModal(){
  const modal=$("prePermissionModal");
  if(modal)modal.classList.add("hidden");
}

function renderPrePermissionList(){
  const q=($("prePermissionSearch")?.value||"").trim().toLowerCase();
  const allStudents=[];
  app.lists.forEach(l=>{
    l.students.forEach(s=>{
      const name=fullName(s);
      if(!q||name.toLowerCase().includes(q)||l.name.toLowerCase().includes(q)){
        allStudents.push({...s,name,listName:l.name});
      }
    });
  });

  allStudents.sort((a,b)=>a.name.localeCompare(b.name,"tr"));

  const listEl=$("prePermissionList");
  if(!listEl)return;

  if(!allStudents.length){
    listEl.innerHTML=`<div class="muted tiny" style="text-align:center;padding:24px">Öğrenci bulunamadı.</div>`;
    return;
  }

  listEl.innerHTML=allStudents.map(s=>{
    const isChecked=!!tempPrePermissions[s.id];
    return `<div class="student-select-item ${isChecked?"checked":""}" onclick="togglePrePermission('${s.id}')">
      <div class="student-meta">
        <strong>${escapeHtml(s.name)}</strong>
        <span class="student-class">${escapeHtml(s.listName)}</span>
      </div>
      <span class="check-badge">${isChecked?"± İzinli":"Seç"}</span>
    </div>`;
  }).join("");
}

function filterPrePermissionList(){
  renderPrePermissionList();
}

function togglePrePermission(studentId){
  if(tempPrePermissions[studentId]){
    delete tempPrePermissions[studentId];
  }else{
    tempPrePermissions[studentId]=true;
  }
  renderPrePermissionList();
}

async function savePrePermissions(){
  saveTodayPermissions(tempPrePermissions);
  closePrePermissionModal();
  renderLists();
  toast("Günün izinlileri kaydedildi.");

  const d=todayKey();
  const todayHistory=app.history.filter(h=>!h.archivedAt&&dayKey(h.takenAt)===d);
  const permMap=tempPrePermissions;

  if(todayHistory.length && Object.keys(permMap).length){
    for(const h of todayHistory){
      try{
        const att=attendanceCache[h.id]||await rpc("get_attendance",{p_token:token,p_attendance_id:h.id});
        const changes={};
        att.entries.forEach(e=>{
          const sId=e.studentId;
          if(sId && permMap[sId] && e.status!=="excused"){
            changes[sId]="excused";
          }
        });
        if(Object.keys(changes).length){
          await rpc("apply_attendance_changes",{p_token:token,p_attendance_id:h.id,p_changes:changes});
          delete attendanceCache[h.id];
        }
      }catch{}
    }
    await refresh();
  }
}

function renderLists(){
  const todayPerms=getTodayPermissions();
  const permCount=Object.keys(todayPerms).length;
  const permBadge=permCount>0?`<span class="badge-count">${permCount}</span>`:"";

  $("listsPage").innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h1 class="page-title" style="margin:0">YOKLAMALAR</h1>
    <button type="button" class="btn secondary small" onclick="openPrePermissionModal()" title="Günün İzinlilerini Seç">
      ± İzinli Ekle ${permBadge}
    </button>
  </div>
  <div class="grid">${app.lists.map(l=>`<article id="listCard-${l.id}" class="list-card">
    <div><h3>${escapeHtml(l.name)}</h3><div class="muted tiny">${l.students.length} öğrenci · Bugün ${todayAttendanceCount(l.id)}</div></div>
    <div class="list-actions">
      <button class="icon-btn ghost list-action" onclick="downloadAllClassPdf('${l.id}')" aria-label="Yoklamaları yazdır / indir" title="Yazdır / PDF">
        <svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg>
      </button>
      <button class="icon-btn list-action" onclick="startAttendance('${l.id}')" aria-label="Yoklama al" title="Yoklama al">
        <svg viewBox="0 0 24 24"><path d="M9 5h6"/><path d="M9 11l2 2 4-4"/><path d="M9 17h6"/><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>
      </button>
    </div>
  </article>`).join("") || `<div class="card" style="text-align:center;padding:32px 16px"><p class="muted" style="margin-bottom:12px">Henüz sınıf eklenmemiş.</p><button class="btn small" onclick="switchTab('new')">Yeni Sınıf Ekle</button></div>`}</div>`;
}
async function startAttendance(listId){
  const list=app.lists.find(x=>x.id===listId); if(!list)return;
  try{
    let lock=await rpc("begin_attendance",{p_token:token,p_list_id:listId});
    if(!lock?.ok){
      if(confirm(`${lock?.error||"Bu sınıfta yoklama zaten alınıyor."}\n\nEski kilidi kaldırıp yoklamaya devam etmek ister misiniz?`)){
        try{ await rpc("release_attendance",{p_token:token,p_list_id:listId}); }catch{}
        lock=await rpc("begin_attendance",{p_token:token,p_list_id:listId});
      }
      if(!lock?.ok){toast(lock?.error||"Bu sınıfta yoklama zaten alınıyor.");return}
    }
  }catch(e){toast(e.message);return}

  const todayPerms=getTodayPermissions();
  const sortedStudents=[...list.students].sort((a,b)=>fullName(a).localeCompare(fullName(b),"tr"));
  const statuses={};
  const preExcused={};
  sortedStudents.forEach(s=>{
    if(todayPerms[s.id]){
      statuses[s.id]="excused";
      preExcused[s.id]=true;
    }else{
      statuses[s.id]="absent";
    }
  });
  active={mode:"new",listId:list.id,listName:list.name,students:sortedStudents,statuses,preExcused};
  startAttendanceHeartbeat(list.id);
  renderAttendance();
}
function startAttendanceHeartbeat(listId){
  clearInterval(attendanceLockTimer);
  attendanceLockTimer=setInterval(async()=>{
    if(!active||active.listId!==listId){clearInterval(attendanceLockTimer);attendanceLockTimer=null;return}
    try{
      await rpc("heartbeat_attendance",{p_token:token,p_list_id:listId});
    }catch(e){
      clearInterval(attendanceLockTimer);attendanceLockTimer=null;
      if(active){
        try{
          await rpc("save_attendance",{p_token:token,p_list_id:active.listId,p_statuses:active.statuses});
        }catch{}
      }
      active=null;
      sessionStorage.removeItem("eyoklama_active");
      await refresh();
      toast("Oturum süresi doldu, yoklama kaydedilerek arşive eklendi.");
      switchTab("history");
    }
  },45000);
}
function renderAttendance(){
  sessionStorage.setItem("eyoklama_active",JSON.stringify(active));
  $("tabs").classList.add("hidden");
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  const root=$("attendancePage");root.classList.remove("hidden");
  root.innerHTML=`<div class="attendance-shell">
    <div class="attendance-top">
      <button class="icon-btn ghost" onclick="cancelAttendance()" aria-label="Geri" title="Geri">
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="attendance-title">
        <strong>${escapeHtml(active.listName)}</strong>
      </div>
      <div id="topCounts" class="top-counts"></div>
    </div>

    <div class="student-list">${active.students.map(renderStudent).join("")}</div>

    <button class="save-fab" onclick="saveNewAttendance()"
      aria-label="Kaydet" title="Kaydet">
      <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
    </button>
  </div>`;
  updateCounts();
}
function renderStudent(s){
  const st=active.statuses[s.id]||"absent";
  const isLocked=!!active?.preExcused?.[s.id];
  const stateLabel=st==="present"?"+":st==="excused"?"±":"-";
  const lockedClass=isLocked?"locked":"";
  const lockTag=isLocked?`<span style="font-size:0.68rem;color:#d97706;margin-left:4px" title="İdare İzni (Kilitli)">🔒</span>`:"";
  return `<div class="student-card ${lockedClass}" onclick="handleStudentTap(event,'${s.id}')">
    <span class="student-bullet" aria-hidden="true">•</span>
    <span class="student-name">${escapeHtml(fullName(s))}${lockTag}</span>
    <span class="attendance-tag ${st} ${lockedClass}">${stateLabel}</span>
  </div>`;
}
function handleStudentTap(ev,id){
  ev.preventDefault();
  ev.stopPropagation();
  if(active?.preExcused?.[id]){
    toast("Bu öğrenci idare tarafından önceden İzinli (±) olarak kilitlendi.");
    return;
  }
  const cur=active.statuses[id]||"absent";
  active.statuses[id]=cur==="absent"?"present":cur==="present"?"excused":"absent";
  renderAttendance();
}
function updateCounts(){
  const vals=Object.values(active.statuses), c={
    present:vals.filter(x=>x==="present").length,
    absent:vals.filter(x=>x==="absent").length,
    excused:vals.filter(x=>x==="excused").length
  };
  const el=$("topCounts");
  if(el) el.innerHTML=`
    <span class="top-count present" title="Var (+)"><b>${c.present}</b><span>+</span></span>
    <span class="top-count absent" title="Yok (-)"><b>${c.absent}</b><span>-</span></span>
    <span class="top-count excused" title="İzinli (±)"><b>${c.excused}</b><span>±</span></span>`;

  const fab=document.querySelector(".save-fab");
  if(fab){
    const hasActive=(c.present+c.excused)>0;
    fab.classList.toggle("dimmed",!hasActive);
  }
}
async function cancelAttendance(){
  if(active){
    const hasChanges=Object.values(active.statuses||{}).some(st=>st!=="absent");
    if(hasChanges&&!confirm("Değişiklikler kaydedilmedi. Çıkılsın mı?"))return;
  }
  const listId=active?.listId;
  clearInterval(attendanceLockTimer);attendanceLockTimer=null;
  if(listId){
    try{await rpc("release_attendance",{p_token:token,p_list_id:listId})}catch{}
  }
  active=null;sessionStorage.removeItem("eyoklama_active");switchTab("lists");
}
async function saveNewAttendance(){
  const vals=Object.values(active.statuses);
  const p=vals.filter(x=>x==="present").length,a=vals.filter(x=>x==="absent").length,e=vals.filter(x=>x==="excused").length;
  if(!confirm(`Kaydet?  + ${p} · - ${a} · ± ${e}`))return;
  try{
    await rpc("save_attendance",{p_token:token,p_list_id:active.listId,p_statuses:active.statuses});
    clearInterval(attendanceLockTimer);attendanceLockTimer=null;
    active=null;
    sessionStorage.removeItem("eyoklama_active");
    await refresh();
    toast("Yoklama kaydedildi ve kilitlendi.");
    switchTab("history");
  }catch(e){toast(e.message)}
}

function renderHistory(){
  const groups=buildHistoryGroups();
  historyGroupCache={};
  let lastDay="";
  const cards=groups.map((g,i)=>{
    const key=`g${i}`;historyGroupCache[key]=g;
    const sel=selectedHistoryItem(key), h=sel.item;
    const day=dayKey(h.takenAt);
    const divider=day!==lastDay?`<div class="history-day">
      <div class="history-day-line"><span class="history-day-label">${escapeHtml(formatHistoryDay(day))}</span></div>
      <button type="button" class="history-day-download" onclick="downloadDayPdf('${day}')" aria-label="${escapeHtml(formatHistoryDay(day))} PDF indir" title="Günün PDF'ini indir">
        <svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
      </button>
    </div>`:"";
    lastDay=day;

    return `${divider}<details id="historyCard-${key}" class="history-item" ontoggle="toggleHistoryGroup(this,'${key}')">
      <summary>
        <div class="history-summary">
          <div id="historyInfo-${key}" style="flex:1;min-width:0">${historyInfoHtml(h,g)}</div>
          <div class="history-summary-actions">
            <span class="history-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
            </span>
          </div>
        </div>
      </summary>
      <div id="historyBody-${key}" class="history-body"><div class="muted tiny">Yükleniyor…</div></div>
    </details>`;
  }).join("");

  $("historyPage").innerHTML=`<h1 class="page-title">ALINANLAR</h1>
    <div class="history-controls"><button class="archive-toggle" onclick="toggleArchiveView()">${showArchived?"Arşivi gizle":"Arşivi göster"}</button></div>
    <div class="history">${cards||`<div class="card" style="text-align:center;padding:32px 16px"><p class="muted" style="margin-bottom:12px">Henüz yoklama kaydı yok.</p><button class="btn small" onclick="switchTab('lists')">Yoklamalara Git</button></div>`}</div>`;
}
function toggleArchiveView(){
  showArchived=!showArchived;
  renderHistory();
}
async function toggleHistoryGroup(el,key){
  if(el.open){await loadHistoryGroup(key);return}
  const g=historyGroupCache[key];
  if(g)g.items.forEach(h=>{delete historyDrafts[h.id];delete historyEditModes[h.id]});
}
async function loadHistoryGroup(key){
  const g=historyGroupCache[key];if(!g)return;
  const body=$(`historyBody-${key}`);if(!body)return;
  const missing=g.items.filter(h=>!attendanceCache[h.id]);
  if(missing.length){
    body.innerHTML=`<div class="muted tiny">Yükleniyor…</div>`;
    try{
      await Promise.all(missing.map(async h=>{
        attendanceCache[h.id]=await rpc("get_attendance",{p_token:token,p_attendance_id:h.id});
      }));
    }catch(e){body.innerHTML=`<div class="notice error">${escapeHtml(e.message)}</div>`;return}
  }
  renderHistoryBody(key);
}
function draftStatus(attendanceId,entry){
  return historyDrafts[attendanceId]?.[entry.id] ?? entry.status;
}
function hasHistoryDraft(attendanceId){
  return !!historyDrafts[attendanceId] && Object.keys(historyDrafts[attendanceId]).length>0;
}
function renderHistoryBody(key){
  const g=historyGroupCache[key];if(!g)return;
  const body=$(`historyBody-${key}`);if(!body)return;
  const editing=g.items.some(h=>!!historyEditModes[h.id]);
  const archived=!!g.archived;

  const studentMap=new Map();
  g.items.forEach(h=>{
    const r=attendanceCache[h.id];
    if(r)r.entries.forEach(e=>{
      const k=e.studentId||`${e.firstName}|${e.lastName}`;
      if(!studentMap.has(k))studentMap.set(k,{id:e.studentId,key:k,firstName:e.firstName,lastName:e.lastName});
    });
  });
  const students=[...studentMap.values()].sort((a,b)=>`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`,"tr"));

  body.innerHTML=`
    <div class="history-grid">
      <div class="history-grid-header">
        <span class="muted tiny" style="font-weight:700">Öğrenci</span>
        <div class="history-grid-cols">
          ${g.items.map((h,idx)=>`
            <div class="h-col-head">${idx+1}/${g.items.length}</div>
          `).join("")}
        </div>
      </div>

      ${students.map(s=>`
        <div class="history-grid-row">
          <span class="history-grid-name">${escapeHtml(`${s.firstName} ${s.lastName}`)}</span>
          <div class="history-grid-cols">
            ${g.items.map(h=>{
              const r=attendanceCache[h.id];
              const entry=r?.entries.find(e=>(e.studentId&&e.studentId===s.id)||(e.firstName===s.firstName&&e.lastName===s.lastName));
              if(!entry)return `<span class="h-cell empty">·</span>`;
              const st=draftStatus(h.id,entry);
              const sym=st==="present"?"+":st==="excused"?"±":"-";
              const canEdit=editing&&!archived&&(app.role==="admin"||st!=="present");
              return canEdit
                ?`<button type="button" class="h-cell btn-cell ${st}" onclick="stageHistoryStatus('${h.id}','${entry.id}','${key}')">${sym}</button>`
                :`<span class="h-cell ${st}">${sym}</span>`;
            }).join("")}
          </div>
        </div>
      `).join("")}

      <div class="history-grid-footer">
        <div class="history-group-actions">
          <button type="button" class="history-tool" onclick="downloadHistoryPdf('${key}')" aria-label="Tümünü PDF indir" title="Tümünü PDF indir">
            <svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
          </button>
          <button type="button" class="history-tool summary-icon" onclick="copyHistoryAll('${key}',event)" aria-label="Tümünü kopyala" title="Tümünü kopyala">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          ${!archived&&!editing?`<button type="button" class="history-tool" onclick="toggleHistoryEdit('${key}')" aria-label="Düzenle" title="Düzenle">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>
          </button>`:""}
          ${!archived&&editing?`<button type="button" class="history-save" onclick="saveHistoryChanges('${key}')" aria-label="Düzenlemeyi onayla" title="Onayla">
            <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
          </button>`:""}
          ${app.role==="admin"&&!archived?`<button type="button" class="history-tool archive" onclick="archiveHistoryAttendance('${key}')" aria-label="Arşivle" title="Arşivle">
            <svg viewBox="0 0 24 24"><path d="M3 5h18"/><path d="M5 5l1 15h12l1-15"/><path d="M9 9h6"/></svg>
          </button>`:""}
          ${!archived&&g.items.some(h=>historyUndoTokens[h.id])?`<button type="button" class="archive-toggle" onclick="undoHistoryChange('${key}')">Geri al</button>`:""}
        </div>
        <div class="history-col-actions">
          <div class="history-grid-cols">
            ${g.items.map((h,idx)=>`
              <button type="button" class="icon-btn ghost h-download-btn" onclick="downloadSingleAttendancePdf('${h.id}')" aria-label="${idx+1}/${g.items.length} PDF indir" title="${idx+1}/${g.items.length} PDF indir">
                <svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
              </button>
            `).join("")}
          </div>
          <div class="history-grid-cols">
            ${g.items.map((h,idx)=>`
              <button type="button" class="icon-btn ghost h-download-btn summary-icon" onclick="copySingleAttendance('${h.id}',event)" aria-label="${idx+1}/${g.items.length} kopyala" title="${idx+1}/${g.items.length} kopyala">
                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    </div>

    ${app.role==="admin"&&!archived&&g.items.some(h=>historyUndoTokens[h.id])?`<div id="undoPanel-${key}" class="undo-confirm hidden">
      <div class="password-wrap">
        <input id="undoPassword-${key}" type="password" maxlength="64" autocomplete="current-password" placeholder="Üst yetkili parolası">
        <button type="button" class="password-eye" onclick="revealPassword('undoPassword-${key}')" aria-label="Parolayı göster" title="1 saniye göster">
          <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
        </button>
      </div>
      <button class="btn small" onclick="confirmSavedUndo('${key}')">Onayla</button>
    </div>`:""}`;
}
function toggleHistoryEdit(key){
  const g=historyGroupCache[key];if(!g)return;
  const anyEditing=g.items.some(h=>historyEditModes[h.id]);
  if(anyEditing){
    g.items.forEach(h=>{delete historyEditModes[h.id];delete historyDrafts[h.id]});
  }else{
    g.items.forEach(h=>{historyEditModes[h.id]=true});
  }
  renderHistoryBody(key);
}
function stageHistoryStatus(attendanceId,entryId,key){
  const r=attendanceCache[attendanceId], e=r?.entries.find(x=>x.id===entryId);
  if(!e)return;
  const cur=draftStatus(attendanceId,e);
  let nxt;

  if(app.role==="admin"){
    nxt=cur==="present"?"absent":cur==="absent"?"excused":"present";
  }else{
    if(cur==="present")return;
    nxt=cur==="absent"?"excused":"absent";
  }

  historyDrafts[attendanceId] ||= {};
  if(nxt===e.status) delete historyDrafts[attendanceId][entryId];
  else historyDrafts[attendanceId][entryId]=nxt;
  if(!Object.keys(historyDrafts[attendanceId]).length) delete historyDrafts[attendanceId];

  renderHistoryBody(key);
}
async function saveHistoryChanges(key){
  const g=historyGroupCache[key];if(!g)return;
  const withDrafts=g.items.filter(h=>historyDrafts[h.id]&&Object.keys(historyDrafts[h.id]).length);
  if(!withDrafts.length){
    g.items.forEach(h=>{delete historyEditModes[h.id];delete historyDrafts[h.id]});
    renderHistoryBody(key);
    return;
  }
  try{
    for(const h of withDrafts){
      const res=await rpc("apply_attendance_changes",{
        p_token:token,
        p_attendance_id:h.id,
        p_changes:historyDrafts[h.id]
      });
      if(res?.undoToken)historyUndoTokens[h.id]=res.undoToken;
      delete historyDrafts[h.id];
      delete historyEditModes[h.id];
      delete attendanceCache[h.id];
    }
    await refresh();
    toast("Değişiklikler kaydedildi.");
    await loadHistoryGroup(key);
  }catch(e){toast(e.message)}
}
function undoHistoryChange(key){
  const g=historyGroupCache[key];if(!g)return;
  const anyDraft=g.items.some(h=>hasHistoryDraft(h.id));
  if(anyDraft){
    g.items.forEach(h=>{delete historyDrafts[h.id];delete historyEditModes[h.id]});
    renderHistoryBody(key);
    return;
  }
  const h=g.items.find(it=>historyUndoTokens[it.id]);
  if(!h)return;
  if(app.role==="admin"){
    const panel=$(`undoPanel-${key}`);if(!panel)return;
    panel.classList.toggle("hidden");
    if(!panel.classList.contains("hidden"))$(`undoPassword-${key}`)?.focus();
    return;
  }
  if(confirm("Az önce kaydettiğiniz değişiklik geri alınsın mı?")){
    confirmSavedUndo(key);
  }
}
async function confirmSavedUndo(key){
  const g=historyGroupCache[key];if(!g)return;
  const h=g.items.find(it=>historyUndoTokens[it.id]);
  if(!h)return;
  const input=$(`undoPassword-${key}`);
  const password=app.role==="admin"?(input?.value||""):null;
  const undoToken=historyUndoTokens[h.id];
  if(!undoToken)return;
  if(app.role==="admin"&&!password){toast("Üst yetkili parolasını yazın.");return}

  try{
    await rpc("undo_attendance_change",{
      p_token:token,
      p_attendance_id:h.id,
      p_undo_token:undoToken,
      p_password:password
    });
    delete attendanceCache[h.id];
    delete historyDrafts[h.id];
    delete historyUndoTokens[h.id];
    await refresh();
    toast("Son değişiklik geri alındı.");
    await loadHistoryGroup(key);
  }catch(e){toast(e.message)}
}

async function downloadSingleAttendancePdf(attendanceId){
  try{
    if(typeof pdfMake==="undefined")throw new Error("PDF modülü yüklenemedi.");
    const h=app.history.find(x=>x.id===attendanceId);
    if(!h)throw new Error("Yoklama bulunamadı.");
    const section=await buildPdfClassSection([h]);
    if(!section)return;
    const doc={
      pageSize:"A4",
      pageMargins:[30,30,30,38],
      defaultStyle:{font:"Roboto",fontSize:9,color:"#202020"},
      content:section.content
    };
    pdfMake.createPdf(doc).download(`${safeFileName(section.listName)}-${section.day}-ders.pdf`);
  }catch(e){toast(e.message||"PDF oluşturulamadı.")}
}

async function copySingleAttendance(attendanceId,ev){
  if(ev){ev.preventDefault();ev.stopPropagation()}
  const btn=ev?.currentTarget;
  try{
    const r=attendanceCache[attendanceId]||await rpc("get_attendance",{p_token:token,p_attendance_id:attendanceId});
    attendanceCache[attendanceId]=r;

    const h=app.history.find(x=>x.id===attendanceId);
    const day=h?dayKey(h.takenAt):"";
    const sameGroup=app.history
      .filter(x=>x.listId===r.attendance.listId&&dayKey(x.takenAt)===day&&!x.archivedAt)
      .sort((a,b)=>new Date(a.takenAt)-new Date(b.takenAt));
    const sessionIdx=sameGroup.findIndex(x=>x.id===attendanceId);
    const sessionLabel=sameGroup.length>1?` (${sessionIdx+1}/${sameGroup.length})`:"";

    const dt=new Date(r.attendance.takenAt);
    const date=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",year:"numeric"}).format(dt);

    const sortedEntries=[...r.entries].sort((a,b)=>`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`,"tr"));
    const absent=sortedEntries.filter(e=>draftStatus(attendanceId,e)==="absent");
    const excused=sortedEntries.filter(e=>draftStatus(attendanceId,e)==="excused");

    let text=`${r.attendance.listName} · ${date}${sessionLabel}\n`;
    if(!absent.length&&!excused.length){
      text+="\n+";
    }else{
      const lines=[];
      absent.forEach(e=>lines.push(`- ${e.firstName} ${e.lastName}`));
      excused.forEach(e=>lines.push(`± ${e.firstName} ${e.lastName}`));
      text+="\n"+lines.join("\n");
    }

    await navigator.clipboard.writeText(text);
    if(btn){
      btn.classList.add("copied");
      setTimeout(()=>btn.classList.remove("copied"),650);
    }
    toast("Yoklama kopyalandı.");
  }catch(e){toast(e.message||"Kopyalanamadı.")}
}

async function copyHistoryAll(key,ev){
  if(ev){ev.preventDefault();ev.stopPropagation()}
  const btn=ev?.currentTarget;
  const g=historyGroupCache[key];if(!g||!g.items.length)return;
  try{
    for(const h of g.items){
      if(!attendanceCache[h.id]){
        attendanceCache[h.id]=await rpc("get_attendance",{p_token:token,p_attendance_id:h.id});
      }
    }

    const first=attendanceCache[g.items[0].id];
    const dt=new Date(first.attendance.takenAt);
    const date=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",year:"numeric"}).format(dt);
    const n=g.items.length;

    let text=`${first.attendance.listName} · ${date}`;

    if(n===1){
      const h=g.items[0];
      const r=attendanceCache[h.id];
      const sortedEntries=[...r.entries].sort((a,b)=>`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`,"tr"));
      const absent=sortedEntries.filter(e=>draftStatus(h.id,e)==="absent");
      const excused=sortedEntries.filter(e=>draftStatus(h.id,e)==="excused");
      if(!absent.length&&!excused.length){
        text+="\n\n+";
      }else{
        const lines=[];
        absent.forEach(e=>lines.push(`- ${e.firstName} ${e.lastName}`));
        excused.forEach(e=>lines.push(`± ${e.firstName} ${e.lastName}`));
        text+="\n\n"+lines.join("\n");
      }
    }else{
      g.items.forEach((h,idx)=>{
        const r=attendanceCache[h.id];
        const sortedEntries=[...r.entries].sort((a,b)=>`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`,"tr"));
        const absent=sortedEntries.filter(e=>draftStatus(h.id,e)==="absent");
        const excused=sortedEntries.filter(e=>draftStatus(h.id,e)==="excused");
        text+=`\n\n${idx+1}/${n}:`;
        if(!absent.length&&!excused.length){
          text+="\n+";
        }else{
          const lines=[];
          absent.forEach(e=>lines.push(`- ${e.firstName} ${e.lastName}`));
          excused.forEach(e=>lines.push(`± ${e.firstName} ${e.lastName}`));
          text+="\n"+lines.join("\n");
        }
      });
    }

    await navigator.clipboard.writeText(text);
    if(btn){
      btn.classList.add("copied");
      setTimeout(()=>btn.classList.remove("copied"),650);
    }
    toast("Tüm yoklamalar kopyalandı.");
  }catch(e){toast(e.message||"Kopyalanamadı.")}
}

async function copyHistoryGroup(ev,key){
  return copyHistoryAll(key,ev);
}

function safeFileName(v){
  return String(v||"yoklama").trim().replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"-");
}
function pdfCleanDate(iso){
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit"
  }).formatToParts(new Date(iso));
  const d=parts.find(p=>p.type==="day")?.value||"";
  const m=parts.find(p=>p.type==="month")?.value||"";
  return `${d}.${m}`;
}

async function buildPdfClassSection(items){
  const sessions=[];
  for(const h of items){
    const r=attendanceCache[h.id]||await rpc("get_attendance",{p_token:token,p_attendance_id:h.id});
    attendanceCache[h.id]=r;
    sessions.push({h,r});
  }
  if(!sessions.length)return null;

  const first=sessions[0];
  const listName=first.r.attendance.listName;
  const n=sessions.length;

  const studentMap=new Map();
  sessions.forEach(({r})=>r.entries.forEach(e=>{
    const k=e.studentId||`${e.firstName}|${e.lastName}`;
    if(!studentMap.has(k))studentMap.set(k,{key:k,name:`${e.firstName} ${e.lastName}`});
  }));

  const statusMaps=sessions.map(({r})=>{
    const m=new Map();
    r.entries.forEach(e=>m.set(e.studentId||`${e.firstName}|${e.lastName}`,e.status));
    return m;
  });

  const students=[...studentMap.values()]
    .map(s=>{
      const absentCount=statusMaps.filter(m=>m.get(s.key)==="absent").length;
      const excusedCount=statusMaps.filter(m=>m.get(s.key)==="excused").length;
      return {...s,absentCount,excusedCount};
    })
    .filter(s=>s.absentCount>0 || s.excusedCount>0)
    .sort((a,b)=>
      (b.absentCount-a.absentCount) ||
      (b.excusedCount-a.excusedCount) ||
      a.name.localeCompare(b.name,"tr")
    );

  const headerRow=[{text:"Öğrenci",bold:true,fontSize:8.5,margin:[0,2,0,2]}];
  sessions.forEach((_,i)=>{
    headerRow.push({text:n>1?`${i+1}/${n}`:"1/1",bold:true,fontSize:8,alignment:"center",margin:[0,2,0,2]});
  });

  const rows=students.map(s=>[
    {text:s.name,fontSize:8.5,margin:[0,2,0,2]},
    ...statusMaps.map(m=>{
      if(!m.has(s.key))return {text:"·",color:"#aaaaaa",alignment:"center",margin:[0,2,0,2]};
      const st=m.get(s.key);
      if(st==="excused")return {text:"±",color:"#d97706",bold:true,fontSize:9,alignment:"center",margin:[0,2,0,2]};
      if(st==="absent")return {text:"-",color:"#d32f2f",bold:true,fontSize:9,alignment:"center",margin:[0,2,0,2]};
      return {text:"+",color:"#247a43",bold:true,fontSize:9,alignment:"center",margin:[0,2,0,2]};
    })
  ]);

  const teachers=sessions.map(({r},i)=>n>1?`${i+1}/${n}: ${r.attendance.takenByName}`:r.attendance.takenByName).join("  •  ");

  return {
    listName,
    content:[
      {text:listName,fontSize:12,bold:true,color:"#111111",margin:[0,0,0,2]},
      {text:teachers,fontSize:7.5,color:"#777777",margin:[0,0,0,5]},
      rows.length ? {
        table:{
          headerRows:1,
          widths:["auto",...sessions.map(()=>18)],
          body:[headerRow,...rows],
          dontBreakRows:true
        },
        layout:{
          hLineWidth:(i,node)=>i===0||i===1||i===node.table.body.length?0.6:0.2,
          vLineWidth:()=>0,
          hLineColor:()=>"#d0d0d0",
          paddingLeft:(i)=>i===0?4:2,
          paddingRight:(i)=>i===0?8:2,
          paddingTop:()=>2,
          paddingBottom:()=>2,
          fillColor:(rowIndex)=>rowIndex===0?"#f2f2f2":null
        }
      } : {
        text:"Tüm öğrenciler mevcuttur (Devamsızlık/izin yok).",
        italics:true,
        fontSize:8,
        color:"#247a43",
        margin:[0,4,0,8]
      }
    ]
  };
}

async function downloadHistoryPdf(key){
  const sel=selectedHistoryItem(key);if(!sel)return;
  try{
    if(typeof pdfMake==="undefined")throw new Error("PDF modülü yüklenemedi.");
    const section=await buildPdfClassSection(sel.group.items);
    if(!section)return;

    const doc={
      pageSize:"A4",
      pageOrientation:"portrait",
      pageMargins:[24,24,24,28],
      defaultStyle:{font:"Roboto",fontSize:8.5,color:"#202020"},
      content:section.content
    };

    pdfMake.createPdf(doc).download(`${safeFileName(section.listName)}-${dayKey(sel.item.takenAt)}.pdf`);
  }catch(e){toast(e.message||"PDF oluşturulamadı.")}
}

async function downloadDayPdf(day){
  try{
    if(typeof pdfMake==="undefined")throw new Error("PDF modülü yüklenemedi.");

    const sameDay=app.history
      .filter(h=>!h.archivedAt&&dayKey(h.takenAt)===day);

    if(!sameDay.length){toast("Bu güne ait aktif yoklama yok.");return}

    const byClass=new Map();
    sameDay.forEach(h=>{
      const k=h.listId||h.listName;
      if(!byClass.has(k))byClass.set(k,[]);
      byClass.get(k).push(h);
    });

    const groups=[...byClass.values()]
      .map(items=>items.sort((a,b)=>new Date(a.takenAt)-new Date(b.takenAt)))
      .sort((a,b)=>{
        const at=new Date(a[0]?.takenAt||0),bt=new Date(b[0]?.takenAt||0);
        return at-bt || (a[0]?.listName||"").localeCompare(b[0]?.listName||"","tr");
      });

    const sections=[];
    for(const items of groups){
      const section=await buildPdfClassSection(items);
      if(section)sections.push(section);
    }
    if(!sections.length){toast("PDF oluşturulacak yoklama bulunamadı.");return}

    const doc={
      pageSize:"A4",
      pageOrientation:"portrait",
      pageMargins:[24,22,24,26],
      defaultStyle:{font:"Roboto",fontSize:8.5,color:"#202020"},
      footer:(currentPage,pageCount)=>({
        text:`${currentPage} / ${pageCount}`,
        alignment:"center",
        fontSize:7,
        color:"#909090",
        margin:[0,6,0,0]
      }),
      content:[
        {
          columns:[
            {text:formatHistoryDay(day),fontSize:13,bold:true},
            {text:"- Yok   ± İzinli",alignment:"right",fontSize:8,color:"#666666",margin:[0,2,0,0]}
          ],
          margin:[0,0,0,10]
        },
        {
          columns:sections.map(sec=>({
            width:"auto",
            stack:sec.content
          })),
          columnGap:24
        },
        {text:"İmza",alignment:"right",fontSize:8,color:"#666666",margin:[0,18,28,2]},
        {text:"________________________",alignment:"right",fontSize:8,color:"#888888"}
      ]
    };

    pdfMake.createPdf(doc).download(`gunun-yoklamasi-${day}.pdf`);
  }catch(e){toast(e.message||"Günün PDF'i oluşturulamadı.")}
}
async function downloadAllClassPdf(listId){
  const list=app.lists.find(x=>x.id===listId);if(!list)return;

  const chosen=app.history
    .filter(h=>!h.archivedAt&&h.listId===listId)
    .sort((a,b)=>new Date(a.takenAt)-new Date(b.takenAt));

  if(!chosen.length){toast("Bu sınıfta henüz yoklama kaydı yok.");return}

  try{
    if(typeof pdfMake==="undefined")throw new Error("PDF modülü yüklenemedi.");

    const sessions=[];
    for(const h of chosen){
      const r=attendanceCache[h.id]||await rpc("get_attendance",{p_token:token,p_attendance_id:h.id});
      attendanceCache[h.id]=r;
      sessions.push({h,r});
    }

    const studentMap=new Map();
    sessions.forEach(({r})=>r.entries.forEach(e=>{
      const k=e.studentId||`${e.firstName}|${e.lastName}`;
      if(!studentMap.has(k))studentMap.set(k,{key:k,name:`${e.firstName} ${e.lastName}`});
    }));

    const statusMaps=sessions.map(({r})=>{
      const m=new Map();
      r.entries.forEach(e=>m.set(e.studentId||`${e.firstName}|${e.lastName}`,e.status));
      return m;
    });

    const students=[...studentMap.values()]
      .map(s=>{
        const presentCount=statusMaps.filter(m=>m.get(s.key)==="present").length;
        const absentCount=statusMaps.filter(m=>m.get(s.key)==="absent").length;
        const excusedCount=statusMaps.filter(m=>m.get(s.key)==="excused").length;
        const requiredCount=statusMaps.filter(m=>m.has(s.key)&&m.get(s.key)!=="excused").length;
        return {...s,presentCount,absentCount,excusedCount,requiredCount};
      })
      .filter(s=>s.absentCount>0 || s.excusedCount>0)
      .sort((a,b)=>
        (b.absentCount-a.absentCount) ||
        (b.excusedCount-a.excusedCount) ||
        a.name.localeCompare(b.name,"tr")
      );

    const firstDay=dayKey(sessions[0].h.takenAt);
    const lastDay=dayKey(sessions[sessions.length-1].h.takenAt);
    const rangeLabel=firstDay===lastDay
      ?formatHistoryDay(firstDay)
      :`${formatHistoryDay(firstDay)} – ${formatHistoryDay(lastDay)}`;

    const pageWidth=842, marginX=14, usable=pageWidth-(marginX*2);
    const minNameWidth=135;
    const colWidth=Math.max(7.5,Math.min(12.5,(usable-minNameWidth)/sessions.length));
    const bodyFont=Math.max(6.5,Math.min(8,colWidth*.65));
    const markFont=Math.max(7,Math.min(9.5,colWidth*.75));
    const dateFont=7.5;
    const sessionFont=5.8;
    const rowPad=sessions.length>35?0.2:sessions.length>20?0.5:0.8;

    const dateGroups=[];
    sessions.forEach(({h},i)=>{
      const d=pdfCleanDate(h.takenAt);
      const last=dateGroups[dateGroups.length-1];
      if(last&&last.date===d){
        last.count++;
        last.indices.push(i);
      }else{
        dateGroups.push({date:d,count:1,indices:[i]});
      }
    });

    const headerRow1=[{text:"Öğrenci",rowSpan:2,bold:true,fontSize:bodyFont,margin:[0,12,0,0]}];
    dateGroups.forEach(g=>{
      headerRow1.push({text:g.date,colSpan:g.count,bold:true,fontSize:dateFont,alignment:"center",margin:[0,1,0,0]});
      for(let k=1;k<g.count;k++) headerRow1.push({});
    });

    const headerRow2=[{}];
    dateGroups.forEach(g=>{
      g.indices.forEach((sessionIdx,localIdx)=>{
        headerRow2.push({text:g.count>1?`${localIdx+1}/${g.count}`:"1",bold:true,fontSize:sessionFont,alignment:"center",color:"#444444",margin:[0,0,0,1]});
      });
    });

    const rows=students.map(s=>[
      {text:s.name,fontSize:bodyFont,margin:[0,rowPad,0,rowPad]},
      ...statusMaps.map(m=>{
        if(!m.has(s.key))return {text:"·",color:"#aaaaaa",fontSize:markFont,alignment:"center",margin:[0,rowPad,0,rowPad]};
        const st=m.get(s.key);
        if(st==="present")return {text:"+",color:"#247a43",bold:true,fontSize:markFont,alignment:"center",margin:[0,rowPad,0,rowPad]};
        if(st==="excused")return {text:"±",color:"#d97706",bold:true,fontSize:markFont,alignment:"center",margin:[0,rowPad,0,rowPad]};
        return {text:"-",color:"#d32f2f",bold:true,fontSize:markFont,alignment:"center",margin:[0,rowPad,0,rowPad]};
      })
    ]);

    const doc={
      pageSize:"A4",
      pageOrientation:"portrait",
      pageMargins:[16,14,16,16],
      defaultStyle:{font:"Roboto",fontSize:bodyFont,color:"#202020"},
      content:[
        {
          columns:[
            {
              stack:[
                {text:list.name,fontSize:12,bold:true},
                {text:rangeLabel,fontSize:6.5,color:"#666666",margin:[0,1,0,0]},
                {text:`${sessions.length} ders · - Yok  ± İzinli`,fontSize:6,color:"#777777",margin:[0,2,0,0]}
              ]
            }
          ],
          margin:[0,0,0,5]
        },
        rows.length ? {
          table:{
            headerRows:2,
            widths:["auto",...sessions.map(()=>colWidth)],
            body:[headerRow1,headerRow2,...rows],
            dontBreakRows:true
          },
          layout:{
            hLineWidth:(i,node)=>i===0||i===2||i===node.table.body.length?0.55:0.18,
            vLineWidth:()=>0,
            hLineColor:()=>"#d8d8d8",
            paddingLeft:(i)=>i===0?3:0,
            paddingRight:(i)=>i===0?6:0,
            paddingTop:()=>0,
            paddingBottom:()=>0,
            fillColor:(rowIndex)=>rowIndex<2?"#f4f4f4":null
          }
        } : {
          text:"Tüm öğrenciler derste mevcuttur (Yok veya izinli öğrenci bulunmamaktadır).",
          italics:true,
          fontSize:8,
          color:"#247a43",
          margin:[0,6,0,8]
        }
      ]
    };

    pdfMake.createPdf(doc).download(`${safeFileName(list.name)}-tum-yoklamalar.pdf`);
  }catch(e){toast(e.message||"PDF oluşturulamadı.")}
}

async function archiveHistoryAttendance(key){
  const sel=selectedHistoryItem(key);if(!sel)return;
  if(!confirm("Bu yoklama arşivlensin mi?"))return;
  try{
    await rpc("archive_attendance",{p_token:token,p_attendance_id:sel.item.id});
    await refresh();
    renderHistory();
  }catch(e){toast(e.message)}
}


function renderNewList(){
  importedStudents=[];
  $("newPage").innerHTML=`<div class="stack">
    <h1 class="page-title">YOKLAMA EKLE</h1>
    <div class="plain-section">
      <label>Sınıf adı<input id="newListName" type="text" placeholder="Örn. TDE Joker"></label>
    </div>

    <div class="mode-toggle">
      <button id="fileModeBtn" class="active" type="button" onclick="setStudentMode('file')">Tablodan yükle</button>
      <button id="manualModeBtn" type="button" onclick="setStudentMode('manual')">Elle yükle</button>
    </div>

    <div id="fileMode" class="stack">
      <div class="file-help">
        <div class="muted tiny">Dosyada yalnızca 2 sütun olsun: <b>İsim</b> ve <b>Soyisim</b>.</div>
        <div class="example-sheet" aria-label="Örnek öğrenci tablosu">
          <div><b>İsim</b><b>Soyisim</b></div>
          <div><span>Ahmet</span><span>Yılmaz</span></div>
          <div class="last"><span>Mehmet Ali</span><span>Kaya</span></div>
        </div>
        <div class="file-picker-row">
          <span id="fileName" class="muted tiny">Dosya seçilmedi</span>
          <label class="file-picker" for="studentFile">
            <svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/></svg>
            Dosya seç
          </label>
          <input id="studentFile" class="file-input" type="file" accept=".csv,.xlsx,.xls">
        </div>
      </div>
    </div>

    <div id="manualMode" class="stack hidden">
      <div class="manual-add">
        <input id="manualFirst" type="text" placeholder="İsim">
        <input id="manualLast" type="text" placeholder="Soyisim">
        <button class="icon-btn" onclick="addManualStudent()" aria-label="Öğrenci ekle" title="Öğrenci ekle">+</button>
      </div>
    </div>

    <div id="importMessage" class="notice hidden"></div>
    <div id="preview"></div>
    <button id="createListBtn" class="btn" disabled>Sınıfı oluştur</button>
  </div>`;

  $("studentFile").onchange=e=>{const f=e.target.files[0];$("fileName").textContent=f?.name||"Dosya seçilmedi";handleFile(f)};
  $("createListBtn").onclick=createList;
  ["manualFirst","manualLast"].forEach(id=>$(id).addEventListener("keydown",e=>{
    if(e.key==="Enter")addManualStudent();
  }));
}
function setStudentMode(mode){
  const fileMode=mode==="file";
  $("fileMode").classList.toggle("hidden",!fileMode);
  $("manualMode").classList.toggle("hidden",fileMode);
  $("fileModeBtn").classList.toggle("active",fileMode);
  $("manualModeBtn").classList.toggle("active",!fileMode);
}
function addManualStudent(){
  const first=$("manualFirst").value.trim(), last=$("manualLast").value.trim();
  if(!first||!last){toast("İsim ve Soyisim birlikte gerekli.");return}
  importedStudents.push({firstName:first,lastName:last});
  $("manualFirst").value="";$("manualLast").value="";
  renderStudentPreview();
  $("manualFirst").focus();
}
function removeImportedStudent(idx){
  importedStudents.splice(idx,1);
  renderStudentPreview();
}
function renderStudentPreview(){
  const p=$("preview"), b=$("createListBtn");
  b.disabled=!importedStudents.length;
  if(!importedStudents.length){
    p.innerHTML="";
    $("importMessage")?.classList.add("hidden");
    return;
  }
  importedStudents.sort((a,b)=>fullName(a).localeCompare(fullName(b),"tr"));
  p.innerHTML=`<div class="preview-head"><strong class="tiny">${importedStudents.length} öğrenci hazır</strong><span class="muted tiny">önizleme</span></div>
    <div style="overflow:auto;max-height:260px"><table><thead><tr><th>İsim</th><th>Soyisim</th><th style="width:34px"></th></tr></thead><tbody>
    ${importedStudents.map((s,i)=>`<tr><td>${escapeHtml(s.firstName)}</td><td>${escapeHtml(s.lastName)}</td><td style="text-align:right"><button type="button" class="icon-btn ghost" style="width:28px;height:28px;font-size:1.1rem;color:#777" onclick="removeImportedStudent(${i})" aria-label="Öğrenciyi çıkar" title="Kaldır">×</button></td></tr>`).join("")}
    </tbody></table></div>`;
}
async function handleFile(file){
  const m=$("importMessage"),p=$("preview"),b=$("createListBtn");importedStudents=[];p.innerHTML="";b.disabled=true;if(!file)return;
  try{
    const ext=file.name.split(".").pop().toLowerCase();let rows;
    if(ext==="csv")rows=parseCSV(await file.text());
    else if(["xlsx","xls"].includes(ext)){
      if(typeof XLSX==="undefined")throw new Error("XLSX okuyucu yüklenemedi.");
      const wb=XLSX.read(await file.arrayBuffer(),{type:"array"}), sh=wb.Sheets[wb.SheetNames[0]];
      rows=XLSX.utils.sheet_to_json(sh,{header:1,defval:"",raw:false});
    }else throw new Error("Yalnızca CSV, XLSX veya XLS kabul edilir.");
    importedStudents=validateRows(rows);
    m.textContent=`${importedStudents.length} öğrenci dosyadan yüklendi.`;m.className="notice success";m.classList.remove("hidden");
    renderStudentPreview();
  }catch(e){m.textContent=e.message;m.className="notice error";m.classList.remove("hidden")}
}
function parseCSV(text){
  const line=text.split(/\r?\n/).find(x=>x.trim())||"", delim=(line.match(/;/g)||[]).length>(line.match(/,/g)||[]).length?";":",";
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){const ch=text[i],n=text[i+1];
    if(ch=='"'&&q&&n=='"'){cell+='"';i++}else if(ch=='"')q=!q;else if(ch===delim&&!q){row.push(cell);cell=""}
    else if((ch==="\n"||ch==="\r")&&!q){if(ch==="\r"&&n==="\n")i++;row.push(cell);rows.push(row);row=[];cell=""}else cell+=ch;
  } if(cell.length||row.length){row.push(cell);rows.push(row)} return rows;
}
const norm=v=>String(v??"").trim(), normHead=v=>norm(v).toLocaleLowerCase("tr-TR").replaceAll("ı","i").replaceAll("ş","s").replaceAll("ğ","g").replaceAll("ü","u").replaceAll("ö","o").replaceAll("ç","c");
function validateRows(raw){
  let rows=raw.map(r=>Array.isArray(r)?r.map(norm):[]).filter(r=>r.some(c=>c!=="")).map(r=>{const x=[...r];while(x.length&&x[x.length-1]==="")x.pop();return x});
  if(!rows.length)throw new Error("Dosyada öğrenci bulunamadı.");
  if(rows.some(r=>r.length>2))throw new Error("Dosya reddedildi: 3. sütun bulundu.");
  const first=rows[0]||[];if(normHead(first[0])==="isim"&&normHead(first[1])==="soyisim")rows=rows.slice(1);
  if(!rows.length)throw new Error("Başlık dışında öğrenci bulunamadı.");
  const bad=rows.findIndex(r=>r.length!==2||!r[0]||!r[1]);if(bad!==-1)throw new Error(`${bad+1}. öğrenci satırında İsim veya Soyisim eksik.`);
  return rows.map(r=>({firstName:r[0],lastName:r[1]}));
}
async function createList(){
  try{
    const name=$("newListName").value.trim();if(!name)throw new Error("Sınıf adını yazın.");if(!importedStudents.length)throw new Error("En az bir öğrenci ekleyin.");
    const res=await rpc("create_list",{p_token:token,p_name:name,p_students:importedStudents});
    await refresh();toast("Sınıf oluşturuldu.");switchTab("lists");
    const listId=res?.id||res?.listId||app.lists.find(x=>x.name===name)?.id;
    if(listId){
      const el=$(`listCard-${listId}`);
      if(el){
        el.classList.add("highlight-card");
        setTimeout(()=>el.classList.remove("highlight-card"),2500);
      }
    }
  }catch(e){toast(e.message)}
}

let pinRevealed=false;
function togglePinReveal(){
  pinRevealed=!pinRevealed;
  renderAdmin();
}

let adminEditingListId=null;

function renderAdmin(){
  if(app.role!=="admin")return;
  const pinDisplay=pinRevealed?escapeHtml(app.teacherPin||"------"):(app.teacherPin?"••••••":"------");
  $("adminPage").innerHTML=`<div class="stack">
    <h1 class="page-title">YÖNETİM</h1>

    <section class="plain-section stack">
      <div>
        <h2>Bugünün Hoca PIN'i</h2>
        <div class="pin-row">
          <div class="pin">${pinDisplay}</div>
          <div class="pin-actions">
            <button class="icon-btn" onclick="togglePinReveal()" aria-label="PIN göster/gizle" title="${pinRevealed?'Gizle':'Göster'}">
              <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
            </button>
            <button class="icon-btn" onclick="copyPin()" aria-label="PIN'i kopyala" title="Kopyala">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="icon-btn" onclick="regeneratePin()" aria-label="Yeni PIN üret" title="Yenile">
              <svg viewBox="0 0 24 24"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.8-2.5L20 9"/><path d="M4 15l2.7 2.5A7 7 0 0 0 18.5 15"/></svg>
            </button>
          </div>
        </div>
        <div class="muted tiny" style="margin-top:4px">${escapeHtml(app.teacherPinDate||"")}</div>
        <div class="muted tiny" style="margin-top:6px">Hoca bu PIN'i haftanın ilk girişinde bir kez kullanır. Cihaz yetkisi Pazartesi 00:00'da otomatik sıfırlanır.</div>
      </div>
    </section>

    <details class="admin-drop" ${adminEditingListId?'open':''}>
      <summary>Sınıf Yönetimi</summary>
      <div class="drop-body">
        ${app.lists.map(l=>{
          const isEditing=adminEditingListId===l.id;
          return `<div class="class-admin-row">
            ${isEditing
              ? `<div>
                   <input id="className-${l.id}" type="text" class="class-inline-input" value="${escapeHtml(l.name)}" maxlength="120"
                     onkeydown="if(event.key==='Enter'){event.preventDefault();confirmRenameList('${l.id}')}if(event.key==='Escape'){event.preventDefault();cancelClassRename()}">
                   <div class="muted tiny">${l.students.length} öğrenci</div>
                 </div>
                 <div class="class-admin-actions">
                   <button type="button" class="icon-btn" style="color:var(--text)" onclick="confirmRenameList('${l.id}')" aria-label="Kaydet" title="Kaydet">
                     <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
                   </button>
                   <button type="button" class="icon-btn" onclick="cancelClassRename()" aria-label="İptal" title="İptal">
                     <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
                   </button>
                 </div>`
              : `<div><strong>${escapeHtml(l.name)}</strong><div class="muted tiny">${l.students.length} öğrenci</div></div>
                 <div class="class-admin-actions">
                   <button type="button" class="icon-btn" onclick="startRenameList('${l.id}')" aria-label="Sınıf adını değiştir" title="Ad değiştir">
                     <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>
                   </button>
                   <button type="button" class="icon-btn danger" onclick="deleteList('${l.id}')" aria-label="Sınıfı sil" title="Sil">
                     <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 10v6M14 10v6"/></svg>
                   </button>
                 </div>`
            }
          </div>`;
        }).join("")}
      </div>
    </details>

    <details class="admin-drop">
      <summary>Üst Yetkili Parolası</summary>
      <div class="drop-body stack">
        <div class="muted tiny">En az 11 karakter · 1 büyük harf · 1 özel karakter</div>
        <div class="password-wrap">
          <input id="oldAdminPassword" type="password" maxlength="64" autocomplete="current-password" placeholder="Mevcut parola">
          <button type="button" class="password-eye" onclick="revealPassword('oldAdminPassword')" aria-label="Parolayı göster" title="1 saniye göster">
            <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
          </button>
        </div>
        <div class="password-wrap">
          <input id="newAdminPassword" type="password" maxlength="64" autocomplete="new-password" placeholder="Yeni parola">
          <button type="button" class="password-eye" onclick="revealPassword('newAdminPassword')" aria-label="Parolayı göster" title="1 saniye göster">
            <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
          </button>
        </div>
        <div class="password-wrap">
          <input id="confirmAdminPassword" type="password" maxlength="64" autocomplete="new-password" placeholder="Yeni parola tekrar">
          <button type="button" class="password-eye" onclick="revealPassword('confirmAdminPassword')" aria-label="Parolayı göster" title="1 saniye göster">
            <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
          </button>
        </div>
        <button class="btn" onclick="changeAdminPassword()">Parolayı değiştir</button>
      </div>
    </details>

    <div style="margin-top:16px;text-align:center">
      <button type="button" class="archive-toggle" onclick="downloadBackup()">Verileri yedekle (.json)</button>
    </div>
  </div>`;
}
function generateMemorablePin() {
  const glides = [
    [1,2,3], [3,2,1], [4,5,6], [6,5,4], [7,8,9], [9,8,7],
    [1,4,7], [7,4,1], [2,5,8], [8,5,2], [3,6,9], [9,6,3],
    [1,5,9], [9,5,1], [3,5,7], [7,5,3]
  ];
  const steps = [
    [1,3,5], [5,3,1], [2,4,6], [6,4,2], [3,5,7], [7,5,3], [4,6,8], [8,6,4], [5,7,9], [9,7,5]
  ];
  const pairs = [
    [1,2], [2,1], [2,3], [3,2], [4,5], [5,4], [5,6], [6,5], [7,8], [8,7], [8,9], [9,8],
    [1,4], [4,1], [2,5], [5,2], [3,6], [6,3], [4,7], [7,4], [5,8], [8,5], [6,9], [9,6],
    [1,5], [5,1], [3,5], [5,3], [7,5], [5,7], [9,5], [5,9],
    [2,8], [8,2], [4,6], [6,4]
  ];
  const ladders = [
    [1,2,3], [3,2,1], [4,5,6], [6,5,4], [7,8,9], [9,8,7],
    [1,4,7], [7,4,1], [2,5,8], [8,5,2], [3,6,9], [9,6,3],
    [2,4,6], [6,4,2], [1,3,5], [5,3,1]
  ];

  const roll = Math.random();
  if (roll < 0.30) {
    const g = glides[Math.floor(Math.random() * glides.length)];
    return `${g[0]}${g[1]}${g[2]}${g[2]}${g[1]}${g[0]}`;
  } else if (roll < 0.55) {
    const g = glides[Math.floor(Math.random() * glides.length)];
    return `${g[0]}${g[1]}${g[2]}${g[0]}${g[1]}${g[2]}`;
  } else if (roll < 0.80) {
    const p = pairs[Math.floor(Math.random() * pairs.length)];
    return `${p[0]}${p[1]}${p[0]}${p[1]}${p[0]}${p[1]}`;
  } else if (roll < 0.92) {
    const s = steps[Math.floor(Math.random() * steps.length)];
    return `${s[0]}${s[1]}${s[2]}${s[2]}${s[1]}${s[0]}`;
  } else {
    const l = ladders[Math.floor(Math.random() * ladders.length)];
    return `${l[0]}${l[0]}${l[1]}${l[1]}${l[2]}${l[2]}`;
  }
}

async function copyPin(){try{await navigator.clipboard.writeText(app.teacherPin);toast("PIN kopyalandı.")}catch{toast("PIN: "+app.teacherPin)}}
async function regeneratePin(){
  const newPin = generateMemorablePin();
  try{
    let r;
    try {
      r = await rpc("regenerate_teacher_pin", { p_token: token, p_pin: newPin });
    } catch(err) {
      r = await rpc("regenerate_teacher_pin", { p_token: token });
    }
    app.teacherPin = r?.teacherPin || newPin;
    app.teacherPinDate = r?.teacherPinDate || new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date());
    renderAdmin();
    toast(`Yeni PIN üretildi: ${app.teacherPin}`);
  }catch(e){
    toast(e.message);
  }
}
function startRenameList(id){
  adminEditingListId=id;
  renderAdmin();
  const input=$(`className-${id}`);
  if(input){input.focus();input.select()}
}
function cancelClassRename(){
  adminEditingListId=null;
  renderAdmin();
}
async function confirmRenameList(id){
  const input=$(`className-${id}`),name=input?.value.trim();
  if(!name){toast("Sınıf adı boş olamaz.");return}
  try{
    await rpc("rename_list",{p_token:token,p_list_id:id,p_name:name});
    adminEditingListId=null;
    await refresh();renderAdmin();toast("Sınıf adı değiştirildi.");
  }catch(e){toast(e.message)}
}
async function deleteList(id){
  const l=app.lists.find(x=>x.id===id);if(!l)return;
  if(!confirm(`“${l.name}” sınıfı silinsin mi?\nEski yoklamalar korunur.`))return;
  try{
    await rpc("delete_list",{p_token:token,p_list_id:id});
    if(adminEditingListId===id)adminEditingListId=null;
    await refresh();renderAdmin();toast("Sınıf silindi.");
  }catch(e){toast(e.message)}
}

async function downloadBackup(){
  if(!confirm("Bu dosya sınıflarınızın ve tüm yoklama geçmişinizin yedeğidir. Güvenli bir yerde saklayın ve silmeyin. Parola/PIN içermez. İndirilsin mi?"))return;
  try{
    const data=await rpc("admin_export_backup",{p_token:token});
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`eyoklama-yedek-${todayKey()}.json`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast("Yedek indirildi. Güvenli bir yerde saklayın.");
  }catch(e){toast(e.message)}
}

async function changeAdminPassword(){
  const oldP=$("oldAdminPassword").value;
  const newP=$("newAdminPassword").value;
  const confirmP=$("confirmAdminPassword").value;

  if(!oldP){toast("Mevcut parolayı yazın.");return}
  if(newP!==confirmP){toast("Yeni parolalar eşleşmiyor.");return}
  if(newP.length<11){toast("Yeni parola en az 11 karakter olmalı.");return}
  if(!/[A-ZÇĞİÖŞÜ]/.test(newP)){toast("En az bir büyük harf gerekli.");return}
  if(!/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(newP)){toast("En az bir özel karakter gerekli.");return}

  try{
    await rpc("change_admin_password",{
      p_token:token,
      p_old_password:oldP,
      p_new_password:newP,
      p_confirm_password:confirmP
    });
    $("oldAdminPassword").value="";
    $("newAdminPassword").value="";
    $("confirmAdminPassword").value="";
    toast("Üst yetkili parolası değiştirildi.");
  }catch(e){toast(e.message)}
}

if(typeof window !== "undefined"){
  Object.assign(window,{startAttendance,handleStudentTap,cancelAttendance,saveNewAttendance,renderHistory,toggleArchiveView,toggleHistoryGroup,cycleHistorySession,copyHistoryGroup,copySingleAttendance,copyHistoryAll,stageHistoryStatus,archiveHistoryAttendance,copyPin,regeneratePin,togglePinReveal,changeAdminPassword,addManualStudent,removeImportedStudent,setStudentMode,revealPassword,saveHistoryChanges,undoHistoryChange,confirmSavedUndo,downloadHistoryPdf,downloadSingleAttendancePdf,downloadBackup,toggleHistoryEdit,startRenameList,cancelClassRename,confirmRenameList,deleteList,downloadDayPdf,downloadAllClassPdf,openPrePermissionModal,closePrePermissionModal,renderPrePermissionList,filterPrePermissionList,togglePrePermission,savePrePermissions});

  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>{
      navigator.serviceWorker.register("sw.js").catch(()=>{});
    });
  }
}

if(typeof module !== "undefined" && module.exports){
  module.exports = {
    generateMemorablePin,
    escapeHtml,
    fullName,
    dayKey,
    todayKey,
    pdfCleanDate,
    formatCardDate,
    formatCardTime,
    validateRows,
    parseCSV
  };
}
