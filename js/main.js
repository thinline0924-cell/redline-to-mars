// 画面(パネル・ダイアログ・HUD)と、ルール・3Dをつなぐ部分
import * as G from './game.js';
import {
  DIFFICULTY, NODES, TECHS, TECH_ORDER, PARTS, PART_ORDER, CARD_LABEL, TEST_COST, MANEUVERS, ACHIEVEMENTS,
  CANDIDATES, ROLE_LABEL, CREW_HIRE_COST, TEAM_HIRE_COST, MAX_TEAMS, EARTH_WINDOWS, RETURN_OFFSET,
  MARS_UNKNOWNS, SUPPLY_PER_CRATE, TRANSIT_TO_MARS, TRANSIT_TO_EARTH,
} from './data.js';
import { sfx, soundOn, toggleSound } from './audio.js';

const SAVE_KEY = 'redline-save-v1';
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const m1 = G.money1;

let S = null;            // ゲームの状態
let scene = null;        // 3D
let tab = 'rd';
let selDraft = null;     // 組み立て中の船
let planRoute = 'landing';
let planAero = true;

// ---------- 保存 ----------
function save() { try { if (S) localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* 保存できない環境でも遊べる */ } }
function load() {
  try { const t = localStorage.getItem(SAVE_KEY); if (!t) return null; const s = JSON.parse(t); return s && s.v === G.SAVE_VERSION ? s : null; } catch { return null; }
}

// ---------- 表示のための計算 ----------
function info() {
  const earthOpen = G.windowOpen('earth', S.month), marsOpen = G.windowOpen('mars', S.month);
  const { title, sub } = hint(earthOpen, marsOpen);
  const crt = [
    `BLUEBONNET AEROSPACE`,
    `${G.monthLabel(S.month)}`.replace('年', '/').replace('月', ''),
    `FUNDS  ${m1(S.money)}`,
    `PUBLIC ${Math.round(S.rep)}%`,
    `TEAMS  ${S.teams - Math.max(0, G.freeSlots(S))}/${G.teamSlots(S)} BUSY`,
    ...S.research.slice(0, 3).map(r => `> ${r.id.padEnd(10)} ${r.left}MO`),
  ];
  return { earthOpen, marsOpen, hintTitle: title, hintSub: sub, crt, deadline: G.deadline(S) };
}
function hint(earthOpen, marsOpen) {
  if (S.gameOver) return { title: S.gameOver.win ? 'MISSION COMPLETE!' : 'PROGRAM CANCELED', sub: S.gameOver.win ? '火星からの生還に成功!' : S.gameOver.reason };
  if (S.pendingEvent) return { title: 'FAXが届いています!', sub: 'FAX(または「次の月へ」)をクリックして、書類に答えよう' };
  const ap = G.approachingCrafts(S);
  if (ap.length) return { title: `${ap[0].name}が${ap[0].loc === 'mars_approach' ? '火星' : '地球'}に接近中!`, sub: '今月中に減速しないと、通り過ぎてしまう' };
  if (!S.research.length && !Object.values(S.techs).some(t => t.owned)) return { title: 'まずは技術開発!', sub: 'コンピューターで「液体燃料エンジン」などの開発を始めよう' };
  if (earthOpen) return { title: '火星への窓が開いている!', sub: '地球低軌道から火星遷移軌道へ噴射できる(2か月間)' };
  if (marsOpen) return { title: '地球への窓が開いている!', sub: '火星周回軌道から地球帰還軌道へ噴射できる(2か月間)' };
  const ne = G.nextWindow('earth', S.month);
  const left = G.deadline(S) - S.month;
  return { title: '準備ができたら次の月へ', sub: `次の火星への窓:${ne == null ? 'なし' : G.monthLabel(ne)} ・ 期限まで あと${left}か月` };
}

// ---------- HUD(右下のバー) ----------
function renderHUD() {
  const left = G.deadline(S) - S.month;
  const rows = [
    ['$', '資金', m1(S.money), Math.max(0, Math.min(1, S.money / 80)), '#57c24a'],
    ['★', '支持率', `${Math.round(S.rep)}`, Math.max(0, S.rep / 100), '#f08a3c'],
    ['⌛', '期限まで', `${left}か月`, Math.max(0, left / (G.deadline(S) + 1)), '#e8553f'],
    ['⚙', '開発チーム', `${Math.max(0, G.freeSlots(S))}/${G.teamSlots(S)} 空き`, G.teamSlots(S) ? Math.max(0, G.freeSlots(S)) / G.teamSlots(S) : 0, '#4fb3e8'],
  ];
  $('hud').innerHTML = `<div class="hud-date">${esc(G.monthLabel(S.month))}<small>${esc(DIFFICULTY[S.difficulty].label)}</small></div>` + rows.map(([ic, name, val, f, col]) => `
    <div class="hud-row" title="${esc(name)}"><span class="hud-ic">${ic}</span><span class="hud-name">${esc(name)}</span><span class="hud-val">${esc(val)}</span>
    <span class="hud-bar"><i style="width:${(f * 100).toFixed(1)}%;background:${col}"></i></span></div>`).join('');
  $('soundBtn').textContent = soundOn() ? '♪ 音:オン' : '♪ 音:オフ';
}

