// ゲームのルールの数字をまとめた表。バランスを変えるときはここを直す。
// 金額の単位は「百万ドル($M)」、時間の単位は「月」。

export const START_YEAR = 1990;

// 難易度ごとの設定
export const DIFFICULTY = {
  normal: {
    label: '標準',
    note: '2001年12月までに、火星に降り立った飛行士を地球へ帰す',
    money: 30, rep: 40, baseIncome: 4.2,
    deadline: 143,               // 0 = 1990年1月
    card: { S: 0.42, m: 0.36, M: 0.22 },
  },
  hard: {
    label: 'ハード',
    note: '2000年12月(千年紀の終わり)まで。資金も少なく、部品の故障も多い',
    money: 20, rep: 35, baseIncome: 4.2,
    deadline: 131,
    card: { S: 0.32, m: 0.40, M: 0.28 },
  },
};

// 行き先(ボードのマス)
export const NODES = {
  earth:          { name: '地球(発射場)',     short: '地球',     space: false },
  leo:            { name: '地球のまわり(低軌道)', short: '地球周回',      space: true, orbit: true },
  mto:            { name: '火星への航路',     short: '火星へ',   space: true, transit: true },
  mars_approach:  { name: '火星に接近中',     short: '火星接近', space: true, approach: true },
  mars_orbit:     { name: '火星のまわり(周回軌道)', short: '火星周回', space: true, orbit: true },
  mars_surface:   { name: '火星の地表',     short: '火星地表', space: true, surface: true },
  eto:            { name: '地球への航路',     short: '地球へ',   space: true, transit: true },
  earth_approach: { name: '地球に接近中',     short: '地球接近', space: true, approach: true },
};

export const TRANSIT_TO_MARS = 7;   // 火星まで何か月かかるか
export const TRANSIT_TO_EARTH = 8;  // 地球まで何か月かかるか

// 打ち上げの窓(行ける時期)。地球→火星は W、火星→地球は W+21。どちらも2か月だけ開く
export const EARTH_WINDOWS = [4, 30, 56, 82, 108, 134];
export const RETURN_OFFSET = 21;
export const WINDOW_LENGTH = 2;

// 技術。cards: 信頼性カードの枚数(0 = カードなし)
export const TECHS = {
  LIQUID:     { name: '液体燃料エンジン', cost: 12, months: 5,  cards: 3, req: [],        desc: 'コンドル ロケットが作れる。地上から宇宙へ行く最初の一歩' },
  SOLID:      { name: '固体ブースター',   cost: 6,  months: 3,  cards: 3, req: [],        desc: '小さなホーネットが作れる。推力の微調整に便利' },
  HEAVY:      { name: '大型ロケット',     cost: 20, months: 8,  cards: 3, req: ['LIQUID'], desc: '巨大なゴライアスが作れる。重い荷物を打ち上げる' },
  NUCLEAR:    { name: '原子力推進',       cost: 30, months: 12, cards: 3, req: ['HEAVY'],  desc: 'ノヴァN:何度でも使えるエンジン。地上や火星の地表からは使えない' },
  GUIDANCE:   { name: '深宇宙航法',       cost: 10, months: 5,  cards: 3, req: [],        desc: '「火星へ出発」「地球へ出発」に必要' },
  HEAT:       { name: '耐熱シールド',     cost: 8,  months: 4,  cards: 3, req: [],        desc: '大気圏への再突入・火星での空力ブレーキに必要' },
  LANDING:    { name: '着陸技術',         cost: 14, months: 6,  cards: 3, req: ['HEAT'],  desc: '火星の地表に降りるのに必要' },
  RENDEZVOUS: { name: 'ランデブー・ドッキング', cost: 10, months: 5, cards: 3, req: [],    desc: '宇宙で船をつないだり切り離したりできる' },
  LIFE:       { name: '生命維持',         cost: 12, months: 6,  cards: 3, req: [],        desc: 'カプセルと居住モジュールが作れる(有人飛行)' },
  RECYCLE:    { name: '閉鎖型生命維持',   cost: 16, months: 8,  cards: 0, req: ['LIFE'],  desc: '水と空気を再利用して、補給品の消費が半分になる' },
};
export const TECH_ORDER = ['LIQUID', 'SOLID', 'HEAVY', 'NUCLEAR', 'GUIDANCE', 'HEAT', 'LANDING', 'RENDEZVOUS', 'LIFE', 'RECYCLE'];

