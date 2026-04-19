// dashboard-html.ts — Embedded SPA for CLAUDECLAW OS Dashboard

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CLAUDECLAW OS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#05050a;--bg2:#0c0c16;--bg3:#111122;--bg4:#181830;
  --border:#1c1c2e;--border2:#262640;
  --text:#e2e2f0;--text2:#6868a0;--text3:#3d3d60;
  --accent:#6366f1;--accent2:#818cf8;--accent-dim:rgba(99,102,241,0.12);
  --green:#22c55e;--red:#ef4444;--amber:#f59e0b;--cyan:#06b6d4;--purple:#a855f7;--emerald:#10b981;
  --c-main:#6366f1;--c-comms:#06b6d4;--c-content:#a855f7;--c-ops:#f59e0b;--c-research:#10b981;
  --font:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;
}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;font-size:14px;line-height:1.5}
*::-webkit-scrollbar{width:4px;height:4px}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}

/* Header */
.hdr{height:52px;background:var(--bg2);border-bottom:1px solid var(--border);
  padding:0 20px;display:flex;align-items:center;gap:12px;
  position:sticky;top:0;z-index:50}
.hdr-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.88rem;letter-spacing:.06em}
.hdr-mark{width:26px;height:26px;border-radius:7px;
  background:linear-gradient(135deg,var(--accent),var(--cyan));
  display:flex;align-items:center;justify-content:center}
.hdr-mark svg{color:#fff}
.hdr-sep{flex:1}
.pill{display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--text2);
  padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:20px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--text3);flex-shrink:0;transition:background .3s}
.dot.live{background:var(--green);box-shadow:0 0 6px rgba(34,197,94,.5);animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.5}}
.hdr-btn{background:none;border:1px solid var(--border);border-radius:6px;
  color:var(--text2);cursor:pointer;padding:5px 12px;font:.72rem var(--font);
  display:flex;align-items:center;gap:5px;transition:all .15s}
.hdr-btn:hover{border-color:var(--accent);color:var(--accent2);background:var(--accent-dim)}

/* Layout */
.wrap{display:grid;grid-template-columns:268px 1fr;min-height:calc(100vh - 52px)}
.side{background:var(--bg);border-right:1px solid var(--border);
  position:sticky;top:52px;height:calc(100vh - 52px);overflow-y:auto;display:flex;flex-direction:column}

/* Section */
.sec{border-bottom:1px solid var(--border)}
.sec-hd{padding:10px 16px;display:flex;align-items:center;gap:7px;
  font:.68rem/.9rem var(--font);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text2)}
.sec-hd svg{flex-shrink:0;opacity:.7}
.sec-hd .cnt{margin-left:auto;font:.6rem var(--mono);
  color:var(--text3);background:var(--bg3);padding:1px 6px;border-radius:3px}

