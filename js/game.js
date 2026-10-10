// ゲームのルール(画面や3Dとは切り離した、計算だけの部分)
// ここの関数は state(ゲームの状態)を書き換えて、結果を返す。
import {
  DIFFICULTY, NODES, TRANSIT_TO_MARS, TRANSIT_TO_EARTH, EARTH_WINDOWS, RETURN_OFFSET, WINDOW_LENGTH,
  TECHS, TECH_ORDER, FIX_COST, TEST_COST, PARTS, SUPPLY_PER_CRATE, MANEUVERS, ACHIEVEMENTS,
  CANDIDATES, CREW_HIRE_COST, CREW_TRAIN_MONTHS, CREW_SALARY, MAX_CREW, TEAM_COST, TEAM_HIRE_COST,
  MAX_TEAMS, DEBT_LIMIT, MARS_UNKNOWNS, HISTORIC_EVENTS, RANDOM_EVENTS, START_YEAR, CARD_LABEL,
} from './data.js';

export const SAVE_VERSION = 1;

// ---------- 乱数(セーブしても同じ続きになるよう、種を state に持つ) ----------
export function rand(s) {
  s.seed = (s.seed + 0x6D2B79F5) >>> 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];

// ---------- はじめる ----------
export function createGame(opts = {}) {
  const difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
  const d = DIFFICULTY[difficulty];
  const s = {
    v: SAVE_VERSION, difficulty, seed: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0,
    month: 0, money: d.money, rep: d.rep, teams: 2, uid: 1,
    techs: {}, research: [], testsThisMonth: 0,
    crew: [], crafts: [], launchedThisMonth: false, freeCondor: 0,
    achievements: {}, lastAchMonth: 0,
    mars: {}, known: {},
    mods: {}, log: [], pendingEvent: null, seenEvents: {}, deaths: 0, gameOver: null,
    stats: { launches: 0, failures: 0, tests: 0 },
  };
  for (const id of TECH_ORDER) s.techs[id] = { owned: false, cards: [] };
  s.mars.landDiff = pick(s, MARS_UNKNOWNS.landDiff.values);
  s.mars.radiation = rand(s) < 0.5 ? 1 : 0;
  s.mars.surface = pick(s, MARS_UNKNOWNS.surface.values);
  log(s, '計画スタート。まずは開発チームに技術の研究をさせよう。');
  return s;
}

// ---------- 小さな道具 ----------
export const monthLabel = (m) => `${START_YEAR + Math.floor(m / 12)}年${(m % 12) + 1}月`;
export const money1 = (v) => `$${(Math.round(v * 10) / 10).toFixed(1)}M`;
function log(s, text, kind = 'info') { s.log.unshift({ m: s.month, text, kind }); if (s.log.length > 120) s.log.length = 120; }
const newId = (s) => s.uid++;
const tvMult = (s) => (s.mods.tvUntil > s.month ? 2 : 1);
export const getCraft = (s, id) => s.crafts.find(c => c.id === id);
export const getCrew = (s, id) => s.crew.find(c => c.id === id);
export const deadline = (s) => DIFFICULTY[s.difficulty].deadline;

export function windowOpen(kind, month) {
  const off = kind === 'mars' ? RETURN_OFFSET : 0;
  return EARTH_WINDOWS.some(w => month >= w + off && month < w + off + WINDOW_LENGTH);
}
export function nextWindow(kind, month) {
  const off = kind === 'mars' ? RETURN_OFFSET : 0;
  for (const w of EARTH_WINDOWS) if (w + off + WINDOW_LENGTH - 1 >= month) return Math.max(w + off, month);
  return null;
}

// ---------- 技術と信頼性カード ----------
function newCard(s) {
  const p = DIFFICULTY[s.difficulty].card; const r = rand(s);
  return { t: r < p.S ? 'S' : r < p.S + p.m ? 'm' : 'M', known: false };
}
export const owned = (s, tech) => !!s.techs[tech]?.owned;
export function teamSlots(s) { return s.teams + (s.mods.freeTeamUntil > s.month ? 1 : 0); }
export function freeSlots(s) { return teamSlots(s) - s.research.length - s.testsThisMonth; }

export function canResearch(s, id) {
  const t = TECHS[id];
  if (!t) return '不明な技術です';
  if (owned(s, id)) return 'もう持っています';
  if (s.research.some(r => r.id === id)) return '開発中です';
  const miss = t.req.filter(r => !owned(s, r));
  if (miss.length) return `先に「${miss.map(r => TECHS[r].name).join('・')}」が必要です`;
  if (freeSlots(s) <= 0) return '手のあいている開発チームがいません';
  if (s.money < t.cost) return 'お金が足りません';
  return null;
}
export function startResearch(s, id) {
  const why = canResearch(s, id); if (why) return { ok: false, msg: why };
  s.money -= TECHS[id].cost;
  s.research.push({ id, left: TECHS[id].months });
  log(s, `「${TECHS[id].name}」の開発を始めた(${TECHS[id].months}か月)。`);
  return { ok: true };
}
function finishResearch(s, id) {
  const t = s.techs[id]; t.owned = true; t.cards = [];
  for (let i = 0; i < TECHS[id].cards; i++) t.cards.push(newCard(s));
  log(s, `「${TECHS[id].name}」が完成! ただし、どこに欠陥が残っているかはまだ分からない。`, 'good');
}

