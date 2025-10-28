import { Desktop } from "@wxcc-desktop/sdk";

const bottoken = "PASTE_YOUR_BEARER_TOKEN_HERE";

const template = document.createElement("template");

template.innerHTML = `
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  :host{display:block}
  body{font-family:Arial, sans-serif;background:#f5f5f5;color:#333}
  .container{margin:2rem auto;padding:20px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .toolbar{display:flex;gap:.5rem;align-items:center;justify-content:space-between;margin-bottom:1rem}
  .left{display:flex;gap:.5rem;align-items:center}
  .right{font-size:.9rem;color:#666}
  .btn{padding:.5rem 1rem;font-size:1rem;border:none;background:#0072C3;color:#fff;cursor:pointer;border-radius:4px;transition:background .2s}
  .btn:hover{background:#005fa3}
  .btn.secondary{background:#00a884}
  .btn.secondary:hover{background:#008f6a}
  #spinner{text-align:center;margin:1rem 0}
  .message{text-align:center;margin:1rem 0;color:#666}
  .hidden{display:none}
  table{width:100%;border-collapse:collapse;margin-top:1rem}
  th,td{padding:.75rem;text-align:left;border-bottom:1px solid #eee}
  thead{background:#f2f2f2}
  tbody tr:nth-child(even){background:#fafafa}
  tbody tr:hover{background:#e6f7ff}
  .badge{display:inline-block;padding:.2rem .5rem;border-radius:999px;font-weight:600}
  .in{background:#e8fff6;color:#067647}
  .out{background:#e8f0ff;color:#1e40af}
  .muted{color:#666}
  </style>

  <div class="container">
    <h1>Agent-History – Anrufliste</h1>
    <div class="toolbar">
      <div class="left">
        <button id="btnRefresh" class="btn">Aktualisieren</button>
        <button id="btnToggle" class="btn secondary">Auto: an</button>
      </div>
      <div class="right">
        Intervall: <span id="intervalLabel">15s</span> · Letzte Aktualisierung: <span id="lastTs" class="muted">–</span>
      </div>
    </div>
    <div id="spinner" class="hidden">Lade…</div>
    <div id="message" class="message"></div>
    <table id="resultsTable">
      <thead>
        <tr>
          <th>Richtung</th>
          <th>Datum</th>
          <th>Uhrzeit</th>
          <th>Dauer (m:ss)</th>
          <th>Kunde</th>
          <th>Entry Point</th>
          <th>ANI</th>
        </tr>
      </thead>
      <tbody id="rows"><tr></tr></tbody>
    </table>
  </div>
`;

const logger = Desktop.logger.createLogger("agent-history");