export const CARD_LABEL = { S: '成功', m: '軽い故障', M: '重大な故障' };
export const FIX_COST = { m: 2, M: 4 };   // 故障カードを取り除く(設計を直す)費用
export const TEST_COST = 1.5;             // 地上試験の費用

// 部品。rocket = ロケット(使うと捨てる)、reusable = 何度でも使える
export const PARTS = {
  HORNET:  { name: 'ホーネット',   kind: 'rocket', mass: 1, thrust: 4,  cost: 2,  tech: 'SOLID',   desc: '小型の固体ロケット' },
  CONDOR:  { name: 'コンドル',     kind: 'rocket', mass: 3, thrust: 21, cost: 5,  tech: 'LIQUID',  desc: '主力の液体燃料ロケット' },
  GOLIATH: { name: 'ゴライアス',   kind: 'rocket', mass: 8, thrust: 72, cost: 12, tech: 'HEAVY',   desc: '大型の打ち上げロケット' },
  NOVA:    { name: 'ノヴァN',      kind: 'rocket', mass: 3, thrust: 27, cost: 14, tech: 'NUCLEAR', reusable: true, noSurface: true, desc: '原子力エンジン。何度でも使える' },
  CAPSULE: { name: 'カプセル',     kind: 'crew',   mass: 2, seats: 2, shielded: true, cost: 6, tech: 'LIFE', desc: '2人乗り。耐熱シールド付きで地球に帰れる' },
  HAB:     { name: '居住モジュール', kind: 'hab',  mass: 4, seats: 3, cost: 10, tech: 'LIFE', desc: '3人が長く暮らせる部屋。再突入には耐えられない' },
  SUPPLY:  { name: '補給コンテナ', kind: 'supply', mass: 1, cost: 1, desc: '食料・水・酸素。6人月ぶん' },
  PROBE:   { name: '探査機',       kind: 'probe',  mass: 1, shielded: true, cost: 3, desc: '無人で船を操縦できる。耐熱シールド付き' },
};
export const PART_ORDER = ['GOLIATH', 'CONDOR', 'HORNET', 'NOVA', 'CAPSULE', 'HAB', 'SUPPLY', 'PROBE'];
export const SUPPLY_PER_CRATE = 6;  // コンテナ1つで何人月もつか