// カードを1枚引く。デッキが空なら必ず成功
export function drawCard(s, tech) {
  const t = s.techs[tech];
  if (!t || !t.cards.length) return { tech, t: 'S', idx: -1 };
  const idx = Math.floor(rand(s) * t.cards.length);
  t.cards[idx].known = true;
  return { tech, t: t.cards[idx].t, idx };
}
export function fixCost(s, type) { return FIX_COST[type] * (s.mods.cheapFixUntil > s.month ? 0.5 : 1); }
export function fixCard(s, tech, idx) {
  const c = s.techs[tech]?.cards[idx];
  if (!c || !c.known || c.t === 'S') return { ok: false, msg: '直せるカードではありません' };
  const cost = fixCost(s, c.t);
  if (s.money < cost) return { ok: false, msg: 'お金が足りません' };
  s.money -= cost; s.techs[tech].cards.splice(idx, 1);
  log(s, `「${TECHS[tech].name}」の欠陥(${CARD_LABEL[c.t]})を設計から取り除いた。`);
  return { ok: true };
}
export function canTest(s, tech) {
  if (!owned(s, tech)) return 'まだ持っていない技術です';
  if (!TECHS[tech].cards) return 'この技術は試験できません';
  if (!s.techs[tech].cards.length) return 'もう欠陥はありません(必ず成功します)';
  if (freeSlots(s) <= 0) return '今月は手のあいている開発チームがいません';
  if (s.money < TEST_COST) return 'お金が足りません';
  return null;
}
export function groundTest(s, tech) {
  const why = canTest(s, tech); if (why) return { ok: false, msg: why };
  s.money -= TEST_COST; s.testsThisMonth++; s.stats.tests++;
  const d = drawCard(s, tech);
  log(s, `「${TECHS[tech].name}」の地上試験:${CARD_LABEL[d.t]}。`, d.t === 'S' ? 'info' : 'warn');
  return { ok: true, draw: d };
}
export function hireTeam(s) {
  if (s.teams >= MAX_TEAMS) return { ok: false, msg: 'これ以上チームは増やせません' };
  if (s.money < TEAM_HIRE_COST) return { ok: false, msg: 'お金が足りません' };
  s.money -= TEAM_HIRE_COST; s.teams++;
  log(s, `開発チームを増やした(${s.teams}チーム)。`);
  return { ok: true };
}

// ---------- 飛行士 ----------
export function candidatesLeft(s) { return CANDIDATES.map((c, i) => ({ ...c, i })).filter(c => !s.crew.some(x => x.cand === c.i)); }
export function hireCrew(s, candIdx) {
  if (s.crew.filter(c => c.status !== 'dead').length >= MAX_CREW) return { ok: false, msg: '飛行士はこれ以上雇えません' };
  if (s.crew.some(c => c.cand === candIdx)) return { ok: false, msg: 'もう雇っています' };
  if (s.money < CREW_HIRE_COST) return { ok: false, msg: 'お金が足りません' };
  const c = CANDIDATES[candIdx];
  const max = c.role === 'none' ? 4 : 3;
  s.money -= CREW_HIRE_COST;
  s.crew.push({ id: newId(s), cand: candIdx, name: c.name, role: c.role, health: max, max, ready: s.month + CREW_TRAIN_MONTHS, status: 'earth', craft: null, walked: false, flights: 0 });
  log(s, `${c.name} を飛行士として採用した。訓練は${CREW_TRAIN_MONTHS}か月。`);
  return { ok: true };
}
export const crewReady = (s, c) => c.status === 'earth' && c.ready <= s.month && c.health >= 2;

function hurt(s, c, n, why) {
  if (c.status === 'dead' || n <= 0) return;
  c.health -= n;
  if (c.health <= 0) killCrew(s, c, why);
}
function killCrew(s, c, why) {
  if (c.status === 'dead') return;
  c.status = 'dead'; c.health = 0;
  const craft = c.craft != null ? getCraft(s, c.craft) : null;
  if (craft) craft.crew = craft.crew.filter(id => id !== c.id);
  c.craft = null; s.deaths++;
  s.rep -= 20 * tvMult(s);
  s.mods.mourningUntil = s.month + 6;
  log(s, `${c.name} が亡くなった(${why})。全米が悲しみに包まれた。支持率が大きく下がった。`, 'bad');
}
function crewOf(s, craft) { return craft.crew.map(id => getCrew(s, id)).filter(c => c && c.status !== 'dead'); }

// ---------- 宇宙船 ----------
export function craftMass(craft) { return craft.parts.reduce((a, p) => a + PARTS[p.type].mass, 0); }
export function craftCost(craft, s) {
  let cost = craft.parts.reduce((a, p) => a + PARTS[p.type].cost, 0);
  if (s && s.freeCondor > 0) cost -= Math.min(s.freeCondor, craft.parts.filter(p => p.type === 'CONDOR').length) * PARTS.CONDOR.cost;
  return cost;
}
export const seats = (craft, kind) => craft.parts.filter(p => PARTS[p.type].kind === kind).reduce((a, p) => a + PARTS[p.type].seats, 0);
export const supplyLeft = (craft) => craft.parts.filter(p => p.type === 'SUPPLY').reduce((a, p) => a + p.fill, 0);
export const controllable = (s, craft) => crewOf(s, craft).length > 0 || craft.parts.some(p => p.type === 'PROBE');

