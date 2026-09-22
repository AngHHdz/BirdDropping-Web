const $ = (s) => document.querySelector(s);
const state = { scans: JSON.parse(localStorage.getItem('bd_draft') || '[]'), files: JSON.parse(localStorage.getItem('bd_files') || '[]'), stream: null, detector: null, scanLoop: 0, firebase: null, unsubscribe: null };
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/; // VIN excluye I, O y Q.

function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2500); }
function normalize(value){ return value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,17); }
function saveDraft(){ localStorage.setItem('bd_draft',JSON.stringify(state.scans)); renderScans(); }
function dateKey(){ return new Intl.DateTimeFormat('es-MX',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('/','-'); }
function displayDate(iso){ return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)); }
function makeTxt(codes){ return codes.join('\r\n')+'\r\n'; }
function download(name,content){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

document.querySelectorAll('.mode-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x===btn));
  const mobile=btn.dataset.mode==='mobile'; $('#mobileView').classList.toggle('active',mobile); $('#desktopView').classList.toggle('active',!mobile); if(!mobile){ stopCamera(); loadFiles(); }
}));

function validateCandidate(){ const input=$('#candidate'); input.value=normalize(input.value); const ok=VIN_RE.test(input.value); const badge=$('#validBadge'); badge.textContent=ok?'17 caracteres válidos':input.value.length?`${input.value.length}/17`:'Pendiente'; badge.className='badge '+(ok?'valid':input.value.length?'invalid':''); $('#captureBtn').disabled=!ok; return ok; }
$('#candidate').addEventListener('input',validateCandidate);
$('#candidate').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!$('#captureBtn').disabled) captureCandidate(); });
$('#captureBtn').addEventListener('click',captureCandidate);
function captureCandidate(){ if(!validateCandidate()) return; const code=$('#candidate').value; if(state.scans.includes(code)){ toast('Este código ya está en la lista.'); return; } state.scans.push(code); $('#candidate').value=''; validateCandidate(); saveDraft(); navigator.vibrate?.(80); toast('VIN capturado.'); }
function renderScans(){ const list=$('#scanList'); $('#scanCount').textContent=state.scans.length; $('#finishBtn').disabled=!state.scans.length; list.innerHTML=state.scans.length?state.scans.map((code,i)=>`<li><span class="num">${i+1}</span><span>${code}</span><button class="remove-code" data-index="${i}" aria-label="Eliminar ${code}">×</button></li>`).join(''):'<li class="empty-row">Aún no hay códigos capturados.</li>'; }
$('#scanList').addEventListener('click',e=>{ const b=e.target.closest('.remove-code'); if(!b)return; state.scans.splice(Number(b.dataset.index),1); saveDraft(); });
$('#clearDraft').addEventListener('click',()=>{ if(state.scans.length&&confirm('¿Limpiar toda la lista actual?')){ state.scans=[]; saveDraft(); }});

async function startCamera(){
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('Cámara no disponible en este navegador.');
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    const video=$('#camera'); video.srcObject=state.stream; await video.play(); $('#cameraStage').classList.add('streaming'); $('#cameraEmpty').hidden=true; $('#startCamera').disabled=true; $('#stopCamera').disabled=false;
    if('BarcodeDetector' in window){ const supported=await BarcodeDetector.getSupportedFormats(); const formats=['code_128','code_39'].filter(x=>supported.includes(x)); state.detector=new BarcodeDetector({formats:formats.length?formats:undefined}); $('#cameraStatus').textContent='Buscando un código de 17 caracteres…'; detectFrame(); }
    else { $('#cameraStatus').textContent='Tu navegador no permite lectura automática. Escribe el código detectado en el campo.'; }
  }catch(err){ $('#cameraStatus').textContent=err.message||'No fue posible abrir la cámara.'; toast('Revisa el permiso de cámara.'); }
}
async function detectFrame(){ if(!state.stream||!state.detector)return; try{ const codes=await state.detector.detect($('#camera')); const value=codes.map(x=>normalize(x.rawValue)).find(x=>VIN_RE.test(x)); if(value&&$('#candidate').value!==value){ $('#candidate').value=value; validateCandidate(); navigator.vibrate?.(50); $('#cameraStatus').textContent='Código detectado. Confírmalo y pulsa Capturar.'; } }catch{} state.scanLoop=requestAnimationFrame(detectFrame); }
function stopCamera(){ cancelAnimationFrame(state.scanLoop); state.stream?.getTracks().forEach(t=>t.stop()); state.stream=null; $('#camera').srcObject=null; $('#cameraStage').classList.remove('streaming'); $('#cameraEmpty').hidden=false; $('#startCamera').disabled=false; $('#stopCamera').disabled=true; $('#cameraStatus').textContent='Cámara detenida.'; }
$('#startCamera').addEventListener('click',startCamera); $('#stopCamera').addEventListener('click',stopCamera); document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.stream)stopCamera()});

