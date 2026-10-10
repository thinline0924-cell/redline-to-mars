// ルールの点検(Node.js で実行:node tests/check-rules.mjs)
// 1) でたらめに遊んでもエラーにならないか  2) 作戦どおりに遊べば勝てるか(難しすぎ・やさしすぎないか)
import * as G from '../js/game.js';
import { PARTS, TECH_ORDER, TECHS, EARTH_WINDOWS, RETURN_OFFSET } from '../js/data.js';

let failed = 0;
const assert = (cond, msg) => { if (!cond) { failed++; console.error('NG:', msg); } };

function checkInvariants(s, where) {
  assert(Number.isFinite(s.money) && Number.isFinite(s.rep), `${where}: お金か支持率が数でない`);
  for (const c of s.crafts) {
    for (const id of c.crew) { const x = G.getCrew(s, id); assert(x && x.status !== 'dead' && x.craft === c.id, `${where}: 乗員の記録が合わない`); }
    for (const p of c.parts) assert(PARTS[p.type], `${where}: 不明な部品`);
  }
  for (const x of s.crew) if (x.craft != null) assert(G.getCraft(s, x.craft)?.crew.includes(x.id), `${where}: 飛行士の乗っている船が見つからない`);
}

// ---------- 1) でたらめに遊ぶ ----------
function randomPlay(seed) {
  const s = G.createGame({ seed, difficulty: seed % 2 ? 'hard' : 'normal' });
  const r = () => G.rand(s);
  for (let step = 0; step < 4000 && !s.gameOver; step++) {
    if (s.pendingEvent) { G.resolveEvent(s, Math.floor(r() * G.eventById(s.pendingEvent).choices.length)); continue; }
    const a = Math.floor(r() * 12);
    const tech = TECH_ORDER[Math.floor(r() * TECH_ORDER.length)];
    const types = Object.keys(PARTS);
    if (a === 0) G.startResearch(s, tech);
    else if (a === 1) G.groundTest(s, tech);
    else if (a === 2) { const t = s.techs[tech]; t.cards.forEach((c, i) => { if (c.known && c.t !== 'S') G.fixCard(s, tech, i); }); }
    else if (a === 3) { const d = s.crafts.find(c => c.loc === 'earth') || G.newDraft(s); G.addPart(s, d.id, types[Math.floor(r() * types.length)]); }
    else if (a === 4) G.hireCrew(s, Math.floor(r() * 8));
    else if (a === 5) { const d = s.crafts.find(c => c.loc === 'earth'); const c = s.crew.find(x => G.crewReady(s, x)); if (d && c) G.boardCrew(s, d.id, c.id); }
    else if (a === 6 || a === 7) {
      const c = s.crafts[Math.floor(r() * s.crafts.length)];
      if (c) { const ms = G.maneuversFor(s, c).filter(o => o.ok); const o = ms[Math.floor(r() * ms.length)]; if (o) G.performManeuver(s, c.id, o.m.id, G.autoSelect(s, c, o.m)); }
    } else if (a === 8 && s.crafts.length > 1) G.dock(s, s.crafts[0].id, s.crafts[1].id);
    else if (a === 9) { const c = s.crafts.find(x => x.loc !== 'earth' && x.parts.length > 1); if (c) G.split(s, c.id, [c.parts[0].uid], []); }
    else if (a === 10) G.hireTeam(s);
    else G.endMonth(s);
    checkInvariants(s, `seed ${seed} step ${step}`);
  }
}
for (let i = 1; i <= 300; i++) {
  try { randomPlay(i); } catch (e) { failed++; console.error(`NG: seed ${i} でエラー`, e); break; }
}
console.log('でたらめプレイ 300回:', failed ? 'NG' : 'OK');

// ---------- 2) 作戦どおりに遊ぶ ----------
// 必要なロケットの数:難しさ diff で、荷物 payload を運ぶのに type が何基いるか
function rocketsFor(diff, payload, type) {
  if (diff <= 0) return 0;
  const p = PARTS[type]; const net = p.thrust - diff * p.mass;
  return Math.ceil((diff * payload) / net);
}
function addN(s, d, type, n) { for (let i = 0; i < n; i++) G.addPart(s, d.id, type); }
function launchStack(s, d) {
  // 打ち上げ用のゴライアス(またはコンドル)を足してから打ち上げる
  const big = G.owned(s, 'HEAVY') ? 'GOLIATH' : 'CONDOR';
  addN(s, d, big, rocketsFor(5, G.craftMass(d), big));
  const o = G.maneuversFor(s, d).find(x => x.m.id === 'launch');
  if (!o.ok) return null;
  const r = G.performManeuver(s, d.id, 'launch', G.autoSelect(s, d, o.m));
  return r.report.outcome === 'ok' ? G.getCraft(s, d.id) : null;
}
function doMove(s, c, id) {
  const o = G.maneuversFor(s, c).find(x => x.m.id === id);
  if (!o || !o.ok) return null;
  return G.performManeuver(s, c.id, id, G.autoSelect(s, c, o.m)).report;
}
const deckClean = (s, t) => G.owned(s, t) && s.techs[t].cards.every(c => c.known && c.t === 'S');