const COLORS = 8;
export function newDraft(s) {
  const n = s.crafts.length ? Math.max(...s.crafts.map(c => c.no)) + 1 : 1;
  const craft = { id: newId(s), no: n, name: `${n}号機`, loc: 'earth', parts: [], crew: [], arrive: null, courseErr: 0, cramped: 0, color: (n - 1) % COLORS, dockTried: -1 };
  s.crafts.push(craft);
  return craft;
}
export function canAddPart(s, craft, type) {
  if (craft.loc !== 'earth') return '地上にある船だけ組み立てられます';
  const p = PARTS[type]; if (!p) return '不明な部品です';
  if (p.tech && !owned(s, p.tech)) return `「${TECHS[p.tech].name}」が必要です`;
  if (craft.parts.length >= 40) return '部品が多すぎます';
  return null;
}
export function addPart(s, craftId, type) {
  const craft = getCraft(s, craftId); if (!craft) return { ok: false, msg: '船がありません' };
  const why = canAddPart(s, craft, type); if (why) return { ok: false, msg: why };
  const part = { uid: newId(s), type };
  if (type === 'SUPPLY') part.fill = SUPPLY_PER_CRATE;
  craft.parts.push(part);
  return { ok: true };
}
export function removePartType(s, craftId, type) {
  const craft = getCraft(s, craftId);
  if (!craft || craft.loc !== 'earth') return { ok: false, msg: '地上の船だけ変更できます' };
  for (let i = craft.parts.length - 1; i >= 0; i--) if (craft.parts[i].type === type) { craft.parts.splice(i, 1); break; }
  fixSeats(s, craft);
  return { ok: true };
}
function fixSeats(s, craft) {
  // 座席が減ったら、乗れない飛行士を降ろす
  const cap = seats(craft, 'crew') + seats(craft, 'hab');
  while (craft.crew.length > cap) { const c = getCrew(s, craft.crew.pop()); if (c) { c.status = 'earth'; c.craft = null; } }
}
export function deleteDraft(s, craftId) {
  const craft = getCraft(s, craftId);
  if (!craft || craft.loc !== 'earth') return { ok: false, msg: '地上の船だけ取り消せます' };
  for (const c of crewOf(s, craft)) { c.status = 'earth'; c.craft = null; }
  s.crafts = s.crafts.filter(c => c !== craft);
  return { ok: true };
}
export function boardCrew(s, craftId, crewId) {
  const craft = getCraft(s, craftId); const c = getCrew(s, crewId);
  if (!craft || !c || craft.loc !== 'earth') return { ok: false, msg: '地上の船にだけ乗れます' };
  if (craft.crew.includes(crewId)) { craft.crew = craft.crew.filter(x => x !== crewId); c.status = 'earth'; c.craft = null; return { ok: true }; }
  if (!crewReady(s, c)) return { ok: false, msg: c.ready > s.month ? '訓練中です' : '体調が回復していません' };
  const cap = seats(craft, 'crew') + seats(craft, 'hab');
  if (craft.crew.length >= cap) return { ok: false, msg: '座席が足りません(カプセルか居住モジュールを積んでください)' };
  if (!seats(craft, 'crew')) return { ok: false, msg: '打ち上げにはカプセルが必要です' };
  if (craft.crew.length >= seats(craft, 'crew')) return { ok: false, msg: '打ち上げのときはカプセルの座席(2人ずつ)にしか乗れません' };
  craft.crew.push(crewId); c.status = 'craft'; c.craft = craft.id;
  return { ok: true };
}

// ---------- 移動(マヌーバ) ----------
export function maneuverDiff(s, craft, m) {
  if (m.land) return s.mars.landDiff;
  let d = m.diff;
  if (m.capture) d += craft.courseErr;
  return d;
}
export function eligibleRockets(craft, m) {
  return craft.parts.filter(p => PARTS[p.type].kind === 'rocket' && !(m.surface && PARTS[p.type].noSurface));
}
export function requiredThrust(s, craft, m) { return Math.ceil(maneuverDiff(s, craft, m) * craftMass(craft)); }

// 使うロケットを自動で選ぶ:再利用できるものを先に使い、残りは推力の余りが最小になる組み合わせ
export function autoSelect(s, craft, m) {
  const need = requiredThrust(s, craft, m);
  if (need <= 0) return [];
  const rockets = eligibleRockets(craft, m);
  const chosen = []; let have = 0;
  for (const r of rockets) if (PARTS[r.type].reusable) { chosen.push(r.uid); have += PARTS[r.type].thrust; }
  if (have >= need) return chosen;
  const rest = rockets.filter(r => !PARTS[r.type].reusable);
  const gap = need - have;
  const total = rest.reduce((a, r) => a + PARTS[r.type].thrust, 0);
  if (total < gap) return chosen.concat(rest.map(r => r.uid)); // 足りない(全部使っても届かない)
  // dp[t] = 推力 t をちょうど出す組み合わせ(費用が最小のもの)
  const dp = new Array(total + 1).fill(null); dp[0] = { cost: 0, set: [] };
  for (const r of rest) {
    const th = PARTS[r.type].thrust, co = PARTS[r.type].cost;
    for (let t = total - th; t >= 0; t--) if (dp[t]) {
      const c = dp[t].cost + co;
      if (!dp[t + th] || dp[t + th].cost > c) dp[t + th] = { cost: c, set: dp[t].set.concat(r.uid) };
    }
  }
  let best = null;
  for (let t = gap; t <= total; t++) if (dp[t] && (!best || dp[t].cost < best.cost || (dp[t].cost === best.cost && t < best.t))) best = { ...dp[t], t };
  return chosen.concat(best ? best.set : []);
}