/* Agent list */
.ag-item{padding:9px 16px;display:flex;align-items:center;gap:10px;transition:background .1s}
.ag-item:hover{background:var(--bg2)}
.ag-av{width:30px;height:30px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.72rem;color:#fff}
.ag-info{flex:1;min-width:0}
.ag-name{font-weight:600;font-size:.8rem}
.ag-role{font-size:.68rem;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-id{font:.58rem var(--mono);color:var(--text3);background:var(--bg3);padding:1px 5px;border-radius:3px;flex-shrink:0}

/* Search */
.srch-wrap{padding:12px 16px}
.srch-row{display:flex;gap:5px;margin-bottom:8px}
.inp{background:var(--bg3);border:1px solid var(--border);border-radius:6px;
  color:var(--text);font:.78rem var(--font);padding:6px 10px;outline:none;transition:border .15s;width:100%}
.inp:focus{border-color:var(--accent)}
.inp::placeholder{color:var(--text3)}
.inp-sm{max-width:80px}
.srch-btn{background:var(--accent-dim);border:1px solid rgba(99,102,241,.25);border-radius:6px;
  color:var(--accent2);cursor:pointer;padding:6px 10px;font:.72rem var(--font);white-space:nowrap;transition:all .15s}
.srch-btn:hover{background:rgba(99,102,241,.22)}
.srch-res{font-size:.73rem;color:var(--text2);line-height:1.6;max-height:140px;overflow-y:auto}
.srch-hit{padding:4px 0;border-bottom:1px solid var(--border)}
.srch-hit:last-child{border-bottom:none}
.srch-kind{font:.6rem var(--mono);color:var(--text3)}
.srch-content{color:var(--text);font-size:.73rem}

/* Mission form */
.mf{padding:12px 16px}
.lbl{font:.68rem var(--font);font-weight:500;color:var(--text2);margin-bottom:4px;display:block}
.ta{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;
  color:var(--text);font:.78rem var(--font);padding:7px 10px;outline:none;resize:none;
  transition:border .15s;margin-bottom:7px;line-height:1.5}
.ta:focus{border-color:var(--accent)}
.ta::placeholder{color:var(--text3)}
.mf-row{display:flex;gap:6px;align-items:center}
.sel{background:var(--bg3);border:1px solid var(--border);border-radius:6px;
  color:var(--text);font:.73rem var(--font);padding:5px 8px;outline:none;cursor:pointer;transition:border .15s}
.sel:focus{border-color:var(--accent)}
.btn-create{background:var(--accent);border:none;border-radius:6px;
  color:#fff;cursor:pointer;padding:6px 14px;font:.72rem/1 var(--font);font-weight:600;
  display:flex;align-items:center;gap:4px;transition:background .15s;white-space:nowrap}
.btn-create:hover{background:var(--accent2)}
.mf-msg{font:.68rem var(--font);color:var(--text2);margin-top:5px;min-height:14px}

/* Main content */
.main{overflow:hidden}
.grid2{display:grid;grid-template-columns:1fr 1fr}
.panel{border-bottom:1px solid var(--border);border-right:1px solid var(--border)}
.panel:nth-child(even){border-right:none}
.panel.full{grid-column:1/-1;border-right:none}
.panel-hd{padding:10px 16px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:7px;
  font:.68rem/.9rem var(--font);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text2)}
.panel-hd svg{opacity:.7;flex-shrink:0}
.panel-hd .bdg{margin-left:auto;font:.6rem var(--mono);background:var(--bg3);
  padding:1px 6px;border-radius:3px;color:var(--text3)}
.panel-body{max-height:300px;overflow-y:auto}

/* Hive mind */
.hv-item{padding:8px 16px;display:flex;align-items:flex-start;gap:8px;
  border-bottom:1px solid var(--border);transition:background .1s}
.hv-item:last-child{border-bottom:none}
.hv-item:hover{background:var(--bg2)}
.hv-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:6px}
.hv-body{flex:1;min-width:0}
.hv-meta{display:flex;align-items:center;gap:5px;margin-bottom:1px;flex-wrap:wrap}
.hv-agent{font-weight:600;font-size:.78rem}
.hv-act{font:.63rem var(--mono);padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--text2)}
.hv-arr{font:.63rem var(--font);color:var(--text3)}
.hv-time{font:.63rem var(--font);color:var(--text3);margin-left:auto}

/* Missions */
.ms-item{padding:8px 16px;display:flex;align-items:center;gap:8px;
  border-bottom:1px solid var(--border);transition:background .1s}
.ms-item:last-child{border-bottom:none}
.ms-item:hover{background:var(--bg2)}
.pri{font:.63rem var(--mono);font-weight:700;width:22px;height:22px;border-radius:4px;
  display:flex;align-items:center;justify-content:center;flex-shrink:0}
.p-hi{background:rgba(239,68,68,.13);color:var(--red)}
.p-md{background:rgba(245,158,11,.12);color:var(--amber)}
.p-lo{background:rgba(34,197,94,.1);color:var(--green)}
.ms-txt{flex:1;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stbdg{font:.62rem var(--mono);padding:2px 6px;border-radius:3px;flex-shrink:0}
.st-queued{background:rgba(99,102,241,.12);color:var(--accent2)}
.st-running{background:rgba(245,158,11,.12);color:var(--amber)}
.st-done{background:rgba(34,197,94,.1);color:var(--green)}
.st-failed{background:rgba(239,68,68,.12);color:var(--red)}

/* Scheduled */
.sc-item{padding:8px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border)}
.sc-item:last-child{border-bottom:none}
.cron{font:.68rem var(--mono);color:var(--cyan);background:var(--bg3);
  padding:2px 6px;border-radius:3px;flex-shrink:0;min-width:88px}
.sc-txt{font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}