async function nextFilename(){ const base=`BirdDropping_${dateKey()}`; const all=await getAllFiles(); const same=all.filter(f=>f.filename===`${base}.txt`||f.filename.startsWith(`${base} (`)); return `${base}${same.length?` (${same.length+1})`:''}.txt`; }
$('#finishBtn').addEventListener('click',async()=>{ const filename=await nextFilename(); const file={id:crypto.randomUUID(),filename,codes:[...state.scans],content:makeTxt(state.scans),createdAt:new Date().toISOString(),origin:'Móvil'}; state.files.unshift(file); localStorage.setItem('bd_files',JSON.stringify(state.files)); try{ await syncFile(file); }catch(e){ toast('Guardado localmente; no se pudo sincronizar.'); } download(filename,file.content); state.scans=[]; saveDraft(); toast(`${filename} guardado.`); });

function firebaseConfigured(){ const c=window.BIRDDROPPING_FIREBASE_CONFIG||{}; return Boolean(c.apiKey&&c.projectId&&c.appId); }
async function initFirebase(){
  if(!firebaseConfigured())return null; if(state.firebase)return state.firebase;
  const [{initializeApp},{getFirestore,collection,addDoc,getDocs,query,orderBy,onSnapshot,serverTimestamp}]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')]);
  const app=initializeApp(window.BIRDDROPPING_FIREBASE_CONFIG); state.firebase={db:getFirestore(app),collection,addDoc,getDocs,query,orderBy,onSnapshot,serverTimestamp}; return state.firebase;
}
function workspace(){ return (localStorage.getItem('bd_workspace')||'').trim().toUpperCase(); }
async function syncFile(file){ const fb=await initFirebase(); const space=workspace(); if(!fb||!space)return; await fb.addDoc(fb.collection(fb.db,'workspaces',space,'files'),{...file,createdAt:file.createdAt,uploadedAt:fb.serverTimestamp()}); }
async function getAllFiles(){ const byId=new Map(state.files.map(f=>[f.id,f])); const fb=await initFirebase(); const space=workspace(); if(fb&&space){ const snap=await fb.getDocs(fb.query(fb.collection(fb.db,'workspaces',space,'files'),fb.orderBy('createdAt','desc'))); snap.forEach(d=>{const f=d.data();byId.set(f.id||d.id,f)}); } return [...byId.values()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); }
async function loadFiles(){ try{ const files=await getAllFiles(); renderFiles(files); const cloud=firebaseConfigured()&&workspace(); $('#syncBadge').textContent=cloud?`Sincronizado · ${workspace()}`:'Solo local'; $('#syncBadge').classList.toggle('local',!cloud); }catch(e){ renderFiles(state.files); $('#syncBadge').textContent='Error de sincronización'; $('#syncBadge').classList.add('local'); } }
function renderFiles(files){ $('#fileCount').textContent=files.length; $('#vinTotal').textContent=files.reduce((n,f)=>n+(f.codes?.length||0),0); $('#lastCapture').textContent=files[0]?displayDate(files[0].createdAt).split(',')[0]:'—'; $('#filesBody').innerHTML=files.length?files.map((f,i)=>`<tr><td><strong>${f.filename}</strong></td><td>${displayDate(f.createdAt)}</td><td>${f.codes?.length||0}</td><td>${f.origin||'Móvil'}</td><td><button class="download-btn" data-file="${i}">Descargar</button></td></tr>`).join(''):'<tr><td colspan="5" class="table-empty">No hay archivos guardados.</td></tr>'; $('#filesBody')._files=files; }
$('#filesBody').addEventListener('click',e=>{const b=e.target.closest('.download-btn');if(!b)return;const f=$('#filesBody')._files[Number(b.dataset.file)];download(f.filename,f.content||makeTxt(f.codes||[]));});
$('#refreshFiles').addEventListener('click',loadFiles); $('#workspaceCode').value=workspace();
$('#saveWorkspace').addEventListener('click',()=>{ const value=$('#workspaceCode').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,''); if(!value){toast('Escribe un código de espacio.');return;} localStorage.setItem('bd_workspace',value); $('#workspaceCode').value=value; loadFiles(); toast(firebaseConfigured()?'Espacio conectado.':'Código guardado. Falta configurar Firebase.'); });

renderScans(); loadFiles(); if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