export function maneuversFor(s, craft) {
  const list = [];
  for (const m of MANEUVERS) {
    if (m.from !== craft.loc) continue;
    const reasons = [];
    if (craft.loc === 'earth') {
      if (s.launchedThisMonth) reasons.push('発射台は今月もう使いました(1か月に1回)');
      if (!craft.parts.length) reasons.push('部品がありません');
      if (s.money < craftCost(craft, s)) reasons.push(`お金が足りません(${money1(craftCost(craft, s))})`);
    } else if (!m.flyby && !controllable(s, craft)) reasons.push('操縦する人(飛行士)か探査機が必要です');
    for (const t of m.techs) if (!owned(s, t)) reasons.push(`「${TECHS[t].name}」が必要です`);
    if (m.window === 'earth' && !windowOpen('earth', s.month)) reasons.push(`火星への窓が閉じています(次は${monthLabel(nextWindow('earth', s.month) ?? 999)})`);
    if (m.window === 'mars' && !windowOpen('mars', s.month)) {
      const nw = nextWindow('mars', s.month);
      reasons.push(`地球への窓が閉じています(次は${nw == null ? 'もうありません' : monthLabel(nw)})`);
    }
    const diff = maneuverDiff(s, craft, m);
    const need = requiredThrust(s, craft, m);
    const maxThrust = eligibleRockets(craft, m).reduce((a, r) => a + PARTS[r.type].thrust, 0);
    if (need > 0 && maxThrust < need) reasons.push(`推力が足りません(必要 ${need} / 最大 ${maxThrust})`);
    list.push({ m, diff, need, maxThrust, ok: reasons.length === 0, reasons, diffKnown: !m.land || !!s.known.landDiff });
  }
  return list;
}

// 部品をこわす(ランダムに1つ、条件に合うもの)
function breakRandom(s, craft, filter, report) {
  const cands = craft.parts.filter(filter);
  if (!cands.length) return;
  const p = pick(s, cands);
  craft.parts = craft.parts.filter(x => x !== p);
  report.lines.push(`「${PARTS[p.type].name}」が壊れて失われた。`);
}
function destroyCraft(s, craft, report, why, opts = {}) {
  for (const c of crewOf(s, craft)) {
    if (opts.escape) { c.status = 'earth'; c.craft = null; hurt(s, c, 1, why); report.lines.push(`${c.name} は脱出装置で助かった。`); }
    else killCrew(s, c, why);
  }
  craft.crew = [];
  s.crafts = s.crafts.filter(c => c !== craft);
  s.stats.failures++;
  s.rep -= 3 * tvMult(s);
  report.lines.push(`${craft.name} は失われた(${why})。`);
  report.outcome = 'lost';
  log(s, `${craft.name} を失った:${why}`, 'bad');
}
function engineerSoftens(s, craft, card) {
  if (!crewOf(s, craft).some(c => c.role === 'engineer')) return card;
  return card === 'M' ? 'm' : card === 'm' ? 'S' : 'S';
}
function pilotSoftens(s, craft, card) {
  return card === 'M' && crewOf(s, craft).some(c => c.role === 'pilot') ? 'm' : card;
}

export function grant(s, id, report) {
  if (s.achievements[id] != null) return;
  const a = ACHIEVEMENTS[id];
  s.achievements[id] = s.month; s.lastAchMonth = s.month;
  s.money += a.money; s.rep += a.rep;
  const line = `実績「${a.name}」! 報奨金 ${money1(a.money)}・支持率 +${a.rep}`;
  if (report) report.lines.push(line);
  log(s, line, 'good');
}
function reveal(s, key, report) {
  if (s.known[key]) return;
  s.known[key] = true;
  const u = MARS_UNKNOWNS[key];
  const v = s.mars[key];
  const text = key === 'landDiff' ? `難しさ ${v}` : key === 'radiation' ? u.text[v] : u.text[v];
  const line = `調査で判明:火星の${u.label}は「${text}」。`;
  if (report) report.lines.push(line);
  log(s, line, 'info');
}

function arriveEarth(s, craft, report) {
  const crew = crewOf(s, craft);
  const fromOrbit = report.from === 'leo';
  let hero = false;
  for (const c of crew) {
    c.status = 'earth'; c.craft = null; c.flights++;
    if (c.walked) hero = true;
  }
  s.crafts = s.crafts.filter(x => x !== craft);
  if (crew.length) {
    report.lines.push(`${crew.map(c => c.name).join('、')} が無事に地球へ帰ってきた!`);
    if (fromOrbit || !s.achievements.crew_orbit) grant(s, 'crew_orbit', report);
  } else report.lines.push(`${craft.name} の回収に成功した。`);
  report.outcome = 'home';
  if (hero) winGame(s, crew.filter(c => c.walked));
}