// 移動(マヌーバ)。diff = 難しさ(必要な推力 = 難しさ × 船の重さ)
export const MANEUVERS = [
  { id: 'launch',   from: 'earth',         to: 'leo',          diff: 5, label: '打ち上げ', techs: [], surface: true,
    hint: '発射台から、地球のまわり(低軌道)へ。打ち上げは1か月に1回。' },
  { id: 'deorbit',  from: 'leo',           to: 'earth',        diff: 0, label: '地球へ帰る(大気圏突入)', techs: ['HEAT'], reentry: true,
    hint: 'カプセルと探査機だけが燃え尽きずに地上へ帰れる。ロケット不要。' },
  { id: 'tmi',      from: 'leo',           to: 'mto',          diff: 3, label: '火星へ出発', techs: ['GUIDANCE'], window: 'earth', transfer: true,
    hint: '地球のまわりからロケットを噴射して火星へ向かう。7か月の旅。出発できるのは「火星行きのチャンス」の2か月だけ。' },
  { id: 'mcap',     from: 'mars_approach', to: 'mars_orbit',   diff: 2, label: 'ロケットで減速して火星を回る', techs: [], capture: true,
    hint: 'ロケットを逆向きに噴射してブレーキをかけ、火星のまわりに入る。' },
  { id: 'maero',    from: 'mars_approach', to: 'mars_orbit',   diff: 0, label: '大気でブレーキして火星を回る', techs: ['HEAT'], aero: true,
    hint: '火星の大気にかすめて減速する(ロケット不要)。失敗すると、シールドのない部品が壊れることがある。' },
  { id: 'mflyby',   from: 'mars_approach', to: null,           diff: 0, label: '減速せず通り過ぎる', techs: [], flyby: true,
    hint: '船は二度と戻れない。無人の探査機を使い捨てるときだけ。' },
  { id: 'mland',    from: 'mars_orbit',    to: 'mars_surface', diff: null, label: '火星に着陸', techs: ['LANDING'], land: true,
    hint: 'ロケットで減速しながら地表に降りる。難しさは探査機が火星のまわりに着くと分かる。' },
  { id: 'mascent',  from: 'mars_surface',  to: 'mars_orbit',   diff: 3, label: '火星から離陸', techs: [], surface: true,
    hint: '地表から火星のまわりへ戻る。原子力エンジン(ノヴァN)は使えない。' },
  { id: 'tei',      from: 'mars_orbit',    to: 'eto',          diff: 3, label: '地球へ出発', techs: ['GUIDANCE'], window: 'mars', transfer: true,
    hint: '火星のまわりから噴射して地球へ向かう。8か月の旅。出発できるのは「地球行きのチャンス」の2か月だけ。' },
  { id: 'eentry',   from: 'earth_approach', to: 'earth',       diff: 0, label: 'そのまま大気圏に突入して帰る', techs: ['HEAT'], reentry: true,
    hint: 'カプセルと探査機だけが燃え尽きずに地上へ帰れる。ロケット不要。' },
  { id: 'ecap',     from: 'earth_approach', to: 'leo',         diff: 2, label: 'ロケットで減速して地球を回る', techs: [], capture: true,
    hint: 'ロケットでブレーキをかけ、地球のまわり(低軌道)に入る。' },
];

// 実績(初めて達成したときにごほうび)
export const ACHIEVEMENTS = {
  leo:          { name: '初の軌道到達',       money: 8,  rep: 5,  desc: '地球のまわりに宇宙船を届けた' },
  docking:      { name: '初のドッキング',     money: 5,  rep: 3,  desc: '宇宙で2つの船をつないだ' },
  crew_orbit:   { name: '有人軌道飛行',       money: 12, rep: 8,  desc: '飛行士が軌道を回り、無事に帰った' },
  mars_flyby:   { name: '火星フライバイ',     money: 8,  rep: 5,  desc: '探査機が火星のそばを通った' },
  mars_orbit:   { name: '火星周回',           money: 12, rep: 6,  desc: '火星の周回軌道に入った' },
  mars_landing: { name: '火星着陸(無人)',   money: 15, rep: 8,  desc: '探査機が火星の地表に降りた' },
  crew_mars:    { name: '有人火星飛行',       money: 10, rep: 10, desc: '飛行士が火星へ向けて旅立った' },
  crew_landing: { name: '人類、火星に立つ',   money: 30, rep: 15, desc: '飛行士が火星の地表に降り立った' },
};

// 飛行士の候補(架空の人物)
export const CANDIDATES = [
  { name: 'ジャック・モロー',     role: 'pilot',    bio: '元テストパイロット。着陸の大事故を小さな事故に変える' },
  { name: 'リンダ・コワルスキー', role: 'engineer', bio: '機械工学の博士。生命維持の故障を1段階軽くする' },
  { name: 'レイ・デルガド',       role: 'doctor',   bio: '航空宇宙医学の医師。宇宙でみんなのけがを少しずつ治す' },
  { name: 'スーザン・パーク',     role: 'pilot',    bio: '海軍出身の操縦士。着陸の大事故を小さな事故に変える' },
  { name: 'トム・ウィテカー',     role: 'none',     bio: '地質学者。とくに技能はないが、体力がある(健康4)' },
  { name: 'グレース・ホロウェイ', role: 'engineer', bio: '電気技師。生命維持の故障を1段階軽くする' },
  { name: 'マーカス・ベル',       role: 'doctor',   bio: '外科医。宇宙でみんなのけがを少しずつ治す' },
  { name: 'エレン・フィッシャー', role: 'none',     bio: '物理学者。とくに技能はないが、体力がある(健康4)' },
];
export const ROLE_LABEL = { pilot: '操縦士', engineer: '技師', doctor: '医師', none: '科学者' };
export const CREW_HIRE_COST = 2;
export const CREW_TRAIN_MONTHS = 6;
export const CREW_SALARY = 0.1;
export const MAX_CREW = 6;

