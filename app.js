const { useState, useEffect, useRef, useCallback } = React;

// =============================================================================
// 幽拐コインランドリー v7
// 第四境界レベルのホラー謎解きARG
// 設計書 v7 (yukai-design-v7.md) に基づく実装
// =============================================================================

// =============================================================================
// 設定フラグ
// =============================================================================
const ENABLE_CLAUDE_API = false;  // 本番デプロイ時に true
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

// タイマー設定（秒）
const STAGE_TIME_LIMIT = 300; // 5分

// =============================================================================
// 画像URI（実装時に base64 を埋め込む or URL に置き換え）
// =============================================================================
const IMAGE_URIS = {
  // 店内
  'A1-1': './images/A1-1.webp',
  'A1-2': './images/A1-2.webp',
  'A1-3': './images/A1-3.webp',
  'A1-Clock': './images/A1-Clock.webp',
  'A6-α': './images/A6-alpha.webp',
  // キャラ
  'C1-1': './images/C1-1.webp',
  'C1-2': './images/C1-2.webp',
  'C1-3': './images/C1-3.webp',
  'C1-4': './images/C1-4.webp',
  'C1-5': './images/C1-5.webp',
  'C2-1': './images/C2-1.webp',
  'C2-2': './images/C2-2.webp',
  // 機械の遺品
  'B1-3': './images/B1-3.webp',
  'B1-4': './images/B1-4.webp',
  'B1-Tuner': './images/B1-Tuner.webp',
  'B2-3': './images/B2-3.webp',
  'B3-3-α': './images/B3-3-alpha.webp',
  // カウンター
  'A8-Counter': './images/A8-Counter.webp',
  'A8-Counter-Menu': './images/A8-Counter-Menu.webp',
  'A8-Terminal': './images/A8-Terminal.webp',
  'A8-Receipt': './images/A8-Receipt.webp',
  // 鏡（2段階）
  'L1-1': './images/L1-1.webp',
  'L1': './images/L1.webp',
  // ドア・奥の部屋
  'A9-Door-Open': './images/A9-Door-Open.webp',
  'E1': './images/E1.webp',
  'E2': './images/E2.webp',
  // 手記（2段階）
  'D2-Dark': './images/D2-Dark.webp',
  'D2': './images/D2.webp',
  // エンディング
  'X9': './images/X9.webp',
  'X10': './images/X10.webp',
};

const getImageUri = (id) => IMAGE_URIS[id] || null;

// 周回による画像の変化
const getImageId = (baseId, loopCount) => {
  if (baseId === 'A1') {
    if (loopCount >= 5) return 'A1-3';
    if (loopCount >= 3) return 'A1-2';
    return 'A1-1';
  }
  if (baseId === 'C2') {
    if (loopCount >= 3) return 'C2-2';
    return 'C2-1';
  }
  return baseId;
};

const getReiAvatar = (expression) => `C1-${expression}`;

// =============================================================================
// 初期メッセージ
// =============================================================================

const INITIAL_MESSAGES = [
  { delay: 800, text: '変な質問していい？' },
  { delay: 2200, text: 'コインランドリーから出られない' },
  { delay: 2400, text: '時計が2:14で止まってる、外の街灯も消えてる' },
  { delay: 2400, text: '110番繋がらない、家族のLINEも既読つかない' },
  { delay: 2200, text: 'なぜか君だけ繋がる' },
  { delay: 2000, text: 'とりあえず、店の中の写真送るね' },
  { delay: 2400, text: '撮った、見て', image: 'A1-1' },
  { delay: 2400, text: 'こんな感じ' },
  { delay: 2200, text: '何か気付いたら言って' },
];

// =============================================================================
// 辞書（自由テキスト → アクションID マッチング）
// 430+ パターン、第四境界レベルの推理ゲーム用
// =============================================================================