/* Audit */
.au-item{padding:8px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border)}
.au-item:last-child{border-bottom:none}
.au-act{font:.63rem var(--mono);padding:2px 6px;border-radius:3px;background:rgba(239,68,68,.1);color:var(--red);flex-shrink:0}
.au-who{font-size:.75rem;color:var(--text2);flex:1}
.au-t{font:.63rem var(--font);color:var(--text3);flex-shrink:0}

.empty{padding:20px 16px;text-align:center;color:var(--text3);font-size:.76rem;font-style:italic}

@media(max-width:900px){
  .wrap{grid-template-columns:1fr}
  .side{position:static;height:auto;border-right:none;border-bottom:1px solid var(--border)}
  .grid2{grid-template-columns:1fr}
  .panel{border-right:none}
}
</style>
</head>
<body>

<header class="hdr">
  <div class="hdr-logo">
    <div class="hdr-mark">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    </div>
    CLAUDECLAW OS
  </div>
  <div class="hdr-sep"></div>
  <div class="pill"><span class="dot" id="sseDot"></span><span id="sseSt">Connecting</span></div>
  <button class="hdr-btn" onclick="scrollToForm()">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    New Mission
  </button>
</header>

<div class="wrap">
  <aside class="side">

    <div class="sec">
      <div class="sec-hd">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
        Agent Council
      </div>
      <div id="agentList"></div>
    </div>

    <div class="sec">
      <div class="sec-hd">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        Memory Search
      </div>
      <div class="srch-wrap">
        <div class="srch-row">
          <input class="inp" id="memQ" placeholder="Query…" />
          <input class="inp inp-sm" id="memCid" placeholder="Chat ID" />
          <button class="srch-btn" onclick="doSearch()">Go</button>
        </div>
        <div class="srch-res" id="memRes"></div>
      </div>
    </div>

    <div class="sec" id="mfSection">
      <div class="sec-hd">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
        Add Mission
      </div>
      <div class="mf">
        <label class="lbl">Task description</label>
        <textarea class="ta" id="mPrompt" rows="3" placeholder="Describe the mission…"></textarea>
        <div class="mf-row">
          <select class="sel" id="mPri">
            <option value="9">P9 — Critical</option>
            <option value="7">P7 — High</option>
            <option value="5" selected>P5 — Medium</option>
            <option value="3">P3 — Low</option>
            <option value="1">P1 — Background</option>
          </select>
          <button class="btn-create" onclick="createMission()">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create
          </button>
        </div>
        <div class="mf-msg" id="mMsg"></div>
      </div>
    </div>

  </aside>

  <div class="main">
    <div class="panel full" style="border-bottom:1px solid var(--border)">
      <div class="panel-hd">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        War Room Voices
      </div>
      <div class="panel-body" style="padding:16px">
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:12px">Per-agent Gemini Live voice config. Main keeps Charon unless you change it.</div>
        <div id="voiceList" style="display:flex;flex-direction:column;gap:8px">
          <!-- Populated by JS -->
        </div>
      </div>
    </div>
    
    <div class="grid2">

      <div class="panel">
        <div class="panel-hd">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Hive Mind
          <span class="bdg" id="hvBdg">—</span>
        </div>
        <div class="panel-body" id="hvList"></div>
      </div>

      <div class="panel">
        <div class="panel-hd">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
          Missions
          <span class="bdg" id="msBdg">—</span>
        </div>
        <div class="panel-body" id="msList"></div>
      </div>

      <div class="panel">
        <div class="panel-hd">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Scheduled Tasks
          <span class="bdg" id="scBdg">—</span>
        </div>
        <div class="panel-body" id="scList"></div>
      </div>

      <div class="panel">
        <div class="panel-hd">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Audit Log
          <span class="bdg" id="auBdg">—</span>
        </div>
        <div class="panel-body" id="auList"></div>
      </div>

    </div>
  </div>
</div>

<script>
const token = new URLSearchParams(location.search).get('token') || '';
const api = p => token ? p + (p.includes('?') ? '&' : '?') + 'token=' + token : p;

const AC = {main:'#6366f1',comms:'#06b6d4',content:'#a855f7',ops:'#f59e0b',research:'#10b981'};
const col = id => AC[id] || '#6868a0';

function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
}