export const TEAM_COST = 0.4;      // 開発チーム1つの毎月の給料
export const TEAM_HIRE_COST = 3;   // チームを増やす費用
export const MAX_TEAMS = 4;
export const DEBT_LIMIT = -15;     // これより借金が増えたら倒産

// 火星の「まだ分からないこと」。探査機を送ると分かる
export const MARS_UNKNOWNS = {
  landDiff:  { values: [1, 2, 3], label: '着陸の難しさ', reveal: '探査機が火星のまわりに着くと分かる' },
  radiation: { values: [0, 1],    label: '宇宙放射線',   reveal: '探査機が火星に着くと分かる',
               text: ['弱い(影響なし)', '強い(火星・地球への航路を飛ぶたびに飛行士の健康 -1)'] },
  surface:   { values: ['safe', 'storm', 'dust'], label: '地表の環境', reveal: '探査機が火星に着陸すると分かる',
               text: { safe: '穏やか(影響なし)', storm: '砂嵐が多い(地表で毎月 25% で全員の健康 -1)', dust: '有害な塵(居住モジュールが無いと毎月健康 -1)' } },
};

// 年月で決まって起きる出来事(month は 0 = 1990年1月)
export const HISTORIC_EVENTS = [
  { month: 23, id: 'ussr', title: 'ソ連が崩壊', text: '冷戦が終わり、旧ソ連のロケット技術者たちが仕事を探している。',
    choices: [
      { label: '技術者を雇う($4M)', effect: { money: -4, freeTeam: 18 }, note: '18か月のあいだ、開発チームが1つ増える' },
      { label: '見送る', effect: {}, note: '何も起きない' },
    ] },
  { month: 79, id: 'alh84001', title: '火星隕石に生命の痕跡?', text: '南極で見つかった火星の隕石に、生命の痕跡かもしれないものが見つかったと発表された。世間は火星の話題でもちきりだ。',
    choices: [ { label: 'よし、追い風だ', effect: { rep: 10 }, note: '支持率 +10' } ] },
  { month: 90, id: 'pathfinder', title: '火星探査車の映像に全米が熱狂', text: '火星の地表を走る小さな探査車の映像が、毎日ニュースで流れている。',
    choices: [ { label: '記者会見を開く($1M)', effect: { money: -1, rep: 6 }, note: '支持率 +6' },
               { label: '仕事に集中する', effect: { rep: 2 }, note: '支持率 +2' } ] },
  { month: 119, id: 'y2k', title: '2000年問題', text: '航法コンピューターの日付が「00年」で誤作動するおそれがある。',
    choices: [ { label: '全部点検する($3M)', effect: { money: -3 }, note: '何も起きない' },
               { label: 'たぶん大丈夫', effect: { addCard: 'GUIDANCE' }, note: '深宇宙航法に、正体不明のカードが1枚増える' } ] },
];