const DICTIONARY = {
  // 0. 会話を繋ぐ返答（最優先、辞書外でも反応）
  'agree': {
    keywords: ['うん', 'はい', 'もちろん', 'わかった', 'わかる', 'おっけー', 'OK', 'ok', 'いいよ', '了解', 'りょうかい', '任せて', 'まかせて', 'やる', 'やろう', '大丈夫だよ', 'できる'],
    response: 'agree',
  },
  'disagree': {
    keywords: ['わからない', 'わかんない', '無理', 'むり', 'いいえ', 'いや', 'ちょっと', 'ごめん', '詳しくない'],
    response: 'disagree',
  },
  'hint_request': {
    keywords: ['ヒント', 'hint', 'どうしたら', 'どうすれば', '何すれば', '何したら', '何しよう', '困った', 'わからない', 'てか何', '何できる'],
    response: 'hint_request',
  },
  // A. 玲の状態確認
  'wellbeing': {
    keywords: ['大丈夫', 'だいじょうぶ', '体調', '気分', '具合', '元気', 'げんき', '辛い', 'つらい'],
    response: 'wellbeing',
  },
  // B. 励まし・感情系
  'comfort': {
    keywords: ['頑張', 'がんば', '応援', '一緒', 'いっしょ', '助ける', 'たすける', '大丈夫だよ', '落ち着いて', '深呼吸'],
    response: 'comfort',
  },
  // C. 環境探索
  'photo': {
    keywords: ['写真', '撮って', '全景', 'どんな', '見せて', 'スマホで', '店内', 'お店'],
    response: 'photo',
  },
  'selfie': {
    keywords: ['自撮り', '顔', 'セルフィー', 'じぶん', '自分'],
    response: 'selfie',
  },
  'clock': {
    keywords: ['時計', 'とけい', '時間', '何時', '2:14'],
    response: 'clock',
  },
  'mirror': {
    keywords: ['鏡', 'かがみ', 'ミラー'],
    response: 'mirror',
  },
  'board': {
    keywords: ['掲示板', '掲示', 'けいじ', 'ボード', 'チラシ', 'フライヤー'],
    response: 'board',
  },
  'door_check': {
    keywords: ['ドア確認', '入口', '玄関', '出口', '出られる', '出口確認'],
    response: 'door_check',
  },
  'whatsee': {
    keywords: ['何が見える', 'なにが', '見える', '見渡', 'みわた', 'どんな部屋'],
    response: 'whatsee',
  },
  // 上下左右
  'look_up': {
    keywords: ['上見', '天井', '上の方', 'うえ', '上を'],
    response: 'look_up',
  },
  'look_down': {
    keywords: ['下見', '床', '下の方', 'した', '下を', 'ゆか'],
    response: 'look_down',
  },
  'look_left': {
    keywords: ['左見', '左壁', 'ひだり', '左を', '左の方'],
    response: 'look_left',
  },
  'look_right': {
    keywords: ['右見', '右壁', 'みぎ', '右を', '右の方', '洗濯機の上', '洗濯機上'],
    response: 'look_right',
  },
  // 鏡（2段階）
  'mirror_breathe': {
    keywords: ['息かけ', '曇らせ', '息吹', 'はぁ', 'ハァ', '息で', '吹きかけ', '曇った', 'くもらせ'],
    response: 'mirror_breathe',
  },
  // 機械
  'machine1': {
    keywords: ['1番', '一番', '1機', '一機', '1号', '一号', '1番機', '一番機'],
    response: 'machine_1',
  },
  'machine2': {
    keywords: ['2番', '二番', '2機', '二機', '2号', '二号', '2番機', '二番機'],
    response: 'machine_2',
  },
  'machine3': {
    keywords: ['3番', '三番', '3機', '三機', '3号', '三号', '3番機', '三番機'],
    response: 'machine_3',
  },
  'machine_back': {
    keywords: ['裏', '裏を見', '裏返し', '裏も', '反対側', 'うらがえし'],
    response: 'machine_back',
  },
  'fold': {
    keywords: ['畳ん', '畳む', 'たたん', 'たたむ', '畳んで'],
    response: 'fold',
  },
  // カウンター・装置
  'counter_under': {
    keywords: ['カウンター下', 'カウンターの下', '受付下', 'カウンターした', 'カウンター裏'],
    response: 'counter_under',
  },
  'counter_terminal': {
    keywords: ['決済端末', '端末', 'カウンター上', '決済', 'けっさい'],
    response: 'counter_terminal',
  },
  'terminal_3': {
    keywords: ['3番押', '再印字', 'さいいんじ', 'サイプリント', '再出力', 'レシート出'],
    response: 'terminal_3',
  },
  'terminal_1': {
    keywords: ['1番押', '決済押'],
    response: 'die_terminal_1',
  },
  'terminal_2': {
    keywords: ['2番押', '取消押', '取り消し'],
    response: 'die_terminal_2',
  },
  // BGM装置
  'bgm_power': {
    keywords: ['電源入', '電源つけ', 'スイッチ入', '起動', 'BGM起動', 'BGM電源'],
    response: 'bgm_power',
  },
  'bgm_select_1': {
    keywords: ['BGM 1', 'BGM1', '1選', 'Morning', 'モーニング', '432Hz'],
    response: 'die_bgm_1',
  },
  'bgm_select_2': {
    keywords: ['BGM 2', 'BGM2', '2選', 'Relaxation', 'リラクゼーション', '528Hz'],
    response: 'die_bgm_2',
  },
  'bgm_select_3': {
    keywords: ['BGM 3', 'BGM3', '3選', 'Deep Sleep', 'ディープスリープ', '210', '220', '210+220', '210と220', 'Binaural', 'バイノーラル'],
    response: 'bgm_play_alpha',
  },
  'bgm_select_4': {
    keywords: ['BGM 4', 'BGM4', '4選', 'Focus', 'フォーカス', '680Hz'],
    response: 'die_bgm_4',
  },
  // 奥のドア
  'open_door': {
    keywords: ['奥のドア開', 'スタッフドア', 'staff', 'STAFF', '奥のドア', 'バックドア'],
    response: 'open_door',
  },
  // 奥の部屋
  'go_back_room': {
    keywords: ['奥に進', '奥へ', '中に入', '入って', '進んで', '奥に行'],
    response: 'go_back_room',
  },
  'guitar_take': {
    keywords: ['ギター取', 'ギターを', 'ギターつか', 'ギター持', 'ギター手'],
    response: 'guitar_take',
  },
  // ライト
  'use_light': {
    keywords: ['ライトつけ', 'ライトで照', '明るくして', '照らして', 'スマホライト', 'フラッシュライト', 'ライト点'],
    response: 'use_light',
  },
  // チューニング
  'tune_guitar': {
    keywords: ['チューニング', 'tuning', 'tune', 'A=440', 'A440', '440に合わせ', 'チューナーで合わせ', '弦を合わせ', '音を合わせ'],
    response: 'tune_guitar',
  },
  // Aコード
  'play_a_chord': {
    keywords: ['Aコード弾', 'Aを弾', 'A コード', 'Aコード演奏', 'Aを鳴ら', 'ラを弾', 'ラの音弾', '440Hz弾'],
    response: 'play_a_chord',
  },
  // 他のコード（即死）
  'play_c_chord': {
    keywords: ['Cコード弾', 'Cを弾', 'Cコード演奏'],
    response: 'die_wrong_chord',
  },
  'play_d_chord': {
    keywords: ['Dコード弾', 'Dを弾', 'Dコード演奏'],
    response: 'die_wrong_chord',
  },
  'play_e_chord': {
    keywords: ['Eコード弾', 'Eを弾', 'Eコード演奏'],
    response: 'die_wrong_chord',
  },
  'play_g_chord': {
    keywords: ['Gコード弾', 'Gを弾', 'Gコード演奏'],
    response: 'die_wrong_chord',
  },
  // 即死パターン
  'die_turn_around': {
    keywords: ['振り向', 'ふりむ', '振り返', 'うしろ見', '後ろ向'],
    response: 'die_turn_around',
  },
  'die_break_mirror': {
    keywords: ['鏡割', 'かがみわ', '鏡を割', '鏡破壊', '鏡こわ'],
    response: 'die_break_mirror',
  },
  'die_scream': {
    keywords: ['叫ん', 'さけん', '大声', '叫べ'],
    response: 'die_scream',
  },
  'die_breaker': {
    keywords: ['ブレーカー', 'breaker', '電源切', '消灯', 'ブレーカー落'],
    response: 'die_breaker',
  },
  // 雑談・無関係
  'chitchat': {
    keywords: ['こんばんは', 'おはよう', 'よろしく', 'はじめまして', 'なんで', 'なぜ', 'どう思う'],
    response: 'chitchat',
  },
};

// =============================================================================
// アクション応答メッセージ
// =============================================================================