const VOICES = [
  {id:'Charon', label:'Charon (Informative)', desc:'Charon / British Male (informative, confident)'},
  {id:'Aoede', label:'Aoede (Breezy)', desc:'Aoede / American Male (breezy, warm)'},
  {id:'Leda', label:'Leda (Youthful)', desc:'Leda / British Female (youthful, creative)'},
  {id:'Alnilam', label:'Alnilam (Firm)', desc:'Alnilam / American Male (firm, direct)'},
  {id:'Kore', label:'Kore (Analytical)', desc:'Kore / American Female (firm, analytical)'},
  {id:'Fenrir', label:'Fenrir (Deep)', desc:'Fenrir / British Male (deep, serious)'},
  {id:'Puck', label:'Puck (Energized)', desc:'Puck / American Male (fast, energized)'}
];

function renderVoices(agents) {
  const el = document.getElementById('voiceList');
  if(!agents?.length) { el.innerHTML = '<div class="empty">No agents available</div>'; return; }
  
  const html = agents.map((a, i) => {
    // defaults matching the screenshot
    const def = i===0 ? 'Charon' : i===1 ? 'Aoede' : i===2 ? 'Leda' : i===3 ? 'Alnilam' : 'Kore';
    
    return \`<div style="display:flex;align-items:center;gap:20px;padding:6px;border-radius:6px;border-bottom:1px solid var(--border)">
      <div style="width:80px;font-weight:700;font-size:0.7rem;letter-spacing:0.05em;color:var(--text3)">\${a.id.toUpperCase()}</div>
      <select class="sel" style="width:200px" onchange="updateVoice('\${a.id}', this.value)">
        \${VOICES.map(v => \`<option value="\${v.id}" \${v.id===def ? 'selected':''}>\${v.label}</option>\`).join('')}
      </select>
      <div id="vdesc-\${a.id}" style="font-size:0.7rem;color:var(--text2)">\${VOICES.find(x=>x.id===def).desc}</div>
    </div>\`;
  }).join('');
  el.innerHTML = html;
}

function updateVoice(agentId, val) {
  const v = VOICES.find(x => x.id === val);
  if(v) document.getElementById('vdesc-' + agentId).textContent = v.desc;
  // TODO: Make network call to update actual Pipecat config / DB
}

function renderAgents(list) {
  const el = document.getElementById('agentList');
  if (!list?.length) { el.innerHTML = '<div class="empty">No agents loaded</div>'; return; }
  el.innerHTML = list.map(a => {
    const c = col(a.id), init = (a.persona||a.id)[0].toUpperCase();
    return \`<div class="ag-item">
      <div class="ag-av" style="background:linear-gradient(135deg,\${c},\${c}88)">\${init}</div>
      <div class="ag-info">
        <div class="ag-name">\${a.persona||a.id}</div>
        <div class="ag-role">\${a.title||''}</div>
      </div>
      <div class="ag-id">@\${a.id}</div>
    </div>\`;
  }).join('');
}

function renderHive(rows) {
  const el = document.getElementById('hvList');
  const bdg = document.getElementById('hvBdg');
  if (!rows?.length) { el.innerHTML = '<div class="empty">No activity yet</div>'; bdg.textContent='0'; return; }
  bdg.textContent = rows.length;
  el.innerHTML = rows.slice(0,50).map(r => {
    const c = col(r.agent_id);
    return \`<div class="hv-item">
      <div class="hv-dot" style="background:\${c}"></div>
      <div class="hv-body">
        <div class="hv-meta">
          <span class="hv-agent" style="color:\${c}">\${r.agent_id}</span>
          <span class="hv-act">\${r.action}</span>
          \${r.target_agent?'<span class="hv-arr">→ '+r.target_agent+'</span>':''}
          <span class="hv-time">\${ago(r.ts)} ago</span>
        </div>
      </div>
    </div>\`;
  }).join('');
}

function renderMissions(list) {
  const el = document.getElementById('msList');
  const bdg = document.getElementById('msBdg');
  if (!list?.length) { el.innerHTML = '<div class="empty">No missions</div>'; bdg.textContent='0'; return; }
  bdg.textContent = list.length;
  el.innerHTML = list.slice(0,20).map(m => {
    const pc = m.priority>=7?'p-hi':m.priority>=4?'p-md':'p-lo';
    return \`<div class="ms-item">
      <div class="pri \${pc}">\${m.priority}</div>
      <span class="ms-txt">\${m.prompt}</span>
      <span class="stbdg st-\${m.status}">\${m.status}</span>
    </div>\`;
  }).join('');
}

function renderScheduled(list) {
  const el = document.getElementById('scList');
  const bdg = document.getElementById('scBdg');
  if (!list?.length) { el.innerHTML = '<div class="empty">No scheduled tasks</div>'; bdg.textContent='0'; return; }
  bdg.textContent = list.length;
  el.innerHTML = list.map(t => \`<div class="sc-item">
    <span class="cron">\${t.cron_expr}</span>
    <span class="sc-txt">\${t.prompt}</span>
  </div>\`).join('');
}

function renderAudit(rows) {
  const el = document.getElementById('auList');
  const bdg = document.getElementById('auBdg');
  if (!rows?.length) { el.innerHTML = '<div class="empty">No audit entries</div>'; bdg.textContent='0'; return; }
  bdg.textContent = rows.length;
  el.innerHTML = rows.slice(0,30).map(r => \`<div class="au-item">
    <span class="au-act">\${r.action}</span>
    <span class="au-who">\${r.actor}</span>
    <span class="au-t">\${ago(r.ts)} ago</span>
  </div>\`).join('');
}

function updateState(s) {
  if (s.agents) { renderAgents(s.agents); renderVoices(s.agents); }
  if (s.hiveMind) renderHive(s.hiveMind);
  if (s.missions) renderMissions(s.missions);
  if (s.scheduled) renderScheduled(s.scheduled);
}

async function doSearch() {
  const q = document.getElementById('memQ').value.trim();
  const cid = document.getElementById('memCid').value.trim();
  const el = document.getElementById('memRes');
  if (!q) { el.innerHTML = ''; return; }
  el.innerHTML = '<span style="color:var(--text3)">Searching…</span>';
  try {
    const r = await fetch(api('/api/memory?q='+encodeURIComponent(q)+'&chat_id='+encodeURIComponent(cid)));
    const d = await r.json();
    if (!d.results?.length) { el.innerHTML = '<span style="color:var(--text3)">No results</span>'; return; }
    el.innerHTML = d.results.slice(0,10).map(x => \`<div class="srch-hit">
      <div class="srch-kind">\${x.kind} · \${x.salience?.toFixed(1)??'?'}</div>
      <div class="srch-content">\${(x.content||'').slice(0,100)}</div>
    </div>\`).join('');
  } catch { el.innerHTML = '<span style="color:var(--red)">Error</span>'; }
}

async function createMission() {
  const prompt = document.getElementById('mPrompt').value.trim();
  const priority = parseInt(document.getElementById('mPri').value);
  const msg = document.getElementById('mMsg');
  if (!prompt) { msg.style.color='var(--red)'; msg.textContent='Prompt required'; return; }
  msg.style.color='var(--text2)'; msg.textContent='Creating…';
  try {
    const r = await fetch(api('/api/mission'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({prompt, priority})
    });
    if (r.ok) {
      msg.style.color='var(--green)'; msg.textContent='Mission created';
      document.getElementById('mPrompt').value='';
      setTimeout(()=>msg.textContent='', 3000);
      fetch(api('/api/state')).then(r=>r.json()).then(updateState);
    } else { msg.style.color='var(--red)'; msg.textContent='Failed'; }
  } catch { msg.style.color='var(--red)'; msg.textContent='Network error'; }
}

function scrollToForm() { document.getElementById('mfSection').scrollIntoView({behavior:'smooth'}); }

document.getElementById('memQ').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });

function connectSSE() {
  const es = new EventSource(api('/sse'));
  const dot = document.getElementById('sseDot');
  const st = document.getElementById('sseSt');
  es.onopen = () => { dot.className='dot live'; st.textContent='Live'; };
  es.addEventListener('state', e => { try { updateState(JSON.parse(e.data)); } catch {} });
  es.addEventListener('mission', () => fetch(api('/api/state')).then(r=>r.json()).then(updateState));
  es.addEventListener('agent_activity', () => fetch(api('/api/state')).then(r=>r.json()).then(updateState));
  es.onerror = () => { dot.className='dot'; st.textContent='Reconnecting'; };
}

Promise.all([
  fetch(api('/api/state')).then(r=>r.json()).then(updateState),
  fetch(api('/api/audit?since=0&limit=30')).then(r=>r.json()).then(d=>renderAudit(d.rows))
]).catch(()=>{});
connectSSE();
</script>
</body>
</html>`;
}
