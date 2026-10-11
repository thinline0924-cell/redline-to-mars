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
  if (ap.length) return { title: `${ap[0].name}が${ap[0].loc === 'mars_approach' ? '火星' : '地球'}に接近中!`, sub: '「宇宙船」タブで今月中に減速しよう。しないと通り過ぎてしまう' };
  const waiting = S.crafts.filter(c => c.loc === 'leo' || c.loc === 'mars_orbit');
  if (earthOpen && waiting.some(c => c.loc === 'leo')) return { title: '今が火星へ出発するチャンス!', sub: `地球のまわりの船は「宇宙船」タブの「火星へ出発」で旅立てる(${G.monthLabel(S.month)}・2か月間だけ)` };
  if (marsOpen && waiting.some(c => c.loc === 'mars_orbit')) return { title: '今が地球へ出発するチャンス!', sub: '火星のまわりの船は「地球へ出発」で帰れる(2か月間だけ)' };
  const g = goal();
  return { title: g[0], sub: g[1] };
}
// 次の目標(進み具合に合わせて案内する)
function goal() {
  const ne = G.nextWindow('earth', S.month);
  const chance = ne == null ? '火星行きの出発チャンスはもうない' : `次の火星行きチャンス:${G.monthLabel(ne)}${ne > S.month ? `(あと${ne - S.month}か月)` : '(今!)'}`;
  const a = S.achievements, has = (t) => G.owned(S, t), doing = (t) => S.research.some(r => r.id === t);
  if (!has('LIQUID') && !doing('LIQUID')) return ['目標:液体燃料エンジンを開発', 'コンピューター(「開発」タブ)で開発を始めよう。宇宙へ行く最初の一歩'];
  if (!has('LIQUID')) return ['目標:エンジンの完成を待つ', '待つ間に、地上試験の準備や、他の技術の開発を。準備ができたら「次の月へ」'];
  if (a.leo == null) return ['目標:初めての打ち上げ', '「組立」タブで、探査機1つ+コンドル1基の船を作って打ち上げよう'];
  if (!has('GUIDANCE') && !doing('GUIDANCE')) return ['目標:深宇宙航法を開発', '火星へ出発するのに必要な技術。' + chance];
  if (a.mars_orbit == null) return ['目標:探査機を火星へ', `地球のまわりから「火星へ出発」。${chance}`];
  if (!S.crew.some(c => c.status !== 'dead')) return ['目標:飛行士を採用', '電話(「飛行士」タブ)で採用。訓練に6か月かかる'];
  if (a.crew_landing == null) return ['目標:人類を火星へ', `大きな船は宇宙で組み立てよう(ドッキング)。${chance}`];
  return ['目標:飛行士を地球へ帰す', `${chance}・期限まで あと${G.deadline(S) - S.month}か月`];
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
  leo: { label: '地球のまわりまで', legs: ['launch'] },
  orbit: { label: '火星のまわりまで', legs: ['launch', 'tmi', 'CAP'] },
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
    const row = { m, need, max, mass: G.craftMass(clone), d, assumed, pass: pass && !missingTech.length, missingTech, used: '' };
    out.push(row);
    if (!pass) { ok = false; break; }
    // 必要な分だけ使ったことにする
    const sel = need > 0 ? autoSelectFor(clone, m, need) : [];
    const cnt = {};
    for (const p of clone.parts) if (sel.includes(p.uid)) { const k = `${PARTS[p.type].name}${p.use === 'space' ? '(宇宙用)' : p.use === 'launch' ? '(打ち上げ用)' : ''}`; cnt[k] = (cnt[k] || 0) + 1; }
    row.used = Object.entries(cnt).map(([k, n]) => `${k}×${n}`).join('・');
    clone.parts = clone.parts.filter(p => !sel.includes(p.uid) || PARTS[p.type].reusable);
    if (m.reentry) clone.parts = clone.parts.filter(p => PARTS[p.type].shielded);
  }
  return { out, ok };
}
// 見積もりで ✗ がなくなるまで、足りない場所にロケットを足す(宇宙用 → 打ち上げ用の順に)
function autoFill() {
  const craft = G.getCraft(S, selDraft); if (!craft) return { ok: false, msg: '船を選んでください' };
  const spaceType = G.owned(S, 'LIQUID') ? 'CONDOR' : null;
  const liftType = G.owned(S, 'HEAVY') ? 'GOLIATH' : G.owned(S, 'LIQUID') ? 'CONDOR' : null;
  if (!liftType) return { ok: false, msg: '先に「液体燃料エンジン」を開発してください' };
  let added = 0;
  for (let i = 0; i < 80; i++) {
    // まず、打ち上げ用だけで持ち上がるようにする(宇宙用を打ち上げで使ってしまわないように)
    const liftNeed = Math.ceil(5 * G.craftMass(craft));
    const liftHave = craft.parts.filter(p => PARTS[p.type].kind === 'rocket' && p.use !== 'space' && !PARTS[p.type].noSurface).reduce((a, p) => a + PARTS[p.type].thrust, 0);
    if (craft.parts.some(p => p.use === 'space') && liftHave < liftNeed) { G.addPart(S, craft.id, liftType, 'launch'); added++; continue; }
    const plan = simulatePlan(craft);
    const bad = plan.out.find(r => !r.pass);
    if (!bad) break;
    if (bad.missingTech.length) return { ok: false, msg: `「${TECHS[bad.missingTech[0]].name}」が未開発のため、${bad.m.label}はできません` };
    if (bad.m.id === 'launch') G.addPart(S, craft.id, liftType, 'launch');
    else if (spaceType) G.addPart(S, craft.id, spaceType, 'space');
    else return { ok: false, msg: '宇宙で使えるロケットがありません' };
    added++;
  }
  if (simulatePlan(craft).out.some(r => !r.pass)) return { ok: false, msg: 'ロケットを足しても届きませんでした。荷物を減らすか、宇宙で組み立ててください' };
  return { ok: true, msg: added ? `ロケットを${added}基足しました(費用 ${m1(G.craftCost(craft, S))})` : 'もう足りています' };
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
  let h = `<h2>組み立て工場</h2><p class="lead">部品を選んで船を組み、発射台から打ち上げる。<b>必要な推力 = 難しさ × 船の重さ</b>(まだ使っていないロケットの重さも入る)。火星へ行くなら、<b>宇宙で使うロケット</b>も一緒に積んで打ち上げる。お金は打ち上げのときに払う。発射は1か月に1回。</p>
  <div class="chips">${drafts.map(c => `<button class="chip ${c.id === selDraft ? 'on' : ''}" data-act="selDraft" data-a="${c.id}">${esc(c.name)}</button>`).join('')}
  <button class="chip add" data-act="newDraft">+ 新しい船</button></div>`;
  const craft = G.getCraft(S, selDraft);
  if (!craft) return h + '<p class="empty">「+ 新しい船」で設計を始めよう。</p>';
  const count = (t, use) => craft.parts.filter(p => p.type === t && (use === undefined || (p.use || 'launch') === use)).length;
  const partCard = (t, use) => {
    const p = PARTS[t]; const why = G.canAddPart(S, craft, t);
    if (use === 'launch' && p.noSurface) return '';
    const spec = p.kind === 'rocket' ? `推力${p.thrust}・重さ${p.mass}${p.reusable ? '・再利用' : ''}` : `重さ${p.mass}${p.seats ? `・${p.seats}席` : ''}${t === 'SUPPLY' ? `・${SUPPLY_PER_CRATE}人月` : ''}`;
    const n = count(t, use);
    return `<div class="part ${why ? 'locked' : ''}" title="${esc(why || p.desc)}"><div class="part-name">${esc(p.name)}</div><div class="small">${spec}・${m1(p.cost)}</div>
      <div class="stepper"><button class="mini" data-act="rmPart" data-a="${t}" data-b="${use || ''}" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button class="mini" data-act="addPart" data-a="${t}" data-b="${use || ''}" ${why ? 'disabled' : ''}>+</button></div></div>`;
  };
  const rockets = PART_ORDER.filter(t => PARTS[t].kind === 'rocket');
  h += `<h3>積む物</h3><div class="grid-parts">${PART_ORDER.filter(t => PARTS[t].kind !== 'rocket').map(t => partCard(t)).join('')}</div>`;
  h += `<h3>宇宙で使うロケット <small>(火星へ出発・減速・着陸・離陸などに使う。打ち上げでは使わない)</small></h3><div class="grid-parts">${rockets.map(t => partCard(t, 'space')).join('')}</div>`;
  h += `<h3>打ち上げ用ロケット <small>(地上 → 地球のまわり。上の全部を持ち上げて、使い終わったら捨てる)</small></h3><div class="grid-parts">${rockets.map(t => partCard(t, 'launch')).join('')}</div>`;
  const mass = G.craftMass(craft), cost = G.craftCost(craft, S);
  const capSeats = G.seats(craft, 'crew');
  h += `<div class="stats"><span>重さ <b>${mass}</b></span><span>費用 <b>${m1(cost)}</b>${S.freeCondor ? `<small>(払い下げコンドル${S.freeCondor}基 無料)</small>` : ''}</span><span>補給品 <b>${G.supplyLeft(craft)}</b>人月</span></div>`;
  // 乗員
  const crewList = S.crew.filter(c => c.status !== 'dead' && (c.craft === craft.id || G.crewReady(S, c)));
  h += `<h3>乗る飛行士 <small>(打ち上げはカプセルの席:${capSeats}席)</small></h3><div class="chips">` +
    (crewList.length ? crewList.map(c => `<button class="chip ${craft.crew.includes(c.id) ? 'on' : ''}" data-act="board" data-a="${c.id}">${esc(c.name)}<small>${ROLE_LABEL[c.role]}・健康${c.health}</small></button>`).join('') : '<span class="small">訓練の終わった飛行士がいません(電話で採用)</span>') + '</div>';
  // 見積もり
  const plan = simulatePlan(craft);
  h += `<h3>飛行計画の見積もり</h3><p class="small">この船で、どこまで行けるかの計算(故障がない場合)。打ち上げでは「打ち上げ用」、そのあとは「宇宙で使う」ロケットを順に使い捨てていく。</p><div class="chips small-chips">${Object.entries(ROUTES).map(([k, r]) => `<button class="chip ${planRoute === k ? 'on' : ''}" data-act="route" data-a="${k}">${r.label}</button>`).join('')}
    <button class="chip ${planAero ? 'on' : ''}" data-act="aero">火星での減速:${planAero ? '大気でブレーキ' : 'ロケット'}</button></div>
    <table class="plan"><tr><th>移動</th><th>重さ</th><th>必要/使える推力</th><th>使うロケット</th></tr>`;
  for (const r of plan.out) {
    h += `<tr class="${r.pass ? 'ok' : 'ng'}"><td>${esc(r.m.label)}${r.assumed ? '<small>(難しさ不明→3で計算)</small>' : ''}</td><td>${r.mass}</td><td>${r.need} / ${r.max}</td><td>${r.missingTech.length ? `<small class="warn">✗ 要開発:${esc(r.missingTech.map(t => TECHS[t].name).join('・'))}</small>` : r.pass ? `✓ <small>${esc(r.used || 'ロケット不要')}</small>` : `✗ 推力不足<small>${r.m.id === 'launch' ? '「打ち上げ用」を足す' : '「宇宙で使う」ロケットを足す'}</small>`}</td></tr>`;
  }
  h += `</table>`;
  if (plan.out.some(r => !r.pass)) h += `<div class="row"><button class="btn small go" data-act="autoFill">足りないロケットを自動で足す</button><span class="small">目的地:${esc(ROUTES[planRoute].label)}</span></div>`;
  if (craft.crew.length) {
    const sup = crewMonthsNeeded(craft.crew.length);
    const have = G.supplyLeft(craft);
    h += `<p class="small ${have >= sup.need ? '' : 'warn'}">補給品:この計画だと約${sup.months}か月 × ${craft.crew.length}人${sup.rate < 1 ? '×0.5(再利用)' : ''} = ${sup.need}人月 必要(積んでいるのは ${have}人月)。${G.seats(craft, 'hab') < craft.crew.length && planRoute !== 'leo' ? '<br>⚠ 居住モジュールが無いと、宇宙で3か月目から毎月健康が下がる。' : ''}</p>`;
  }
  const lo = G.maneuversFor(S, craft).find(o => o.m.id === 'launch');
  const ng = lo.checks.filter(x => !x.ok);
  h += `<h3>打ち上げ</h3>${moveCard(craft, lo)}`;
  h += `<div class="sticky-foot"><div class="sf-stats"><span>重さ <b>${mass}</b></span><span>費用 <b>${m1(cost)}</b></span><span class="${lo.maxThrust >= lo.need ? 'okc' : 'warn'}">打ち上げ用の推力 <b>${lo.maxThrust}</b>/${lo.need}</span></div>
    <div class="sf-note ${ng.length ? 'warn' : 'okc'}">${ng.length ? `✗ ${esc(ng[0].bad)}` : '✓ 打ち上げできます'}</div>
    <button class="btn go" data-act="burn" data-a="${craft.id}" data-b="launch" ${lo.ok ? '' : 'disabled'}>🚀 打ち上げ…</button></div>`;
  h += `<div class="row"><button class="btn danger small" data-act="delDraft">この設計を取り消す</button></div>`;
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
// 移動1つぶんのカード:何をする移動か+条件のチェックリスト
function moveCard(c, o) {
  const m = o.m;
  const thrustOnly = !o.ok && o.checks.filter(x => !x.ok).every(x => x.key === 'thrust') && !o.diffKnown;
  const can = o.ok || thrustOnly;
  const need = o.need > 0 ? `<span class="need">必要な推力 ${o.diffKnown ? o.need : '?'}</span>` : '<span class="need">ロケット不要</span>';
  const checks = o.checks.map(x => `<li class="${x.ok ? 'ok' : 'ng'}"><span class="mk">${x.ok ? '✓' : '✗'}</span><span>${esc(x.ok ? x.text : x.bad)}${x.ok ? '' : `<small>→ ${esc(x.fix)}</small>`}</span></li>`).join('');
  return `<div class="move ${can ? 'can' : ''} ${m.flyby ? 'flyby' : ''}">
    <div class="move-head"><div class="move-title"><b>${esc(m.label)}</b>${need}</div><button class="btn small ${can && !m.flyby ? 'go' : ''}" data-act="burn" data-a="${c.id}" data-b="${m.id}" ${can ? '' : 'disabled'}>${can ? '実行…' : '条件が未達'}</button></div>
    <div class="small">${esc(m.hint || '')}</div>
    ${o.checks.length ? `<ul class="checks">${checks}</ul>` : ''}
  </div>`;
}
function panelFleet() {
  const list = S.crafts.filter(c => c.loc !== 'earth');
  let h = `<h2>宇宙船</h2><p class="lead">宇宙にいる船の操作。それぞれの移動の下に<b>条件のチェックリスト</b>がある。✗ の項目を満たせば実行できる。火星・地球に<b>接近した月に減速しないと通り過ぎる</b>。</p>`;
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
    if (NODES[c.loc].transit) {
      const total = c.loc === 'mto' ? TRANSIT_TO_MARS : TRANSIT_TO_EARTH;
      const left = c.arrive - S.month;
      h += `<div class="travel"><div class="travel-bar"><i style="width:${Math.round((1 - left / total) * 100)}%"></i></div><span>${c.loc === 'mto' ? '火星' : '地球'}まで あと${left}か月(${esc(G.monthLabel(c.arrive))}に到着)。到着した月に減速の操作をする。</span></div>`;
    } else {
      h += `<div class="moves">`;
      for (const o of G.maneuversFor(S, c)) h += moveCard(c, o);
      h += `</div>`;
      const mates = S.crafts.filter(x => x !== c && x.loc === c.loc);
      const extra = [];
      for (const x of mates) {
        const why = G.canDock(S, c, x);
        extra.push(`<button class="btn small" data-act="dock" data-a="${c.id}" data-b="${x.id}" ${why ? 'disabled' : ''}>${esc(x.name)}とドッキング</button>${why ? `<span class="small">${esc(why)}</span>` : ''}`);
      }
      if (c.parts.length > 1) { const why = G.canSplit(S, c); extra.push(`<button class="btn small" data-act="splitDlg" data-a="${c.id}" ${why ? 'disabled' : ''}>切り離す…</button>${why ? `<span class="small">${esc(why)}</span>` : ''}`); }
      if (extra.length) h += `<div class="actions">${extra.join('')}</div>`;
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
  h += `</ul><h3>出発チャンスの予定</h3><p class="small">惑星の位置の関係で、火星への旅に出られるのは約26か月ごとの2か月間だけ。</p><table class="plan"><tr><th>火星行き(地球を出発)</th><th>地球行き(火星を出発)</th></tr>`;
  for (const w of EARTH_WINDOWS) h += `<tr class="${w + 1 < S.month ? 'past' : ''}"><td>${G.monthLabel(w)}〜</td><td>${G.monthLabel(w + RETURN_OFFSET)}〜</td></tr>`;
  h += `</table><p class="small">期限:${G.monthLabel(G.deadline(S))}。火星までの旅は${TRANSIT_TO_MARS}か月、地球までは${TRANSIT_TO_EARTH}か月。</p><h3>実績</h3><div class="ach">`;
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
      return `<label class="burn-row"><input type="checkbox" data-uid="${r.uid}" ${sel.has(r.uid) ? 'checked' : ''}> <b>${esc(p.name)}</b>${r.use === 'space' ? '<span class="tag">宇宙用</span>' : r.use === 'launch' ? '<span class="tag">打ち上げ用</span>' : ''} 推力${p.thrust}${p.reusable ? '(再利用)' : ''} <span class="deck">${deckSummary(p.tech)}</span></label>`;
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
    const dz = r.report.disaster;
    if (dz && (dz.lost.length || dz.escaped.length)) { closeModal(); playDistress(r.report).then(() => showReport(r.report, o.m.label)); }
    else showReport(r.report, o.m.label);
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

// ---------- 事故の演出(飛行士の乗った船を失ったとき) ----------
const CAPCOM = '管制(ヒューストン)';
function distressScript(rep) {
  const d = rep.disaster;
  const crew = [...d.lost, ...d.escaped];
  const a = crew[0], b = crew[1] || crew[0];
  const L = (who, text, fx) => ({ who, text, fx });
  const end = d.lost.length ? [L(null, '', 'static'), L(CAPCOM, `……${d.craft}、応答せよ。${d.craft}、応答せよ……`), L(null, 'SIGNAL LOST — 交信途絶', 'lost')] : [];
  if (rep.mId === 'launch') {
    const boom = d.why.includes('爆発');
    return [
      L(CAPCOM, `${d.craft}、リフトオフ。順調だ。`),
      boom ? L(a, 'マスターアラーム! 何かが爆発した!', 'alarm') : L(a, 'エンジンが止まった! 高度が落ちてる!', 'alarm'),
      L(b, '揺れが止まらない……機体がもたない!'),
      L(CAPCOM, 'アボート! アボート! 脱出しろ!'),
      L(a, 'うわあああああっ——!', 'scream'),
      L(null, '', 'static'),
      ...(d.escaped.length ? [L(CAPCOM, '……パラシュートを確認。乗員の生存を確認した。'), L(null, 'CREW RECOVERED — 乗員救助', 'saved')] : end),
    ];
  }
  if (rep.mId === 'mland') return [
    L(a, '降下が速すぎる! 噴射が足りない!', 'alarm'), L(b, '地面が——!'), L(a, 'いやだ、いやだあああっ——!', 'scream'), ...end];
  if (rep.mId === 'deorbit' || rep.mId === 'eentry' || rep.mId === 'maero') return [
    L(a, 'シールドが焼けてる……熱い、熱い!', 'alarm'), L(b, 'ヒューストン、聞こえるか! 船体が割れ——'), L(a, 'ああああああっ——!', 'scream'), ...end];
  if (rep.mId === 'mflyby') return [
    L(a, '減速できない……火星が遠ざかっていく。'), L(b, 'ヒューストン……家族に、愛していると伝えてくれ。'), L(CAPCOM, '……了解した。必ず伝える。'), L(null, '', 'static'), L(null, 'SIGNAL LOST — 交信途絶', 'lost')];
  return [
    L(a, '何かが爆発した! 船内の気圧が下がってる!', 'alarm'), L(b, 'ハッチを閉めろ! 早く——!'), L(a, 'ぐああああっ——!', 'scream'), ...end];
}
function playDistress(rep) {
  return new Promise((resolve) => {
    const lines = distressScript(rep);
    scene.effect('lost', { craftId: rep.craftId });
    const el = document.createElement('div');
    el.className = 'distress';
    el.innerHTML = `<div class="ds-box"><div class="ds-head"><span class="ds-rec">● REC</span><span>交信記録 — ${esc(rep.disaster.craft)}</span><span class="ds-time"></span></div>
      <div class="ds-lines"></div><button class="ds-skip">スキップ ▶</button></div>`;
    document.body.appendChild(el);
    document.body.classList.add('shaking');
    const box = el.querySelector('.ds-lines'), clock = el.querySelector('.ds-time');
    const t0 = 30 + Math.floor(Math.random() * 40);
    let i = 0, timer = 0, done = false;
    const finish = () => {
      if (done) return; done = true; clearTimeout(timer);
      document.body.classList.remove('shaking');
      el.classList.add('out'); setTimeout(() => el.remove(), 400);
      resolve();
    };
    el.querySelector('.ds-skip').onclick = finish;
    const step = () => {
      if (i >= lines.length) { timer = setTimeout(finish, 1800); return; }
      const ln = lines[i++];
      { const sec = t0 + i * 3; clock.textContent = `T+${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
      if (ln.fx === 'alarm') sfx.alarm(4);
      if (ln.fx === 'scream') { sfx.scream(0.1); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 600); }
      if (ln.fx === 'static') { sfx.radio(1.2, 0.07); document.body.classList.remove('shaking'); }
      if (ln.fx === 'lost' || ln.fx === 'saved') {
        box.insertAdjacentHTML('beforeend', `<div class="ds-banner ${ln.fx}">${esc(ln.text)}</div>`);
        if (ln.fx === 'lost') sfx.radio(2.0, 0.04);
      } else if (ln.fx === 'static') {
        box.insertAdjacentHTML('beforeend', `<div class="ds-static">ザ——————ッ……</div>`);
      } else {
        sfx.radio(0.15, 0.04);
        box.insertAdjacentHTML('beforeend', `<div class="ds-line ${ln.fx === 'scream' ? 'scream' : ''} ${ln.who === CAPCOM ? 'capcom' : ''}"><b>${esc(ln.who)}</b><span>${esc(ln.text)}</span></div>`);
      }
      box.scrollTop = box.scrollHeight;
      timer = setTimeout(step, ln.fx === 'scream' ? 2000 : ln.fx === 'static' ? 1300 : 1700);
    };
    timer = setTimeout(step, 500);
  });
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
  if (!sum.lines.length && !S.pendingEvent && !S.gameOver) {
    toast(`${G.monthLabel(S.month)}へ ・ 収入 +${m1(sum.income)} ・ 給料 −${m1(sum.salary)}`, 'info');
    return;
  }
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
  <h3>技術とカード</h3><p>技術が完成すると、見えない<b>信頼性カード</b>(ふつう3枚)が付きます。ロケットを噴射するたび、着陸・再突入のたびにカードを1枚引き、<b>成功/軽い故障/重大な故障</b>が決まります。地上試験($1.5M・チーム1つを1か月)でカードを引いて正体を調べ、見つけた欠陥はお金を払って取り除けます。カードが無くなった技術は必ず成功します。<br>→ テストにお金と時間をかけるか、危険を承知で急ぐか。それがこのゲームの悩みどころです。</p>
  <h3>ロケットと推力</h3><p>移動に必要な推力 = <b>難しさ × 船の重さ</b>。重さには、まだ使っていないロケット自身も入ります。使ったロケットは捨てられて軽くなります(ノヴァNは何度でも使える)。<br>組み立て工場ではロケットを<b>「打ち上げ用」</b>と<b>「宇宙で使う用」</b>に分けて積みます。打ち上げでは打ち上げ用だけを使うので、宇宙で使う用(火星へ出発・減速・着陸など)は宇宙まで残ります。迷ったら「飛行計画の見積もり」の<b>「足りないロケットを自動で足す」</b>を押してください。<br>
  難しさ:打ち上げ 5/火星へ出発 3/火星での減速 2(耐熱シールドで大気ブレーキなら0)/着陸 ?(1〜3、探査機で調べる)/離陸 3/地球へ出発 3/大気圏突入 0(耐熱シールド)</p>
  <h3>出発チャンスと旅</h3><p>惑星は動いているので、火星へは約26か月ごとに2か月だけある<b>出発チャンス</b>のときしか出発できません(ボード上端の年表の緑のマス)。片道7〜8か月。到着した月に減速しないと通り過ぎてしまいます。帰りのチャンスは、行きのチャンスの21か月後です(オレンジのマス)。</p>
  <h3>宇宙での組み立て</h3><p>重い船は一度に打ち上げられません。「ランデブー・ドッキング」で軌道上でつなぎ合わせましょう。火星では、帰りの船を軌道に残し、軽い着陸船だけ降ろす作戦も有効です(切り離し)。</p>
  <h3>飛行士</h3><p>カプセル(2席・再突入できる)で打ち上げ、居住モジュール(3席)で長旅をします。居住モジュールが無いと3か月目から毎月健康が下がります。補給品は1人1か月に1人月(閉鎖型生命維持で半分)。操縦士・技師・医師の技能も活かしましょう。</p>
  <h3>お金と支持率</h3><p>毎月の収入は支持率で増えます。実績を上げると報奨金と支持率が入ります。1年間何も実績がないと関心が薄れます。<b>支持率 0、借金 $15M 超、期限切れ</b>でゲームオーバー。</p>
  <h3>操作</h3><p>机の上の物はクリックできます:コンピューター=開発、電話=飛行士、地球=組み立て、ボード=宇宙船、FAX=書類、カレンダー=記録。マウスを動かすと少し見回せます。ホイールで近づけます。</p>
  </div><div class="row end"><button class="btn go" data-act="close">わかった</button></div>`, 'board');
}

let toastTimer = 0;
function toast(t, kind = 'error') { const el = $('toast'); el.textContent = t; el.className = `toast show ${kind}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }

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
    case 'addPart': { const r = G.addPart(S, selDraft, x, y || undefined); if (!r.ok) toast(r.msg); afterAction(); break; }
    case 'rmPart': { const c = G.getCraft(S, selDraft); const use = y || undefined;
      // 使い道なしの古い部品は「打ち上げ用」として数えている
      if (use === 'launch' && c && !c.parts.some(p => p.type === x && p.use === 'launch')) { const i = c.parts.map(p => p.type === x && !p.use).lastIndexOf(true); if (i >= 0) c.parts.splice(i, 1); }
      else G.removePartType(S, selDraft, x, use);
      afterAction(); break; }
    case 'autoFill': { const r = autoFill(); toast(r.msg, r.ok ? 'info' : 'error'); afterAction(); break; }
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
// キーボード操作(PC):N = 次の月へ、1〜5 = タブ、Esc = 閉じる
document.addEventListener('keydown', (e) => {
  if (!S || e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const open = !$('modal').classList.contains('hidden');
  if (e.key === 'Escape') { if (open && !S.pendingEvent) closeModal(); return; }
  if (open || !$('title').classList.contains('hidden')) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nextMonth(); }
  const tabs = ['rd', 'hangar', 'fleet', 'crew', 'log'];
  if (/^[1-5]$/.test(e.key)) { act('tab', tabs[+e.key - 1]); }
});
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