const ACTIONS = {
  // 会話を繋ぐ返答（プレイヤーの汎用的な返答に対する応答）
  agree: (ctx) => {
    // 状況に応じてヒントを出す
    if (ctx.stage === 'back_room') {
      if (!ctx.flags.tookGuitar) {
        return {
          msgs: [
            { delay: 700, text: 'うん、ありがとう' },
            { delay: 2200, text: 'まず、このギターを取った方がいいかな' },
          ],
        };
      }
      if (!ctx.flags.readMemo) {
        return {
          msgs: [
            { delay: 700, text: 'うん、暗いね' },
            { delay: 2200, text: '床に何か落ちてる気がする' },
            { delay: 2400, text: '明るくして、見ようかな' },
          ],
        };
      }
      return {
        msgs: [
          { delay: 700, text: 'うん、頭の整理する' },
          { delay: 2200, text: '篠田……チューニング担当だった' },
          { delay: 2400, text: '私、何すればいいかな？' },
        ],
      };
    }
    // 第1幕
    if (!ctx.flags.seenMirror && !ctx.flags.foundBgm) {
      return {
        msgs: [
          { delay: 700, text: 'ありがとう' },
          { delay: 2200, text: '何かヒント、欲しいな' },
          { delay: 2400, text: '上下左右、見てみる？' },
          { delay: 2200, text: '掲示板とか、機械とかも気になる' },
        ],
      };
    }
    if (ctx.flags.alphaPlayed && ctx.stage !== 'back_room') {
      return {
        msgs: [
          { delay: 700, text: 'うん、奥のドア開いた' },
          { delay: 2200, text: '中、入る？' },
        ],
      };
    }
    return {
      msgs: [
        { delay: 700, text: 'うん、続けよう' },
        { delay: 2000, text: '何か気になることある？' },
      ],
    };
  },
  disagree: () => ({
    msgs: [
      { delay: 700, text: 'そっか' },
      { delay: 2000, text: 'でも一緒に考えてくれるだけで、助かる' },
      { delay: 2400, text: 'まず何できるか、整理する？' },
    ],
  }),
  hint_request: (ctx) => {
    // 進行度に応じてヒントを出す
    if (ctx.stage === 'back_room') {
      if (!ctx.flags.tookGuitar) {
        return {
          msgs: [
            { delay: 700, text: 'ヒント……' },
            { delay: 2200, text: 'ここ、奥の部屋。ギターが立てかけてある' },
            { delay: 2400, text: '取ってみる？' },
          ],
        };
      }
      if (!ctx.flags.lightOn) {
        return {
          msgs: [
            { delay: 700, text: 'ヒント……' },
            { delay: 2200, text: 'ここ、ちょっと暗い' },
            { delay: 2400, text: 'スマホのライト、つけられる？' },
          ],
        };
      }
      if (!ctx.flags.readMemo) {
        return {
          msgs: [
            { delay: 700, text: '床、もう一回見てみる？' },
            { delay: 2200, text: '何か紙が落ちてる気がする' },
          ],
        };
      }
      if (!ctx.flags.tunedGuitar) {
        return {
          msgs: [
            { delay: 700, text: '……篠田、チューニング担当だった' },
            { delay: 2200, text: 'チューナーは「A=440Hz」で固まってた' },
            { delay: 2400, text: 'ギター、合わせてみる？' },
          ],
        };
      }
      return {
        msgs: [
          { delay: 700, text: 'チューニング、合った' },
          { delay: 2200, text: '何かコード、弾いてみる？' },
        ],
      };
    }
    // 第1幕
    if (!ctx.flags.seenPhoto) {
      return {
        msgs: [
          { delay: 700, text: 'まず、店内を見てみよう' },
          { delay: 2200, text: '「写真撮って」って言ってくれれば、送るよ' },
        ],
      };
    }
    if (!ctx.flags.seenMirror) {
      return {
        msgs: [
          { delay: 700, text: 'ヒント……' },
          { delay: 2200, text: '上下左右、見回してみる？' },
          { delay: 2400, text: '壁に古い鏡があるよ' },
        ],
      };
    }
    if (!ctx.flags.breathedOnMirror && ctx.flags.seenMirror) {
      return {
        msgs: [
          { delay: 700, text: '鏡、薄っすら文字が浮かんでる' },
          { delay: 2400, text: 'もっとはっきり見るには……息かけてみる？' },
        ],
      };
    }
    if (!ctx.flags.foundBgm) {
      return {
        msgs: [
          { delay: 700, text: '210と220Hzを合わせる、って書いてあった' },
          { delay: 2400, text: '音を流す装置、ない？' },
          { delay: 2400, text: 'カウンターの下とか、探してみて' },
        ],
      };
    }
    if (!ctx.flags.bgmPowered) {
      return {
        msgs: [
          { delay: 700, text: 'BGM装置、見つけた' },
          { delay: 2400, text: '電源、入れてみる？' },
        ],
      };
    }
    if (!ctx.flags.alphaPlayed) {
      return {
        msgs: [
          { delay: 700, text: 'プリセット、選べる' },
          { delay: 2400, text: 'レシートの「2ch L/R別」「±10Hz」と合うもの' },
          { delay: 2400, text: '3番のDeep Sleepかな？' },
        ],
      };
    }
    return {
      msgs: [
        { delay: 700, text: '奥のドア、開いた' },
        { delay: 2200, text: '中、入ってみる？' },
      ],
    };
  },
  // 初期探索
  photo: (ctx) => ({
    msgs: [
      { delay: 700, text: 'ちょっと待って' },
      { delay: 2000, text: '撮った', image: getImageId('A1', ctx.loopCount) },
      { delay: 1800, text: '今気付いたけど、BGMも止まってる' },
    ],
    setFlag: 'seenPhoto',
  }),
  selfie: (ctx) => ({
    msgs: [
      { delay: 700, text: '自撮り？まあいいけど' },
      { delay: 2000, text: '', image: getImageId('C2', ctx.loopCount) },
      { delay: 1500, text: 'こんな感じ' },
    ],
    setFlag: 'seenSelfie',
  }),
  clock: () => ({
    msgs: [
      { delay: 700, text: '撮った', image: 'A1-Clock' },
      { delay: 2000, text: '2:14で止まってる、秒針も動かない' },
    ],
  }),
  mirror: (ctx) => ({
    msgs: ctx.flags.breathedOnMirror
      ? [
          { delay: 700, text: '鏡を撮った', image: 'L1' },
          { delay: 2400, text: '「210 と 220 を 合 わ せ て」' },
          { delay: 2200, text: 'はっきり読める' },
        ]
      : [
          { delay: 700, text: '……' },
          { delay: 2000, text: '映ってない' },
          { delay: 1500, text: '私だけ' },
          { delay: 1800, text: '後ろの椅子は普通に映ってる' },
          { delay: 2400, text: '何か……薄く文字みたいなのが、', image: 'L1-1' },
          { delay: 2200, text: '「220 と」だけ読める' },
        ],
    setFlag: 'seenMirror',
  }),
  mirror_breathe: (ctx) => ({
    msgs: ctx.flags.seenMirror
      ? [
          { delay: 700, text: '鏡に息かけてみた' },
          { delay: 2200, text: '曇った……文字が浮かんでくる', image: 'L1' },
          { delay: 2400, text: '「210 と 220 を 合 わ せ て」' },
          { delay: 2400, text: '全部読めた' },
        ]
      : [
          { delay: 700, text: 'まず鏡を見つけないと' },
        ],
    setFlag: 'breathedOnMirror',
  }),
  board: () => ({
    msgs: [
      { delay: 700, text: '掲示板撮った', image: 'A6-α' },
      { delay: 2400, text: 'いろいろ貼ってある' },
      { delay: 2200, text: '「α-life 休業のお知らせ」「店長行方不明」' },
      { delay: 2200, text: 'ピアノ調律師の求人' },
      { delay: 2400, text: '町内会のお知らせ、ごみの分別……' },
      { delay: 2200, text: '普通のコインランドリーの掲示板' },
    ],
    setFlag: 'seenBoard',
  }),
  door_check: () => ({
    msgs: [
      { delay: 700, text: '自動ドア、センサー反応しない' },
      { delay: 2000, text: '手で押してもダメ' },
      { delay: 2200, text: '奥にスタッフ用のドアもあるけど、暗証パネルが赤いランプ' },
    ],
    setFlag: 'checkedDoor',
  }),
  whatsee: () => ({
    msgs: [
      { delay: 800, text: '蛍光灯、洗濯機、長椅子' },
      { delay: 2000, text: '奥にスタッフ用のドア' },
      { delay: 1800, text: '受付カウンター、掲示板、自動販売機' },
      { delay: 2000, text: '壁に古い鏡' },
    ],
  }),
  // 上下左右
  look_up: () => ({
    msgs: [
      { delay: 800, text: '天井見上げた' },
      { delay: 2000, text: '蛍光灯、薄汚れたシミ' },
      { delay: 2200, text: '……「2:14」って読める' },
      { delay: 1800, text: '気のせいかも' },
    ],
  }),
  look_down: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? (ctx.flags.lightOn
          ? [
              { delay: 700, text: '床に紙がある、明るくなった', image: 'D2' },
              { delay: 2400, text: '読める……顧問の手記みたい' },
              { delay: 2400, text: '「篠田は今日も全員のチューニングを丁寧に合わせていた」' },
              { delay: 2400, text: '「俺がやらないと みんなの音が揃わないから」' },
              { delay: 2400, text: '「あいつが消えてから 誰も引き継げない」' },
              { delay: 2400, text: '「ライブは中止になった」' },
              { delay: 2200, text: '軽音部顧問 田島' },
            ]
          : [
              { delay: 700, text: '床に何かある', image: 'D2-Dark' },
              { delay: 2200, text: '紙……でも暗くて読めない' },
              { delay: 2000, text: 'もっと明るくしないと' },
            ])
      : [
          { delay: 800, text: '床を見た' },
          { delay: 2000, text: 'リノリウムの床、すり減ってる' },
          { delay: 2200, text: 'チョークの跡みたいな……「眠れない」って読める' },
        ],
    setFlag: ctx.stage === 'back_room' && ctx.flags.lightOn ? 'readMemo' : null,
  }),
  look_left: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: '左の壁見た' },
          { delay: 2000, text: 'コード表のメモ書きが貼ってある' },
          { delay: 2200, text: '簡単なコードが羅列されてるだけ' },
        ]
      : [
          { delay: 700, text: '左を見た……鏡がある' },
          { delay: 2000, text: '鏡を撮るね', image: 'L1-1' },
          { delay: 2400, text: '……何か薄く浮いてる、「220 と」だけ読める' },
          { delay: 2200, text: '残りは曇ってて見えない' },
        ],
    setFlag: ctx.stage !== 'back_room' ? 'seenMirror' : null,
  }),
  look_right: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: '右を見た' },
          { delay: 2000, text: '空のギターケース' },
          { delay: 2200, text: '中身は……ない' },
        ]
      : [
          { delay: 700, text: '右の洗濯機の上を見た' },
          { delay: 2000, text: '判読不能な走り書き' },
          { delay: 2200, text: '誰かが書いた跡だけ残ってる' },
        ],
  }),
  // 機械
  machine_1: (ctx) => {
    const layer = ctx.machineLayers['1'];
    if (ctx.foldedMachines.has('1')) {
      return { msgs: [{ delay: 700, text: '1番機はもう開けた、畳んだ後' }] };
    }
    const layers = [
      [
        { delay: 700, text: '1番機、回ってる' },
        { delay: 2000, text: '高校のジャージ、3年A組のゼッケン' },
        { delay: 2200, text: 'もっと探ってみる？' },
      ],
      [
        { delay: 700, text: 'ポケット探る' },
        { delay: 2000, text: 'チューナーが出てきた', image: 'B1-Tuner' },
        { delay: 2400, text: '「A=440Hz」で固まってる、メーターど真ん中' },
      ],
      [
        { delay: 700, text: 'もっと深く見る' },
        { delay: 2200, text: '楽譜の切れ端、写真送る', image: 'B1-3' },
        { delay: 2400, text: 'ただの五線譜、何か走り書きはない' },
      ],
    ];
    return {
      msgs: layers[layer] || [{ delay: 700, text: '中身、もう何もない' }],
      incrementMachine: '1',
    };
  },
  machine_2: (ctx) => {
    const layer = ctx.machineLayers['2'];
    if (ctx.foldedMachines.has('2')) {
      return { msgs: [{ delay: 700, text: '2番機はもう開けた、畳んだ後' }] };
    }
    const layers = [
      [
        { delay: 700, text: '2番機、回ってる' },
        { delay: 2000, text: 'ヨガパンツ、汗の匂い' },
      ],
      [
        { delay: 700, text: 'ポケット' },
        { delay: 2000, text: 'イヤホンと、しおり' },
      ],
      [
        { delay: 700, text: 'しおりを撮った、見て', image: 'B2-3' },
        { delay: 2400, text: '「α波で深い眠りへ」' },
        { delay: 2200, text: '不眠症の本のしおり' },
      ],
    ];
    return {
      msgs: layers[layer] || [{ delay: 700, text: '中身、もう何もない' }],
      incrementMachine: '2',
    };
  },
  machine_3: (ctx) => {
    const layer = ctx.machineLayers['3'];
    if (ctx.foldedMachines.has('3')) {
      return { msgs: [{ delay: 700, text: '3番機はもう開けた、畳んだ後' }] };
    }
    const layers = [
      [
        { delay: 700, text: '3番機、回ってる' },
        { delay: 2000, text: 'スーツのジャケット' },
      ],
      [
        { delay: 700, text: '内ポケット、名刺' },
        { delay: 2200, text: 'よく読めない……苗字がかろうじて' },
        { delay: 1800, text: 'お客さんの忘れ物っぽい' },
      ],
      [
        { delay: 700, text: '名刺の裏も見てみる', image: 'B3-3-α' },
        { delay: 2400, text: '滲んでる、読めない' },
        { delay: 2200, text: '誰かの……仕事関係の人かな' },
      ],
    ];
    return {
      msgs: layers[layer] || [{ delay: 700, text: '中身、もう何もない' }],
      incrementMachine: '3',
    };
  },
  machine_back: (ctx) => {
    // 「裏を見て」アクション、最後に開けた機械の裏面を見る
    return {
      msgs: [
        { delay: 700, text: 'どの裏？' },
        { delay: 2000, text: '1番機、2番機、3番機？' },
      ],
    };
  },
  fold: (ctx) => {
    // 直近に開けた機械を畳む（簡易実装）
    return {
      msgs: [
        { delay: 700, text: 'どれ畳む？' },
        { delay: 2000, text: '畳むなら機械の番号教えて' },
      ],
    };
  },
  // カウンター下のBGM装置
  counter_under: () => ({
    msgs: [
      { delay: 700, text: 'カウンターの下、覗き込む' },
      { delay: 2200, text: '撮った', image: 'A8-Counter' },
      { delay: 2400, text: '古いアンプとCDプレイヤー、配線ぐちゃぐちゃ' },
      { delay: 2200, text: '電源は切れてる' },
    ],
    setFlag: 'foundBgm',
  }),
  bgm_power: (ctx) => ({
    msgs: ctx.flags.foundBgm
      ? [
          { delay: 700, text: '電源入れた' },
          { delay: 2200, text: '画面ついた、プリセット選べる', image: 'A8-Counter-Menu' },
          { delay: 2400, text: '1. Morning Healing / 432Hz Ambient' },
          { delay: 2200, text: '2. Relaxation / 528Hz Piano' },
          { delay: 2200, text: '3. Deep Sleep / 210Hz + 220Hz Binaural' },
          { delay: 2200, text: '4. Focus Boost / 680Hz High Freq' },
          { delay: 2400, text: 'どれにする？' },
        ]
      : [
          { delay: 700, text: 'まずBGM装置を見つけないと' },
        ],
    setFlag: 'bgmPowered',
  }),
  // カウンター上の決済端末
  counter_terminal: () => ({
    msgs: [
      { delay: 700, text: 'カウンター上の決済端末', image: 'A8-Terminal' },
      { delay: 2400, text: 'メニュー出てる' },
      { delay: 2200, text: '1. 決済 / 2. 取消 / 3. 再印字' },
      { delay: 2200, text: 'どれ押す？' },
    ],
    setFlag: 'seenTerminal',
  }),
  terminal_3: () => ({
    msgs: [
      { delay: 700, text: '3番押した、再印字' },
      { delay: 2200, text: 'レシート出てきた', image: 'A8-Receipt' },
      { delay: 2400, text: '「PAYMENT TERMINAL #αN-440」' },
      { delay: 2400, text: '「端末: αN/440-C」「日時 02:14」' },
      { delay: 2400, text: '「決済音響: 2ch L/R別」' },
      { delay: 2400, text: '「推奨帯: 200-250Hz」「許容差: ±10Hz」' },
    ],
    setFlag: 'gotReceipt',
  }),
  // α波再生（正解）
  bgm_play_alpha: (ctx) => ({
    msgs: ctx.flags.bgmPowered
      ? [
          { delay: 700, text: '3番、選んだ' },
          { delay: 2200, text: 'Deep Sleep……再生してる' },
          { delay: 2400, text: '低い、深い音が左右から重なって響く' },
          { delay: 3000, text: '……', wait: true },
          { delay: 2400, text: '蛍光灯のチラつき、止まった' },
          { delay: 2400, text: 'ベンチに、女の人が横たわってる', image: 'X10' },
          { delay: 2400, text: '半透明……眠ってる、もう動かない' },
          { delay: 2400, text: '奥のドアが「カチッ」って開いた音' },
        ]
      : [
          { delay: 700, text: 'まずBGM装置の電源を入れないと' },
        ],
    setFlag: 'alphaPlayed',
    triggerStage: 'after_alpha',
  }),
  // 奥のドア
  open_door: (ctx) => ({
    msgs: ctx.flags.alphaPlayed
      ? [
          { delay: 700, text: '奥のドア、押してみる' },
          { delay: 2200, text: '開いた', image: 'A9-Door-Open' },
          { delay: 2400, text: '中、真っ暗' },
          { delay: 2400, text: '入る？' },
        ]
      : [
          { delay: 700, text: 'ドア開かない' },
          { delay: 2200, text: '暗証パネルの赤いランプ、消えてない' },
          { delay: 2400, text: '何か条件があるはず' },
        ],
    triggerDie: !ctx.flags.alphaPlayed && ctx.flags.checkedDoor && ctx.tries > 2,
  }),
  // 奥の部屋へ移動
  go_back_room: (ctx) => ({
    msgs: ctx.flags.alphaPlayed
      ? [
          { delay: 700, text: '中に入る' },
          { delay: 2400, text: '空気が変わった', image: 'E1' },
          { delay: 2400, text: '古い倉庫みたい、ギターが立てかけてある' },
          { delay: 2400, text: '床に紙くずが散らばってる' },
        ]
      : [
          { delay: 700, text: 'ドアが開いてない、まだ入れない' },
        ],
    triggerStage: 'back_room',
    resetTimer: true,
  }),
  // 奥の部屋でギター
  guitar_take: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: 'ギター取った', image: 'E2' },
          { delay: 2400, text: '弦は張ってる、でも……' },
          { delay: 2400, text: '音、変。チューニングが狂ってる' },
          { delay: 2400, text: '2弦が切れて垂れてる' },
        ]
      : [
          { delay: 700, text: 'ここにギターはない' },
        ],
    setFlag: 'tookGuitar',
  }),
  // ライトで照らす
  use_light: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: 'スマホのライトつけた' },
          { delay: 2200, text: '床、明るくなった' },
          { delay: 2400, text: '紙が見える、何か書いてある' },
          { delay: 2200, text: '「下を見て」で読める' },
        ]
      : [
          { delay: 700, text: 'うん、つけた' },
          { delay: 2000, text: 'でもここ、全部明るい' },
        ],
    setFlag: ctx.stage === 'back_room' ? 'lightOn' : null,
  }),
  // チューニング
  tune_guitar: (ctx) => ({
    msgs: (ctx.flags.tookGuitar && ctx.flags.readMemo)
      ? [
          { delay: 700, text: 'A=440Hzで合わせる' },
          { delay: 2400, text: '6弦から……' },
          { delay: 2400, text: '5弦……' },
          { delay: 2400, text: '4弦……' },
          { delay: 2400, text: '3弦……' },
          { delay: 2400, text: '2弦は切れてるから、残り合わせる' },
          { delay: 2400, text: '1弦……' },
          { delay: 2400, text: '全部、揃った' },
          { delay: 2400, text: '篠田の代わりに、できた気がする' },
        ]
      : !ctx.flags.tookGuitar
      ? [{ delay: 700, text: 'まずギター取らないと' }]
      : [
          { delay: 700, text: 'どう合わせればいいか分からない' },
          { delay: 2200, text: '基準音、誰か教えて' },
        ],
    setFlag: 'tunedGuitar',
  }),
  // Aコード演奏（クリア）
  play_a_chord: (ctx) => ({
    msgs: ctx.flags.tunedGuitar
      ? [
          { delay: 700, text: 'Aコード、弾く' },
          { delay: 2400, text: '……' },
          { delay: 2400, text: '響いた' },
          { delay: 3000, text: 'ラの音、綺麗に' },
          { delay: 2400, text: '空気が、軽くなった' },
          { delay: 2400, text: '頭の重さ、消えた' },
          { delay: 2400, text: '私、出られる気がする' },
          { delay: 2400, text: '……ありがとう' },
        ]
      : ctx.flags.tookGuitar
      ? [
          { delay: 700, text: 'チューニングしてないのに弾けない' },
          { delay: 2200, text: '音が割れる、おかしい' },
        ]
      : [{ delay: 700, text: 'まずギター取って、合わせないと' }],
    triggerStage: ctx.flags.tunedGuitar ? 'end_true' : null,
  }),
  // 即死パターン
  die_terminal_1: () => ({
    msgs: [
      { delay: 700, text: '1番、決済を押した' },
      { delay: 2200, text: '……何か始まった' },
      { delay: 2400, text: 'ピッ、ピッ、ピッ、ピッ', isGlitch: true },
      { delay: 2400, text: '額に何か巻きつい──', isGlitch: true },
    ],
    triggerStage: 'end_bad_a',
  }),
  die_terminal_2: () => ({
    msgs: [
      { delay: 700, text: '2番、取消を押した' },
      { delay: 2200, text: '画面が真っ赤になった' },
      { delay: 2400, text: '取り消されるって、私が？' },
      { delay: 2400, text: 'ｱ──', isGlitch: true },
    ],
    triggerStage: 'end_bad_a',
  }),
  die_bgm_1: () => ({
    msgs: [
      { delay: 700, text: '1番、Morning Healing' },
      { delay: 2200, text: '432Hz……' },
      { delay: 2400, text: '頭が、割れる' },
      { delay: 2400, text: 'ｲﾔ ｲﾔ ｲﾔﾀﾞ', isGlitch: true },
    ],
    triggerStage: 'end_bad_a',
  }),
  die_bgm_2: () => ({
    msgs: [
      { delay: 700, text: '2番、Relaxation' },
      { delay: 2200, text: '528Hz……ピアノの音' },
      { delay: 2400, text: '違う、これじゃない' },
      { delay: 2400, text: 'ｱｱｱｱｱｱｱ', isGlitch: true },
    ],
    triggerStage: 'end_bad_a',
  }),
  die_bgm_4: () => ({
    msgs: [
      { delay: 700, text: '4番、Focus Boost' },
      { delay: 2200, text: '680Hz……高い音' },
      { delay: 2400, text: '耳が、痛い' },
      { delay: 2400, text: 'ｺﾅｲﾃﾞ──', isGlitch: true },
    ],
    triggerStage: 'end_bad_a',
  }),
  die_wrong_chord: () => ({
    msgs: [
      { delay: 700, text: 'コード弾いた' },
      { delay: 2200, text: '……違う' },
      { delay: 2400, text: '空気が硬くなった' },
      { delay: 2400, text: '篠田の影、こっち向いた', isGlitch: true },
      { delay: 2400, text: 'ｺﾚｼﾞｬﾅｲ', isGlitch: true },
    ],
    triggerStage: 'end_bad_b',
  }),
  die_turn_around: () => ({
    msgs: [
      { delay: 700, text: '……振り向く' },
      { delay: 2400, text: 'ｱ', isGlitch: true },
      { delay: 2400, text: 'ｱｱｱｱ', isGlitch: true },
      { delay: 2400, text: 'ﾐﾗﾚﾀ', isGlitch: true, isFading: true },
    ],
    triggerStage: 'end_bad_b',
  }),
  die_break_mirror: () => ({
    msgs: [
      { delay: 700, text: '鏡を割る' },
      { delay: 2400, text: '破片、落ちた' },
      { delay: 2400, text: 'そして……', isGlitch: true },
      { delay: 2400, text: '中から', isGlitch: true },
    ],
    triggerStage: 'end_bad_b',
  }),
  die_scream: () => ({
    msgs: [
      { delay: 700, text: '叫んだ' },
      { delay: 2400, text: '声が、響いた' },
      { delay: 2400, text: '何かに、聞かれた', isGlitch: true },
    ],
    triggerStage: 'end_bad_b',
  }),
  die_breaker: () => ({
    msgs: [
      { delay: 700, text: 'ブレーカー、落とした' },
      { delay: 2400, text: '真っ暗' },
      { delay: 2400, text: '見えない……何かが、近い', isGlitch: true },
    ],
    triggerStage: 'end_bad_b',
  }),
  // 雑談
  chitchat: () => ({
    msgs: [
      { delay: 700, text: 'うん、まあ' },
      { delay: 2000, text: 'でも今、ちょっと余裕ない' },
      { delay: 2200, text: '助けて、考えて' },
    ],
  }),
  // 共通
  wellbeing: () => ({
    msgs: [
      { delay: 800, text: '頭は重い' },
      { delay: 2000, text: 'でもまだ平気' },
      { delay: 1800, text: '君のほうが心配そう' },
    ],
  }),
  comfort: () => ({
    msgs: [
      { delay: 800, text: 'ありがとう' },
      { delay: 1800, text: '一回深呼吸する' },
      { delay: 2200, text: '……うん、続けよう' },
    ],
  }),
};