// 移動を実行する。rocketUids = 噴射に使うロケット
export function performManeuver(s, craftId, mId, rocketUids) {
  const craft = getCraft(s, craftId);
  const report = { lines: [], draws: [], outcome: 'ok', craftId, from: craft?.loc };
  if (!craft) return { ok: false, msg: '船がありません' };
  const opt = maneuversFor(s, craft).find(o => o.m.id === mId);
  if (!opt) return { ok: false, msg: 'ここからはその移動はできません' };
  const m = opt.m;
  const blocking = opt.reasons.filter(r => !r.startsWith('推力が足りません'));
  if (blocking.length) return { ok: false, msg: blocking[0] };
  if (s.gameOver || s.pendingEvent) return { ok: false, msg: '今は操作できません' };
  const allowed = new Set(eligibleRockets(craft, m).map(r => r.uid));
  const fire = [...new Set(rocketUids || [])].filter(u => allowed.has(u));
  const planned = fire.reduce((a, u) => a + PARTS[craft.parts.find(p => p.uid === u).type].thrust, 0);
  if (opt.need > 0 && opt.diffKnown && planned < opt.need) return { ok: false, msg: `推力が足りません(選んだ推力 ${planned} / 必要 ${opt.need})` };

  // 打ち上げのときはここで代金を払う
  if (m.id === 'launch') {
    const cost = craftCost(craft, s);
    s.money -= cost;
    s.freeCondor = Math.max(0, s.freeCondor - craft.parts.filter(p => p.type === 'CONDOR').length);
    s.launchedThisMonth = true; s.stats.launches++;
    for (const c of crewOf(s, craft)) c.status = 'craft';
    report.lines.push(`${craft.name} を打ち上げ!(費用 ${money1(cost)})`);
  }

  if (m.flyby) {
    report.lines.push(`${craft.name} は火星を通り過ぎ、二度と戻らない軌道へ去っていった。`);
    for (const c of crewOf(s, craft)) killCrew(s, c, '宇宙のかなたへ');
    s.crafts = s.crafts.filter(x => x !== craft);
    report.outcome = 'gone';
    return { ok: true, report };
  }

  // 噴射
  const need = opt.need;
  if (need > 0) {
    let thrust = 0;
    for (const uid of fire) {
      const part = craft.parts.find(p => p.uid === uid);
      const def = PARTS[part.type];
      const d = drawCard(s, def.tech);
      d.part = part.type; report.draws.push(d);
      if (d.t === 'M') {
        destroyCraft(s, craft, report, `${def.name}が爆発`, { escape: m.id === 'launch' && seats(craft, 'crew') > 0 });
        return { ok: true, report };
      }
      if (d.t === 'S') thrust += def.thrust;
      else report.lines.push(`${def.name}が途中で止まった(推力なし)。`);
      if (!def.reusable) craft.parts = craft.parts.filter(p => p !== part);
    }
    report.thrust = thrust; report.need = need;
    if (thrust < need) {
      if (m.surface) {
        destroyCraft(s, craft, report, `推力不足で墜落(${thrust}/${need})`, { escape: m.id === 'launch' && seats(craft, 'crew') > 0 });
        return { ok: true, report };
      }
      report.lines.push(`推力が足りず(${thrust}/${need})、移動できなかった。使ったロケットは失われた。`);
      report.outcome = 'fail'; s.stats.failures++;
      return { ok: true, report };
    }
  }

  // 大気を使う移動
  if (m.reentry || m.aero) {
    const draws = 1 + (m.aero || m.id === 'eentry' ? craft.courseErr : 0);
    for (let i = 0; i < draws; i++) {
      const d = drawCard(s, 'HEAT'); report.draws.push(d);
      if (d.t === 'M') { destroyCraft(s, craft, report, '耐熱シールドが壊れて燃え尽きた'); return { ok: true, report }; }
      if (d.t === 'm') {
        if (m.aero) breakRandom(s, craft, p => !PARTS[p.type].shielded, report);
        for (const c of crewOf(s, craft)) { hurt(s, c, 1, '激しい揺れ'); }
        report.lines.push('シールドの一部が焼けて、船体が激しく揺れた。');
      }
    }
    if (m.reentry) {
      const lost = craft.parts.filter(p => !PARTS[p.type].shielded);
      craft.parts = craft.parts.filter(p => PARTS[p.type].shielded);
      if (lost.length) report.lines.push(`耐熱シールドのない部品(${lost.length}個)は燃え尽きた。`);
      const crew = crewOf(s, craft);
      const capSeats = seats(craft, 'crew');
      crew.slice(capSeats).forEach(c => killCrew(s, c, 'カプセルに座席がなかった'));
      if (!craft.parts.length) { destroyCraft(s, craft, report, '何も残らず燃え尽きた'); return { ok: true, report }; }
      craft.courseErr = 0;
      arriveEarth(s, craft, report);
      return { ok: true, report };
    }
  }

  if (m.land) {
    let d = drawCard(s, 'LANDING'); report.draws.push(d);
    const t = pilotSoftens(s, craft, d.t);
    if (t !== d.t) report.lines.push('操縦士の腕で、大事故をまぬがれた!');
    if (t === 'M') { destroyCraft(s, craft, report, '着陸に失敗して墜落'); return { ok: true, report }; }
    if (t === 'm') {
      report.lines.push('激しい着陸だった。');
      for (const c of crewOf(s, craft)) hurt(s, c, 1, '着陸の衝撃');
      breakRandom(s, craft, p => !['CAPSULE', 'HAB', 'PROBE'].includes(p.type), report);
    }
  }

  // 移動成功
  if (m.transfer) {
    craft.loc = m.to;
    craft.arrive = s.month + (m.to === 'mto' ? TRANSIT_TO_MARS : TRANSIT_TO_EARTH);
    const g = drawCard(s, 'GUIDANCE'); report.draws.push(g);
    if (g.t === 'm') { craft.courseErr += 1; report.lines.push('軌道に小さなずれ。到着時の減速が少し難しくなる。'); }
    if (g.t === 'M') { craft.courseErr += 2; report.lines.push('航法コンピューターの誤作動で、大きく軌道がずれた! 到着時の減速がとても難しくなる。'); }
    const crew = crewOf(s, craft);
    if (crew.length) {
      const l = drawCard(s, 'LIFE'); report.draws.push(l);
      const t = engineerSoftens(s, craft, l.t);
      if (t !== l.t) report.lines.push('技師が生命維持装置の不具合をすばやく直した。');
      if (t === 'm') loseSupply(craft, 1 / 3, report);
      if (t === 'M') { loseSupply(craft, 1 / 2, report); for (const c of crew) hurt(s, c, 1, '生命維持装置の故障'); }
      if (m.id === 'tmi') grant(s, 'crew_mars', report);
    }
    report.lines.push(`${craft.name} は${NODES[m.to].name}へ。到着は ${monthLabel(craft.arrive)}。`);
  } else {
    craft.loc = m.to;
    if (m.capture || m.aero) craft.courseErr = 0;
    report.lines.push(`${craft.name} は${NODES[m.to].name}に着いた。`);
  }
  if (m.to === 'leo') grant(s, 'leo', report);
  if (m.to === 'mars_orbit') { grant(s, 'mars_orbit', report); reveal(s, 'landDiff', report); }
  if (m.to === 'mars_surface') {
    reveal(s, 'surface', report);
    const crew = crewOf(s, craft);
    if (crew.length) { crew.forEach(c => { c.walked = true; }); grant(s, 'crew_landing', report); }
    else grant(s, 'mars_landing', report);
  }
  return { ok: true, report };
}
function loseSupply(craft, frac, report) {
  const sup = craft.parts.filter(p => p.type === 'SUPPLY');
  const total = sup.reduce((a, p) => a + p.fill, 0);
  let lose = Math.round(total * frac * 10) / 10;
  report.lines.push(`補給品が漏れて ${lose.toFixed(1)} 人月ぶん失われた。`);
  for (const p of sup) { const x = Math.min(p.fill, lose); p.fill -= x; lose -= x; }
  craft.parts = craft.parts.filter(p => p.type !== 'SUPPLY' || p.fill > 0.001);
}