// ---------- パネル ----------
function renderPanel() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle("on", b.dataset.a === tab));
  const body = $('panelBody');
  const html = { rd: panelRD, hangar: panelHangar, fleet: panelFleet, crew: panelCrew, log: panelLog }[tab]();
  body.innerHTML = html;
  const badge = (t, n) => { const el = document.querySelector(`.tab[data-a="${t}"] .badge`); if (el) { el.textContent = n || ''; el.hidden = !n; } };
  badge('fleet', S.crafts.filter(c => c.loc !== 'earth').length);
  badge('hangar', S.crafts.filter(c => c.loc === 'earth').length);
}
function cardChip(c, tech, i) {
  if (!c.known) return `<span class="rcard unk" title="まだ分からない">?</span>`;
  const cls = c.t === 'S' ? 'ok' : c.t === 'm' ? 'minor' : 'major';
  const fix = c.t !== 'S' ? `<button class="mini" data-act="fix" data-a="${tech}" data-b="${i}">直す ${m1(G.fixCost(S, c.t))}</button>` : '';
  return `<span class="rcard ${cls}" title="${CARD_LABEL[c.t]}">${c.t === 'S' ? '成功' : c.t === 'm' ? '軽' : '重'}</span>${fix}`;
}
function deckSummary(tech) {
  const t = S.techs[tech]; if (!t?.owned) return '';
  if (!t.cards.length) return '<span class="tag ok">完全(必ず成功)</span>';
  const unk = t.cards.filter(c => !c.known).length;
  const bad = t.cards.filter(c => c.known && c.t !== 'S').length;
  return `<span class="tag">${t.cards.length}枚</span>` + (unk ? `<span class="tag unk">不明 ${unk}</span>` : '') + (bad ? `<span class="tag major">欠陥 ${bad}</span>` : '');
}
function panelRD() {
  const slots = G.teamSlots(S), free = Math.max(0, G.freeSlots(S));
  let h = `<h2>技術開発</h2><p class="lead">開発には「お金」と「チームの手」が要る。完成した技術には<b>見えない欠陥カード</b>が混ざっている。地上試験で引いて正体を調べ、見つけた欠陥は直そう。</p>
  <div class="row between"><div>開発チーム:<b>${free}</b> / ${slots} 空き${S.mods.freeTeamUntil > S.month ? '<span class="tag ok">旧ソ連の技術者 参加中</span>' : ''}</div>
  <button class="btn small" data-act="hireTeam" ${S.teams >= MAX_TEAMS ? 'disabled' : ''}>チームを増やす ${m1(TEAM_HIRE_COST)}</button></div>`;
  for (const id of TECH_ORDER) {
    const t = TECHS[id], st = S.techs[id], r = S.research.find(x => x.id === id);
    let right = '';
    if (st.owned) {
      right = `<div class="cards">${st.cards.map((c, i) => cardChip(c, id, i)).join('') || '<span class="tag ok">欠陥なし</span>'}</div>`;
      if (t.cards) {
        const why = G.canTest(S, id);
        right += `<button class="btn small" data-act="test" data-a="${id}" ${why ? `disabled title="${esc(why)}"` : ''}>地上試験 ${m1(TEST_COST)}</button>`;
      }
    } else if (r) right = `<div class="progress"><i style="width:${(1 - r.left / t.months) * 100}%"></i></div><div class="small">開発中 あと${r.left}か月</div>`;
    else {
      const why = G.canResearch(S, id);
      right = `<button class="btn ${why ? '' : 'go'}" data-act="research" data-a="${id}" ${why ? `disabled title="${esc(why)}"` : ''}>開発する ${m1(t.cost)}・${t.months}か月</button>${why && !why.includes('お金') && !why.includes('チーム') ? `<div class="small warn">${esc(why)}</div>` : ''}`;
    }
    h += `<div class="item ${st.owned ? 'owned' : ''}"><div class="item-head"><b>${esc(t.name)}</b> ${st.owned ? deckSummary(id) : ''}</div><div class="small">${esc(t.desc)}</div><div class="item-act">${right}</div></div>`;
  }
  return h;
}