// =============================================================================
// タイマー警告メッセージ
// =============================================================================
const TIMEOUT_WARNINGS = {
  early: [ // 3:00 (150秒経過)
    { delay: 1000, text: 'ねぇ、寒くなってきた' },
    { delay: 2200, text: '空気が、薄い気がする' },
  ],
  mid: [ // 3:30 (210秒経過)
    { delay: 1000, text: '頭、おかしい' },
    { delay: 2200, text: '視界がチカチカしてる' },
    { delay: 2400, text: '君、急いで' },
  ],
  late: [ // 4:00 (240秒経過)
    { delay: 1000, text: 'お願い、何か思いついて' },
    { delay: 2200, text: 'いや、いやだ' },
    { delay: 2400, text: 'ここで終わるの? 私?' },
  ],
  panic: [ // 4:30 (270秒経過)
    { delay: 1000, text: 'ねぇ! 助けて!' },
    { delay: 2200, text: '来る、何か来てる' },
    { delay: 2400, text: '振り向きたくない、振り向きたくない' },
    { delay: 2400, text: '君、いるよね? いるよね??' },
  ],
  collapse: [ // 4:45 (285秒経過)
    { delay: 1000, text: 'ｲﾔﾀﾞ ｲﾔﾀﾞ ｺﾅｲﾃﾞ', isGlitch: true },
    { delay: 2200, text: 'ﾀｽｹﾃ ｵﾈｶﾞｲ', isGlitch: true },
  ],
  back_panic: [ // 第2幕 4:00
    { delay: 1000, text: '君、また?' },
    { delay: 2200, text: '死にたくない、絶対' },
    { delay: 2400, text: 'ｱﾙﾌｧﾉｰﾄ ﾉ ﾋﾄｼﾞｬﾅｲ?', isGlitch: true },
  ],
  back_collapse: [ // 第2幕 4:30
    { delay: 1000, text: 'ｲﾔﾀﾞ ｲﾔﾀﾞ ﾓｳ ｲﾔﾀﾞ', isGlitch: true },
    { delay: 2200, text: 'ｵﾈｶﾞｲ ｺｺﾆ ｵｲﾃｲｶﾅｲﾃﾞ', isGlitch: true },
  ],
};