// ---------- ドッキング・切り離し・投棄 ----------
const DOCK_PLACES = ['leo', 'mars_orbit', 'mars_surface'];
export function canDock(s, a, b) {
  if (!a || !b || a === b) return '船を選んでください';
  if (a.loc !== b.loc || !DOCK_PLACES.includes(a.loc)) return '同じ軌道(または地表)にいる船どうしだけつなげます';
  if (a.loc !== 'mars_surface') {
    if (!owned(s, 'RENDEZVOUS')) return '「ランデブー・ドッキング」が必要です';
    if (!controllable(s, a) && !controllable(s, b)) return 'どちらかに操縦する人か探査機が必要です';
    if (a.dockTried === s.month || b.dockTried === s.month) return '今月はもうドッキングを試しました';
  }
  return null;
}
export function dock(s, aId, bId) {
  const a = getCraft(s, aId), b = getCraft(s, bId);
  const why = canDock(s, a, b); if (why) return { ok: false, msg: why };
  const report = { lines: [], draws: [], outcome: 'ok', craftId: a.id };
  if (a.loc !== 'mars_surface') {
    a.dockTried = b.dockTried = s.month;
    const d = drawCard(s, 'RENDEZVOUS'); report.draws.push(d);
    if (d.t === 'm') { report.lines.push('接近に失敗。来月もう一度やってみよう。'); report.outcome = 'fail'; return { ok: true, report }; }
    if (d.t === 'M') {
      report.lines.push('衝突してしまった!');
      for (const c of [...crewOf(s, a), ...crewOf(s, b)]) hurt(s, c, 1, 'ドッキング中の衝突');
      breakRandom(s, a, p => !PARTS[p.type].shielded, report);
      breakRandom(s, b, p => !PARTS[p.type].shielded, report);
      report.outcome = 'fail'; s.stats.failures++;
      return { ok: true, report };
    }
  }
  a.parts.push(...b.parts); a.crew.push(...b.crew);
  for (const c of crewOf(s, b)) c.craft = a.id;
  a.courseErr = Math.max(a.courseErr, b.courseErr); a.cramped = Math.min(a.cramped, b.cramped);
  s.crafts = s.crafts.filter(c => c !== b);
  report.lines.push(`${b.name} を ${a.name} につないだ。`);
  grant(s, 'docking', report);
  return { ok: true, report };
}
export function canSplit(s, craft) {
  if (!craft || !DOCK_PLACES.includes(craft.loc)) return '軌道上か地表にいる船だけ切り離せます';
  if (craft.loc !== 'mars_surface' && !owned(s, 'RENDEZVOUS')) return '「ランデブー・ドッキング」が必要です';
  return null;
}
export function split(s, craftId, partUids, crewIds) {
  const craft = getCraft(s, craftId);
  const why = canSplit(s, craft); if (why) return { ok: false, msg: why };
  const parts = craft.parts.filter(p => partUids.includes(p.uid));
  const crew = craft.crew.filter(id => crewIds.includes(id));
  if (!parts.length) return { ok: false, msg: '切り離す部品を選んでください' };
  if (parts.length === craft.parts.length) return { ok: false, msg: 'すべての部品は切り離せません' };
  const rest = craft.parts.filter(p => !partUids.includes(p.uid));
  const restCrew = craft.crew.filter(id => !crewIds.includes(id));
  const hasRoom = (ps) => ps.some(p => ['CAPSULE', 'HAB'].includes(p.type));
  if (crew.length && !hasRoom(parts)) return { ok: false, msg: '飛行士が乗る船にはカプセルか居住モジュールが必要です' };
  if (restCrew.length && !hasRoom(rest)) return { ok: false, msg: '残る飛行士のためのカプセルか居住モジュールが必要です' };
  const n = Math.max(...s.crafts.map(c => c.no)) + 1;
  const nc = { id: newId(s), no: n, name: `${n}号機`, loc: craft.loc, parts, crew, arrive: null, courseErr: 0, cramped: craft.cramped, color: (n - 1) % COLORS, dockTried: -1 };
  craft.parts = rest; craft.crew = restCrew;
  for (const id of crew) getCrew(s, id).craft = nc.id;
  s.crafts.push(nc);
  log(s, `${craft.name} から ${nc.name} を切り離した。`);
  return { ok: true, craft: nc };
}
export function jettison(s, craftId, uid) {
  const craft = getCraft(s, craftId);
  if (!craft || craft.loc === 'earth') return { ok: false, msg: '宇宙にいる船だけ投棄できます' };
  const p = craft.parts.find(x => x.uid === uid); if (!p) return { ok: false, msg: '部品がありません' };
  if (['CAPSULE', 'HAB'].includes(p.type) && craft.crew.length) {
    const left = craft.parts.filter(x => x !== p);
    if (!left.some(x => ['CAPSULE', 'HAB'].includes(x.type))) return { ok: false, msg: '飛行士がいる部屋は捨てられません' };
  }
  craft.parts = craft.parts.filter(x => x !== p);
  if (!craft.parts.length) s.crafts = s.crafts.filter(c => c !== craft);
  return { ok: true };
}