// ときどき起きる出来事(毎月の終わりに抽選)
export const RANDOM_EVENTS = [
  { id: 'budget_cut', title: '議会が予算を見直し', text: '「宇宙にお金を使いすぎだ」という声が議会で上がっている。',
    choices: [ { label: '議員に説明して回る($2M)', effect: { money: -2, rep: 2 }, note: '支持率 +2' },
               { label: '受け入れる', effect: { money: -6 }, note: '資金 -$6M' } ] },
  { id: 'tv_deal', title: 'テレビ局から独占取材の話', text: '大手テレビ局が、開発の舞台裏を密着取材したいと言っている。',
    choices: [ { label: '受ける', effect: { money: 5, rep: 3, flag: 'tv' }, note: '$5M・支持率+3。ただし12か月、事故の悪影響が2倍' },
               { label: '断る', effect: {}, note: '何も起きない' } ] },
  { id: 'donor', title: '大富豪からの寄付', text: 'ITブームでもうけた実業家が寄付を申し出た。',
    choices: [ { label: 'ありがたく受け取る', effect: { money: 8 }, note: '資金 +$8M' } ] },
  { id: 'strike', title: '下請け工場のストライキ', text: '部品工場で労働争議が起きている。',
    choices: [ { label: '賃上げに応じる($3M)', effect: { money: -3 }, note: '何も起きない' },
               { label: '長引かせる', effect: { delayResearch: 2 }, note: '開発中の技術がすべて2か月遅れる' } ] },
  { id: 'whistle', title: '内部告発', text: '「設計の欠陥が隠されている」という内部告発があった。',
    choices: [ { label: '徹底的に調べる($2M)', effect: { money: -2, revealRandom: true }, note: '正体不明のカードを1枚調べられる' },
               { label: '否定する', effect: { rep: -5 }, note: '支持率 -5' } ] },
  { id: 'school', title: '子どもたちからの手紙', text: '全国の小学校から、応援の手紙がたくさん届いた。',
    choices: [ { label: '返事を書く', effect: { rep: 3 }, note: '支持率 +3' } ] },
  { id: 'competitor', title: 'ライバル企業が名乗りを上げた', text: '別の会社も火星を目指すと発表した。議会は競争をあおっている。',
    choices: [ { label: '開発を急ぐ($5M)', effect: { money: -5, speedResearch: 2 }, note: '開発中の技術がすべて2か月早まる' },
               { label: '自分のペースで', effect: { rep: -3 }, note: '支持率 -3' } ] },
  { id: 'surplus', title: '軍の払い下げ品', text: '冷戦終結で余ったロケットの部品を、安く譲ってもらえるらしい。',
    choices: [ { label: '買う($3M)', effect: { money: -3, freeParts: 'CONDOR' }, note: '次の打ち上げでコンドル1基が無料(液体燃料エンジンが必要)' },
               { label: 'いらない', effect: {}, note: '何も起きない' } ] },
  { id: 'scandal', title: '経費の使いみちが報道された', text: '幹部の豪華な出張がニュースになってしまった。',
    choices: [ { label: '謝罪会見を開く', effect: { rep: -2 }, note: '支持率 -2' },
               { label: 'ノーコメント', effect: { rep: -6 }, note: '支持率 -6' } ] },
  { id: 'university', title: '大学との共同研究', text: '工科大学が共同研究を持ちかけてきた。',
    choices: [ { label: '参加する($2M)', effect: { money: -2, cheapFix: 6 }, note: '6か月、故障を直す費用が半額' },
               { label: '断る', effect: {}, note: '何も起きない' } ] },
  { id: 'astronaut_tv', title: '飛行士がトーク番組に', text: '人気のトーク番組から、飛行士に出演依頼が来た。', needCrew: true,
    choices: [ { label: '出演させる', effect: { rep: 4 }, note: '支持率 +4' },
               { label: '訓練を優先', effect: {}, note: '何も起きない' } ] },
  { id: 'fire', title: '試験場で小さな火災', text: '燃料の試験場でぼやが出た。けが人はいない。',
    choices: [ { label: '安全設備を更新($2M)', effect: { money: -2 }, note: '何も起きない' },
               { label: 'そのまま続ける', effect: { rep: -4 }, note: '支持率 -4' } ] },
  { id: 'grant', title: '科学財団の助成金', text: '火星の研究に助成金が出ることになった。',
    choices: [ { label: '受け取る', effect: { money: 5 }, note: '資金 +$5M' } ] },
  { id: 'recession', title: '不景気', text: '景気が悪くなり、宇宙開発への風当たりが強い。',
    choices: [ { label: '耐える', effect: { incomeCut: 6 }, note: '6か月、毎月の収入が $1M 減る' },
               { label: '人員整理する', effect: { rep: -4, money: 3 }, note: '資金 +$3M、支持率 -4' } ] },
];