function botPlay(seed, difficulty) {
  const s = G.createGame({ seed, difficulty });
  const plan = ['LIQUID', 'GUIDANCE', 'HEAT', 'LIFE', 'HEAVY', 'LANDING', 'RENDEZVOUS', 'RECYCLE'];
  const needed = ['LIQUID', 'GUIDANCE', 'HEAT', 'LIFE', 'HEAVY', 'LANDING', 'RENDEZVOUS'];
  const mission = { stage: 'prep' };
  for (let guard = 0; guard < 400 && !s.gameOver; guard++) {
    if (s.pendingEvent) {
      const e = G.eventById(s.pendingEvent);
      const i = e.choices.findIndex(c => (c.effect.money ?? 0) >= 0 && !c.effect.flag && !c.effect.addCard && !c.effect.delayResearch);
      G.resolveEvent(s, i >= 0 ? i : 0);
      continue;
    }
    const reserve = 6;
    if (s.month === 1) G.hireTeam(s);
    for (const t of plan) if (s.money - TECHS[t].cost > reserve) G.startResearch(s, t);
    // 試験と修理
    for (const t of needed) {
      if (!G.owned(s, t)) continue;
      s.techs[t].cards.forEach((c, i) => { if (c.known && c.t !== 'S' && s.money - G.fixCost(s, c.t) > reserve) G.fixCard(s, t, i); });
      for (let k = s.techs[t].cards.length - 1; k >= 0; k--) { const c = s.techs[t].cards[k]; if (c.known && c.t !== 'S' && s.money > G.fixCost(s, c.t) + 2) G.fixCard(s, t, k); }
      while (s.techs[t].cards.some(c => !c.known) && s.money > reserve + 2 && !G.canTest(s, t)) {
        const r = G.groundTest(s, t);
        if (r.draw.t !== 'S' && s.money > G.fixCost(s, r.draw.t)) G.fixCard(s, t, r.draw.idx);
      }
    }
    if (s.crew.length < 2 && s.month >= 40) { G.hireCrew(s, 0); G.hireCrew(s, 1); }

    // 実績:まず軌道へ
    if (G.owned(s, 'LIQUID') && s.achievements.leo == null && !s.launchedThisMonth && s.money > 15) {
      const d = G.newDraft(s); G.addPart(s, d.id, 'PROBE'); G.addPart(s, d.id, 'CONDOR');
      const o = G.maneuversFor(s, d).find(x => x.m.id === 'launch');
      if (o.ok) G.performManeuver(s, d.id, 'launch', G.autoSelect(s, d, o.m)); else G.deleteDraft(s, d.id);
    }
    // 無人の火星探査(窓が開いたら)
    if (['GUIDANCE', 'HEAT', 'LANDING', 'HEAVY'].every(t => G.owned(s, t)) && s.achievements.mars_landing == null && !mission.probe
        && G.windowOpen('earth', s.month) && !s.launchedThisMonth && s.money > 45) {
      const d = G.newDraft(s); G.addPart(s, d.id, 'PROBE');
      addN(s, d, 'CONDOR', rocketsFor(3, G.craftMass(d), 'CONDOR'));       // 着陸(最悪の難しさ3と考える)
      addN(s, d, 'CONDOR', rocketsFor(3, G.craftMass(d), 'CONDOR'));       // 火星遷移
      const c = launchStack(s, d);
      if (c) { doMove(s, c, 'tmi'); mission.probe = c.id; }
    }
    for (const c of [...s.crafts]) {
      if (c.loc === 'mars_approach') { if (!doMove(s, c, 'maero')) doMove(s, c, 'mcap'); }
      else if (c.id === mission.probe && c.loc === 'mars_orbit') doMove(s, c, 'mland');
      else if (c.loc === 'earth_approach') doMove(s, c, 'eentry');
    }

    // 有人の火星往還
    const ready = needed.every(t => G.owned(s, t));
    const w = EARTH_WINDOWS.find(x => x >= s.month && x + RETURN_OFFSET + 10 <= G.deadline(s));
    if (ready && mission.stage === 'prep' && w != null && w - s.month <= 4 && s.crew.filter(c => G.crewReady(s, c)).length >= 2 && deckClean(s, 'HEAT')) {
      mission.stage = 'build'; mission.w = w; mission.pieces = [];
    }
    if (mission.stage === 'build' && !s.launchedThisMonth) {
      const ld = s.known.landDiff ? s.mars.landDiff : 3;
      const rate = G.owned(s, 'RECYCLE') ? 0.5 : 1;
      const crates = (m) => Math.ceil((m * 2 * rate) / 6);
      // 部品の構成を計算する
      if (!mission.layout) {
        let lander = 2 + crates(3);
        lander += PARTS.CONDOR.mass * rocketsFor(3, lander, 'CONDOR'); const ascent = rocketsFor(3, 2 + crates(3), 'CONDOR');
        const landN = rocketsFor(ld, lander, 'CONDOR'); lander += 3 * landN;
        let orbiter = 1 + 4 + crates(26);
        const teiN = rocketsFor(3, orbiter, 'CONDOR'); orbiter += 3 * teiN;
        const stack = lander + orbiter;
        const tmiN = rocketsFor(3, stack, 'CONDOR');
        mission.layout = { ascent, landN, teiN, tmiN, landCr: crates(3), orbCr: crates(26) };
      }
      const L = mission.layout;
      if (!mission.core) {
        const d = G.newDraft(s); G.addPart(s, d.id, 'PROBE'); G.addPart(s, d.id, 'HAB'); addN(s, d, 'SUPPLY', L.orbCr); addN(s, d, 'CONDOR', L.teiN);
        const c = s.money > G.craftCost(d, s) + 40 ? launchStack(s, d) : (G.deleteDraft(s, d.id), null);
        if (c) mission.core = c.id;
      } else if ((mission.tmiLeft ?? L.tmiN) > 0 && s.month < mission.w) {
        const n = Math.min(mission.tmiLeft ?? L.tmiN, 6);
        const d = G.newDraft(s); addN(s, d, 'CONDOR', n);
        const c = s.money > G.craftCost(d, s) + 30 ? launchStack(s, d) : (G.deleteDraft(s, d.id), null);
        if (c) { mission.pieces.push(c.id); mission.tmiLeft = (mission.tmiLeft ?? L.tmiN) - n; }
      } else if (s.month >= mission.w && G.windowOpen('earth', s.month)) {
        const d = G.newDraft(s); G.addPart(s, d.id, 'CAPSULE'); addN(s, d, 'SUPPLY', L.landCr); addN(s, d, 'CONDOR', L.ascent + L.landN);
        const crew = s.crew.filter(c => G.crewReady(s, c)).slice(0, 2);
        crew.forEach(c => G.boardCrew(s, d.id, c.id));
        const c = launchStack(s, d);
        if (c) { mission.lander = c.id; mission.stage = 'dock'; }
        else mission.stage = 'abort';
      }
    }
    if (mission.stage === 'dock') {
      const core = G.getCraft(s, mission.core);
      for (const id of [...mission.pieces, mission.lander]) if (G.getCraft(s, id) && core) { const r = G.dock(s, core.id, id); if (r.ok && r.report.outcome === 'ok') mission.pieces = mission.pieces.filter(x => x !== id); }
      if (core && !mission.pieces.length && !G.getCraft(s, mission.lander)) {
        if (doMove(s, core, 'tmi')) mission.stage = 'fly';
      }
      if (!core || !G.windowOpen('earth', s.month) && mission.stage === 'dock' && s.month > mission.w + 1) mission.stage = 'abort';
    }
    if (mission.stage === 'fly') {
      const core = G.getCraft(s, mission.core);
      if (!core) mission.stage = 'abort';
      else if (core.loc === 'mars_orbit' && !mission.landed) {
        const capsuleSide = core.parts.filter(p => p.type === 'CAPSULE' || (p.type === 'SUPPLY' && false));
        const condors = core.parts.filter(p => p.type === 'CONDOR').slice(0, mission.layout.ascent + mission.layout.landN);
        const sup = core.parts.filter(p => p.type === 'SUPPLY').slice(0, mission.layout.landCr);
        const r = G.split(s, core.id, [...capsuleSide, ...condors, ...sup].map(p => p.uid), [...core.crew]);
        if (r.ok) { const lr = doMove(s, r.craft, 'mland'); mission.lander = r.craft.id; mission.landed = !!lr; }
      } else if (mission.landed && G.getCraft(s, mission.lander)?.loc === 'mars_surface') doMove(s, G.getCraft(s, mission.lander), 'mascent');
      else if (mission.landed && G.getCraft(s, mission.lander)?.loc === 'mars_orbit') G.dock(s, core.id, mission.lander);
      else if (core.loc === 'mars_orbit' && core.crew.length) doMove(s, core, 'tei');
    }
    if (mission.stage === 'abort') { mission.stage = 'prep'; mission.layout = null; mission.core = null; mission.landed = false; mission.tmiLeft = undefined; }
    G.endMonth(s);
    checkInvariants(s, `bot ${seed}`);
  }
  return s;
}

for (const diff of ['normal', 'hard']) {
  let wins = 0, monthSum = 0, broke = 0; const N = 200;
  for (let i = 0; i < N; i++) {
    const s = botPlay(1000 + i, diff);
    if (s.gameOver?.win) { wins++; monthSum += s.gameOver.month; }
    else if (s.gameOver?.reason?.includes('倒産')) broke++;
  }
  console.log(`作戦プレイ(${diff}):${N}回中 ${wins}回 勝ち(平均 ${wins ? G.monthLabel(Math.round(monthSum / wins)) : '-'})、倒産 ${broke}回`);
  if (diff === 'normal') assert(wins >= N * 0.1, '標準でも作戦どおりに遊んで勝てない(難しすぎ)');
}
if (failed) { console.error(`点検 NG(${failed}件)`); process.exit(1); }
console.log('点検 OK');