// ---------- 月の終わり ----------
export function approachingCrafts(s) { return s.crafts.filter(c => NODES[c.loc].approach); }

export function endMonth(s) {
  if (s.gameOver) return { ok: false, msg: 'ゲームは終わっています' };
  if (s.pendingEvent) return { ok: false, msg: '先にFAXの書類に答えてください' };
  const summary = { lines: [], month: s.month };
  const say = (t) => summary.lines.push(t);

  // 接近中のまま放っておいた船は通り過ぎてしまう
  for (const c of approachingCrafts(s)) {
    say(`${c.name} は減速できず、${c.loc === 'mars_approach' ? '火星' : '地球'}を通り過ぎてしまった。`);
    for (const x of crewOf(s, c)) killCrew(s, x, '宇宙のかなたへ');
    s.crafts = s.crafts.filter(x => x !== c); s.stats.failures++;
  }

  // 開発
  for (const r of s.research) r.left--;
  for (const r of s.research.filter(r => r.left <= 0)) { finishResearch(s, r.id); say(`「${TECHS[r.id].name}」が完成した。`); }
  s.research = s.research.filter(r => r.left > 0);
  s.testsThisMonth = 0; s.launchedThisMonth = false;

  // 飛行士(地上)
  for (const c of s.crew) {
    if (c.status === 'earth' && c.ready === s.month + 1) say(`${c.name} の訓練が終わった。`);
    if (c.status === 'earth' && c.health < c.max && (s.month % 3 === 2)) c.health++;
  }

  // 宇宙にいる船
  const rate = owned(s, 'RECYCLE') ? 0.5 : 1;
  for (const craft of [...s.crafts]) {
    if (craft.loc === 'earth') continue;
    const crew = crewOf(s, craft);
    if (crew.length) {
      // 補給品
      let need = crew.length * rate;
      for (const p of craft.parts.filter(p => p.type === 'SUPPLY').sort((a, b) => a.fill - b.fill)) {
        const x = Math.min(p.fill, need); p.fill -= x; need -= x;
      }
      craft.parts = craft.parts.filter(p => p.type !== 'SUPPLY' || p.fill > 0.001);
      if (need > 0.001) { say(`${craft.name}:補給品が尽きている! 飛行士が弱っている。`); crew.forEach(c => hurt(s, c, 1, '食料と酸素が尽きた')); }
      // 狭さ
      const habSeats = seats(craft, 'hab');
      if (crew.length > habSeats) {
        craft.cramped++;
        if (craft.cramped > 2) { say(`${craft.name}:狭いカプセルでの生活が長く、体調をくずしている。`); crew.forEach(c => hurt(s, c, 1, '狭いカプセルでの長い生活')); }
      } else craft.cramped = 0;
      // 地表の環境
      if (craft.loc === 'mars_surface') {
        if (s.mars.surface === 'storm' && rand(s) < 0.25) { say(`${craft.name}:激しい砂嵐!`); crew.forEach(c => hurt(s, c, 1, '火星の砂嵐')); reveal(s, 'surface'); }
        if (s.mars.surface === 'dust' && !habSeats) { say(`${craft.name}:有害な塵が入り込んでいる。`); crew.forEach(c => hurt(s, c, 1, '火星の有害な塵')); reveal(s, 'surface'); }
      }
      // 医師
      const alive = crewOf(s, craft);
      if (alive.some(c => c.role === 'doctor') && s.month % 3 === 0) {
        const w = alive.filter(c => c.health < c.max).sort((a, b) => a.health - b.health)[0];
        if (w) { w.health++; say(`${craft.name}:医師が ${w.name} を手当てした。`); }
      }
    }
    // 到着
    if (craft.arrive != null && craft.arrive <= s.month + 1) {
      const toMars = craft.loc === 'mto';
      craft.loc = toMars ? 'mars_approach' : 'earth_approach'; craft.arrive = null;
      say(`${craft.name} が${toMars ? '火星' : '地球'}に近づいた! 今月中に減速しないと通り過ぎてしまう。`);
      const cr = crewOf(s, craft);
      if (cr.length && s.mars.radiation) { cr.forEach(c => hurt(s, c, 1, '宇宙放射線')); say(`${craft.name}:長い旅の放射線で、飛行士の健康が下がった。`); reveal(s, 'radiation'); }
      if (toMars) { grant(s, 'mars_flyby', summary); reveal(s, 'radiation', summary); }
    }
  }

  // お金
  const d = DIFFICULTY[s.difficulty];
  let income = d.baseIncome + Math.max(0, s.rep) * 0.04;
  if (s.mods.incomeCutUntil > s.month) income -= 1;
  if (s.mods.mourningUntil > s.month) income -= 1.5;
  const salary = s.teams * TEAM_COST + s.crew.filter(c => c.status !== 'dead').length * CREW_SALARY;
  s.money += income - salary;
  summary.income = income; summary.salary = salary;
  // 世間の関心
  if (s.month - s.lastAchMonth >= 12) { s.rep -= 0.5; }
  s.rep = Math.min(100, s.rep);

  s.month++;
  // 出来事
  const h = HISTORIC_EVENTS.find(e => e.month === s.month && !s.seenEvents[e.id]);
  if (h) s.pendingEvent = h.id;
  else if (s.month > 2 && rand(s) < 0.3) {
    const pool = RANDOM_EVENTS.filter(e => (s.seenEvents[e.id] ?? -99) < s.month - 24 && (!e.needCrew || s.crew.some(c => c.status !== 'dead')));
    if (pool.length) s.pendingEvent = pick(s, pool).id;
  }
  checkGameOver(s);
  s.lastSummary = summary;
  return { ok: true, summary };
}