// 飛行計画の見積もり(この船で、どこまで行けるか)
const ROUTES = {
  leo: { label: '地球低軌道まで', legs: ['launch'] },
  orbit: { label: '火星周回まで', legs: ['launch', 'tmi', 'CAP'] },
  landing: { label: '火星着陸まで', legs: ['launch', 'tmi', 'CAP', 'mland'] },
  round: { label: '火星往復(着陸なし)', legs: ['launch', 'tmi', 'CAP', 'tei', 'eentry'] },
  full: { label: '火星往復(着陸あり)', legs: ['launch', 'tmi', 'CAP', 'mland', 'mascent', 'tei', 'eentry'] },
};
function simulatePlan(craft) {
  const clone = { ...craft, parts: craft.parts.map(p => ({ ...p })), courseErr: 0 };
  const out = [];
  let ok = true;
  for (let id of ROUTES[planRoute].legs) {
    if (id === 'CAP') id = planAero ? 'maero' : 'mcap';
    const m = MANEUVERS.find(x => x.id === id);
    const diff = G.maneuverDiff(S, clone, m);
    const assumed = m.land && !S.known.landDiff;
    const d = assumed ? 3 : diff;
    const need = Math.ceil(d * G.craftMass(clone));
    const rockets = G.eligibleRockets(clone, m);
    const max = rockets.reduce((a, r) => a + PARTS[r.type].thrust, 0);
    const pass = need <= max;
    const missingTech = m.techs.filter(t => !G.owned(S, t));
    out.push({ m, need, max, mass: G.craftMass(clone), d, assumed, pass: pass && !missingTech.length, missingTech });
    if (!pass) { ok = false; break; }
    // 必要な分だけ使ったことにする
    const sel = need > 0 ? autoSelectFor(clone, m, need) : [];
    clone.parts = clone.parts.filter(p => !sel.includes(p.uid) || PARTS[p.type].reusable);
    if (m.reentry) clone.parts = clone.parts.filter(p => PARTS[p.type].shielded);
  }
  return { out, ok };
}
function autoSelectFor(craft, m, need) {
  // 見積もり用:難しさを need に合わせた仮の移動で自動選択を使う
  const mass = G.craftMass(craft) || 1;
  return G.autoSelect(S, craft, { ...m, diff: need / mass, land: false, capture: false });
}
function crewMonthsNeeded(craftCrew) {
  const rate = G.owned(S, 'RECYCLE') ? 0.5 : 1;
  const months = { leo: 1, orbit: TRANSIT_TO_MARS + 1, landing: TRANSIT_TO_MARS + 2, round: TRANSIT_TO_MARS + RETURN_OFFSET - TRANSIT_TO_MARS + TRANSIT_TO_EARTH + 1, full: RETURN_OFFSET + TRANSIT_TO_EARTH + 1 }[planRoute];
  return { months, need: craftCrew * months * rate, rate };
}
function panelHangar() {
  const drafts = S.crafts.filter(c => c.loc === 'earth');
  if (selDraft && !drafts.some(c => c.id === selDraft)) selDraft = null;
  if (!selDraft && drafts.length) selDraft = drafts[0].id;
  let h = `<h2>組み立て工場</h2><p class="lead">部品を選んで船を組み、発射台から打ち上げる。<b>必要な推力 = 難しさ × 船の重さ</b>(使うロケット自身の重さも入る)。お金は打ち上げのときに払う。発射は1か月に1回。</p>
  <div class="chips">${drafts.map(c => `<button class="chip ${c.id === selDraft ? 'on' : ''}" data-act="selDraft" data-a="${c.id}">${esc(c.name)}</button>`).join('')}
  <button class="chip add" data-act="newDraft">+ 新しい船</button></div>`;
  const craft = G.getCraft(S, selDraft);
  if (!craft) return h + '<p class="empty">「+ 新しい船」で設計を始めよう。</p>';
  const count = (t) => craft.parts.filter(p => p.type === t).length;
  h += `<div class="grid-parts">`;
  for (const t of PART_ORDER) {
    const p = PARTS[t]; const why = G.canAddPart(S, craft, t);
    const spec = p.kind === 'rocket' ? `推力${p.thrust}・重さ${p.mass}${p.reusable ? '・再利用' : ''}` : `重さ${p.mass}${p.seats ? `・${p.seats}席` : ''}${t === 'SUPPLY' ? `・${SUPPLY_PER_CRATE}人月` : ''}`;
    h += `<div class="part ${why ? 'locked' : ''}" title="${esc(why || p.desc)}"><div class="part-name">${esc(p.name)}</div><div class="small">${spec}・${m1(p.cost)}</div>
      <div class="stepper"><button class="mini" data-act="rmPart" data-a="${t}" ${count(t) ? '' : 'disabled'}>−</button><b>${count(t)}</b><button class="mini" data-act="addPart" data-a="${t}" ${why ? 'disabled' : ''}>+</button></div></div>`;
  }
  h += `</div>`;
  const mass = G.craftMass(craft), cost = G.craftCost(craft, S);
  const capSeats = G.seats(craft, 'crew');
  h += `<div class="stats"><span>重さ <b>${mass}</b></span><span>費用 <b>${m1(cost)}</b>${S.freeCondor ? `<small>(払い下げコンドル${S.freeCondor}基 無料)</small>` : ''}</span><span>補給品 <b>${G.supplyLeft(craft)}</b>人月</span></div>`;
  // 乗員
  const crewList = S.crew.filter(c => c.status !== 'dead' && (c.craft === craft.id || G.crewReady(S, c)));
  h += `<h3>乗る飛行士 <small>(打ち上げはカプセルの席:${capSeats}席)</small></h3><div class="chips">` +
    (crewList.length ? crewList.map(c => `<button class="chip ${craft.crew.includes(c.id) ? 'on' : ''}" data-act="board" data-a="${c.id}">${esc(c.name)}<small>${ROLE_LABEL[c.role]}・健康${c.health}</small></button>`).join('') : '<span class="small">訓練の終わった飛行士がいません(電話で採用)</span>') + '</div>';
  // 見積もり
  const plan = simulatePlan(craft);
  h += `<h3>飛行計画の見積もり</h3><div class="chips small-chips">${Object.entries(ROUTES).map(([k, r]) => `<button class="chip ${planRoute === k ? 'on' : ''}" data-act="route" data-a="${k}">${r.label}</button>`).join('')}
    <button class="chip ${planAero ? 'on' : ''}" data-act="aero">火星での減速:${planAero ? '空力ブレーキ' : 'ロケット噴射'}</button></div>
    <table class="plan"><tr><th>移動</th><th>重さ</th><th>必要/最大の推力</th><th></th></tr>`;
  for (const r of plan.out) {
    h += `<tr class="${r.pass ? 'ok' : 'ng'}"><td>${esc(r.m.label)}${r.assumed ? '<small>(難しさ不明→3で計算)</small>' : ''}</td><td>${r.mass}</td><td>${r.need} / ${r.max}</td><td>${r.missingTech.length ? `<small>要:${esc(r.missingTech.map(t => TECHS[t].name).join('・'))}</small>` : r.pass ? '✓' : '✗ 推力不足'}</td></tr>`;
  }
  h += `</table>`;
  if (craft.crew.length) {
    const sup = crewMonthsNeeded(craft.crew.length);
    const have = G.supplyLeft(craft);
    h += `<p class="small ${have >= sup.need ? '' : 'warn'}">補給品:この計画だと約${sup.months}か月 × ${craft.crew.length}人${sup.rate < 1 ? '×0.5(再利用)' : ''} = ${sup.need}人月 必要(積んでいるのは ${have}人月)。${G.seats(craft, 'hab') < craft.crew.length && planRoute !== 'leo' ? '<br>⚠ 居住モジュールが無いと、宇宙で3か月目から毎月健康が下がる。' : ''}</p>`;
  }
  const lo = G.maneuversFor(S, craft).find(o => o.m.id === 'launch');
  const blockers = lo.reasons;
  h += `<div class="row between"><button class="btn danger small" data-act="delDraft">設計を取り消す</button>
    <button class="btn go big" data-act="burn" data-a="${craft.id}" data-b="launch" ${blockers.length ? 'disabled' : ''}>🚀 打ち上げ準備</button></div>
    ${blockers.length ? `<p class="small warn">${blockers.map(esc).join('<br>')}</p>` : ''}`;
  return h;
}
function crewLine(c) {
  const hearts = '♥'.repeat(Math.max(0, c.health)) + '♡'.repeat(Math.max(0, c.max - c.health));
  return `<span class="crewline">${esc(c.name)}<small>${ROLE_LABEL[c.role]}</small><span class="hearts">${hearts}</span>${c.walked ? '<span class="tag ok">火星を歩いた</span>' : ''}</span>`;
}
function partsSummary(craft, withJettison) {
  const counts = {};
  for (const p of craft.parts) (counts[p.type] ||= []).push(p);
  return Object.entries(counts).map(([t, ps]) => `<span class="pchip">${esc(PARTS[t].name)}×${ps.length}${withJettison ? `<button class="x" data-act="jettison" data-a="${craft.id}" data-b="${ps[0].uid}" title="1つ捨てる">×</button>` : ''}</span>`).join('');
}
function panelFleet() {
  const list = S.crafts.filter(c => c.loc !== 'earth');
  let h = `<h2>宇宙船</h2><p class="lead">宇宙にいる船の操作。移動にはロケットの噴射が必要(難しさ × 重さ)。火星・地球に<b>接近した月に減速しないと通り過ぎる</b>。</p>`;
  if (!list.length) return h + '<p class="empty">まだ宇宙に船はありません。組み立て工場で船を作って打ち上げよう。</p>';
  const order = ['earth_approach', 'mars_approach', 'leo', 'mto', 'mars_orbit', 'mars_surface', 'eto'];
  list.sort((a, b) => order.indexOf(a.loc) - order.indexOf(b.loc));
  for (const c of list) {
    const crew = c.crew.map(id => G.getCrew(S, id)).filter(Boolean);
    const urgent = NODES[c.loc].approach;
    h += `<div class="item craft ${urgent ? 'urgent' : ''}" style="--cc:${['#e8553f', '#3f8fe8', '#f2c94c', '#7ed957', '#c36ee0', '#f08a3c', '#4fd1c5', '#f2f2f2'][c.color % 8]}">
      <div class="item-head"><span class="dot"></span><b>${esc(c.name)}</b><span class="tag">${esc(NODES[c.loc].name)}</span>${c.arrive != null ? `<span class="tag">到着 ${esc(G.monthLabel(c.arrive))}</span>` : ''}${c.courseErr ? `<span class="tag major">軌道のずれ +${c.courseErr}</span>` : ''}</div>
      <div class="small">重さ ${G.craftMass(c)}・補給品 ${G.supplyLeft(c)}人月${G.controllable(S, c) ? '' : '・<span class="warn">操縦できない(探査機も飛行士もいない)</span>'}</div>
      <div class="parts">${partsSummary(c, !NODES[c.loc].transit)}</div>
      ${crew.length ? `<div class="crew">${crew.map(crewLine).join('')}</div>` : ''}`;
    if (!NODES[c.loc].transit) {
      h += `<div class="actions">`;
      for (const o of G.maneuversFor(S, c)) {
        const blk = o.reasons.filter(r => !r.startsWith('推力が足りません'));
        const label = `${o.m.label}${o.need > 0 ? `(必要推力 ${o.diffKnown ? o.need : '?'})` : ''}`;
        h += `<button class="btn ${o.ok ? 'go' : ''} small" data-act="burn" data-a="${c.id}" data-b="${o.m.id}" ${blk.length ? `disabled title="${esc(blk.join(' / '))}"` : ''}>${esc(label)}</button>`;
      }
      const mates = S.crafts.filter(x => x !== c && x.loc === c.loc);
      for (const x of mates) {
        const why = G.canDock(S, c, x);
        h += `<button class="btn small" data-act="dock" data-a="${c.id}" data-b="${x.id}" ${why ? `disabled title="${esc(why)}"` : ''}>${esc(x.name)}とドッキング</button>`;
      }
      if (c.parts.length > 1) { const why = G.canSplit(S, c); h += `<button class="btn small" data-act="splitDlg" data-a="${c.id}" ${why ? `disabled title="${esc(why)}"` : ''}>切り離す…</button>`; }
      h += `</div>`;
      const blocked = G.maneuversFor(S, c).filter(o => o.reasons.length && !o.reasons.every(r => r.startsWith('推力')));
      if (blocked.length) h += `<details class="small"><summary>できない移動の理由</summary>${blocked.map(o => `<div>・${esc(o.m.label)}:${esc(o.reasons.join(' / '))}</div>`).join('')}</details>`;
    }
    h += `</div>`;
  }
  return h;
}
function panelCrew() {
  let h = `<h2>飛行士</h2><p class="lead">採用すると${6}か月の訓練のあと飛べる。給料は毎月 $0.1M。健康が 0 になると亡くなり、支持率が大きく下がる。</p>`;
  const alive = S.crew.filter(c => c.status !== 'dead');
  h += alive.length ? alive.map(c => `<div class="item"><div class="item-head">${crewLine(c)}</div><div class="small">${c.ready > S.month ? `訓練中(${G.monthLabel(c.ready)}に完了)` : c.status === 'craft' ? `${esc(G.getCraft(S, c.craft)?.name || '')}に搭乗中` : '待機中'}・飛行 ${c.flights}回</div></div>`).join('') : '<p class="empty">まだ飛行士がいません。</p>';
  const dead = S.crew.filter(c => c.status === 'dead');
  if (dead.length) h += `<h3>殉職者</h3>${dead.map(c => `<div class="small">✝ ${esc(c.name)}</div>`).join('')}`;
  h += `<h3>候補者(採用 ${m1(CREW_HIRE_COST)})</h3>`;
  for (const c of G.candidatesLeft(S)) h += `<div class="item"><div class="item-head"><b>${esc(c.name)}</b><span class="tag">${ROLE_LABEL[c.role]}</span></div><div class="small">${esc(c.bio)}</div><div class="item-act"><button class="btn small" data-act="hire" data-a="${c.i}">採用する</button></div></div>`;
  return h;
}
function panelLog() {
  let h = `<h2>記録</h2><h3>火星について分かっていること</h3><ul class="facts">`;
  for (const [k, u] of Object.entries(MARS_UNKNOWNS)) {
    const v = S.mars[k];
    const text = S.known[k] ? (k === 'landDiff' ? `難しさ ${v}` : u.text[v]) : `? (${u.reveal})`;
    h += `<li><b>${esc(u.label)}</b>:${esc(text)}</li>`;
  }
  h += `</ul><h3>打ち上げの窓</h3><table class="plan"><tr><th>地球 → 火星</th><th>火星 → 地球</th></tr>`;
  for (const w of EARTH_WINDOWS) h += `<tr class="${w + 1 < S.month ? 'past' : ''}"><td>${G.monthLabel(w)}〜</td><td>${G.monthLabel(w + RETURN_OFFSET)}〜</td></tr>`;
  h += `</table><p class="small">期限:${G.monthLabel(G.deadline(S))}。遷移軌道は火星まで${TRANSIT_TO_MARS}か月、地球まで${TRANSIT_TO_EARTH}か月。</p><h3>実績</h3><div class="ach">`;
  for (const [k, a] of Object.entries(ACHIEVEMENTS)) h += `<div class="achi ${S.achievements[k] != null ? 'got' : ''}"><b>${esc(a.name)}</b><small>${esc(a.desc)}・${m1(a.money)}・★+${a.rep}${S.achievements[k] != null ? `・${G.monthLabel(S.achievements[k])}` : ''}</small></div>`;
  h += `</div><h3>できごと</h3><div class="logs">${S.log.slice(0, 60).map(l => `<div class="log ${l.kind}"><small>${esc(G.monthLabel(l.m))}</small>${esc(l.text)}</div>`).join('')}</div>`;
  return h;
}

