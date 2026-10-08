(function () {
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const liveCodes = new Set(["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"]);
  const resultCodes = new Set(["FT","AET","PEN"]);
  const group = item => { const code = item?.fixture?.status?.short || ""; return liveCodes.has(code) ? "live" : resultCodes.has(code) ? "results" : "upcoming"; };
  const localTime = value => new Intl.DateTimeFormat("en-NG", {timeZone:"Africa/Lagos",weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
  const cleanPercent = value => Math.max(0, Math.min(100, Number.parseFloat(String(value || "0").replace("%", "")) || 0));

  function skeleton() {
    return '<div class="ai2-skeleton"><i></i><i></i><i></i></div>';
  }

  window.openAITips = function openProfessionalAITips() {
    document.getElementById("lpAiCentre")?.remove();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = document.createElement("div");
    root.id = "lpAiCentre";
    root.innerHTML = `
      <style>
        #lpAiCentre{position:fixed;inset:0;z-index:32000;background:#f1f6fc;color:#10213b;font-family:Arial,sans-serif;overflow:auto}
        #lpAiCentre *{box-sizing:border-box}#lpAiCentre button{font:inherit}
        .ai2-shell{max-width:700px;margin:auto;min-height:100vh;padding-bottom:46px}
        .ai2-hero{position:sticky;top:0;z-index:5;background:radial-gradient(circle at 90% 0,#1989ef 0,transparent 42%),linear-gradient(145deg,#051a37,#073c7e);color:#fff;padding:18px 16px 20px;box-shadow:0 8px 24px rgba(5,28,60,.18)}
        .ai2-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.ai2-kicker{font-size:9px;font-weight:900;letter-spacing:.14em;color:#8fd0ff}.ai2-title{font-size:22px;letter-spacing:-.5px;margin:5px 0 4px}.ai2-sub{font-size:11px;color:#cae1fa}.ai2-actions{display:flex;gap:7px}.ai2-icon{width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.11);color:#fff;font-size:17px}
        .ai2-body{padding:14px}.ai2-note{display:flex;gap:9px;align-items:center;background:#e6f3ff;color:#28557d;border:1px solid #cfe6fa;border-radius:14px;padding:10px 12px;font-size:10px;line-height:1.4;margin-bottom:12px}.ai2-note b{color:#0b3a68}
        .ai2-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;background:#e3eaf3;border-radius:14px;padding:5px;position:sticky;top:95px;z-index:4}.ai2-tab{border:0;background:transparent;padding:10px 4px;border-radius:10px;color:#65758b;font-size:11px;font-weight:900}.ai2-tab.active{background:#fff;color:#0867df;box-shadow:0 3px 10px rgba(15,35,65,.08)}.ai2-count{display:inline-grid;place-items:center;min-width:17px;height:17px;border-radius:9px;background:#d8e3f0;margin-left:3px;font-size:8px}.ai2-tab.active .ai2-count{background:#e3f1ff}
        .ai2-list{margin-top:12px}.ai2-card{width:100%;border:1px solid #e1e9f2;background:#fff;border-radius:18px;padding:13px;margin-bottom:9px;text-align:left;box-shadow:0 6px 17px rgba(20,49,85,.045)}.ai2-card:active{transform:scale(.992)}.ai2-meta{display:flex;justify-content:space-between;gap:10px;color:#718096;font-size:9px;font-weight:800;margin-bottom:11px}.ai2-live{color:#d92d4a}.ai2-teams{display:grid;grid-template-columns:1fr 60px 1fr;gap:8px;align-items:center}.ai2-team{text-align:center;min-width:0}.ai2-team img{width:40px;height:40px;object-fit:contain}.ai2-team b{display:block;font-size:11px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai2-score{text-align:center}.ai2-score strong{font-size:18px}.ai2-score span{display:block;font-size:8px;color:#8995a6;margin-top:3px}
        .ai2-empty,.ai2-error{background:#fff;border:1px solid #e4ebf3;border-radius:18px;padding:28px 17px;text-align:center;color:#6c7b8e;font-size:12px;line-height:1.5}.ai2-empty i{display:block;font-style:normal;font-size:31px;margin-bottom:9px}.ai2-retry{border:0;background:#0867df;color:#fff;border-radius:10px;padding:9px 14px;font-size:10px;font-weight:900;margin-top:12px}
        .ai2-skeleton i{display:block;height:122px;border-radius:18px;margin-bottom:9px;background:linear-gradient(90deg,#fff,#e9eff6,#fff);background-size:200% 100%;animation:ai2pulse 1.1s infinite}@keyframes ai2pulse{to{background-position:-200% 0}}
        .ai2-detail{position:fixed;inset:0;z-index:2;background:rgba(3,17,38,.66);display:flex;align-items:flex-end;justify-content:center}.ai2-sheet{width:100%;max-width:700px;max-height:92vh;overflow:auto;background:#fff;border-radius:25px 25px 0 0;padding:10px 16px 28px}.ai2-handle{width:44px;height:5px;border-radius:9px;background:#dce5ef;margin:2px auto 15px}.ai2-sheet-head{display:flex;justify-content:space-between;align-items:center}.ai2-close-sheet{width:37px;height:37px;border:0;border-radius:50%;font-size:20px;background:#edf2f7}.ai2-versus{display:grid;grid-template-columns:1fr 58px 1fr;align-items:center;margin:17px 0}.ai2-versus .ai2-team img{width:52px;height:52px}.ai2-chip{display:inline-block;background:#edf5ff;color:#1762ad;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900}.ai2-panel{background:#f7f9fc;border-radius:15px;padding:12px;margin-top:11px}.ai2-panel h3{font-size:12px;margin:0 0 10px}.ai2-prob-row{display:grid;grid-template-columns:56px 1fr 36px;gap:8px;align-items:center;font-size:9px;margin:8px 0}.ai2-track{height:7px;background:#e3eaf2;border-radius:8px;overflow:hidden}.ai2-fill{height:100%;background:linear-gradient(90deg,#0867df,#39a7ff);border-radius:8px}.ai2-stat{display:grid;grid-template-columns:1fr 1.2fr 1fr;text-align:center;font-size:10px;padding:9px 3px;border-top:1px solid #e8edf3}.ai2-advice{background:#eaf7f1;color:#176442;border:1px solid #d2ede0;border-radius:14px;padding:12px;font-size:10px;line-height:1.5;margin-top:11px}.ai2-warning{background:#fff6e5;border:1px solid #f1dfb9;color:#75551b;border-radius:14px;padding:11px;font-size:9px;line-height:1.5;margin-top:12px}
      </style>
      <div class="ai2-shell"><header class="ai2-hero"><div class="ai2-top"><div><div class="ai2-kicker">LONERPAY SMART CENTRE</div><h2 class="ai2-title">⚽ AI Match Insights</h2><div class="ai2-sub">Fixtures, live scores and data-driven previews</div></div><div class="ai2-actions"><button class="ai2-icon" id="ai2Refresh" aria-label="Refresh">↻</button><button class="ai2-icon" id="ai2Close" aria-label="Close">×</button></div></div></header><main class="ai2-body"><div class="ai2-note"><span>✨</span><div><b>Smart data, clearly explained.</b><br>Tap a match for forecasts, team comparison and live statistics when available.</div></div><nav class="ai2-tabs"><button class="ai2-tab active" data-tab="upcoming">Upcoming <span class="ai2-count">0</span></button><button class="ai2-tab" data-tab="live">Live <span class="ai2-count">0</span></button><button class="ai2-tab" data-tab="results">Results <span class="ai2-count">0</span></button></nav><section class="ai2-list">${skeleton()}</section><div class="ai2-warning"><b>18+ Responsible use:</b> Forecasts are statistical information, not guaranteed results or financial advice. Never stake money you cannot afford to lose.</div></main></div>`;
    document.body.appendChild(root);
    const list = root.querySelector(".ai2-list");
    const tabs = [...root.querySelectorAll(".ai2-tab")];
    let fixtures = [], selected = "upcoming";
    const close = () => { root.remove(); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); };
    const onKey = event => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    root.querySelector("#ai2Close").onclick = close;

    function render() {
      const counts = {upcoming:0,live:0,results:0}; fixtures.forEach(item => counts[group(item)]++);
      tabs.forEach(tab => tab.querySelector(".ai2-count").textContent = counts[tab.dataset.tab]);
      const items = fixtures.filter(item => group(item) === selected).sort((a,b) => new Date(a.fixture.date)-new Date(b.fixture.date));
      if (!items.length) { list.innerHTML = `<div class="ai2-empty"><i>${selected === "live" ? "📡" : selected === "results" ? "🏁" : "📅"}</i><b>No ${escapeHtml(selected)} matches available</b><br>Try another section or refresh shortly.</div>`; return; }
      list.innerHTML = items.map(item => {
        const home=item.teams?.home||{},away=item.teams?.away||{},status=item.fixture?.status||{},goals=item.goals||{};
        const score = group(item)==="upcoming" ? "VS" : `${goals.home ?? 0} - ${goals.away ?? 0}`;
        const label = group(item)==="live" ? `${status.elapsed || 0}' LIVE` : status.short || "NS";
        return `<button class="ai2-card" data-id="${escapeHtml(item.fixture?.id)}"><div class="ai2-meta"><span>${escapeHtml(item.league?.name||"Football")} • ${escapeHtml(item.league?.country||"")}</span><span class="${group(item)==="live"?"ai2-live":""}">${escapeHtml(localTime(item.fixture?.date))}</span></div><div class="ai2-teams"><div class="ai2-team">${home.logo?`<img src="${escapeHtml(home.logo)}" alt="">`:""}<b>${escapeHtml(home.name)}</b></div><div class="ai2-score"><strong>${escapeHtml(score)}</strong><span>${escapeHtml(label)}</span></div><div class="ai2-team">${away.logo?`<img src="${escapeHtml(away.logo)}" alt="">`:""}<b>${escapeHtml(away.name)}</b></div></div></button>`;
      }).join("");
      list.querySelectorAll(".ai2-card").forEach(card => card.onclick = () => openDetail(card.dataset.id));
    }

    async function load() {
      list.innerHTML = skeleton();
      try { const response=await fetch("/api/football",{cache:"no-store"}); const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.provider_reason||data.error||"Unable to load matches"); fixtures=Array.isArray(data.response)?data.response:[]; render(); }
      catch(error){ list.innerHTML=`<div class="ai2-error"><b>Matches could not be loaded</b><br>${escapeHtml(error.message)}<br><button class="ai2-retry">Try again</button></div>`; list.querySelector(".ai2-retry").onclick=load; }
    }

    async function openDetail(id) {
      const detail=document.createElement("div"); detail.className="ai2-detail"; detail.innerHTML=`<div class="ai2-sheet"><div class="ai2-handle"></div>${skeleton()}</div>`; root.appendChild(detail); detail.onclick=e=>{if(e.target===detail)detail.remove();};
      try { const response=await fetch(`/api/football-analysis?fixture=${encodeURIComponent(id)}`,{cache:"no-store"}); const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data.error||"Analysis unavailable");
        const prediction=data.prediction?.predictions||{},percent=prediction.percent||{},teams=data.statistics||[]; const getStat=(team,type)=>(team?.statistics||[]).find(stat=>stat.type===type)?.value??"—"; const stats=[["Shots on Goal","On target"],["Ball Possession","Possession"],["Corner Kicks","Corners"],["Yellow Cards","Yellow cards"]];
        const probabilities=[["Home",cleanPercent(percent.home)],["Draw",cleanPercent(percent.draw)],["Away",cleanPercent(percent.away)]];
        detail.querySelector(".ai2-sheet").innerHTML=`<div class="ai2-handle"></div><div class="ai2-sheet-head"><div><span class="ai2-chip">${escapeHtml(data.status)}</span><h2 style="font-size:17px;margin:7px 0 0">Match analysis</h2></div><button class="ai2-close-sheet">×</button></div><div class="ai2-versus"><div class="ai2-team">${data.home?.logo?`<img src="${escapeHtml(data.home.logo)}" alt="">`:""}<b>${escapeHtml(data.home?.name)}</b></div><div class="ai2-score"><strong>${data.goals?.home ?? "–"} - ${data.goals?.away ?? "–"}</strong><span>${escapeHtml(localTime(data.fixture?.date))}</span></div><div class="ai2-team">${data.away?.logo?`<img src="${escapeHtml(data.away.logo)}" alt="">`:""}<b>${escapeHtml(data.away?.name)}</b></div></div>${data.prediction?`<div class="ai2-panel"><h3>Data model forecast</h3>${probabilities.map(([label,value])=>`<div class="ai2-prob-row"><span>${label}</span><div class="ai2-track"><div class="ai2-fill" style="width:${value}%"></div></div><b>${value}%</b></div>`).join("")}</div><div class="ai2-advice"><b>Smart preview</b><br>${escapeHtml(prediction.advice||prediction.winner?.comment||"No written preview is available.")}${prediction.under_over?`<br>Goals model: ${escapeHtml(prediction.under_over)}`:""}</div>`:`<div class="ai2-panel"><h3>Forecast unavailable</h3><div style="font-size:10px;color:#718096;line-height:1.5">This competition does not currently provide enough historical data for a forecast.</div></div>`}<div class="ai2-panel"><h3>Match statistics</h3>${stats.map(([key,label])=>`<div class="ai2-stat"><b>${escapeHtml(getStat(teams[0],key))}</b><span>${label}</span><b>${escapeHtml(getStat(teams[1],key))}</b></div>`).join("")}</div><div class="ai2-warning">Predictions can be wrong and are not a promise of any result.</div>`;
        detail.querySelector(".ai2-close-sheet").onclick=()=>detail.remove();
      } catch(error){ detail.querySelector(".ai2-sheet").innerHTML=`<div class="ai2-handle"></div><div class="ai2-error"><b>Analysis could not be loaded</b><br>${escapeHtml(error.message)}<br><button class="ai2-retry">Close</button></div>`; detail.querySelector(".ai2-retry").onclick=()=>detail.remove(); }
    }

    tabs.forEach(tab=>tab.onclick=()=>{tabs.forEach(item=>item.classList.toggle("active",item===tab));selected=tab.dataset.tab;render();});
    root.querySelector("#ai2Refresh").onclick=load;
    load();
  };
})();
