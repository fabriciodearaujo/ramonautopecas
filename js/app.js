// ── STATE ─────────────────────────────────────────
let app = {
  vehicles: [], orders: [], inventory: [], sales: [],
  workshop: { name:'Minha Oficina', cnpj:'', address:'', city:'', phone:'', email:'', resp:'' },
  view: 'dashboard',
  cart: []
};
let items = [];


// ── HELPERS ───────────────────────────────────────
const ge = id => document.getElementById(id);
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function fmt(v){ return 'R$ '+parseFloat(v||0).toFixed(2).replace('.',','); }
function fmtD(iso){ if(!iso) return '—'; try{ return new Date(iso).toLocaleDateString('pt-BR'); }catch(e){ return '—'; } }

const ST = {
  aguardando:{label:'Aguardando'}, andamento:{label:'Em Andamento'},
  pecas:{label:'Ag. Peças'}, concluido:{label:'Concluído'}, entregue:{label:'Entregue'}
};
const ST_CLASSES = {
  aguardando: 'bg-warning/10 text-warning border border-warning/20',
  andamento: 'bg-info/10 text-info border border-info/20',
  pecas: 'bg-accent/10 text-accent border border-accent/20',
  concluido: 'bg-success/10 text-success border border-success/20',
  entregue: 'bg-surface3 text-textDim border border-border'
};
const stColor = { 
  aguardando: '#FBBF24', 
  andamento: '#60A5FA', 
  pecas: '#F97316', 
  concluido: '#4ADE80', 
  entregue: '#5C5854' 
};

function getBadgeHtml(st){
  const label = ST[st]?.label || ST.aguardando.label;
  const cls = ST_CLASSES[st] || ST_CLASSES.aguardando;
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}">${label}</span>`;
}

function toast(msg){
  const t=ge('toast'); t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.add('hidden'),2800);
}
function showLoad(msg){ ge('loading').classList.replace('hidden','flex'); if(msg) ge('loading-msg').textContent=msg; }
function hideLoad(){ ge('loading').classList.replace('flex','hidden'); }
function setConn(state, msg){
  const dot=ge('sb-dot'), lbl=ge('sb-conn');
  dot.className='w-1.5 h-1.5 rounded-full transition-colors '+(state==='ok'?'bg-success':state==='err'?'bg-error':'bg-textDim');
  lbl.textContent=msg;
}
function btnLoad(id, loading, label){
  const b=ge(id); if(!b) return;
  b.disabled=loading;
  if(loading){ b._orig=b.innerHTML; b.innerHTML='<div class="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> Salvando...'; }
  else if(b._orig) b.innerHTML=b._orig;
}

// ── AUTHENTICATION ────────────────────────────────
async function handleLogin(){
  const email = ge('auth-email').value.trim();
  const password = ge('auth-pass').value.trim();
  const errEl = ge('auth-error');
  
  if(!email || !password){
    errEl.textContent = 'Preencha todos os campos.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    ge('auth-ov').classList.add('hidden');
    await load();
  } catch (e) {
    errEl.textContent = 'Erro ao entrar: ' + e.message;
    errEl.classList.remove('hidden');
  }
}

async function handleLogout(){
  await db.auth.signOut();
  ge('auth-ov').classList.remove('hidden');
  app.vehicles = [];
  app.orders = [];
}

async function checkSession(){
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    ge('auth-ov').classList.add('hidden');
    await load();
  } else {
    ge('auth-ov').classList.remove('hidden');
  }
}

// ── DATA MAPPERS ──────────────────────────────────
function vFromDB(r){
  return {
    id:r.id, plate:r.plate, model:r.model||'', brand:r.brand||'',
    year:r.year||'', color:r.color||'', km:r.km||'',
    client:{ name:r.client_name, phone:r.client_phone||'', cpf:r.client_cpf||'', email:r.client_email||'' },
    service:r.service||'', status:r.status||'aguardando', notes:r.notes||'', entryDate:r.entry_date
  };
}
function vToDB(v, isNew){
  const d = {
    plate:v.plate, model:v.model, brand:v.brand||null, year:v.year||null,
    color:v.color||null, km:v.km||null,
    client_name:v.client.name, client_phone:v.client.phone||null,
    client_cpf:v.client.cpf||null, client_email:v.client.email||null,
    service:v.service||null, status:v.status, notes:v.notes||null,
    entry_date:v.entryDate
  };
  if(!isNew) d.id=v.id;
  return d;
}
function oFromDB(r){
  return {
    id:r.id, number:r.number, vehicleId:r.vehicle_id,
    plate:r.plate, model:r.model||'', brand:r.brand||'',
    year:r.year||'', color:r.color||'', km:r.km||'',
    clientName:r.client_name, clientPhone:r.client_phone||'',
    clientCpf:r.client_cpf||'', clientAddr:r.client_addr||'',
    items:r.items||[], labor:parseFloat(r.labor||0),
    discount:parseFloat(r.discount||0), total:parseFloat(r.total||0),
    notes:r.notes||'', date:r.date
  };
}
function oToDB(o, isNew){
  const d = {
    vehicle_id:o.vehicleId||null, plate:o.plate,
    model:o.model||null, brand:o.brand||null, year:o.year||null,
    color:o.color||null, km:o.km||null,
    client_name:o.clientName, client_phone:o.clientPhone||null,
    client_cpf:o.clientCpf||null, client_addr:o.clientAddr||null,
    items:o.items||[], labor:o.labor||0, discount:o.discount||0, total:o.total||0,
    notes:o.notes||null, date:o.date||new Date().toISOString()
  };
  if(!isNew) d.id=o.id;
  return d;
}

// ── LOAD DATA ─────────────────────────────────────
async function load(){
  showLoad('Conectando ao banco de dados...');
  setConn('loading','Conectando...');
  try {
    const [wsR, vR, oR, iR, sR] = await Promise.all([
      db.from('workshop_settings').select('*').eq('id',1).maybeSingle(),
      db.from('vehicles').select('*').order('created_at',{ascending:true}),
      db.from('orders').select('*').order('number',{ascending:true}),
      db.from('inventory').select('*').order('name',{ascending:true}),
      db.from('sales').select('*').order('created_at',{ascending:false})
    ]);
    if(wsR.error) throw wsR.error;
    if(vR.error) throw vR.error;
    if(oR.error) throw oR.error;
    if(iR.error) throw iR.error;
    if(sR.error) throw sR.error;
    if(wsR.data){
      app.workshop = {
        name:wsR.data.name||'Minha Oficina', cnpj:wsR.data.cnpj||'',
        phone:wsR.data.phone||'', email:wsR.data.email||'',
        resp:wsR.data.resp||'', address:wsR.data.address||'', city:wsR.data.city||''
      };
    }
    app.vehicles = (vR.data||[]).map(vFromDB);
    app.orders = (oR.data||[]).map(oFromDB);
    app.inventory = (iR.data||[]);
    app.sales = (sR.data||[]);
    ge('sb-wn').textContent = app.workshop.name;
    setConn('ok','Conectado');
  } catch(e){
    console.error(e);
    setConn('err','Erro de conexão');
    toast('❌ Erro ao conectar com o Supabase');
  }
  hideLoad();
  nav('dashboard');
}