// ---------- ダイアログ ----------
function modal(html, cls = '') {
  const m = $('modal'); $('modalBox').className = `modal-box ${cls}`; $('modalBox').innerHTML = html; m.classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }

function openBurn(craftId, mId) {
  const craft = G.getCraft(S, craftId); if (!craft) return;
  const o = G.maneuversFor(S, craft).find(x => x.m.id === mId); if (!o) return;
  const rockets = G.eligibleRockets(craft, o.m);
  const sel = new Set(G.autoSelect(S, craft, o.m));
  const needTxt = o.diffKnown ? `${o.need}` : `? (難しさ 1〜3:未調査)`;
  let h = `<div class="memo-head">FLIGHT DIRECTOR</div><h2>${esc(craft.name)}:${esc(o.m.label)}</h2>
   <p>${esc(NODES[craft.loc].name)} → ${o.m.to ? esc(NODES[o.m.to].name) : '宇宙のかなた'}</p>`;
  if (o.need > 0 || o.m.land) {
    h += `<p>必要な推力 = 難しさ <b>${o.diffKnown ? o.diff : '?'}</b> × 重さ <b>${G.craftMass(craft)}</b> = <b>${needTxt}</b></p>
    <div class="burn-list">${rockets.map(r => {
      const p = PARTS[r.type];
      return `<label class="burn-row"><input type="checkbox" data-uid="${r.uid}" ${sel.has(r.uid) ? 'checked' : ''}> <b>${esc(p.name)}</b> 推力${p.thrust}${p.reusable ? '(再利用)' : ''} <span class="deck">${deckSummary(p.tech)}</span></label>`;
    }).join('') || '<p class="warn">使えるロケットがありません</p>'}</div>
    <p class="burn-total">選んだ推力:<b id="burnSum">0</b> / ${needTxt}</p>
    <p class="small">ロケット1基ごとに、その技術の信頼性カードを1枚引く。<b>軽い故障</b>=そのロケットは推力なし、<b>重大な故障</b>=爆発して船を失う${o.m.id === 'launch' ? '(カプセルの飛行士は脱出装置で助かる)' : ''}。</p>`;
  }
  const extra = [];
  if (o.m.reentry) extra.push('耐熱シールドのカードを引く。カプセル・探査機以外の部品は燃え尽きる。');
  if (o.m.aero) extra.push('耐熱シールドのカードを引く。軽い故障だと、シールドのない部品が1つ壊れる。');
  if (o.m.land) extra.push('着陸技術のカードを引く。');
  if (o.m.transfer) extra.push(`深宇宙航法のカードを引く${craft.crew.length ? '。飛行士がいるので生命維持のカードも引く' : ''}。`);
  if ((o.m.aero || o.m.id === 'eentry') && craft.courseErr) extra.push(`軌道のずれがあるので、耐熱シールドのカードを ${1 + craft.courseErr} 枚引く。`);
  if (o.m.flyby) extra.push(craft.crew.length ? '⚠ 飛行士が乗っている! 二度と戻れない。' : '船は失われる。');
  if (extra.length) h += `<ul class="small">${extra.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
  h += `<div class="row between"><button class="btn" data-act="close">やめる</button><button class="btn go big" id="burnGo">実行!</button></div>`;
  modal(h, 'memo');
  const upd = () => {
    let sum = 0; document.querySelectorAll('.burn-row input:checked').forEach(i => { const p = craft.parts.find(x => x.uid === +i.dataset.uid); if (p) sum += PARTS[p.type].thrust; });
    const el = $('burnSum'); if (el) { el.textContent = sum; el.className = o.diffKnown && sum < o.need ? 'warn' : 'okc'; }
    $('burnGo').disabled = o.need > 0 && o.diffKnown && sum < o.need;
  };
  document.querySelectorAll('.burn-row input').forEach(i => i.addEventListener('change', upd)); upd();
  $('burnGo').onclick = () => {
    const uids = [...document.querySelectorAll('.burn-row input:checked')].map(i => +i.dataset.uid);
    const r = G.performManeuver(S, craftId, mId, uids);
    if (!r.ok) { toast(r.msg); return; }
    if (mId === 'launch') { sfx.launch(); scene.effect('launch'); }
    showReport(r.report, o.m.label);
  };
}

function showReport(report, title) {
  const draws = report.draws || [];
  let h = `<div class="memo-head">RESULT</div><h2>${esc(title)}</h2><div class="flips">${draws.map((d, i) => `
    <div class="flip" style="--d:${i * 0.45}s"><div class="flip-in"><div class="face back">?</div><div class="face front ${d.t === 'S' ? 'ok' : d.t === 'm' ? 'minor' : 'major'}"><small>${esc(TECHS[d.tech].name)}${d.part ? `<br>${esc(PARTS[d.part].name)}` : ''}</small><b>${CARD_LABEL[d.t]}</b></div></div></div>`).join('')}</div>
    ${report.thrust != null ? `<p>推力 <b>${report.thrust}</b> / 必要 ${report.need}</p>` : ''}
    <div class="report-lines" style="--d:${draws.length * 0.45 + 0.3}s">${report.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>
    <div class="row end"><button class="btn go" data-act="close">OK</button></div>`;
  modal(h, 'memo');
  draws.forEach((d, i) => setTimeout(() => sfx.card(d.t), i * 450 + 300));
  const end = draws.length * 450 + 400;
  setTimeout(() => {
    if (report.outcome === 'lost') { sfx.boom(); scene.effect('lost', { craftId: report.craftId }); }
    else if (report.outcome === 'ok' || report.outcome === 'home') sfx.good();
    else if (report.outcome === 'fail') sfx.bad();
  }, end);
  if (report.outcome === 'lost') scene.effect('lost', { craftId: report.craftId });
  afterAction();
}

function openSplit(craftId) {
  const c = G.getCraft(S, craftId); if (!c) return;
  const crew = c.crew.map(id => G.getCrew(S, id));
  modal(`<div class="memo-head">UNDOCK</div><h2>${esc(c.name)}から切り離す</h2><p class="small">新しい船に移す部品と飛行士を選ぶ。飛行士が乗る側には、カプセルか居住モジュールが必要。</p>
    <div class="burn-list">${c.parts.map(p => `<label class="burn-row"><input type="checkbox" data-part="${p.uid}"> ${esc(PARTS[p.type].name)}${p.type === 'SUPPLY' ? `(${p.fill.toFixed(1)}人月)` : ''}</label>`).join('')}</div>
    ${crew.length ? `<h3>飛行士</h3><div class="burn-list">${crew.map(x => `<label class="burn-row"><input type="checkbox" data-crew="${x.id}"> ${esc(x.name)}</label>`).join('')}</div>` : ''}
    <div class="row between"><button class="btn" data-act="close">やめる</button><button class="btn go" id="splitGo">切り離す</button></div>`, 'memo');
  $('splitGo').onclick = () => {
    const parts = [...document.querySelectorAll('[data-part]:checked')].map(i => +i.dataset.part);
    const cr = [...document.querySelectorAll('[data-crew]:checked')].map(i => +i.dataset.crew);
    const r = G.split(S, craftId, parts, cr);
    if (!r.ok) { toast(r.msg); return; }
    closeModal(); sfx.click(); afterAction();
  };
}

function confirmBox(text, okLabel, onOk) {
  modal(`<div class="memo-head">CONFIRM</div><p>${text}</p><div class="row between"><button class="btn" data-act="close">やめる</button><button class="btn danger" id="cfOk">${esc(okLabel)}</button></div>`, 'memo');
  $('cfOk').onclick = () => { closeModal(); onOk(); };
}

function showEvent() {
  const e = G.eventById(S.pendingEvent); if (!e) return;
  modal(`<div class="memo-head">BLUEBONNET AEROSPACE INC. — MEMO</div><div class="memo-date">${esc(G.monthLabel(S.month))}</div><h2>${esc(e.title)}</h2><p>${esc(e.text)}</p>
    <div class="choices">${e.choices.map((c, i) => `<button class="btn choice" data-act="choose" data-a="${i}"><b>${esc(c.label)}</b><small>${esc(c.note)}</small></button>`).join('')}</div>`, 'memo paper');
}

function showSummary(sum) {
  const lines = sum.lines.slice();
  lines.push(`収入 ${m1(sum.income)} ・ 給料 −${m1(sum.salary)}`);
  modal(`<div class="memo-head">MONTHLY REPORT</div><div class="memo-date">${esc(G.monthLabel(sum.month))} の報告</div>
    <div class="report-lines" style="--d:0s">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>
    <div class="row end"><button class="btn go" data-act="${S.pendingEvent ? 'event' : S.gameOver ? 'over' : 'close'}">${S.pendingEvent ? 'FAXを読む' : 'OK'}</button></div>`, 'memo paper');
}

function showGameOver() {
  const g = S.gameOver;
  const ach = Object.keys(S.achievements).length;
  modal(`<div class="ib-title">${g.win ? 'MISSION COMPLETE!' : 'PROGRAM CANCELED'}</div>
    <h2>${g.win ? esc(g.title) : '計画は中止された'}</h2>
    <p>${g.win ? `${esc(g.heroes.join('、'))} が、${esc(G.monthLabel(g.month))}に火星から地球へ帰ってきた!` : esc(g.reason)}</p>
    <div class="score">SCORE <b>${g.score.toLocaleString()}</b></div>
    <p class="small">実績 ${ach}/${Object.keys(ACHIEVEMENTS).length}・打ち上げ ${S.stats.launches}回・事故 ${S.stats.failures}回・地上試験 ${S.stats.tests}回・殉職 ${S.deaths}人・残り資金 ${m1(S.money)}</p>
    <div class="row between"><button class="btn" data-act="close">ボードを見る</button><button class="btn go big" data-act="title">タイトルへ</button></div>`, 'board');
  if (g.win) { sfx.good(); scene.effect('confetti'); } else sfx.bad();
}

function showHelp() {
  modal(`<div class="ib-title">HOW TO PLAY</div><div class="help">
  <h3>目的</h3><p>1990年1月、テキサスの宇宙企業「ブルーボネット・エアロスペース」の計画責任者になったあなた。期限までに<b>飛行士を火星の地表に降ろし、生きて地球へ帰す</b>のが目標です。</p>
  <h3>1か月の流れ</h3><p>好きなだけ操作したら、机の上の<b>緑の大きなボタン</b>(または左下の「次の月へ」)で月を進めます。月末に開発が進み、補給品が減り、お金が入ります。ときどきFAXで出来事が届きます。</p>
  <h3>技術とカード(いちばん大事)</h3><p>技術が完成すると、見えない<b>信頼性カード</b>(ふつう3枚)が付きます。ロケットを噴射するたび、着陸・再突入のたびにカードを1枚引き、<b>成功/軽い故障/重大な故障</b>が決まります。地上試験($1.5M・チーム1つを1か月)でカードを引いて正体を調べ、見つけた欠陥はお金を払って取り除けます。カードが無くなった技術は必ず成功します。<br>→ テストにお金と時間をかけるか、危険を承知で急ぐか。それがこのゲームの悩みどころです。</p>
  <h3>ロケットと推力</h3><p>移動に必要な推力 = <b>難しさ × 船の重さ</b>。重さには、まだ使っていないロケット自身も入ります。使ったロケットは捨てられて軽くなります(ノヴァNは何度でも使える)。<br>
  難しさ:打ち上げ 5/火星遷移 3/火星での減速 2(耐熱シールドで空力ブレーキなら0)/着陸 ?(1〜3、探査機で調べる)/離陸 3/地球帰還 3/再突入 0(耐熱シールド)</p>
  <h3>窓と旅</h3><p>火星へは約26か月ごとに2か月だけ開く<b>窓</b>のときしか出発できません。片道7〜8か月。到着した月に減速しないと通り過ぎてしまいます。帰りの窓は、行きの窓の21か月後です。</p>
  <h3>宇宙での組み立て</h3><p>重い船は一度に打ち上げられません。「ランデブー・ドッキング」で軌道上でつなぎ合わせましょう。火星では、帰りの船を軌道に残し、軽い着陸船だけ降ろす作戦も有効です(切り離し)。</p>
  <h3>飛行士</h3><p>カプセル(2席・再突入できる)で打ち上げ、居住モジュール(3席)で長旅をします。居住モジュールが無いと3か月目から毎月健康が下がります。補給品は1人1か月に1人月(閉鎖型生命維持で半分)。操縦士・技師・医師の技能も活かしましょう。</p>
  <h3>お金と支持率</h3><p>毎月の収入は支持率で増えます。実績を上げると報奨金と支持率が入ります。1年間何も実績がないと関心が薄れます。<b>支持率 0、借金 $15M 超、期限切れ</b>でゲームオーバー。</p>
  <h3>操作</h3><p>机の上の物はクリックできます:コンピューター=開発、電話=飛行士、地球=組み立て、ボード=宇宙船、FAX=書類、カレンダー=記録。マウスを動かすと少し見回せます。ホイールで近づけます。</p>
  </div><div class="row end"><button class="btn go" data-act="close">わかった</button></div>`, 'board');
}

let toastTimer = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }

// ---------- 操作 ----------
function afterAction() { save(); render(); }
function render() {
  if (!S) return;
  renderHUD(); renderPanel();
  const inf = info();
  $('hintTitle').textContent = inf.hintTitle; $('hintSub').textContent = inf.hintSub;
  scene.update(S, inf);
  $('nextBtn').disabled = !!S.gameOver;
}

function nextMonth() {
  if (S.gameOver) { showGameOver(); return; }
  if (S.pendingEvent) { showEvent(); return; }
  const ap = G.approachingCrafts(S);
  const go = () => {
    sfx.press(); scene.effect('press');
    const r = G.endMonth(S);
    if (!r.ok) { toast(r.msg); return; }
    save(); render();
    if (S.pendingEvent) setTimeout(() => sfx.fax(), 300);
    showSummary(r.summary);
  };
  if (ap.length) confirmBox(`<b>${ap.map(c => esc(c.name)).join('、')}</b> が接近中のまま減速していません。このまま月を進めると<b>通り過ぎて失われます</b>。よろしいですか?`, '月を進める', go);
  else go();
}

function act(a, x, y) {
  switch (a) {
    case 'close': closeModal(); render(); break;
    case 'tab': tab = x; sfx.click(); document.body.classList.remove('panel-closed'); renderPanel(); break;
    case 'research': { const r = G.startResearch(S, x); if (!r.ok) toast(r.msg); else sfx.click(); afterAction(); break; }
    case 'test': {
      const r = G.groundTest(S, x); if (!r.ok) { toast(r.msg); break; }
      showReport({ lines: [`「${TECHS[x].name}」を地上で試験した。`, r.draw.t === 'S' ? '問題なし。' : '欠陥が見つかった! お金を払えば設計から取り除ける。'], draws: [r.draw], outcome: r.draw.t === 'S' ? 'ok' : 'fail' }, '地上試験');
      break;
    }
    case 'fix': { const r = G.fixCard(S, x, +y); if (!r.ok) toast(r.msg); else sfx.good(); afterAction(); break; }
    case 'hireTeam': { const r = G.hireTeam(S); if (!r.ok) toast(r.msg); afterAction(); break; }
    case 'hire': { const r = G.hireCrew(S, +x); if (!r.ok) toast(r.msg); else sfx.click(); afterAction(); break; }
    case 'newDraft': { const c = G.newDraft(S); selDraft = c.id; afterAction(); break; }
    case 'selDraft': selDraft = +x; renderPanel(); break;
    case 'addPart': { const r = G.addPart(S, selDraft, x); if (!r.ok) toast(r.msg); afterAction(); break; }
    case 'rmPart': G.removePartType(S, selDraft, x); afterAction(); break;
    case 'delDraft': confirmBox('この設計を取り消しますか?(まだお金は払っていません)', '取り消す', () => { G.deleteDraft(S, selDraft); selDraft = null; afterAction(); }); break;
    case 'board': { const r = G.boardCrew(S, selDraft, +x); if (!r.ok) toast(r.msg); afterAction(); break; }
    case 'route': planRoute = x; renderPanel(); break;
    case 'aero': planAero = !planAero; renderPanel(); break;
    case 'burn': {
      const craft = G.getCraft(S, +x);
      const m = MANEUVERS.find(mm => mm.id === y);
      if (m?.flyby && craft?.crew.length) { confirmBox('飛行士が乗っています。本当に通り過ぎますか?(二度と戻れません)', '通り過ぎる', () => openBurn(+x, y)); break; }
      openBurn(+x, y); break;
    }
    case 'dock': { const r = G.dock(S, +x, +y); if (!r.ok) { toast(r.msg); break; } showReport(r.report, 'ドッキング'); break; }
    case 'splitDlg': openSplit(+x); break;
    case 'jettison': confirmBox('この部品を1つ宇宙に捨てますか?(船が軽くなる)', '捨てる', () => { const r = G.jettison(S, +x, +y); if (!r.ok) toast(r.msg); afterAction(); }); break;
    case 'choose': { const r = G.resolveEvent(S, +x); if (!r.ok) { toast(r.msg); break; } sfx.click(); afterAction(); if (r.lines.length) modal(`<div class="memo-head">MEMO</div>${r.lines.map(l => `<p>${esc(l)}</p>`).join('')}<div class="row end"><button class="btn go" data-act="close">OK</button></div>`, 'memo paper'); else closeModal(); if (S.gameOver) showGameOver(); break; }
    case 'event': showEvent(); break;
    case 'over': showGameOver(); break;
    case 'title': closeModal(); showTitle(); break;
    default: break;
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  act(b.dataset.act, b.dataset.a, b.dataset.b);
});
$('nextBtn').addEventListener('click', nextMonth);
$('helpBtn').addEventListener('click', showHelp);
$('soundBtn').addEventListener('click', () => { toggleSound(); renderHUD(); });
$('panelToggle').addEventListener('click', () => { document.body.classList.toggle('panel-closed'); setTimeout(() => scene.resize(), 320); });
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !S?.pendingEvent) closeModal(); });

// 3Dの物をクリックしたとき
function onPick(action) {
  if (!S || !$('title').classList.contains('hidden')) return;
  if (!$('modal').classList.contains('hidden')) return;
  sfx.click();
  if (action === 'next') return nextMonth();
  if (action === 'fax') { if (S.pendingEvent) showEvent(); else toast('新しい書類はありません'); return; }
  if (action === 'help') return showHelp();
  if (action.startsWith('craft:')) { tab = 'fleet'; document.body.classList.remove('panel-closed'); renderPanel(); return; }
  tab = action; document.body.classList.remove('panel-closed'); renderPanel();
}
function onHover(tip, x, y) {
  const el = $('tip');
  if (!tip) { el.classList.add('hidden'); return; }
  el.textContent = tip; el.style.left = `${x + 14}px`; el.style.top = `${y + 14}px`; el.classList.remove('hidden');
}

// ---------- タイトル ----------
function showTitle() {
  const saved = load();
  $('title').classList.remove('hidden');
  document.body.classList.add('at-title'); scene?.resize(); scene?.showText('REDLINE TO MARS', '1990年、アメリカ。火星へ行って、帰ってこい。');
  $('continueBtn').hidden = !saved || !!saved.gameOver;
  if (saved && !saved.gameOver) $('continueBtn').innerHTML = `続きから<small>${esc(G.monthLabel(saved.month))}・${esc(DIFFICULTY[saved.difficulty].label)}</small>`;
}
function startGame(s) {
  S = s; tab = 'rd'; selDraft = null;
  $('title').classList.add('hidden');
  document.body.classList.remove('at-title'); scene.resize();
  save(); render();
  if (S.month === 0 && !S.research.length) showHelp();
}
document.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => {
  const saved = load();
  const go = () => startGame(G.createGame({ difficulty: b.dataset.new }));
  if (saved && !saved.gameOver) { $('title').classList.add('hidden'); confirmBox('今の続きのデータは消えます。新しく始めますか?', '新しく始める', go); $('modal').querySelector('[data-act="close"]').addEventListener('click', () => showTitle()); }
  else go();
}));
$('continueBtn').addEventListener('click', () => { const s = load(); if (s) startGame(s); });
$('titleHelp').addEventListener('click', () => { $('title').classList.add('hidden'); showHelp(); $('modal').querySelector('[data-act="close"]').addEventListener('click', () => { if (!S) showTitle(); }); });

// ---------- 起動 ----------
async function boot() {
  try {
    await document.fonts?.ready;
    const { createScene } = await import('./scene.js');
    scene = createScene($('view'), { onPick, onHover });
  } catch (e) {
    console.error(e);
    $('bootText').textContent = '3D の表示を始められませんでした。ブラウザを最新にするか、別のブラウザ(Chrome / Edge / Safari)で開いてください。';
    return;
  }
  $('boot').classList.add('hidden');
  showTitle();
}
boot();
// 動作確認用(URL に ?debug を付けたときだけ)
if (location.search.includes('debug')) window.__dbg = { get S() { return S; }, set S(v) { S = v; }, G, act, render, nextMonth };