// =============================================================================
// 入力 → アクション マッチング関数
// =============================================================================
const matchInput = (input, ctx) => {
  const normalized = input.toLowerCase().trim();
  
  // 各アクションのキーワードをチェック
  for (const [key, entry] of Object.entries(DICTIONARY)) {
    for (const kw of entry.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        return entry.response;
      }
    }
  }
  return null;
};

// =============================================================================
// メインコンポーネント
// =============================================================================

function YukaiLaundromat() {
  // 状態管理
  const [loopCount, setLoopCount] = useState(1);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [stage, setStage] = useState('intro'); // intro / explore / after_alpha / back_room / end_*
  const [inputText, setInputText] = useState('');
  const [isLocked, setIsLocked] = useState(true); // 入力ロック
  const [exploreStart, setExploreStart] = useState(null);
  const [backRoomStart, setBackRoomStart] = useState(null);
  const [tries, setTries] = useState(0);
  
  const [flags, setFlags] = useState({
    seenPhoto: false, seenSelfie: false, seenClock: false,
    seenMirror: false, breathedOnMirror: false,
    seenBoard: false, checkedDoor: false,
    foundBgm: false, bgmPowered: false, alphaPlayed: false,
    seenTerminal: false, gotReceipt: false,
    tookGuitar: false, lightOn: false, readMemo: false, tunedGuitar: false,
  });
  const [machineLayers, setMachineLayers] = useState({ '1': 0, '2': 0, '3': 0 });
  const [foldedMachines, setFoldedMachines] = useState(new Set());

  // 演出系状態
  const [crisis, setCrisis] = useState(0); // 0=平穏 1=違和感 2=動揺 3=恐怖 4=パニック 5=崩壊
  const [battery, setBattery] = useState(80);
  const [glitchLevel, setGlitchLevel] = useState(0);

  const messagesEndRef = useRef(null);
  const queueRef = useRef([]);
  const processingRef = useRef(false);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  
  const isEnded = stage.startsWith('end_');
  const reiExpression = isEnded
    ? (stage === 'end_true' ? 1 : 5)
    : Math.min(5, Math.max(1, crisis + 1));

  // スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // メッセージキュー処理
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    
    while (queueRef.current.length > 0) {
      const msg = queueRef.current.shift();
      setIsTyping(true);
      await sleep(msg.delay || 1500);
      setIsTyping(false);
      setMessages((prev) => [...prev, {
        sender: 'rei',
        text: msg.text,
        image: msg.image,
        isGlitch: msg.isGlitch,
        isFading: msg.isFading,
        ts: Date.now(),
      }]);
      await sleep(300);
    }
    
    processingRef.current = false;
    setIsLocked(false);
  }, []);

  const queueRei = useCallback((msgs) => {
    setIsLocked(true);
    queueRef.current.push(...msgs);
    processQueue();
  }, [processQueue]);

  // 初期メッセージ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sleep(800);
      if (cancelled) return;
      queueRei(INITIAL_MESSAGES);
      // 全部送信後に explore へ
      const totalDelay = INITIAL_MESSAGES.reduce((a, m) => a + m.delay + 400, 800);
      setTimeout(() => {
        if (cancelled) return;
        setStage('explore');
        setExploreStart(Date.now());
      }, totalDelay);
    })();
    return () => { cancelled = true; };
  }, [loopCount, queueRei]);

  // タイマー（第1幕・第2幕）
  useEffect(() => {
    if (!['explore', 'after_alpha', 'back_room'].includes(stage)) return;
    const start = stage === 'back_room' ? backRoomStart : exploreStart;
    if (!start) return;
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const isBack = stage === 'back_room';
      
      // 演出段階
      if (elapsed > 90 && crisis < 1) { setCrisis(1); setBattery(50); }
      if (elapsed > 150 && crisis < 2) { setCrisis(2); setBattery(30); setGlitchLevel(1); }
      if (elapsed > 210 && crisis < 3) { 
        setCrisis(3); setBattery(15); setGlitchLevel(2);
        queueRei(isBack ? TIMEOUT_WARNINGS.late : TIMEOUT_WARNINGS.late);
      }
      if (elapsed > 240 && crisis < 4) { 
        setCrisis(4); setBattery(8); setGlitchLevel(3);
        queueRei(isBack ? TIMEOUT_WARNINGS.back_panic : TIMEOUT_WARNINGS.panic);
      }
      if (elapsed > 270 && crisis < 5) { 
        setCrisis(5); setBattery(3); setGlitchLevel(4);
        queueRei(isBack ? TIMEOUT_WARNINGS.back_collapse : TIMEOUT_WARNINGS.collapse);
      }
      
      // タイムアウト死亡
      if (elapsed > STAGE_TIME_LIMIT) {
        setStage(isBack ? 'end_bad_b' : 'end_bad_a');
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [stage, exploreStart, backRoomStart, crisis, queueRei]);

  // アクション実行
  const executeAction = useCallback((actionId) => {
    const action = ACTIONS[actionId];
    if (!action) return;

    const ctx = {
      loopCount,
      stage,
      flags,
      machineLayers,
      foldedMachines,
      tries,
    };
    const result = action(ctx);

    if (result.msgs) queueRei(result.msgs);
    if (result.setFlag) setFlags((f) => ({ ...f, [result.setFlag]: true }));
    if (result.incrementMachine) {
      setMachineLayers((m) => ({ ...m, [result.incrementMachine]: Math.min(3, (m[result.incrementMachine] || 0) + 1) }));
    }
    if (result.triggerStage) {
      setTimeout(() => {
        setStage(result.triggerStage);
        if (result.resetTimer) setBackRoomStart(Date.now());
      }, 1500);
    }
    setTries((t) => t + 1);
  }, [loopCount, stage, flags, machineLayers, foldedMachines, tries, queueRei]);

  // 辞書外のフォールバック応答（プログレス段階に応じて誘導）
  const getFallbackResponse = useCallback((ctx) => {
    const responses = [];
    
    // 第2幕での誘導
    if (ctx.stage === 'back_room') {
      if (!ctx.flags.tookGuitar) {
        responses.push([
          { delay: 700, text: 'ごめん、よく分からない' },
          { delay: 2000, text: 'まず、このギター取った方がいいかな' },
        ]);
      } else if (!ctx.flags.lightOn) {
        responses.push([
          { delay: 700, text: 'えっと……' },
          { delay: 2000, text: 'ここ、ちょっと暗いね' },
          { delay: 2200, text: '明るくしてみる？' },
        ]);
      } else if (!ctx.flags.readMemo) {
        responses.push([
          { delay: 700, text: 'うーん' },
          { delay: 2000, text: '床、もう一回見てみる？' },
        ]);
      } else if (!ctx.flags.tunedGuitar) {
        responses.push([
          { delay: 700, text: 'チューニング、合わせないと' },
          { delay: 2200, text: 'A=440Hzだったよね' },
        ]);
      } else {
        responses.push([
          { delay: 700, text: '何か、コード弾いてみる？' },
        ]);
      }
    }
    // 第1幕での誘導
    else if (!ctx.flags.seenPhoto) {
      responses.push([
        { delay: 700, text: 'ごめん、ちょっと分かんない' },
        { delay: 2200, text: 'とりあえず、店内の写真もう一回見てみる？' },
      ]);
    } else if (!ctx.flags.seenMirror) {
      responses.push([
        { delay: 700, text: 'うーん' },
        { delay: 2000, text: '上下左右、見回してみる？' },
        { delay: 2400, text: '左に古い鏡がある' },
      ]);
    } else if (!ctx.flags.breathedOnMirror) {
      responses.push([
        { delay: 700, text: '鏡の文字、もっとはっきり見たいな' },
        { delay: 2400, text: '息かけたら……出るかも' },
      ]);
    } else if (!ctx.flags.foundBgm) {
      responses.push([
        { delay: 700, text: '「210と220を合わせて」……' },
        { delay: 2400, text: '音を流す装置、ないかな' },
        { delay: 2400, text: 'カウンターの下とか、見てみる？' },
      ]);
    } else if (!ctx.flags.bgmPowered) {
      responses.push([
        { delay: 700, text: 'BGM装置あった' },
        { delay: 2200, text: '電源、入れる？' },
      ]);
    } else if (!ctx.flags.alphaPlayed) {
      responses.push([
        { delay: 700, text: 'プリセット選べる' },
        { delay: 2400, text: 'レシートの数字と合うやつ、選んでみる？' },
      ]);
    } else {
      responses.push([
        { delay: 700, text: '奥のドア、開いてる' },
        { delay: 2200, text: '中、入る？' },
      ]);
    }
    
    return responses[0] || [
      { delay: 700, text: 'ごめん、よく分からない' },
      { delay: 2000, text: 'もう少し具体的に言える？' },
    ];
  }, []);

  // 入力ハンドラ
  const handleSubmit = useCallback(() => {
    if (!inputText.trim() || isLocked || isEnded) return;
    
    const text = inputText.trim();
    setMessages((prev) => [...prev, { sender: 'user', text, ts: Date.now() }]);
    setInputText('');
    
    const ctx = {
      loopCount, stage, flags, machineLayers, foldedMachines, tries,
    };
    const actionId = matchInput(text, ctx);
    
    if (actionId) {
      executeAction(actionId);
    } else {
      // 辞書外でも玲が会話を繋ぐ（フォールバック応答）
      const fallback = getFallbackResponse(ctx);
      queueRei(fallback);
    }
  }, [inputText, isLocked, isEnded, loopCount, stage, flags, machineLayers, foldedMachines, tries, executeAction, getFallbackResponse, queueRei]);

  // リセット
  const reset = useCallback(() => {
    setLoopCount((l) => l + 1);
    setMessages([]);
    setStage('intro');
    setFlags({
      seenPhoto: false, seenSelfie: false, seenClock: false,
      seenMirror: false, breathedOnMirror: false,
      seenBoard: false, checkedDoor: false,
      foundBgm: false, bgmPowered: false, alphaPlayed: false,
      seenTerminal: false, gotReceipt: false,
      tookGuitar: false, lightOn: false, readMemo: false, tunedGuitar: false,
    });
    setMachineLayers({ '1': 0, '2': 0, '3': 0 });
    setFoldedMachines(new Set());
    setCrisis(0);
    setBattery(80);
    setGlitchLevel(0);
    setTries(0);
    setExploreStart(null);
    setBackRoomStart(null);
    queueRef.current = [];
  }, []);

  // 演出スタイル
  const vignetteIntensity = Math.min(0.8, crisis * 0.15);
  const screenStyle = {
    background: `radial-gradient(ellipse at center, transparent 30%, rgba(80,10,30,${vignetteIntensity}) 100%)`,
    filter: crisis >= 4 ? 'hue-rotate(-10deg) contrast(1.1)' : 'none',
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white relative overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center gap-3 z-10">
        <div className={`w-10 h-10 rounded-full bg-gray-700 overflow-hidden border-2 ${crisis >= 4 ? 'border-red-500' : 'border-gray-600'}`}>
          {/* アバター画像（実際は IMAGE_URIS から取得） */}
          <div className="w-full h-full flex items-center justify-center text-xs">{reiExpression}</div>
        </div>
        <div className="flex-1">
          <div className="font-bold text-sm">篠崎 玲</div>
          <div className="text-xs text-gray-400">
            {isTyping ? '入力中...' : 'オンライン'}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={battery <= 15 ? 'text-red-400' : 'text-gray-400'}>
            🔋{battery}%
          </span>
          <span className="text-gray-500">L{loopCount}</span>
        </div>
      </div>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={screenStyle}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} ${msg.isFading ? 'opacity-50' : ''}`}
          >
            <div
              className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                msg.sender === 'user'
                  ? 'bg-green-600 text-white'
                  : msg.sender === 'system'
                  ? 'bg-red-900/60 text-red-300 border border-red-700'
                  : `bg-gray-700 text-white ${msg.isGlitch ? 'font-mono tracking-wider text-red-300' : ''}`
              }`}
              style={msg.isGlitch ? { textShadow: '2px 0 #ff0040, -2px 0 #00d0ff' } : {}}
            >
              {msg.image && (
                <div className="mb-2">
                  <img
                    src={getImageUri(msg.image)}
                    alt={msg.image || 'image'}
                    className="rounded max-w-full"
                    onError={(e) => {
                      const fallback = e.target.nextSibling;
                      if (fallback) fallback.style.display = 'block';
                      e.target.style.display = 'none';
                    }}
                  />
                  <div style={{ display: 'none' }} className="text-xs text-yellow-400 p-2 bg-gray-800 rounded">
                    [画像読込失敗: {msg.image}]
                  </div>
                </div>
              )}
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400">
              入力中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* X9 BAD END 画面 */}
      {stage === 'end_bad_b' && (
        <div className="absolute inset-0 z-20 bg-black flex items-center justify-center">
          <div className="relative w-full h-full">
            <img src={getImageUri('X9')} alt="BAD END" className="w-full h-full object-cover" />
            <div className="absolute bottom-32 left-0 right-0 flex flex-col items-center gap-3">
              <button
                onClick={reset}
                className="px-8 py-2 bg-transparent text-white text-lg tracking-widest hover:bg-red-900/30 transition"
              >
                RETRY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BAD_A エンド */}
      {stage === 'end_bad_a' && (
        <div className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center">
          <div className="text-red-500 text-3xl mb-4 font-bold tracking-widest">BAD END</div>
          <div className="text-red-300 mb-8">怪異①に呑まれた</div>
          <button
            onClick={reset}
            className="px-8 py-2 border border-red-500 text-red-300 hover:bg-red-900/30 transition"
          >
            RETRY
          </button>
        </div>
      )}

      {/* TRUE END */}
      {stage === 'end_true' && (
        <div className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center">
          <div className="text-amber-300 text-3xl mb-4 tracking-widest">TRUE END</div>
          <div className="text-amber-200 mb-8">玲を救出した</div>
          <div className="text-gray-400 text-sm mb-8">α波で怪異①を眠らせ、ラの音で怪異②を許した</div>
          <button
            onClick={reset}
            className="px-8 py-2 border border-amber-400 text-amber-200 hover:bg-amber-900/30 transition"
          >
            もう一度プレイ
          </button>
        </div>
      )}

      {/* 入力エリア */}
      {!isEnded && (
        <div className="bg-gray-800 border-t border-gray-700 p-3 z-10">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={isLocked}
              placeholder={isLocked ? '玲が考えてる...' : 'メッセージを入力'}
              className="flex-1 bg-gray-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={isLocked || !inputText.trim()}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              送信
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<YukaiLaundromat />);