// ── NAVIGATION ────────────────────────────────────
function nav(view){
  app.view=view;
  document.querySelectorAll('.ni, nav button').forEach(el=> {
    el.classList.remove('bg-[#1E0E03]', 'text-accent', 'border', 'border-[#3A1A06]');
    el.classList.add('text-textMuted');
  });
  const active = ge('n-'+view);
  if(active){
    active.classList.remove('text-textMuted');
    active.classList.add('bg-[#1E0E03]', 'text-accent', 'border', 'border-[#3A1A06]');
  }
  render();
}
function render(){
  try {
    const views={dashboard:dashView,vehicles:vehView,inventory:invView,pos:posView,orders:ordView,history:histView,settings:setView};
    ge('ct').innerHTML=(views[app.view]||dashView)();
  } catch (e) {
    console.error('Render Error:', e);
    ge('ct').innerHTML = `<div class="p-8 text-error font-bold">Erro ao renderizar a página: ${e.message}</div>`;
  }
}

// ── DASHBOARD ─────────────────────────────────────
function dashView(){
  const vs=app.vehicles;
  const inShop=vs.filter(v=>v.status!=='entregue').length;
  const inProg=vs.filter(v=>v.status==='andamento').length;
  const waiting=vs.filter(v=>v.status==='aguardando'||v.status==='pecas').length;
  const done=vs.filter(v=>v.status==='concluido').length;
  
  const rows=vs.length===0?emptyRow(6):
    vs.slice().reverse().map(v=>`
    <tr class="border-b border-border hover:bg-surface2 transition-colors">
      <td class="p-3"><span class="font-rajdhani font-bold text-accent tracking-wider">${esc(v.plate)}</span></td>
      <td class="p-3"><div class="font-medium">${esc((v.brand?v.brand+' ':'')+v.model)}</div></td>
      <td class="p-3">${esc(v.client?.name||'—')}</td>
      <td class="p-3">${fmtD(v.entryDate)}</td>
      <td class="p-3">${getBadgeHtml(v.status)}</td>
      <td class="p-3">
        <div class="flex gap-2">
          <button class="p-1.5 bg-transparent border border-border text-textMuted hover:text-textMain rounded-lg transition-colors" onclick="openVM('${v.id}')" title="Editar">${iEdit}</button>
          <button class="p-1.5 bg-success/10 text-success border border-success/20 hover:bg-success/20 rounded-lg transition-colors" onclick="openOMfromV('${v.id}')" title="Gerar OS">${iOS}</button>
        </div>
      </td>
    </tr>`).join('');

  return `
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-rajdhani font-bold tracking-tight">Dashboard</h1>
      <p class="text-xs text-textMuted">Visão geral da oficina</p>
    </div>
    <div class="flex gap-2">
      <button onclick="load()" class="p-2 bg-surface border border-border text-textMuted hover:text-textMain rounded-lg transition-all" title="Atualizar dados">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </button>
      <button onclick="openVM()" class="bg-accent hover:bg-accentHover text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2">
        ${iPlus} Entrada de Veículo
      </button>
    </div>
  </header>
  
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <div class="bg-surface border border-border rounded-xl p-4">
      <div class="text-[10px] text-textDim uppercase tracking-widest mb-1">Na Oficina</div>
      <div class="text-3xl font-rajdhani font-bold text-accent">${inShop}</div>
      <div class="text-[11px] text-textMuted mt-1">veículos ativos</div>
    </div>
    <div class="bg-surface border border-border rounded-xl p-4">
      <div class="text-[10px] text-textDim uppercase tracking-widest mb-1">Em Andamento</div>
      <div class="text-3xl font-rajdhani font-bold text-info">${inProg}</div>
      <div class="text-[11px] text-textMuted mt-1">em serviço agora</div>
    </div>
    <div class="bg-surface border border-border rounded-xl p-4">
      <div class="text-[10px] text-textDim uppercase tracking-widest mb-1">Aguardando</div>
      <div class="text-3xl font-rajdhani font-bold text-warning">${waiting}</div>
      <div class="text-[11px] text-textMuted mt-1">pendentes</div>
    </div>
    <div class="bg-surface border border-border rounded-xl p-4">
      <div class="text-[10px] text-textDim uppercase tracking-widest mb-1">Concluídos</div>
      <div class="text-3xl font-rajdhani font-bold text-success">${done}</div>
      <div class="text-[11px] text-textMuted mt-1">prontos p/ entrega</div>
    </div>
  </div>

  <div class="bg-surface border border-border rounded-xl overflow-hidden">
    <div class="p-4 border-b border-border flex justify-between items-center">
      <h3 class="text-sm font-semibold">Veículos na Oficina</h3>
      <span class="text-xs text-textMuted">${vs.length} registro(s)</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="bg-surface2 text-textDim uppercase tracking-wider">
            <th class="p-3 border-b border-border">Placa</th>
            <th class="p-3 border-b border-border">Veículo</th>
            <th class="p-3 border-b border-border">Cliente</th>
            <th class="p-3 border-b border-border">Entrada</th>
            <th class="p-3 border-b border-border">Status</th>
            <th class="p-3 border-b border-border">Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ── VEHICLES VIEW ─────────────────────────────────
function vehView(){
  const vs=app.vehicles;
  const rows=vs.length===0?emptyRow(6):
    vs.slice().reverse().map(v=>`
    <tr class="border-b border-border hover:bg-surface2 transition-colors">
      <td class="p-3"><span class="font-rajdhani font-bold text-accent tracking-wider">${esc(v.plate)}</span></td>
      <td class="p-3">
        <div class="font-medium">${esc((v.brand?v.brand+' ':'')+v.model)}</div>
        <div class="text-[11px] text-textMuted">${esc(v.year||'')}${v.color?' · '+esc(v.color):''}${v.km?' · '+esc(v.km)+' km':''}</div>
      </td>
      <td class="p-3">
        <div>${esc(v.client?.name||'—')}</div>
        <div class="text-[11px] text-textMuted">${esc(v.client?.phone||'')}</div>
      </td>
      <td class="p-3">${fmtD(v.entryDate)}</td>
      <td class="p-3">
        <select onchange="updSt('${v.id}',this.value)" class="bg-transparent border-none text-[11px] font-bold uppercase tracking-wider cursor-pointer outline-none p-0 w-auto" style="color:${stColor[v.status]||'var(--mu)'}">
          <option value="aguardando" ${v.status==='aguardando'?'selected':''}>Aguardando</option>
          <option value="andamento" ${v.status==='andamento'?'selected':''}>Em Andamento</option>
          <option value="pecas" ${v.status==='pecas'?'selected':''}>Ag. Peças</option>
          <option value="concluido" ${v.status==='concluido'?'selected':''}>Concluído</option>
          <option value="entregue" ${v.status==='entregue'?'selected':''}>Entregue</option>
        </select>
      </td>
      <td class="p-3">
        <div class="flex gap-2">
          <button class="p-1.5 bg-transparent border border-border text-textMuted hover:text-textMain rounded-lg transition-colors" onclick="openVM('${v.id}')" title="Editar">${iEdit}</button>
          <button class="p-1.5 bg-success/10 text-success border border-success/20 hover:bg-success/20 rounded-lg transition-colors" onclick="openOMfromV('${v.id}')" title="Gerar OS">${iOS}</button>
          <button class="p-1.5 bg-error/10 text-error border border-error/20 hover:bg-error/20 rounded-lg transition-colors" onclick="delV('${v.id}')" title="Excluir">${iTrash}</button>
        </div>
      </td>
    </tr>`).join('');

  return `
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-rajdhani font-bold tracking-tight">Veículos</h1>
      <p class="text-xs text-textMuted">Gestão de entradas e status</p>
    </div>
    <button onclick="openVM()" class="bg-accent hover:bg-accentHover text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2">
      ${iPlus} Registrar Veículo
    </button>
  </header>
  <div class="bg-surface border border-border rounded-xl overflow-hidden">
    <div class="p-4 border-b border-border flex justify-between items-center">
      <h3 class="text-sm font-semibold">Todos os Veículos</h3>
      <span class="text-xs text-textMuted">${vs.length} registro(s)</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="bg-surface2 text-textDim uppercase tracking-wider">
            <th class="p-3 border-b border-border">Placa</th>
            <th class="p-3 border-b border-border">Veículo</th>
            <th class="p-3 border-b border-border">Cliente</th>
            <th class="p-3 border-b border-border">Entrada</th>
            <th class="p-3 border-b border-border">Status</th>
            <th class="p-3 border-b border-border">Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ── ORDERS VIEW ───────────────────────────────────
function ordView(){
  const os=app.orders;
  const rows=os.length===0?emptyRow(7):
    os.slice().reverse().map(o=>`
    <tr class="border-b border-border hover:bg-surface2 transition-colors">
      <td class="p-3 font-rajdhani font-bold text-accent tracking-wider text-sm">OS #${String(o.number).padStart(4,'0')}</td>
      <td class="p-3"><span class="font-rajdhani font-bold text-accent tracking-wider">${esc(o.plate)}</span></td>
      <td class="p-3">${esc(o.model||'—')}</td>
      <td class="p-3">${esc(o.clientName||'—')}</td>
      <td class="p-3">${fmtD(o.date)}</td>
      <td class="p-3 font-bold">${fmt(o.total)}</td>
      <td class="p-3">
        <div class="flex gap-2">
          <button class="p-1.5 bg-transparent border border-border text-textMuted hover:text-textMain rounded-lg transition-colors" onclick="openOM('${o.id}')" title="Editar">${iEdit}</button>
          <button class="p-1.5 bg-info/10 text-info border border-info/20 hover:bg-info/20 rounded-lg transition-colors" onclick="printO('${o.id}')" title="Imprimir PDF">${iPrint}</button>
          <button class="p-1.5 bg-error/10 text-error border border-error/20 hover:bg-error/20 rounded-lg transition-colors" onclick="delO('${o.id}')" title="Excluir">${iTrash}</button>
        </div>
      </td>
    </tr>`).join('');

  return `
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-rajdhani font-bold tracking-tight">Ordens de Serviço</h1>
      <p class="text-xs text-textMuted">Gestão e impressão de OS</p>
    </div>
    <button onclick="openOM()" class="bg-accent hover:bg-accentHover text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2">
      ${iPlus} Nova Ordem
    </button>
  </header>
  <div class="bg-surface border border-border rounded-xl overflow-hidden">
    <div class="p-4 border-b border-border flex justify-between items-center">
      <h3 class="text-sm font-semibold">Todas as Ordens</h3>
      <span class="text-xs text-textMuted">${os.length} ordem(s)</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="bg-surface2 text-textDim uppercase tracking-wider">
            <th class="p-3 border-b border-border">Nº OS</th>
            <th class="p-3 border-b border-border">Placa</th>
            <th class="p-3 border-b border-border">Veículo</th>
            <th class="p-3 border-b border-border">Cliente</th>
            <th class="p-3 border-b border-border">Data</th>
            <th class="p-3 border-b border-border">Total</th>
            <th class="p-3 border-b border-border">Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ── SETTINGS VIEW ─────────────────────────────────
function setView(){
  const w=app.workshop;
  return `
  <header class="mb-6">
    <h1 class="text-2xl font-rajdhani font-bold tracking-tight">Configurações</h1>
    <p class="text-xs text-textMuted">Dados da oficina utilizados nas ordens de serviço</p>
  </header>
  <div class="bg-surface border border-border rounded-xl max-w-2xl overflow-hidden">
    <div class="p-4 border-b border-border">
      <h3 class="text-sm font-semibold">Dados da Oficina</h3>
    </div>
    <div class="p-6 space-y-6">
      <section>
        <h3 class="text-xs font-rajdhani font-bold text-accent uppercase tracking-wider mb-3 border-b border-border pb-1">🏪 Informações</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2 flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Nome da Oficina *</label>
            <input type="text" id="s-name" value="${esc(w.name)}" class="bg-surface2 border border-border rounded-lg p-2 text-textMain outline-none focus:border-accent transition-colors" placeholder="Nome da sua oficina">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-textMuted uppercase tracking-wider">CNPJ</label>
            <input type="text" id="s-cnpj" value="${esc(w.cnpj)}" class="bg-surface2 border border-border rounded-lg p-2 text-textMain outline-none focus:border-accent transition-colors" placeholder="00.000.000/0000-00">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Telefone</label>
            <input type="text" id="s-phone" value="${esc(w.phone)}" class="bg-surface2 border border-border rounded-lg p-2 text-textMain outline-none focus:border-accent transition-colors" placeholder="(00) 0000-0000">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-textMuted uppercase tracking-wider">E-mail</label>
            <input type="email" id="s-email" value="${esc(w.email)}" class="bg-surface2 border border-border rounded-lg p-2 text-textMain outline-none focus:border-accent transition-colors" placeholder="contato@oficina.com">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Responsável</label>
            <input type="text" id="s-resp" value="${esc(w.resp||'')}" class="bg-surface2 border border-border rounded-lg p-2 text-textMain outline-none focus:border-accent transition-colors" placeholder="Nome do responsável">
          </div>
          <div class="sm:col-span-2 flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Endereço</label>
            <input type="text" id="s-addr" value="${esc(w.address)}" class="bg-surface2 border border-border rounded-lg p-2 text-textMain outline-none focus:border-accent transition-colors" placeholder="Rua, número, bairro">
          </div>
          <div class="sm:col-span-2 flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-textMuted uppercase tracking-wider">Cidade / Estado</label>
            <input type="text" id="s-city" value="${esc(w.city)}" class="bg-surface2 border border-border rounded-lg p-2 text-textMain outline-none focus:border-accent transition-colors" placeholder="Cidade - UF">
          </div>
        </div>
      </section>
      <div class="flex justify-end">
        <button id="save-set-btn" onclick="saveSettings()" class="bg-accent hover:bg-accentHover text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Salvar Configurações
        </button>
      </div>
    </div>
  </div>`;
}

// ── VEHICLE CRUD ──────────────────────────────────
function openVM(id){
  ge('vm-tit').textContent=id?'Editar Veículo':'Registrar Veículo';
  ge('vm-id').value=id||'';
  const v=id?app.vehicles.find(x=>x.id===id):null;
  ge('vm-plate').value=v?.plate||''; ge('vm-model').value=v?.model||''; ge('vm-brand').value=v?.brand||'';
  ge('vm-year').value=v?.year||''; ge('vm-color').value=v?.color||''; ge('vm-km').value=v?.km||'';
  ge('vm-cn').value=v?.client?.name||''; ge('vm-cp').value=v?.client?.phone||'';
  ge('vm-cc').value=v?.client?.cpf||''; ge('vm-ce').value=v?.client?.email||'';
  ge('vm-svc').value=v?.service||''; ge('vm-st').value=v?.status||'aguardando';
  ge('vm-obs').value=v?.notes||'';
  ge('vm-dt').value=v?.entryDate?v.entryDate.split('T')[0]:new Date().toISOString().split('T')[0];
  ge('vm').classList.replace('hidden','flex');
}

async function saveVehicle(){
  const id=ge('vm-id').value;
  const plate=ge('vm-plate').value.trim();
  const model=ge('vm-model').value.trim();
  const cn=ge('vm-cn').value.trim();
  if(!plate){alert('Informe a placa do veículo.');return;}
  if(!model){alert('Informe o modelo do veículo.');return;}
  if(!cn){alert('Informe o nome do cliente.');return;}
  const dtVal=ge('vm-dt').value;
  const v={
    id:id||null, plate, model, brand:ge('vm-brand').value.trim(), year:ge('vm-year').value.trim(),
    color:ge('vm-color').value.trim(), km:ge('vm-km').value.trim(),
    client:{name:cn, phone:ge('vm-cp').value.trim(), cpf:ge('vm-cc').value.trim(), email:ge('vm-ce').value.trim()},
    service:ge('vm-svc').value.trim(), status:ge('vm-st').value, notes:ge('vm-obs').value.trim(),
    entryDate:dtVal?new Date(dtVal+'T12:00:00').toISOString():new Date().toISOString()
  };
  btnLoad('vm-save-btn',true);
  let res;
  if(id){
    res=await db.from('vehicles').update(vToDB(v,false)).eq('id',id).select().single();
  } else {
    res=await db.from('vehicles').insert(vToDB(v,true)).select().single();
  }
  btnLoad('vm-save-btn',false);
  if(res.error){toast('❌ Erro: '+res.error.message);return;}
  const newV=vFromDB(res.data);
  if(id){const i=app.vehicles.findIndex(x=>x.id===id);if(i>=0)app.vehicles[i]=newV;}
  else app.vehicles.push(newV);
  closeModal('vm'); render(); toast(id?'✓ Veículo atualizado':'✓ Veículo registrado com sucesso');
}

async function delV(id){
  if(!confirm('Excluir este veículo? Esta ação não pode ser desfeita.'))return;
  const {error}=await db.from('vehicles').delete().eq('id',id);
  if(error){toast('❌ Erro ao excluir: '+error.message);return;}
  app.vehicles=app.vehicles.filter(v=>v.id!==id);
  render(); toast('Veículo removido');
}

async function updSt(id, st){
  const {error}=await db.from('vehicles').update({status:st}).eq('id',id);
  if(error){toast('❌ Erro ao atualizar status');return;}
  const v=app.vehicles.find(v=>v.id===id);
  if(v) v.status=st;
  toast('✓ Status atualizado');
}

// ── INVENTORY CRUD ─────────────────────────────────
function openIM(id){
  ge('im-tit').textContent=id?'Editar Peça':'Cadastrar Peça';
  ge('im-id').value=id||'';
  const item=id?app.inventory.find(x=>x.id===id):null;
  ge('im-name').value=item?.name||''; ge('im-desc').value=item?.description||'';
  ge('im-qty').value=item?.quantity||0; ge('im-min').value=item?.min_quantity||5;
  ge('im-price').value=item?.unit_price||0; ge('im-sup').value=item?.supplier||'';
  ge('im').classList.replace('hidden','flex');
}

async function saveItem(){
  const id=ge('im-id').value;
  const name=ge('im-name').value.trim();
  if(!name){alert('Informe o nome da peça.');return;}
  const item={
    name, description:ge('im-desc').value.trim(),
    quantity:parseInt(ge('im-qty').value)||0, min_quantity:parseInt(ge('im-min').value)||5,
    unit_price:parseFloat(ge('im-price').value)||0, supplier:ge('im-sup').value.trim()
  };
  btnLoad('im-save-btn',true);
  let res;
  if(id){
    res=await db.from('inventory').update(item).eq('id',id).select().single();
  } else {
    res=await db.from('inventory').insert(item).select().single();
  }
  btnLoad('im-save-btn',false);
  if(res.error){toast('❌ Erro: '+res.error.message);return;}
  if(id){const i=app.inventory.findIndex(x=>x.id===id);if(i>=0)app.inventory[i]=res.data;}
  else app.inventory.push(res.data);
  closeModal('im'); render(); toast('✓ Estoque atualizado');
}

async function delItem(id){
  if(!confirm('Excluir esta peça?'))return;
  const {error}=await db.from('inventory').delete().eq('id',id);
  if(error){toast('❌ Erro: '+error.message);return;}
  app.inventory=app.inventory.filter(i=>i.id!==id);
  render(); toast('Peça removida');
}

function invView(){
  const inv=app.inventory;
  const lowStock=inv.filter(i=>i.quantity<=i.min_quantity).length;
  const rows=inv.length===0?emptyRow(6):
    inv.map(i=>`
    <tr class="border-b border-border hover:bg-surface2 transition-colors">
      <td class="p-3 font-medium">${esc(i.name)}</td>
      <td class="p-3 text-center">${i.quantity}</td>
      <td class="p-3 text-right">${fmt(i.unit_price)}</td>
      <td class="p-3">${esc(i.supplier||'—')}</td>
      <td class="p-3">${getBadgeHtml(i.quantity<=i.min_quantity?'pecas':'concluido')}</td>
      <td class="p-3">
        <div class="flex gap-2">
          <button class="p-1.5 bg-transparent border border-border text-textMuted hover:text-textMain rounded-lg transition-colors" onclick="openIM('${i.id}')" title="Editar">${iEdit}</button>
          <button class="p-1.5 bg-error/10 text-error border border-error/20 hover:bg-error/20 rounded-lg transition-colors" onclick="delItem('${i.id}')" title="Excluir">${iTrash}</button>
        </div>
      </td>
    </tr>`).join('');

  return `
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-rajdhani font-bold tracking-tight">Estoque de Peças</h1>
      <p class="text-xs text-textMuted">Controle de inventário da oficina</p>
    </div>
    <button onclick="openIM()" class="bg-accent hover:bg-accentHover text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2">
      ${iPlus} Cadastrar Peça
    </button>
  </header>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
    <div class="bg-surface border border-border rounded-xl p-4">
      <div class="text-[10px] text-textDim uppercase tracking-widest mb-1">Total de Itens</div>
      <div class="text-3xl font-rajdhani font-bold text-info">${inv.length}</div>
    </div>
    <div class="bg-surface border border-border rounded-xl p-4 ${lowStock>0?'border-error/50':''}">
      <div class="text-[10px] text-textDim uppercase tracking-widest mb-1">Estoque Baixo</div>
      <div class="text-3xl font-rajdhani font-bold ${lowStock>0?'text-error':'text-success'}">${lowStock}</div>
    </div>
  </div>
  <div class="bg-surface border border-border rounded-xl overflow-hidden">
    <div class="p-4 border-b border-border flex justify-between items-center">
      <h3 class="text-sm font-semibold">Lista de Peças</h3>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="bg-surface2 text-textDim uppercase tracking-wider">
            <th class="p-3 border-b border-border">Peça</th>
            <th class="p-3 border-b border-border text-center">Qtd</th>
            <th class="p-3 border-b border-border text-right">Preço</th>
            <th class="p-3 border-b border-border">Fornecedor</th>
            <th class="p-3 border-b border-border">Status</th>
            <th class="p-3 border-b border-border">Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}
function openOMfromV(vid){
  const v=app.vehicles.find(x=>x.id===vid);
  if(v) openOM(null,v);
}

function openOM(id, pre){
  items=[];
  ge('om-tit').textContent=id?'Editar Ordem de Serviço':'Nova Ordem de Serviço';
  ge('om-id').value=id||''; ge('om-vid').value='';
  if(id){
    const o=app.orders.find(x=>x.id===id);
    if(o){
      ge('om-plate').value=o.plate||''; ge('om-model').value=o.model||''; ge('om-brand').value=o.brand||'';
      ge('om-year').value=o.year||''; ge('om-color').value=o.color||''; ge('om-km').value=o.km||'';
      ge('om-cn').value=o.clientName||''; ge('om-cp').value=o.clientPhone||'';
      ge('om-cc').value=o.clientCpf||''; ge('om-ca').value=o.clientAddr||'';
      ge('om-labor').value=o.labor||0; ge('om-disc').value=o.discount||0;
      ge('om-obs').value=o.notes||''; ge('om-vid').value=o.vehicleId||'';
      ge('om-mech').value=o.mechanic_name||'';
      items=(o.items||[]).map(i=>({...i}));
    }
  } else if(pre){
    ge('om-plate').value=pre.plate||''; ge('om-model').value=pre.model||''; ge('om-brand').value=pre.brand||'';
    ge('om-year').value=pre.year||''; ge('om-color').value=pre.color||''; ge('om-km').value=pre.km||'';
    ge('om-cn').value=pre.client?.name||''; ge('om-cp').value=pre.client?.phone||'';
    ge('om-cc').value=pre.client?.cpf||''; ge('om-ca').value='';
    ge('om-labor').value=0; ge('om-disc').value=0;
    ge('om-obs').value=pre.service||''; ge('om-vid').value=pre.id||'';
    ge('om-mech').value='';
    if(pre.service) items.push({desc:pre.service,qty:1,unit:0,total:0});
  } else {
    ['om-plate','om-model','om-brand','om-year','om-color','om-km','om-cn','om-cp','om-cc','om-ca','om-obs','om-mech'].forEach(i=>ge(i).value='');
    ge('om-labor').value=0; ge('om-disc').value=0;
  }
  renderItems(); calcTot(); ge('om').classList.replace('hidden','flex');
}

function lookupV(plate){
  if(plate.length<7)return;
  const v=app.vehicles.find(v=>v.plate===plate);
  if(v){
    ge('om-model').value=v.model||''; ge('om-brand').value=v.brand||'';
    ge('om-year').value=v.year||''; ge('om-color').value=v.color||'';
    ge('om-km').value=v.km||''; ge('om-cn').value=v.client?.name||'';
    ge('om-cp').value=v.client?.phone||''; ge('om-cc').value=v.client?.cpf||'';
    ge('om-vid').value=v.id;
    toast('✓ Veículo encontrado: '+v.brand+' '+v.model);
  }
}

function renderItems(){
  const tb=ge('itb'); if(!tb)return;
  tb.innerHTML=items.length===0
    ?'<tr><td colspan="5" class="p-3 text-center text-textDim text-xs italic">Nenhum item. Clique em "Adicionar Item" para começar.</td></tr>'
    :items.map((it,i)=>`
    <tr class="border-b border-border">
      <td class="p-2">
        <input type="text" value="${esc(it.desc||'')}" oninput="updateItemDesc(${i}, this.value)" class="bg-surface border border-border rounded p-1 text-xs text-textMain outline-none focus:border-accent w-full" placeholder="Descrição" list="inv-list">
        <datalist id="inv-list">
          ${app.inventory.map(inv => `<option value="${esc(inv.name)}">`).join('')}
        </datalist>
      </td>
      <td class="p-2"><input type="number" value="${it.qty||1}" min="0.01" step="0.01" oninput="items[${i}].qty=parseFloat(this.value)||0;items[${i}].total=+(items[${i}].qty*items[${i}].unit).toFixed(2);calcTot()" class="bg-surface border border-border rounded p-1 text-xs text-textMain outline-none focus:border-accent w-full text-center"></td>
      <td class="p-2"><input type="number" value="${it.unit||0}" min="0" step="0.01" oninput="items[${i}].unit=parseFloat(this.value)||0;items[${i}].total=+(items[${i}].qty*items[${i}].unit).toFixed(2);calcTot()" class="bg-surface border border-border rounded p-1 text-xs text-textMain outline-none focus:border-accent w-full text-right"></td>
      <td class="p-2 text-right font-bold text-accent">${fmt(it.total||0)}</td>
      <td class="p-2"><button class="p-1 text-textDim hover:text-error transition-colors" onclick="remItem(${i})"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></td>
    </tr>`).join('');
}

function updateItemDesc(i, val){
  items[i].desc = val;
  const part = app.inventory.find(p => p.name === val);
  if(part){
    items[i].unit = part.unit_price;
    items[i].total = +(items[i].qty * part.unit_price).toFixed(2);
    calcTot();
    renderItems();
  }
}
function addItem(){ items.push({desc:'',qty:1,unit:0,total:0}); renderItems(); calcTot(); }
function remItem(i){ items.splice(i,1); renderItems(); calcTot(); }
function calcTot(){
  const sub=items.reduce((s,i)=>s+parseFloat(i.total||0),0);
  const lab=parseFloat(ge('om-labor')?.value||0);
  const dsc=parseFloat(ge('om-disc')?.value||0);
  const ttl=sub+lab-dsc;
  if(ge('tot-sub')) ge('tot-sub').textContent=fmt(sub);
  if(ge('tot-lab')) ge('tot-lab').textContent=fmt(lab);
  if(ge('tot-dsc')) ge('tot-dsc').textContent='- '+fmt(dsc);
  if(ge('tot-ttl')) ge('tot-ttl').textContent=fmt(ttl);
  return {sub,lab,dsc,ttl};
}

async function saveOrder(){
  const id=ge('om-id').value;
  const plate=ge('om-plate').value.trim();
  const cn=ge('om-cn').value.trim();
  if(!plate){alert('Informe a placa do veículo.');return;}
  if(!cn){alert('Informe o nome do cliente.');return;}
  const {sub,lab,dsc,ttl}=calcTot();
  const order={
    id:id||null, vehicleId:ge('om-vid').value||null,
    plate, model:ge('om-model').value.trim(), brand:ge('om-brand').value.trim(),
    year:ge('om-year').value.trim(), color:ge('om-color').value.trim(), km:ge('om-km').value.trim(),
    clientName:cn, clientPhone:ge('om-cp').value.trim(),
    clientCpf:ge('om-cc').value.trim(), clientAddr:ge('om-ca').value.trim(),
    items:items.map(i=>({...i})), labor:lab, discount:dsc, total:ttl,
    notes:ge('om-obs').value.trim(), mechanic_name:ge('om-mech').value.trim(), date:new Date().toISOString()
  };
  btnLoad('om-save-btn',true);
  
  try {
    // Baixa no Estoque
    for(const it of items){
      const part = app.inventory.find(p => p.name === it.desc);
      if(part){
        const newQty = part.quantity - it.qty;
        if(newQty < 0){
          throw new Error(`Estoque insuficiente para a peça: ${it.desc}. Disponível: ${part.quantity}`);
        }
        await db.from('inventory').update({ quantity: newQty }).eq('id', part.id);
      }
    }
  
    let res;
    if(id){
      res=await db.from('orders').update(oToDB(order,false)).eq('id',id).select().single();
    } else {
      res=await db.from('orders').insert(oToDB(order,true)).select().single();
    }
    if(res.error) throw res.error;
    const newO=oFromDB(res.data);
    if(id){const i=app.orders.findIndex(x=>x.id===id);if(i>=0)app.orders[i]=newO;}
    else app.orders.push(newO);
    closeModal('om'); render(); toast('✓ OS #'+String(newO.number).padStart(4,'0')+' salva com sucesso');
  } catch (e) {
    toast('❌ Erro: ' + e.message);
  } finally {
    btnLoad('om-save-btn',false);
  }
}

async function delO(id){
  if(!confirm('Excluir esta ordem de serviço? Esta ação não pode ser desfeita.'))return;
  const {error}=await db.from('orders').delete().eq('id',id);
  if(error){toast('❌ Erro ao excluir: '+error.message);return;}
  app.orders=app.orders.filter(o=>o.id!==id);
  render(); toast('Ordem removida');
}

// ── POS (CAIXA) ────────────────────────────────────
function addToCart(id){
  const item = app.inventory.find(i => i.id === id);
  if(!item) return;
  if(item.quantity <= 0){ toast('❌ Peça sem estoque!'); return; }
  
  const existing = app.cart.find(c => c.id === id);
  if(existing){
    if(existing.qty < item.quantity){ existing.qty++; }
    else { toast('❌ Limite de estoque atingido!'); return; }
  } else {
    app.cart.push({ id: item.id, name: item.name, price: item.unit_price, qty: 1 });
  }
  render();
}
function remCart(id){
  app.cart = app.cart.filter(c => c.id !== id);
  render();
}
function updateCartQty(id, delta){
  const item = app.cart.find(c => c.id === id);
  const inv = app.inventory.find(i => i.id === id);
  if(!item || !inv) return;
  const newQty = item.qty + delta;
  if(newQty <= 0) return remCart(id);
  if(newQty > inv.quantity){ toast('❌ Estoque insuficiente!'); return; }
  item.qty = newQty;
  render();
}
function calcCartTot(){
  const sub = app.cart.reduce((s,i)=> s + (i.price * i.qty), 0);
  const disc = parseFloat(ge('pos-disc')?.value) || 0;
  return { sub, disc, total: sub - disc };
}

async function finalizeSale(){
  const custName = ge('pos-cust')?.value;
  const method = ge('pos-pay')?.value;
  const disc = parseFloat(ge('pos-disc')?.value) || 0;
  if(app.cart.length === 0){ alert('Carrinho vazio!'); return; }
  if(!method){ alert('Selecione a forma de pagamento!'); return; }
  
  const vehicle = app.vehicles.find(v => v.client.name === custName);
  const custId = vehicle ? vehicle.id : null;

  const { sub, total } = calcCartTot();
  btnLoad('pos-save-btn', true);
  
  try {
    const { data: sale, error: sErr } = await db.from('sales').insert({
      customer_id: custId, 
      customer_name: custName || 'Avulsa',
      total, discount: disc, payment_method: method
    }).select().single();
    if(sErr) throw sErr;
    
    const itemsToSave = app.cart.map(c => ({
      sale_id: sale.id, inventory_id: c.id, quantity: c.qty, unit_price: c.price, subtotal: c.price * c.qty
    }));
    const { error: iErr } = await db.from('sale_items').insert(itemsToSave);
    if(iErr) throw iErr;
    
    for(const c of app.cart){
      const { error: invErr } = await db.from('inventory').update({ quantity: app.inventory.find(i=>i.id===c.id).quantity - c.qty }).eq('id', c.id);
      if(invErr) console.error('Erro ao baixar estoque:', invErr);
    }
    
    app.cart = [];
    await load();
    render();
    printReceipt(sale.id);
    toast('✓ Venda finalizada com sucesso!');
  } catch(e) {
    toast('❌ Erro na venda: ' + e.message);
  } finally {
    btnLoad('pos-save-btn', false);
  }
}

function updatePosTotal(){
  const totalData = calcCartTot();
  const totalEl = ge('pos-total-val');
  if(totalEl) totalEl.textContent = fmt(totalData.total);
}

function posView(){
  const totalData = calcCartTot();
  const rows = app.cart.map(c => `
    <tr class="border-b border-border text-xs">
      <td class="p-2">${esc(c.name)}</td>
      <td class="p-2 text-center">
        <div class="flex items-center justify-center gap-2">
          <button onclick="updateCartQty('${c.id}',-1)" class="w-5 h-5 bg-surface2 border border-border rounded">-</button>
          <span>${c.qty}</span>
          <button onclick="updateCartQty('${c.id}',1)" class="w-5 h-5 bg-surface2 border border-border rounded">+</button>
        </div>
      </td>
      <td class="p-2 text-right">${fmt(c.price)}</td>
      <td class="p-2 text-right font-bold">${fmt(c.price * c.qty)}</td>
      <td class="p-2 text-center"><button onclick="remCart('${c.id}')" class="text-error">×</button></td>
    </tr>`).join('');

  return `
  <div class="flex flex-col lg:flex-row gap-6 h-full">
    <div class="flex-1 bg-surface border border-border rounded-xl p-4 overflow-hidden flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-rajdhani font-bold">Catálogo de Peças</h2>
        <input type="text" oninput="filterPos(this.value)" id="pos-search" class="bg-surface2 border border-border rounded-lg p-2 text-xs text-textMain outline-none focus:border-accent transition-colors w-full max-w-xs" placeholder="Buscar peça...">
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto" id="pos-grid">
        ${app.inventory.map(i => `
          <button onclick="addToCart('${i.id}')" class="p-3 bg-surface2 border border-border rounded-lg text-left hover:border-accent transition-all group">
            <div class="text-xs font-bold truncate">${esc(i.name)}</div>
            <div class="text-[10px] text-textMuted">${fmt(i.unit_price)}</div>
            <div class="text-[10px] ${i.quantity<=i.min_quantity?'text-error':'text-success'} mt-1">Estoque: ${i.quantity}</div>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="w-full lg:w-96 bg-surface border border-border rounded-xl p-4 flex flex-col">
      <h2 class="text-xl font-rajdhani font-bold mb-4">Carrinho</h2>
      <div class="flex-1 overflow-y-auto mb-4">
        <table class="w-full text-left">
          <thead><tr class="text-[10px] text-textDim uppercase border-b border-border"><th class="pb-2">Item</th><th class="pb-2 text-center">Qtd</th><th class="pb-2 text-right">Uni</th><th class="pb-2 text-right">Tot</th><th class="pb-2"></th></tr></thead>
          <tbody>${app.cart.length===0?'<tr><td colspan="5" class="p-4 text-center text-textDim text-xs">Carrinho vazio</td></tr>':rows}</tbody>
        </table>
      </div>
      <div class="space-y-3 border-t border-border pt-4">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-textMuted uppercase">Cliente (Opcional)</label>
          <input type="text" id="pos-cust" list="pos-cust-list" class="bg-surface2 border border-border rounded p-2 text-xs outline-none focus:border-accent" placeholder="Nome do cliente">
          <datalist id="pos-cust-list">${app.vehicles.map(v=>`<option value="${esc(v.client.name)}">`).join('')}</datalist>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-textMuted uppercase">Pagamento</label>
          <select id="pos-pay" class="bg-surface2 border border-border rounded p-2 text-xs outline-none focus:border-accent">
            <option value="">Selecione...</option>
            <option value="Pix">Pix</option>
            <option value="Cartão Crédito">Cartão Crédito</option>
            <option value="Cartão Débito">Cartão Débito</option>
            <option value="Dinheiro">Dinheiro</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-textMuted uppercase">Desconto (R$)</label>
          <input type="number" id="pos-disc" oninput="updatePosTotal()" value="0" class="bg-surface2 border border-border rounded p-2 text-xs outline-none focus:border-accent">
        </div>
        <div class="flex justify-between items-center py-2 border-t border-border">
          <span class="text-sm font-semibold">Total:</span>
          <span id="pos-total-val" class="text-2xl font-rajdhani font-bold text-accent">${fmt(totalData.total)}</span>
        </div>
        <button id="pos-save-btn" onclick="finalizeSale()" class="w-full bg-accent hover:bg-accentHover text-white py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2">
          Finalizar Venda
        </button>
      </div>
    </div>
  </div>`;
}

function filterPos(val){
  const grid = ge('pos-grid');
  const filtered = app.inventory.filter(i => i.name.toLowerCase().includes(val.toLowerCase()));
  grid.innerHTML = filtered.map(i => `
    <button onclick="addToCart('${i.id}')" class="p-3 bg-surface2 border border-border rounded-lg text-left hover:border-accent transition-all group">
      <div class="text-xs font-bold truncate">${esc(i.name)}</div>
      <div class="text-[10px] text-textMuted">${fmt(i.unit_price)}</div>
      <div class="text-[10px] ${i.quantity<=i.min_quantity?'text-error':'text-success'} mt-1">Estoque: ${i.quantity}</div>
    </button>
  `).join('');
}

function histView(){
  const sales = app.sales;
  const rows = sales.length === 0 ? emptyRow(6) : sales.map(s => {
    const clientName = s.customer_name || (app.vehicles.find(v => v.id === s.customer_id)?.client.name) || 'Avulsa';
    return `
    <tr class="border-b border-border hover:bg-surface2 transition-colors">
      <td class="p-3 text-xs">${fmtD(s.created_at)}</td>
      <td class="p-3 text-xs">${esc(clientName)}</td>
      <td class="p-3 text-xs">${s.payment_method}</td>
      <td class="p-3 text-xs font-bold text-accent">${fmt(s.total)}</td>
      <td class="p-3">
        <div class="flex gap-2">
          <button onclick="printSale('${s.id}')" class="p-1.5 bg-transparent border border-border text-textMuted hover:text-textMain rounded-lg transition-colors" title="Imprimir Comprovante">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </button>
          <button onclick="delSale('${s.id}')" class="p-1.5 bg-error/10 text-error border border-error/20 hover:bg-error/20 rounded-lg transition-colors" title="Excluir Venda">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-rajdhani font-bold tracking-tight">Histórico de Vendas</h1>
      <p class="text-xs text-textMuted">Relatório de transações do caixa</p>
    </div>
  </header>
  <div class="bg-surface border border-border rounded-xl overflow-hidden">
    <div class="p-4 border-b border-border flex justify-between items-center">
      <h3 class="text-sm font-semibold">Vendas Realizadas</h3>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="bg-surface2 text-textDim uppercase tracking-wider">
            <th class="p-3 border-b border-border">Data</th>
            <th class="p-3 border-b border-border">Cliente</th>
            <th class="p-3 border-b border-border">Pagamento</th>
            <th class="p-3 border-b border-border">Total</th>
            <th class="p-3 border-b border-border">Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

async function delSale(id){
  if(!confirm('Excluir esta venda? Os produtos voltarão ao estoque.')) return;
  
  try {
    console.log('Iniciando exclusão da venda:', id);
    
    // 1. Buscar itens da venda
    const { data: items, error: iErr } = await db.from('sale_items').select('inventory_id, quantity').eq('sale_id', id);
    if(iErr) throw iErr;
    
    console.log('Itens encontrados para devolver:', items);

    // 2. Devolver itens ao estoque
    if(items && items.length > 0){
      for(const it of items){
        if(!it.inventory_id) {
          console.warn('Item sem inventory_id, pulando...');
          continue;
        }
        
        // Busca quantidade atualizada do banco
        const { data: part, error: pErr } = await db.from('inventory').select('quantity').eq('id', it.inventory_id).single();
        if(pErr) {
          console.error(`Erro ao buscar peça ${it.inventory_id}:`, pErr);
          continue;
        }

        const currentQty = parseFloat(part?.quantity || 0);
        const returnQty = parseFloat(it.quantity || 0);
        const newQty = currentQty + returnQty;
        
        console.log(`Restaurando peça ${it.inventory_id}: ${currentQty} -> ${newQty}`);
        
        const { error: uErr } = await db.from('inventory').update({ quantity: newQty }).eq('id', it.inventory_id);
        if(uErr) console.error(`Erro ao atualizar estoque da peça ${it.inventory_id}:`, uErr);
      }
    } else {
      console.log('Nenhum item encontrado para esta venda.');
    }

    // 3. Deletar a venda
    const { error: sErr } = await db.from('sales').delete().eq('id', id);
    if(sErr) throw sErr;

    app.sales = app.sales.filter(s => s.id !== id);
    await load(); 
    render();
    toast('✓ Venda removida e estoque restaurado');
  } catch(e) {
    console.error('Erro crítico no delSale:', e);
    toast('❌ Erro ao excluir: ' + e.message);
  }
}


async function printSale(id){
  // Busca a venda atualizada diretamente do banco para evitar erro de cache/estado
  const { data: sale, error: sErr } = await db.from('sales').select('*').eq('id', id).single();
  if(sErr || !sale) {
    console.error('Erro ao buscar venda:', sErr);
    toast('❌ Erro ao carregar dados da venda');
    return;
  }
  
  const { data: items, error: iErr } = await db.from('sale_items').select('*').eq('sale_id', id);
  if(iErr) {
    console.error('Erro ao buscar itens:', iErr);
    toast('❌ Erro ao carregar itens da venda');
    return;
  }
  
  const w = app.workshop;
  
  const itRows = items.map(i => {
    const part = app.inventory.find(p => p.id === i.inventory_id);
    const name = part ? part.name : 'Item não encontrado';
    return `<tr><td>${esc(name)}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${fmt(i.unit_price)}</td><td style="text-align:right">${fmt(i.subtotal)}</td></tr>`;
  }).join('');
  
  const clientName = sale.customer_name || (app.vehicles.find(v => v.id === sale.customer_id)?.client.name) || 'Avulsa';
  const discVal = parseFloat(sale.discount || 0);

  ge('prt').innerHTML = `
    <div style="text-align:center; font-family: monospace; width: 80mm; margin: 0 auto;">
      <div style="font-weight: bold; font-size: 16px;">${esc(w.name)}</div>
      <div style="font-size: 10px;">${esc(w.cnpj)} | ${esc(w.phone)}</div>
      <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
      <div style="text-align: left; font-size: 12px;">Data: ${fmtD(sale.created_at)}</div>
      <div style="text-align: left; font-size: 12px;">Cliente: ${esc(clientName)}</div>
      <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
        <thead><tr style="border-bottom: 1px solid #000"><th>Item</th><th>Qtd</th><th>Uni</th><th>Tot</th></tr></thead>
        <tbody>${itRows}</tbody>
      </table>
      <div style="text-align: right; font-size: 12px; margin-top: 5px;">
        ${discVal > 0 ? `<div>Desconto: -${fmt(discVal)}</div>` : ''}
      </div>
      <div style="border-top: 1px solid #000; margin-top: 5px; padding-top: 5px; text-align: right; font-weight: bold; font-size: 16px;">
        TOTAL: ${fmt(sale.total)}
      </div>
      <div style="text-align: center; font-size: 10px; margin-top: 20px;">Obrigado pela preferência!</div>
    </div>
  `;
  window.print();
}

function printReceipt(id){
  printSale(id);
}


function printO(id){
  const o=app.orders.find(x=>x.id===id); if(!o)return;
  const w=app.workshop;
  const itRows=o.items.length>0
    ?o.items.map(it=>`<tr><td>${esc(it.desc||'')}</td><td style="text-align:center">${it.qty||1}</td><td style="text-align:right">R$ ${parseFloat(it.unit||0).toFixed(2).replace('.',',')}</td><td style="text-align:right">R$ ${parseFloat(it.total||0).toFixed(2).replace('.',',')}</td></tr>`).join('')
    :'<tr><td colspan="4" style="text-align:center;color:#999;font-style:italic">Nenhum item registrado</td></tr>';
  const sub=parseFloat(o.total||0)-parseFloat(o.labor||0)+parseFloat(o.discount||0);
  ge('prt').innerHTML=`<div>
    <div class="po-hd">
      <div>
        <div class="po-wn">${esc(w.name||'OFICINA')}</div>
        <div class="po-wi">
          ${w.cnpj?'CNPJ: '+esc(w.cnpj)+'<br>':''}
          ${w.address?esc(w.address)+(w.city?', '+esc(w.city):'')+'<br>':''}
          ${w.phone?'Tel: '+esc(w.phone):''}${w.email?(w.phone?' | ':'')+esc(w.email):''}
        </div>
      </div>
      <div class="po-nr">
        <div class="po-nl">Ordem de Serviço</div>
        <div class="po-nv">OS #${String(o.number).padStart(4,'0')}</div>
        <div class="po-nd">Data: ${fmtD(o.date)}</div>
      </div>
    </div>
    <div class="po-sc">Dados do Veículo</div>
    <div class="po-gr">
      <div class="po-fi"><span class="po-fl">Placa:</span><span class="po-fv" style="font-size:14px;font-weight:700;letter-spacing:1px">${esc(o.plate)}</span></div>
      <div class="po-fi"><span class="po-fl">Modelo:</span><span class="po-fv">${esc((o.brand?o.brand+' ':'')+o.model)}</span></div>
      <div class="po-fi"><span class="po-fl">Ano:</span><span class="po-fv">${esc(o.year||'—')}</span></div>
      <div class="po-fi"><span class="po-fl">Cor:</span><span class="po-fv">${esc(o.color||'—')}</span></div>
      <div class="po-fi"><span class="po-fl">KM:</span><span class="po-fv">${esc(o.km||'—')}</span></div>
    </div>
    <div class="po-sc">Dados do Cliente</div>
    <div class="po-gr">
      <div class="po-fi"><span class="po-fl">Nome:</span><span class="po-fv">${esc(o.clientName||'—')}</span></div>
      <div class="po-fi"><span class="po-fl">CPF:</span><span class="po-fv">${esc(o.clientCpf||'—')}</span></div>
      <div class="po-fi"><span class="po-fl">Telefone:</span><span class="po-fv">${esc(o.clientPhone||'—')}</span></div>
      <div class="po-fi" style="grid-column:1/-1"><span class="po-fl">Endereço:</span><span class="po-fv">${esc(o.clientAddr||'—')}</span></div>
    </div>
    <div class="po-sc">Serviços e Peças</div>
    <table class="po-tb">
      <thead><tr><th>Descrição</th><th style="width:55px;text-align:center">Qtd</th><th style="width:95px;text-align:right">Valor Unit.</th><th style="width:95px;text-align:right">Total</th></tr></thead>
      <tbody>${itRows}</tbody>
    </table>
    <div class="po-tot"><div class="po-tb-box">
      <div class="po-tr"><span>Subtotal:</span><span>R$ ${sub.toFixed(2).replace('.',',')}</span></div>
      ${o.labor?`<div class="po-tr"><span>Mão de Obra:</span><span>R$ ${parseFloat(o.labor).toFixed(2).replace('.',',')}</span></div>`:''}
      ${o.discount?`<div class="po-tr"><span>Desconto:</span><span>- R$ ${parseFloat(o.discount).toFixed(2).replace('.',',')}</span></div>`:''}
      <div class="po-tr big"><span>TOTAL:</span><span>R$ ${parseFloat(o.total).toFixed(2).replace('.',',')}</span></div>
    </div></div>
    ${o.notes?`<div class="po-obs"><div class="po-obl">Observações:</div><div class="po-obt">${esc(o.notes)}</div></div>`:''}
    <div class="po-sgs">
      <div class="po-sg"><div class="po-sgl">Responsável Oficina</div><div class="po-sgn">${esc(w.resp||w.name||'')}</div></div>
      <div class="po-sg"><div class="po-sgl">Mecânico Responsável</div><div class="po-sgn">${esc(o.mechanic_name || '—')}</div></div>
      <div class="po-sg"><div class="po-sgl">Assinatura do Cliente</div><div class="po-sgn">${esc(o.clientName||'')}</div></div>
    </div>
  </div>`;
  window.print();
}

// ── SETTINGS ──────────────────────────────────────
async function saveSettings(){
  const data={
    id:1, name:ge('s-name')?.value.trim()||'Minha Oficina',
    cnpj:ge('s-cnpj')?.value.trim()||null, phone:ge('s-phone')?.value.trim()||null,
    email:ge('s-email')?.value.trim()||null, resp:ge('s-resp')?.value.trim()||null,
    address:ge('s-addr')?.value.trim()||null, city:ge('s-city')?.value.trim()||null
  };
  const btn=ge('save-set-btn'); if(btn){btn._orig=btn.innerHTML;btn.disabled=true;btn.innerHTML='<div class="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> Salvando...';}
  const {error}=await db.from('workshop_settings').upsert(data,{onConflict:'id'});
  if(btn){btn.disabled=false;btn.innerHTML=btn._orig;}
  if(error){toast('❌ Erro: '+error.message);return;}
  app.workshop={name:data.name,cnpj:data.cnpj||'',phone:data.phone||'',email:data.email||'',resp:data.resp||'',address:data.address||'',city:data.city||''};
  ge('sb-wn').textContent=data.name;
  toast('✓ Configurações salvas no Supabase');
}

// ── MODAL HELPERS ─────────────────────────────────
function closeModal(id){ ge(id).classList.replace('flex','hidden'); }
document.querySelectorAll('.ov, .fixed.inset-0').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)closeModal(ov.id);}));

// ── EMPTY ROW ─────────────────────────────────────
function emptyRow(cols){
  return `<tr><td colspan="${cols}" class="p-12 text-center text-textDim text-xs">
    <div class="flex flex-col items-center gap-2">
      <svg class="w-8 h-8 stroke-border" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      <p>Nenhum registro encontrado.</p>
    </div>
  </td></tr>`;
}

// ── ICONS ─────────────────────────────────────────
const iPlus=`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const iEdit=`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const iTrash=`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const iOS=`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
const iPrint=`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;

// ── INIT ──────────────────────────────────────────
checkSession();