export function eventById(id) { return HISTORIC_EVENTS.find(e => e.id === id) || RANDOM_EVENTS.find(e => e.id === id); }
export function resolveEvent(s, choiceIdx) {
  const e = eventById(s.pendingEvent); if (!e) return { ok: false, msg: '出来事がありません' };
  const ch = e.choices[choiceIdx]; if (!ch) return { ok: false, msg: '選択肢がありません' };
  const f = ch.effect; const lines = [];
  if (f.money) s.money += f.money;
  if (f.rep) s.rep = Math.min(100, s.rep + f.rep);
  if (f.freeTeam) s.mods.freeTeamUntil = s.month + f.freeTeam;
  if (f.flag === 'tv') s.mods.tvUntil = s.month + 12;
  if (f.delayResearch) s.research.forEach(r => { r.left += f.delayResearch; });
  if (f.speedResearch) s.research.forEach(r => { r.left = Math.max(1, r.left - f.speedResearch); });
  if (f.cheapFix) s.mods.cheapFixUntil = s.month + f.cheapFix;
  if (f.incomeCut) s.mods.incomeCutUntil = s.month + f.incomeCut;
  if (f.freeParts === 'CONDOR') s.freeCondor++;
  if (f.addCard && owned(s, f.addCard)) s.techs[f.addCard].cards.push(newCard(s));
  if (f.revealRandom) {
    const unknown = [];
    for (const id of TECH_ORDER) s.techs[id].cards.forEach((c, i) => { if (!c.known) unknown.push([id, i]); });
    if (unknown.length) { const [id, i] = pick(s, unknown); const c = s.techs[id].cards[i]; c.known = true; lines.push(`調べた結果:「${TECHS[id].name}」のカードは「${CARD_LABEL[c.t]}」だった。`); }
    else lines.push('調べたが、隠れた欠陥は見つからなかった。');
  }
  s.seenEvents[e.id] = s.month; s.pendingEvent = null;
  log(s, `${e.title}:${ch.label}`);
  checkGameOver(s);
  return { ok: true, lines };
}

// ---------- 勝ち負け ----------
function winGame(s, heroes) {
  const left = deadline(s) - s.month;
  const score = Math.round(10000 + left * 60 + Math.max(0, s.rep) * 40 + Math.max(0, s.money) * 20 - s.deaths * 2500 + (s.difficulty === 'hard' ? 5000 : 0));
  s.gameOver = { win: true, month: s.month, score, heroes: heroes.map(c => c.name),
    title: score >= 20000 ? '伝説の計画責任者' : score >= 16000 ? '名だたる宇宙開発者' : score >= 12000 ? '火星の開拓者' : '奇跡の生還' };
  log(s, `${heroes.map(c => c.name).join('、')} が火星から生還! 計画は大成功だ!`, 'good');
}
function checkGameOver(s) {
  if (s.gameOver) return;
  let reason = null;
  if (s.rep <= 0) reason = '支持率が 0 になり、議会が計画の中止を決めた。';
  else if (s.money < DEBT_LIMIT) reason = `借金が ${money1(-s.money)} にふくらみ、会社が倒産した。`;
  else if (s.month > deadline(s)) reason = `期限(${monthLabel(deadline(s))})までに、火星に立った飛行士を地球へ帰せなかった。`;
  if (reason) {
    s.gameOver = { win: false, month: s.month, reason, score: Math.round(Object.keys(s.achievements).length * 600 + Math.max(0, s.rep) * 10) };
    log(s, reason, 'bad');
  }
}
export function rankLabel(s) { return s.gameOver?.win ? s.gameOver.title : '計画中止'; }