class AgentHistoryWidget extends HTMLElement {
  constructor(){
    super();
    logger.info("agent-history", "started");
    this.attachShadow({mode:"open"});
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.$rows = this.shadowRoot.getElementById("rows");
    this.$message = this.shadowRoot.getElementById("message");
    this.$spinner = this.shadowRoot.getElementById("spinner");
    this.$intervalLabel = this.shadowRoot.getElementById("intervalLabel");
    this.$lastTs = this.shadowRoot.getElementById("lastTs");
    this.$btnRefresh = this.shadowRoot.getElementById("btnRefresh");
    this.$btnToggle = this.shadowRoot.getElementById("btnToggle");
    this.agentId = this.getAttribute("agent-id") || "04a73c42-64b5-4d68-ad9e-37abaf43b72e";
    this.pageSize = Number(this.getAttribute("page-size") || 1000);
    this.intervalMs = Number(this.getAttribute("interval-ms") || 15000);
    this.baseUrl = this.getAttribute("base-url") || "https://api.wxcc-us1.cisco.com/v1/history/agentHistory";
    this.timer = null;
    this.auto = true;
  }
  connectedCallback(){
    Desktop.config.init();
    this.$intervalLabel.textContent = Math.round(this.intervalMs/1000)+"s";
    this.$btnRefresh.addEventListener("click", () => this.refresh(true));
    this.$btnToggle.addEventListener("click", () => this.toggleAuto());
    this.start();
  }
  disconnectedCallback(){
    clearInterval(this.timer);
    Desktop.agentContact.removeAllEventListeners();
  }
  start(){
    this.refresh(false);
    this.timer = setInterval(() => { if(this.auto) this.refresh(false); }, this.intervalMs);
  }
  toggleAuto(){
    this.auto = !this.auto;
    this.$btnToggle.textContent = this.auto ? "Auto: an" : "Auto: aus";
  }
  async getToken(){
    const actoken = await Desktop.actions.getToken();
    logger.info("agent-history", "getToken" +actoken);
    // Versuche Token aus dem Desktop SDK zu holen, fallback auf bottoken-Konstante
    try{
      const t = Desktop?.config?.auth?.accessToken || Desktop?.auth?.accessToken;
      if (t) return t;
    }catch(_){}
    return actoken;
  }
  buildUrl(){
    const u = new URL(this.baseUrl);
    u.searchParams.set("agentId", this.agentId);
    u.searchParams.set("page", "0");
    u.searchParams.set("pageSize", String(this.pageSize));
    return u.toString();
  }
  async fetchHistory(){
    const token = await this.getToken();

    logger.info("agent-history", "fetch history Token clean" +token);
    const orgid = this.organizationId;
    logger.info("agent-history", "fetch history Org" + orgid);
    const tt = "Bearer "+token;
    logger.info("agent-history", "fetch history Token " +tt);
    const headers = {"Accept":"application/json","X-Organization-Id":orgid,"Authorization":tt};

    const res = await fetch(this.buildUrl(), { headers });
    if(!res.ok){
      const txt = await res.text().catch(()=>"");
      throw new Error(`HTTP ${res.status} ${res.statusText}${txt?" – "+txt:""}`);
    }
    return res.json();
  }
  msToMinSec(ms){
    const total = Math.max(0, Math.round((ms||0)/1000));
    const m = Math.floor(total/60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2,"0")}`;
  }
  normalize(rec){

    logger.info("agent-history", rec);
  const dirRaw = rec.callDirection || rec.direction || rec.callType || "";
  const dir = String(dirRaw).toUpperCase().includes("OUT") ? "OUT" : "IN";
  const talkMs = rec.talkDuration ?? rec.talkTimeMs ?? rec.talkTime ?? rec.durationMs ?? 0;
  const customerName = rec.customerName || rec.customer?.name || rec.customer?.displayName || "";
  const entryPoint = rec.entrypointName || rec.entryPoint || rec.entrypoint || rec.entryPointId || "";
  const ani = rec.dnis || rec.callerId || rec.callingNumber || rec.fromAddress || "";
  logger.info("agent-history", entryPoint);
  // Mehr mögliche Zeitfelder:
  const when =
    rec.cstts || rec.startDateTime || rec.startTimestamp ||
    rec.contactStartTimestamp || rec.agentConnectedTimestamp ||
    rec.connectedTime || rec.createdTime || rec.timestamp ||
    rec.activityDate || null;

  return { dir, talkMs, customerName, entryPoint, ani, when };
}

parseWhen(value){
  if (!value && value !== 0) return null;
  try {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

    if (typeof value === 'number'){
      const ms = value < 1e12 ? value * 1000 : value; // < 10^12 => Sekunden
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    const s = String(value).trim();
    if (/^\d{10}$/.test(s)){
      const d = new Date(parseInt(s,10) * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{13}$/.test(s)){
      const d = new Date(parseInt(s,10));
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(s); // ISO / sonstige Formate
    return isNaN(d.getTime()) ? null : d;
  } catch { return null }
}
  fmtDateTime(when){
  const d = this.parseWhen(when);
  if(!d) return {date:'', time:''};
  return {
    date: d.toLocaleDateString(undefined,{year:'numeric',month:'2-digit',day:'2-digit'}),
    time: d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  };
}
  clearTable(){ this.$rows.innerHTML = ""; }
  render(items){
    this.clearTable();
    const { arr, path } = this.pickRecords(items);
    logger.info("agent-history", `records path: ${path} length: ${arr.length}`);
    if(arr.length===0){
      this.$message.textContent = "Keine Daten gefunden (Prüfe Datenpfad).";
      try{ logger.info("agent-history", `top-level keys: ${Object.keys(items||{}).join(', ')}`); }catch(_){}
      return;
    }
    const frag=document.createDocumentFragment();
    for(const r of arr){
      const {dir,talkMs,customerName,entryPoint,ani,when}=this.normalize(r);
      const dt=this.fmtDateTime(when);
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td><span class="badge ${dir==='IN'?'in':'out'}">${dir==='IN'?'Eingehend':'Ausgehend'}</span></td>
        <td>${dt.date||'<span class="muted">—</span>'}</td>
        <td>${dt.time||'<span class="muted">—</span>'}</td>
        <td>${this.msToMinSec(talkMs)}</td>
        <td>${customerName?this.escape(customerName):'<span class="muted">—</span>'}</td>
        <td>${entryPoint?this.escape(entryPoint):'<span class="muted">—</span>'}</td>
        <td>${ani?this.escape(ani):'<span class="muted">—</span>'}</td>`;
      frag.appendChild(tr);
    }
    this.$rows.appendChild(frag);
  }
  pickRecords(payload){
    if(Array.isArray(payload)) return {arr:payload,path:'[root]'};
    if(Array.isArray(payload?.data)) return {arr:payload.data,path:'data'};
    if(Array.isArray(payload?.records)) return {arr:payload.records,path:'records'};
    if(Array.isArray(payload?.items)) return {arr:payload.items,path:'items'};
    if(Array.isArray(payload?.data?.records)) return {arr:payload.data.records,path:'data.records'};
    if(Array.isArray(payload?.data?.items)) return {arr:payload.data.items,path:'data.items'};
    const visited=new Set();
    const queue=[{obj:payload,path:'[root]'}];
    while(queue.length){
      const {obj,path}=queue.shift();
      if(!obj||typeof obj!=='object'||visited.has(obj))continue;
      visited.add(obj);
      for(const key of Object.keys(obj)){
        const v=obj[key];
        const newPath=path==='[root]'?key:path+'.'+key;
        if(Array.isArray(v)) return {arr:v,path:newPath};
        if(v&&typeof v==='object') queue.push({obj:v,path:newPath});
      }
    }
    return {arr:[],path:'(unbekannt)'};
  }
  escape(s){
    
    return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }
  setBusy(b){ this.$spinner.classList.toggle("hidden",!b); }
  async refresh(manual){
    try{
      this.$message.textContent = manual ? "Lade… (manuell)" : "Lade…";
      this.setBusy(true);
      const data = await this.fetchHistory();
      this.render(data);
      this.$lastTs.textContent = new Date().toLocaleTimeString();
      this.$message.textContent = "";
    }catch(err){
      logger.error("agent-history", err?.message || String(err));
      this.$message.textContent = `Fehler: ${err?.message || err}`;
    }finally{ this.setBusy(false); }
  }
}

customElements.define("agent-history-list", AgentHistoryWidget);

