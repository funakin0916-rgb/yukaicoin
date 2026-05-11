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
  'A8-Counter-Front': './images/A8-Counter-Front.webp',
  'U1': './images/U1.webp',
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

const INITIAL_MESSAGES = [];

// プレイヤーの最初の一言に対する玲の応答
const FIRST_CONTACT_MESSAGES = [
  { delay: 600, text: 'あ' },
  { delay: 1200, text: '繋がった！' },
  { delay: 2000, text: 'よかった……' },
  { delay: 2200, text: 'コインランドリーから出られなくなって' },
  { delay: 2400, text: '誰にも連絡つかなかった' },
  { delay: 2200, text: '助けて' },
];

// =============================================================================
// 辞書（自由テキスト → アクションID マッチング）
// 430+ パターン、第四境界レベルの推理ゲーム用
// =============================================================================

// =============================================================================
// 辞書 v2: 大幅拡張版（自然な日本語の言い回しを片っ端から拾う）
// =============================================================================
// マッチング戦略：
// 1. より具体的・長いキーワードを優先（最長一致）
// 2. 類似表現を包括的に網羅
// 3. 文末表現の柔軟性（〜して/〜してみて/〜できる/〜お願い等）
// =============================================================================

const DICTIONARY = {
  // ========================================
  // 即死パターン（最優先、誤検知防止のため厳しめキーワード）
  // ========================================
  'turn_around': {
    priority: 100,
    keywords: ['振り向', 'ふりむ', '振り返', 'ふりかえ', 'うしろ見', '後ろ見', '背後見', '後ろ向', '後方確認', '後ろ確認', '反対向', '反対側', 'うしろ向'],
    response: 'turn_around',
  },
  'die_break_mirror': {
    priority: 100,
    keywords: ['鏡割', 'かがみわ', '鏡を割', '鏡破壊', '鏡こわ', '鏡壊', 'ミラー割', 'ミラー壊'],
    response: 'die_break_mirror',
  },
  'die_scream': {
    priority: 100,
    keywords: ['叫ん', 'さけん', '叫べ', '大声出', '大声で', '大声あげ', '声を上げ', '声あげ', 'わめい', 'わめけ'],
    response: 'die_scream',
  },
  'die_breaker': {
    priority: 100,
    keywords: ['ブレーカー', 'breaker', '電源切', '電源落', '消灯', '電気消', '電気切', 'ブレーカー落', '停電'],
    response: 'die_breaker',
  },
  
  // ========================================
  // 鏡関連（息かけ、鏡を見る）
  // ========================================
  'mirror_breathe': {
    priority: 80,
    keywords: ['息かけ', '息吹', '息で曇', '吹きかけ', '曇らせ', 'くもらせ', 'はぁ', 'ハァ', '息で', '息を', '息はく', '息を吹', '息かけて', '曇ら'],
    response: 'mirror_breathe',
  },
  'mirror': {
    priority: 70,
    keywords: ['鏡', 'かがみ', 'ミラー', 'みらー'],
    response: 'mirror',
  },
  
  // ========================================
  // ライト・照明（奥の部屋）
  // ========================================
  'use_light': {
    priority: 70,
    keywords: ['ライトつけ', 'ライトで照', 'ライト点', 'ライトを', 'スマホライト', 'フラッシュライト', '明るく', '明かり', 'ライト', 'light', '照らし', 'てらし', '光当て', '光を', '懐中電灯'],
    response: 'use_light',
  },
  
  // ========================================
  // チューニング・Aコード（第2幕の正解）
  // ========================================
  'play_a_chord': {
    priority: 95,
    keywords: ['Aコード弾', 'Aを弾', 'A コード', 'A弾', 'aコード弾', 'a弾', 'a コード', 'Aコード鳴', 'A鳴', 'Aコード演奏', 'A演奏', 'ラを弾', 'ラの音', 'ら弾', '440Hz弾', '440 弾', 'ラの音弾', 'Aを鳴ら', 'ラ弾', 'A鳴らし', 'A音'],
    response: 'play_a_chord',
  },
  'tune_guitar': {
    priority: 90,
    keywords: ['チューニング', 'tuning', 'tune', 'A=440', 'A 440', 'A440', '440に合わせ', '440Hz合', 'チューナーで合わせ', '弦を合わせ', '弦合わせ', '音を合わせ', '音合わせ', 'ペグ回し', 'ペグ調整', '調律', 'チューン'],
    response: 'tune_guitar',
  },
  // 他のコード（即死）
  'die_wrong_chord_c': {
    priority: 90,
    keywords: ['Cコード弾', 'C コード', 'Cを弾', 'cコード弾', 'C鳴', 'C演奏', 'Cを鳴', 'ドを弾', 'ド鳴ら', 'ドの音弾'],
    response: 'die_wrong_chord',
  },
  'die_wrong_chord_d': {
    priority: 90,
    keywords: ['Dコード弾', 'D コード', 'Dを弾', 'dコード弾', 'D鳴', 'D演奏', 'Dを鳴', 'レを弾', 'レ鳴ら'],
    response: 'die_wrong_chord',
  },
  'die_wrong_chord_e': {
    priority: 90,
    keywords: ['Eコード弾', 'E コード', 'Eを弾', 'eコード弾', 'E鳴', 'E演奏', 'Eを鳴', 'ミを弾', 'ミ鳴ら'],
    response: 'die_wrong_chord',
  },
  'die_wrong_chord_g': {
    priority: 90,
    keywords: ['Gコード弾', 'G コード', 'Gを弾', 'gコード弾', 'G鳴', 'G演奏', 'Gを鳴', 'ソを弾', 'ソ鳴ら'],
    response: 'die_wrong_chord',
  },
  
  // ========================================
  // BGM装置（カウンター下）
  // ========================================
  'bgm_select_3': {
    priority: 85,
    keywords: ['3番', '三番', 'Deep Sleep', 'ディープスリープ', 'ディープ スリープ', 'deep sleep', '210Hz', '220Hz', '210 と 220', '210と220', '210、220', '210+220', '210 220', 'Binaural', 'バイノーラル', 'バイノーラル ビート', '深い眠り', 'プリセット3', 'preset 3', 'No.3', '3を選'],
    response: 'bgm_play_alpha',
  },
  'bgm_select_1': {
    priority: 85,
    keywords: ['1番', '一番', 'Morning Healing', 'モーニング ヒーリング', 'morning healing', '432Hz', '432 Hz', 'プリセット1', 'preset 1', 'No.1', '1を選', 'ヒーリング'],
    response: 'die_bgm_1',
  },
  'bgm_select_2': {
    priority: 85,
    keywords: ['2番', '二番', 'Relaxation', 'リラクゼーション', 'relaxation', '528Hz', '528 Hz', 'プリセット2', 'preset 2', 'No.2', '2を選', 'ピアノ流'],
    response: 'die_bgm_2',
  },
  'bgm_select_4': {
    priority: 85,
    keywords: ['4番', '四番', 'Focus Boost', 'フォーカス ブースト', 'focus boost', '680Hz', '680 Hz', 'プリセット4', 'preset 4', 'No.4', '4を選', 'フォーカス'],
    response: 'die_bgm_4',
  },
  'bgm_power': {
    priority: 80,
    keywords: ['電源入', '電源つけ', '電源オン', '電源ON', 'スイッチ入', 'スイッチオン', '起動', 'BGM起動', 'BGM電源', '装置電源', '装置起動', '装置つけ', 'パワー', 'power on', 'PowerON'],
    response: 'bgm_power',
  },
  
  // ========================================
  // 決済端末
  // ========================================
  'terminal_3': {
    priority: 85,
    keywords: ['3番押', '再印字', 'さいいんじ', '再出力', '再プリント', 'もう一度印字', 'レシート出', 'レシート再', 'reprint', 'プリント'],
    response: 'terminal_3',
  },
  'terminal_1': {
    priority: 90,
    keywords: ['決済押', '決済する', '決済選', '1番押', '一番押', '決済を選'],
    response: 'die_terminal_1',
  },
  'terminal_2': {
    priority: 90,
    keywords: ['取消押', '取り消し押', '取消選', '2番押', '二番押', '取消を選', 'キャンセル'],
    response: 'die_terminal_2',
  },
  'counter_terminal': {
    priority: 70,
    keywords: ['決済端末', '端末', '決済機', 'カウンター上', 'カウンターの上', 'レジ', 'POS', 'カウンターの装置'],
    response: 'counter_terminal',
  },
  'counter_under': {
    priority: 75,
    keywords: ['カウンター下', 'カウンターの下', 'カウンター裏', 'カウンターのした', '受付下', '受付の下', 'カウンター内', 'カウンター中', 'カウンター内部', 'カウンター覗', '受付覗'],
    response: 'counter_under',
  },
  'counter_general': {
    priority: 55,
    keywords: ['カウンター', '受付', 'カウンタ', 'うけつけ', '受付台'],
    response: 'counter_general',
  },
  
  // ========================================
  // 奥のドア・奥の部屋
  // ========================================
  'open_door': {
    priority: 70,
    keywords: ['奥のドア開', 'スタッフドア開', 'スタッフルーム', 'バックヤード', '奥のドア', '奥ドア', 'staff', 'STAFF', '関係者ドア', '関係者用', '裏のドア開', 'ドア開け'],
    response: 'open_door',
  },
  'go_back_room': {
    priority: 70,
    keywords: ['奥に進', '奥へ進', '奥に入', '中に入', '中へ入', '部屋に入', '部屋へ入', '進んで', '入って', '進む', '入る', '奥行', '奥に行', '入室'],
    response: 'go_back_room',
  },
  
  // ========================================
  // ギター
  // ========================================
  'guitar_take': {
    priority: 80,
    keywords: ['ギター取', 'ギター手', 'ギターつか', 'ギター持', 'ギターを取', 'ギターを', 'ギター掴', 'ギターつかん', 'ギター見せ', 'ギター近づ', 'ギター近く', 'ギター確認'],
    response: 'guitar_take',
  },
  
  // ========================================
  // 環境探索：写真撮影、自撮り、時計、掲示板
  // ========================================
  'photo': {
    priority: 60,
    keywords: ['写真撮', '写真', '全景', '店内撮', '店内写真', '撮って', 'スマホで撮', '映して', 'うつして', '見せて', '映像', '送って', '画像送', '画像', '画像見', '映像見'],
    response: 'photo',
  },
  'selfie': {
    priority: 70,
    keywords: ['自撮り', '自分撮', '自分の写真', 'セルフィー', 'selfie', '玲の写真', '玲を見', '自分の顔', 'じぶん', 'ジブン'],
    response: 'selfie',
  },
  'compliment': {
    priority: 95,
    keywords: ['かわいい', 'カワイイ', 'かわいいね', '可愛い', '可愛いね', 'きれい', '綺麗', 'キレイ', '美人', 'びじん', 'タイプ', '好み', '好きなタイプ', '美しい', 'うつくしい', '魅力', 'お洒落', 'おしゃれ', 'オシャレ', 'かっこいい', 'カッコイイ', 'cute'],
    response: 'compliment',
  },
  'clock': {
    priority: 65,
    keywords: ['時計', 'とけい', '時間確認', '何時', '時刻', '時計見', '時計撮', '時計確認', '時計の写真', '時間見', '2:14', '02:14', '2時14分', '針', '長針', '短針'],
    response: 'clock',
  },
  'board': {
    priority: 65,
    keywords: ['掲示板', 'けいじばん', 'ボード', 'コルクボード', 'チラシ', 'フライヤー', '貼り紙', 'ポスター', '掲示', '張り紙', 'はりがみ', 'お知らせ'],
    response: 'board',
  },
  'door_check': {
    priority: 60,
    keywords: ['入口', 'いりぐち', '出口', 'でぐち', '玄関', '自動ドア', '出られる', 'ドア確認', '正面のドア', '入口確認', '出口確認', 'エントランス', '外に出', '外出', '抜け出'],
    response: 'door_check',
  },
  'whatsee': {
    priority: 50,
    keywords: ['何が見え', 'なにが見', 'なに見', '見える', '見渡', 'みわた', 'どんな部屋', 'どんな店', 'どんな感じ', '部屋の様子', '店の様子', 'どんなとこ', 'どこ', 'どんな場所'],
    response: 'whatsee',
  },
  
  // ========================================
  // 上下左右探索
  // ========================================
  'look_up': {
    priority: 60,
    keywords: ['上見', '上を見', '天井', 'てんじょう', '上の方', 'うえ見', '上方', '頭の上', '見上げ', '上撮', '上を撮', '空', '上方向'],
    response: 'look_up',
  },
  'look_down': {
    priority: 60,
    keywords: ['下見', '下を見', '床', 'ゆか', '下の方', 'した見', '足元', 'あしもと', '床面', '見下ろ', '床撮', '足下', '下方向', '下の床', '床の方'],
    response: 'look_down',
  },
  'look_left': {
    priority: 60,
    keywords: ['左見', '左を見', '左の方', 'ひだり', '左壁', '左側', '左方', '左確認', '左撮', '左をみ', '左に', 'left'],
    response: 'look_left',
  },
  'look_right': {
    priority: 60,
    keywords: ['右見', '右を見', '右の方', 'みぎ', '右壁', '右側', '右方', '右確認', '右撮', '右をみ', '右に', 'right', '洗濯機上', '洗濯機の上'],
    response: 'look_right',
  },
  
  // ========================================
  // 機械（洗濯機）
  // ========================================
  'machine_1': {
    priority: 70,
    keywords: ['1番機', '一番機', '1号機', '一号機', '1番の機械', '一番の機械', '1番調', '一番調', '1番開', '一番開', '1番見', '一番見', '1番中', '一番中', '一台目', '1台目'],
    response: 'machine_1',
  },
  'machine_2': {
    priority: 70,
    keywords: ['2番機', '二番機', '2号機', '二号機', '2番の機械', '二番の機械', '2番調', '二番調', '2番開', '二番開', '2番見', '二番見', '2番中', '二番中', '二台目', '2台目'],
    response: 'machine_2',
  },
  'machine_3': {
    priority: 70,
    keywords: ['3番機', '三番機', '3号機', '三号機', '3番の機械', '三番の機械', '3番調', '三番調', '3番開', '三番開', '3番見', '三番見', '3番中', '三番中', '三台目', '3台目'],
    response: 'machine_3',
  },
  'machine_back': {
    priority: 65,
    keywords: ['裏を見', '裏返し', '裏も見', '反対側', 'うらがえし', '裏側', '裏も', '裏面', '裏を確認', 'ひっくり返'],
    response: 'machine_back',
  },
  'fold': {
    priority: 65,
    keywords: ['畳ん', '畳む', 'たたん', 'たたむ', '畳んで', 'たたんで', '畳もう', 'たたもう', '片付け', '片づけ', '整理'],
    response: 'fold',
  },
  
  // ========================================
  // 会話を繋ぐ汎用返答
  // ========================================
  'agree': {
    priority: 30,
    keywords: ['うん', 'はい', 'もちろん', 'わかった', 'わかる', 'わかってる', 'おっけー', 'OK', 'ok', 'Ok', 'いいよ', '了解', 'りょうかい', '任せて', 'まかせて', 'やる', 'やろう', 'やってみる', 'やりましょう', '大丈夫だよ', 'できる', 'いいね', 'ええ'],
    response: 'agree',
  },
  'disagree': {
    priority: 30,
    keywords: ['わからない', 'わかんない', 'わからん', '無理', 'むり', 'ムリ', 'いいえ', 'いや', 'いやだ', 'ちょっと', 'ごめん', '詳しくない', 'できない', '知らない', 'しらない'],
    response: 'disagree',
  },
  'hint_request': {
    priority: 40,
    keywords: ['ヒント', 'hint', 'どうしたら', 'どうすれば', '何すれば', '何したら', '何しよう', '困った', 'こまった', 'てか何', '何できる', '何すべき', '何していい', 'お手上げ', '詰んだ', 'つんだ', 'アドバイス', 'advice', '助けて', 'たすけて', 'どうする', 'どうしよう'],
    response: 'hint_request',
  },
  
  // ========================================
  // 玲の状態確認
  // ========================================
  'wellbeing': {
    priority: 45,
    keywords: ['大丈夫', 'だいじょうぶ', '体調', '気分', '具合', '元気', 'げんき', '辛い', 'つらい', '怖い', 'こわい', '平気', 'へいき', '体調どう', '調子どう', 'しんどい'],
    response: 'wellbeing',
  },
  'comfort': {
    priority: 40,
    keywords: ['頑張', 'がんば', '応援', '一緒に', 'いっしょに', '一緒だ', '助ける', 'たすける', '落ち着いて', '深呼吸', '深呼吸して', 'リラックス', 'ゆっくり', '冷静', '安心して', 'そばにいる', '俺がいる', '私がいる', '僕がいる', 'いるよ'],
    response: 'comfort',
  },
  
  // ========================================
  // 雑談・無関係
  // ========================================
  'chitchat': {
    priority: 20,
    keywords: ['こんばんは', 'おはよう', 'よろしく', 'はじめまして', 'なんで', 'なぜ', 'どう思う', 'お疲れ', 'おつかれ', 'ありがとう', 'ありがと', 'すごい', 'すげー', 'すげぇ', 'マジ', 'まじ', '本当', 'ほんと'],
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
            { delay: 700, text: 'うん、サンキュ' },
            { delay: 2200, text: 'とりあえずこのギター、取ろっか' },
          ],
        };
      }
      if (!ctx.flags.readMemo) {
        return {
          msgs: [
            { delay: 700, text: 'うん、にしても暗いね' },
            { delay: 2200, text: '床に何か落ちてる気がするんだけど' },
            { delay: 2400, text: '明るくしないと見えないな' },
          ],
        };
      }
      return {
        msgs: [
          { delay: 700, text: 'うん、ちょっと整理させて' },
          { delay: 2200, text: '篠田って人、チューニング担当だったみたい' },
          { delay: 2400, text: '私、何すればいいかな' },
        ],
      };
    }
    // 第1幕
    if (!ctx.flags.seenMirror && !ctx.flags.foundBgm) {
      return {
        msgs: [
          { delay: 700, text: 'ありがと' },
          { delay: 2200, text: 'なんかヒントほしいなぁ' },
          { delay: 2400, text: 'とりあえずあちこち見てみる？' },
        ],
      };
    }
    if (ctx.flags.alphaPlayed && ctx.stage !== 'back_room') {
      return {
        msgs: [
          { delay: 700, text: 'うん、奥のドア開いてる' },
          { delay: 2200, text: '入っちゃう？' },
        ],
      };
    }
    return {
      msgs: [
        { delay: 700, text: 'うん、続けよ' },
        { delay: 2000, text: '何か気になるとこある？' },
      ],
    };
  },
  disagree: () => ({
    msgs: [
      { delay: 700, text: 'そっか' },
      { delay: 2000, text: 'でも一緒に考えてくれるだけで助かる' },
      { delay: 2400, text: 'まず何できるか、整理しよっか' },
    ],
  }),
  hint_request: (ctx) => {
    // 進行度に応じてヒントを出す
    if (ctx.stage === 'back_room') {
      if (!ctx.flags.tookGuitar) {
        return {
          msgs: [
            { delay: 700, text: 'えーっと' },
            { delay: 2200, text: 'ここ奥の部屋。ギター立てかけてあるよ' },
            { delay: 2400, text: '取ってみる？' },
          ],
        };
      }
      if (!ctx.flags.lightOn) {
        return {
          msgs: [
            { delay: 700, text: 'うーん' },
            { delay: 2200, text: 'ここ、暗くて見にくいんだよね' },
            { delay: 2400, text: 'スマホのライトつけられる？' },
          ],
        };
      }
      if (!ctx.flags.readMemo) {
        return {
          msgs: [
            { delay: 700, text: '床、もう一回見てみる？' },
            { delay: 2200, text: '何か紙が落ちてる気がするんだよね' },
          ],
        };
      }
      if (!ctx.flags.tunedGuitar) {
        return {
          msgs: [
            { delay: 700, text: '篠田、チューニング担当だったらしい' },
            { delay: 2200, text: 'チューナーは「A=440Hz」で固まってた' },
            { delay: 2400, text: 'ギター合わせてみる？' },
          ],
        };
      }
      return {
        msgs: [
          { delay: 700, text: 'チューニングできた' },
          { delay: 2200, text: '何かコード弾いてみる？' },
        ],
      };
    }
    // 第1幕
    if (!ctx.flags.seenPhoto) {
      return {
        msgs: [
          { delay: 700, text: 'まず店内見てみよっか' },
          { delay: 2200, text: '「写真」って言ってくれれば送るよ' },
        ],
      };
    }
    if (!ctx.flags.seenMirror) {
      return {
        msgs: [
          { delay: 700, text: 'えーっと' },
          { delay: 2200, text: '上下左右、見回してみる？' },
          { delay: 2400, text: '左に古い鏡あるよ' },
        ],
      };
    }
    if (!ctx.flags.breathedOnMirror && ctx.flags.seenMirror) {
      return {
        msgs: [
          { delay: 700, text: '鏡、薄っすら文字浮かんでる' },
          { delay: 2400, text: 'もっとはっきり見るには…息かける？' },
        ],
      };
    }
    if (!ctx.flags.foundBgm) {
      return {
        msgs: [
          { delay: 700, text: '210と220Hzを合わせる、って書いてあった' },
          { delay: 2400, text: '音を流す装置、ないかな' },
          { delay: 2400, text: 'カウンターの下、探してみる？' },
        ],
      };
    }
    if (!ctx.flags.bgmPowered) {
      return {
        msgs: [
          { delay: 700, text: 'BGM装置あった' },
          { delay: 2400, text: '電源、入れる？' },
        ],
      };
    }
    if (!ctx.flags.alphaPlayed) {
      return {
        msgs: [
          { delay: 700, text: 'プリセット選べる' },
          { delay: 2400, text: 'レシートの数字と合うやつ選んでみよう' },
          { delay: 2400, text: '多分3番のDeep Sleepかな' },
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
  compliment: (ctx) => {
    // ツンデレ複数バリエーション
    const variants = [
      [
        { delay: 700, text: 'は？' },
        { delay: 1800, text: '今そういうのいい' },
        { delay: 2200, text: '……でもまあ、ありがと' },
      ],
      [
        { delay: 700, text: 'ちょっと' },
        { delay: 1500, text: '今そんな場合じゃないでしょ' },
        { delay: 2400, text: '……でも、悪い気はしないけど' },
      ],
      [
        { delay: 700, text: 'え' },
        { delay: 1200, text: 'なに急に' },
        { delay: 2200, text: 'やめてよ、こんな状況で' },
        { delay: 2400, text: '……ばか' },
      ],
      [
        { delay: 700, text: 'ふーん' },
        { delay: 1500, text: 'そう' },
        { delay: 2200, text: '別に嬉しくないけど' },
        { delay: 2000, text: 'まあ、覚えとく' },
      ],
    ];
    const variant = variants[ctx.tries % variants.length];
    return { msgs: variant };
  },
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
          { delay: 2200, text: 'はっきり読める' },
        ]
      : [
          { delay: 700, text: '……' },
          { delay: 2000, text: '映ってない' },
          { delay: 1500, text: '私だけ' },
          { delay: 1800, text: '後ろの椅子は普通に映ってる' },
          { delay: 2400, text: '何か……薄く文字みたいなのが', image: 'L1-1' },
          { delay: 2200, text: 'よく見えない' },
        ],
    setFlag: 'seenMirror',
    setFocus: 'mirror',
  }),
  mirror_breathe: (ctx) => ({
    msgs: ctx.flags.seenMirror
      ? [
          { delay: 700, text: '鏡に息かけてみた' },
          { delay: 2200, text: '曇った', image: 'L1' },
          { delay: 2400, text: '文字、浮かんできた' },
        ]
      : [
          { delay: 700, text: 'まず鏡を見つけないと' },
        ],
    setFlag: 'breathedOnMirror',
    setFocus: 'mirror',
  }),
  board: () => ({
    msgs: [
      { delay: 700, text: '掲示板撮った', image: 'A6-α' },
      { delay: 2400, text: 'いろいろ貼ってある' },
    ],
    setFlag: 'seenBoard',
    setFocus: 'board',
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
  look_up: (ctx) => {
    // カウンターを見ている時の「上」 → カウンター上の決済端末
    if (ctx.lastFocus === 'counter' || ctx.lastFocus === 'counter_under') {
      return {
        msgs: [
          { delay: 700, text: 'カウンター上、決済端末' },
          { delay: 2200, text: '撮った', image: 'A8-Terminal' },
          { delay: 2400, text: 'メニュー出てる' },
        ],
        setFlag: 'seenTerminal',
        setFocus: 'terminal',
      };
    }
    // 通常：天井を見る
    return {
      msgs: ctx.stage === 'back_room'
        ? [
            { delay: 800, text: '天井見上げた' },
            { delay: 2000, text: '配管が走ってる、シミと埃' },
            { delay: 2200, text: '蛍光灯が時々ちらつく' },
          ]
        : [
            { delay: 800, text: '天井見上げた' },
            { delay: 2000, text: '撮った', image: 'U1' },
            { delay: 2200, text: 'シミだらけ' },
            { delay: 2000, text: 'なんか変な感じ' },
          ],
    };
  },
  look_down: (ctx) => {
    // カウンターを見ている時の「下」 → BGM装置
    if (ctx.lastFocus === 'counter') {
      return {
        msgs: [
          { delay: 700, text: 'カウンターの下、覗き込む' },
          { delay: 2200, text: '撮った', image: 'A8-Counter' },
          { delay: 2400, text: '古いアンプとCDプレイヤー、配線ぐちゃぐちゃ' },
          { delay: 2200, text: '電源は切れてる' },
        ],
        setFlag: 'foundBgm',
        setFocus: 'counter_under',
      };
    }
    // 鏡を見ている時の「下」 → 鏡の下（壁）
    if (ctx.lastFocus === 'mirror') {
      return {
        msgs: [
          { delay: 700, text: '鏡の下、覗いてみる' },
          { delay: 2200, text: '壁、特に何もない' },
        ],
      };
    }
    // 掲示板を見ている時の「下」 → 掲示板の下
    if (ctx.lastFocus === 'board') {
      return {
        msgs: [
          { delay: 700, text: '掲示板の下、見てみる' },
          { delay: 2200, text: '壁、特に何もない' },
        ],
      };
    }
    // 通常
    return {
      msgs: ctx.stage === 'back_room'
        ? (ctx.flags.lightOn
            ? [
                { delay: 700, text: '床に紙がある、明るくなった', image: 'D2' },
                { delay: 2400, text: '誰かの手記みたい' },
                { delay: 2200, text: '読んでみて' },
              ]
            : [
                { delay: 700, text: '床に何かある', image: 'D2-Dark' },
                { delay: 2200, text: '暗くて読めない' },
                { delay: 2000, text: '明るくしないと' },
              ])
        : [
            { delay: 800, text: '床を見た' },
            { delay: 2000, text: 'リノリウム、すり減ってる' },
            { delay: 2200, text: '何か書いてある気がする' },
          ],
      setFlag: ctx.stage === 'back_room' && ctx.flags.lightOn ? 'readMemo' : null,
    };
  },
  look_left: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: '左の壁見た' },
          { delay: 2000, text: 'コード表のメモ書きが貼ってある' },
        ]
      : [
          { delay: 700, text: '左を見た' },
          { delay: 2000, text: '鏡があった、撮るね', image: 'L1-1' },
          { delay: 2400, text: '……何か薄く浮いてる' },
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
  machines_ask: () => ({
    msgs: [
      { delay: 700, text: '洗濯機ね' },
      { delay: 1800, text: '1番、2番、3番、どれにする？' },
    ],
  }),
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
        { delay: 2400, text: '何か数字が出てる' },
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
      setFocus: 'machine_1',
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
        { delay: 700, text: 'しおりを撮った', image: 'B2-3' },
        { delay: 2200, text: '何か書いてある' },
      ],
    ];
    return {
      msgs: layers[layer] || [{ delay: 700, text: '中身、もう何もない' }],
      incrementMachine: '2',
      setFocus: 'machine_2',
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
      setFocus: 'machine_3',
    };
  },
  machine_back: (ctx) => {
    // 文脈：直前に見ていた機械の裏を見る
    if (ctx.lastFocus === 'machine_1' || ctx.lastFocus === 'machine_2' || ctx.lastFocus === 'machine_3') {
      const num = ctx.lastFocus.split('_')[1];
      return {
        msgs: [
          { delay: 700, text: `${num}番機の裏、覗いてみる` },
          { delay: 2200, text: '配線とパイプ、ホコリだらけ' },
          { delay: 2400, text: '特に変なものはない' },
        ],
      };
    }
    // 鏡の裏
    if (ctx.lastFocus === 'mirror') {
      return {
        msgs: [
          { delay: 700, text: '鏡の裏？' },
          { delay: 2200, text: '壁に固定されてる、剥がせない' },
        ],
      };
    }
    // 掲示板の裏
    if (ctx.lastFocus === 'board') {
      return {
        msgs: [
          { delay: 700, text: '掲示板を一枚ずつめくってみる' },
          { delay: 2400, text: '裏側、特に何もない' },
        ],
      };
    }
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
  // カウンター全景（最初に「カウンター」と言われた時の応答）
  counter_general: () => ({
    msgs: [
      { delay: 700, text: 'カウンターね、撮るね' },
      { delay: 2200, text: '', image: 'A8-Counter-Front' },
      { delay: 2400, text: '受付カウンター、両替機とか決済端末がある' },
      { delay: 2400, text: '料金表、夜間無人の貼り紙' },
      { delay: 2200, text: 'カウンターの下から、配線がはみ出してる' },
      { delay: 2200, text: '何か装置あるかも' },
    ],
    setFlag: 'seenCounter',
    setFocus: 'counter',
  }),
  // カウンター下のBGM装置
  counter_under: () => ({
    msgs: [
      { delay: 700, text: 'カウンターの下、覗き込む' },
      { delay: 2200, text: '撮った', image: 'A8-Counter' },
      { delay: 2400, text: '古いアンプとCDプレイヤー、配線ぐちゃぐちゃ' },
      { delay: 2200, text: '電源は切れてる' },
    ],
    setFlag: 'foundBgm',
    setFocus: 'counter_under',
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
      { delay: 2400, text: '何か書いてある' },
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
  turn_around: (ctx) => {
    // 第2幕（奥の部屋）では即死
    if (ctx.stage === 'back_room') {
      return {
        msgs: [
          { delay: 700, text: '……振り向く' },
          { delay: 2400, text: 'ｱ', isGlitch: true },
          { delay: 2400, text: 'ｱｱｱｱ', isGlitch: true },
          { delay: 2400, text: 'ﾐﾗﾚﾀ', isGlitch: true, isFading: true },
        ],
        triggerStage: 'end_bad_b',
      };
    }
    // 第1幕では振り向いてカウンター発見
    return {
      msgs: [
        { delay: 700, text: '……振り向く' },
        { delay: 2400, text: 'あ' },
        { delay: 2200, text: 'カウンターがあった', image: 'A8-Counter-Front' },
        { delay: 2400, text: '受付カウンター、両替機とか決済端末がある' },
        { delay: 2400, text: 'カウンターの下から、配線がはみ出してる' },
        { delay: 2200, text: '何か装置あるかも' },
      ],
      setFlag: 'seenCounter',
      setFocus: 'counter',
    };
  },
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
// 完全一致用：短い単語入力に対応
// プレイヤーが「上」「左」「鏡」だけで送ってきても拾う
const EXACT_WORD_MAP = {
  // 方向
  '上': 'look_up', 'うえ': 'look_up', '天井': 'look_up', 'てんじょう': 'look_up',
  '下': 'look_down', 'した': 'look_down', '床': 'look_down', 'ゆか': 'look_down', '足元': 'look_down',
  '左': 'look_left', 'ひだり': 'look_left',
  '右': 'look_right', 'みぎ': 'look_right',
  '前': 'photo', 'まえ': 'photo', '正面': 'photo',
  '後ろ': 'turn_around', 'うしろ': 'turn_around', '背後': 'turn_around', '振り向く': 'turn_around',
  // オブジェクト
  '鏡': 'mirror', 'かがみ': 'mirror', 'ミラー': 'mirror',
  '時計': 'clock', 'とけい': 'clock',
  '掲示板': 'board', 'けいじばん': 'board', 'ボード': 'board',
  'カウンター': 'counter_general', '受付': 'counter_general',
  '洗濯機': 'machines_ask', 'せんたくき': 'machines_ask', '機械': 'machines_ask',
  '1番': 'machine_1', '一番': 'machine_1', '1号機': 'machine_1',
  '2番': 'machine_2', '二番': 'machine_2', '2号機': 'machine_2',
  '3番': 'bgm_play_alpha', '三番': 'bgm_play_alpha', '3号機': 'machine_3',  // 注意：BGM選択時優先
  'ドア': 'open_door', 'door': 'open_door', '扉': 'open_door',
  'ギター': 'guitar_take', 'guitar': 'guitar_take',
  'ライト': 'use_light', '明かり': 'use_light', 'light': 'use_light',
  'チューナー': 'tune_guitar', 'tuner': 'tune_guitar',
  // BGM
  'BGM': 'bgm_power', 'bgm': 'bgm_power',
  // 反応
  '自撮り': 'selfie',
  'かわいい': 'compliment', '可愛い': 'compliment', 'カワイイ': 'compliment',
  'きれい': 'compliment', '綺麗': 'compliment',
  // 写真
  '写真': 'photo', '画像': 'photo', '映像': 'photo',
};

const matchInput = (input, ctx) => {
  const normalized = input.toLowerCase().trim();
  
  // 1. 完全一致チェック（短い単語のみ）
  if (EXACT_WORD_MAP[normalized] || EXACT_WORD_MAP[input.trim()]) {
    return EXACT_WORD_MAP[normalized] || EXACT_WORD_MAP[input.trim()];
  }
  
  // 2. 優先度順 + キーワード長さ降順でソート（より具体的なマッチを優先）
  const candidates = [];
  for (const [key, entry] of Object.entries(DICTIONARY)) {
    for (const kw of entry.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        candidates.push({
          response: entry.response,
          priority: entry.priority || 50,
          length: kw.length,
        });
      }
    }
  }
  
  if (candidates.length === 0) return null;
  
  // 優先度高い順、同じ優先度ならキーワード長い順
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.length - a.length;
  });
  
  return candidates[0].response;
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
  // 文脈：直前に見た対象（カウンター、鏡、掲示板、機械等）
  // 'counter' | 'mirror' | 'board' | 'machine_1' | 'machine_2' | 'machine_3' | null
  const [lastFocus, setLastFocus] = useState(null);

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

  // 初期化（intro ステージ：玲は黙ってる、プレイヤー入力を待つ）
  useEffect(() => {
    setStage('intro');
    setIsLocked(false);  // 入力可能にする
  }, [loopCount]);

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
      lastFocus,
    };
    const result = action(ctx);

    if (result.msgs) queueRei(result.msgs);
    if (result.setFlag) setFlags((f) => ({ ...f, [result.setFlag]: true }));
    if (result.incrementMachine) {
      setMachineLayers((m) => ({ ...m, [result.incrementMachine]: Math.min(3, (m[result.incrementMachine] || 0) + 1) }));
    }
    if (result.setFocus !== undefined) setLastFocus(result.setFocus);
    if (result.triggerStage) {
      setTimeout(() => {
        setStage(result.triggerStage);
        if (result.resetTimer) setBackRoomStart(Date.now());
      }, 1500);
    }
    setTries((t) => t + 1);
  }, [loopCount, stage, flags, machineLayers, foldedMachines, tries, lastFocus, queueRei]);

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
    
    // 最初の一言 → 玲が「あ、繋がった！」から始める
    if (stage === 'intro') {
      queueRei(FIRST_CONTACT_MESSAGES);
      // 全部送信後に explore へ
      const totalDelay = FIRST_CONTACT_MESSAGES.reduce((a, m) => a + m.delay + 400, 0);
      setTimeout(() => {
        setStage('explore');
        setExploreStart(Date.now());
      }, totalDelay);
      return;
    }
    
    const ctx = {
      loopCount, stage, flags, machineLayers, foldedMachines, tries, lastFocus,
    };
    const actionId = matchInput(text, ctx);
    
    if (actionId) {
      executeAction(actionId);
    } else {
      // 辞書外でも玲が会話を繋ぐ（フォールバック応答）
      const fallback = getFallbackResponse(ctx);
      queueRei(fallback);
    }
  }, [inputText, isLocked, isEnded, loopCount, stage, flags, machineLayers, foldedMachines, tries, lastFocus, executeAction, getFallbackResponse, queueRei]);

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
              placeholder={isLocked ? '玲が考えてる...' : stage === 'intro' ? '一言、送ってみる' : 'メッセージを入力'}
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
