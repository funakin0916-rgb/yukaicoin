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
  'D1': './images/D1.webp',
  'M1-1': './images/M1-1.webp',
  'M2-1': './images/M2-1.webp',
  'M3-1': './images/M3-1.webp',
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

// 周回による画像変化は無効化（常に基本画像を使う）
const getImageId = (baseId, loopCount) => {
  if (baseId === 'A1') return 'A1-1';
  if (baseId === 'C2') return 'C2-1';
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
  { delay: 1500, text: 'よかった、よかった' },
  { delay: 2200, text: 'ねえ、コインランドリーから出られないの' },
  { delay: 2400, text: '誰にも連絡つかない、あなただけ繋がってる' },
  { delay: 2400, text: '助けて、お願い' },
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
    keywords: ['振り向', 'ふりむ', '振り返', 'ふりかえ', 'うしろ見', '後ろ見', '背後見', '後ろ向', '後方確認', '後ろ確認', '反対向', '反対側', 'うしろ向', '後ろは', '後ろって', '後ろの方', 'うしろは', 'うしろって', 'うしろの', '後ろをみ', 'うしろをみ', '後ろをみて', '後ろは何', '後ろはなに', '後ろはどう', '後方'],
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
    keywords: ['息かけ', '息吹', '息で曇', '吹きかけ', '曇らせ', 'くもらせ', 'はぁ', 'ハァ', '息で', '息を', '息はく', '息を吹', '息かけて', '曇ら', 'はっきり', 'クリア', 'もっと見', 'よく見', '読み取', 'しっかり見'],
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
    keywords: ['決済端末', '端末', '決済機', 'カウンター上', 'カウンターの上', 'レジ', 'POS', 'カウンターの装置', '光ってる', '光ってる装置', '点滅', '画面ついて', '画面光', 'ピカピカ', 'パネル光', '液晶光', '液晶ついて'],
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
    keywords: ['写真撮', '写真', '全景', '店内撮', '店内写真', '撮って', 'スマホで撮', '映して', 'うつして', '見せて', '映像', '送って', '画像送', '画像', '画像見', '映像見', '前見', '前を見', '前撮', '前の方', '正面', 'まえ見', '前はどう', '前はなに', '前って', '前は何'],
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
    keywords: ['上見', '上を見', '天井', 'てんじょう', '上の方', 'うえ見', '上方', '頭の上', '見上げ', '上撮', '上を撮', '上はどう', '上はなに', '上には', '上の写真', '上をみ', '上って'],
    response: 'look_up',
  },
  'look_down': {
    priority: 60,
    keywords: ['下見', '下を見', '床', 'ゆか', '下の方', 'した見', '足元', 'あしもと', '床面', '見下ろ', '床撮', '足下', '下の床', '床の方', '下はどう', '下はなに', '下には', '下の写真', '下をみ', '下って'],
    response: 'look_down',
  },
  'look_left': {
    priority: 60,
    keywords: ['左見', '左を見', '左の方', 'ひだり', '左壁', '左方', '左確認', '左撮', '左をみ', '左に', 'left', '左はどう', '左はなに', '左には', '左って'],
    response: 'look_left',
  },
  'look_right': {
    priority: 60,
    keywords: ['右見', '右を見', '右の方', 'みぎ', '右壁', '右方', '右確認', '右撮', '右をみ', '右に', 'right', '右はどう', '右はなに', '右には', '右って'],
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
  'machine_stop': {
    priority: 65,
    keywords: ['洗濯機止', '止めて', '止める', '停止', 'ストップ', 'stop', '電源切', '電源オフ', '電源OFF', 'スイッチ切'],
    response: 'machine_stop',
  },
  
  // ========================================
  // 会話を繋ぐ汎用返答
  // ========================================
  'agree': {
    priority: 30,
    keywords: ['うん', 'はい', 'もちろん', 'わかった', 'わかる', 'わかってる', 'おっけー', 'OK', 'ok', 'Ok', 'いいよ', '了解', 'りょうかい', '任せて', 'まかせて', 'やる', 'やろう', 'やってみる', 'やりましょう', '大丈夫だよ', 'できる', 'いいね', 'ええ', '取り出', 'とりだ', '取って', 'とって', '出して', 'だして', '中身', '中見', '中を見', '見て', '開けて', '進めて', '続けて', '次', 'お願い', 'おねがい'],
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
  // 自己紹介・能力確認
  'self_intro': {
    priority: 92,
    keywords: ['誰', 'だれ', '名前', '何者', 'なまえ', '君は', 'あなたは', 'あなた誰', '君誰', 'お名前', '自己紹介'],
    response: 'self_intro',
  },
  'capabilities': {
    priority: 92,
    keywords: ['何ができる', 'できること', 'なにできる', '何できる', '何持って', '何ある', '装備', 'なに持って', '持ち物', '何か持って', '何ができ'],
    response: 'capabilities',
  },
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
    // 文脈に応じて次のアクションへ
    // 洗濯機を見てる時の「はい」「取り出す」→ 次のレイヤー
    if (ctx.lastFocus === 'machine_1') return ACTIONS.machine_1(ctx);
    if (ctx.lastFocus === 'machine_2') return ACTIONS.machine_2(ctx);
    if (ctx.lastFocus === 'machine_3') return ACTIONS.machine_3(ctx);
    
    // それ以外（一般的な相槌）
    if (ctx.stage === 'back_room') {
      return {
        msgs: [
          { delay: 700, text: 'うん' },
          { delay: 1800, text: 'どうしたらいい？' },
        ],
      };
    }
    return {
      msgs: [
        { delay: 700, text: 'うん' },
        { delay: 1800, text: 'どうすればいい？' },
      ],
    };
  },
  disagree: () => ({
    msgs: [
      { delay: 700, text: 'そっか' },
      { delay: 1800, text: 'えっと、じゃあ、どうしよう' },
    ],
  }),
  hint_request: () => ({
    msgs: [
      { delay: 700, text: 'どうしよう……' },
      { delay: 1800, text: 'ねえ、何かない？' },
      { delay: 2200, text: 'どうしたらいい？' },
    ],
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
  self_intro: () => ({
    msgs: [
      { delay: 600, text: '篠崎玲、26歳' },
      { delay: 2000, text: 'フリーのグラフィックデザイナー' },
      { delay: 2200, text: '今、コインランドリーで閉じ込められてる' },
      { delay: 2400, text: 'あなたは？……ううん、それより助けて' },
    ],
  }),
  capabilities: () => ({
    msgs: [
      { delay: 700, text: 'スマホはある' },
      { delay: 2000, text: '写真撮って送れる' },
      { delay: 2200, text: '何でも頼んで' },
    ],
  }),
  photo: () => ({
    msgs: [
      { delay: 700, text: '撮るね' },
      { delay: 2000, text: '', image: 'A1-1' },
    ],
    setFlag: 'seenPhoto',
  }),
  selfie: () => ({
    msgs: [
      { delay: 700, text: '自撮り？まあいいけど' },
      { delay: 2000, text: '', image: 'C2-1' },
    ],
    setFlag: 'seenSelfie',
  }),
  compliment: (ctx) => {
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
      ],
    ];
    const variant = variants[ctx.tries % variants.length];
    return { msgs: variant };
  },
  clock: () => ({
    msgs: [
      { delay: 700, text: '時計、撮るね' },
      { delay: 2000, text: '', image: 'A1-Clock' },
    ],
    setFlag: 'seenClock',
    setFocus: 'clock',
  }),
  mirror: (ctx) => ({
    msgs: ctx.flags.breathedOnMirror
      ? [
          { delay: 700, text: '鏡', image: 'L1' },
        ]
      : [
          { delay: 700, text: '鏡、撮るね' },
          { delay: 2000, text: '', image: 'L1-1' },
        ],
    setFlag: 'seenMirror',
    setFocus: 'mirror',
  }),
  mirror_breathe: (ctx) => ({
    msgs: ctx.flags.seenMirror
      ? [
          { delay: 700, text: '息かけた' },
          { delay: 2200, text: '', image: 'L1' },
        ]
      : [
          { delay: 700, text: 'え、何に？' },
        ],
    setFlag: 'breathedOnMirror',
    setFocus: 'mirror',
  }),
  board: () => ({
    msgs: [
      { delay: 700, text: '掲示板、撮るね' },
      { delay: 2200, text: '', image: 'A6-α' },
    ],
    setFlag: 'seenBoard',
    setFocus: 'board',
  }),
  door_check: () => ({
    msgs: [
      { delay: 700, text: '自動ドア、センサー反応しない' },
      { delay: 2000, text: '手で押してもダメ' },
    ],
    setFlag: 'checkedDoor',
  }),
  whatsee: () => ({
    msgs: [
      { delay: 800, text: '蛍光灯、洗濯機、長椅子' },
      { delay: 2000, text: 'カウンター、掲示板、鏡' },
    ],
  }),
  // 上下左右
  look_up: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 800, text: '天井' },
          { delay: 2000, text: '配管、シミ' },
        ]
      : [
          { delay: 800, text: '上、撮るね' },
          { delay: 2000, text: '', image: 'U1' },
        ],
  }),
  look_down: (ctx) => {
    return {
      msgs: ctx.stage === 'back_room'
        ? (ctx.flags.lightOn
            ? [
                { delay: 700, text: '床、紙がある', image: 'D2' },
              ]
            : [
                { delay: 700, text: '床、何かある', image: 'D2-Dark' },
                { delay: 2200, text: '暗い' },
              ])
        : [
            { delay: 800, text: '下、撮るね' },
            { delay: 2000, text: '', image: 'D1' },
            { delay: 2400, text: 'あれ、ピック…' },
            { delay: 2400, text: '懐かしい、学生の頃バンドやってたから' },
          ],
      setFlag: ctx.stage === 'back_room' && ctx.flags.lightOn ? 'readMemo' : null,
      setFocus: ctx.stage !== 'back_room' ? 'floor' : null,
    };
  },
  look_left: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: '左、メモ書きが貼ってある' },
        ]
      : [
          { delay: 700, text: '左、撮るね' },
          { delay: 2000, text: '', image: 'L1-1' },
        ],
    setFlag: ctx.stage !== 'back_room' ? 'seenMirror' : null,
    setFocus: ctx.stage !== 'back_room' ? 'mirror' : null,
  }),
  look_right: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: '右、ギターケース' },
        ]
      : ctx.flags.alphaPlayed
        ? [
            { delay: 700, text: '右、ドア開いてる', image: 'A9-Door-Open' },
          ]
        : [
            { delay: 700, text: '右、奥のドア' },
            { delay: 2000, text: '暗証パネル、赤いランプ' },
            { delay: 2200, text: '今は開かない' },
          ],
    setFlag: ctx.stage !== 'back_room' ? 'checkedDoor' : null,
    setFocus: ctx.stage !== 'back_room' ? 'door' : null,
  }),
  // 機械
  machines_ask: () => ({
    msgs: [
      { delay: 700, text: '洗濯機ね' },
      { delay: 1800, text: '1番、2番、3番、どれにする？' },
    ],
    setFocus: 'machines_question',
  }),
  // 数字選択（文脈で何を選んでるか判定）
  // 即死扱いは「今まさにそのメニューを見ている時」に限定
  pick_1: (ctx) => {
    // BGMプリセット選択中（lastFocus が bgm_menu の時だけ）
    if (ctx.lastFocus === 'bgm_menu' && !ctx.flags.alphaPlayed) {
      return ACTIONS.die_bgm_1 ? ACTIONS.die_bgm_1(ctx) : { msgs: [{ delay: 700, text: '1番' }] };
    }
    // 決済端末選択中
    if (ctx.lastFocus === 'terminal') {
      return ACTIONS.die_terminal_1 ? ACTIONS.die_terminal_1(ctx) : { msgs: [{ delay: 700, text: '1番' }] };
    }
    // それ以外は機械選択（先に「1番ね」と返事）
    const m1 = ACTIONS.machine_1(ctx);
    return {
      ...m1,
      msgs: [{ delay: 600, text: '1番ね' }, ...m1.msgs],
    };
  },
  pick_2: (ctx) => {
    if (ctx.lastFocus === 'bgm_menu' && !ctx.flags.alphaPlayed) {
      return ACTIONS.die_bgm_2 ? ACTIONS.die_bgm_2(ctx) : { msgs: [{ delay: 700, text: '2番' }] };
    }
    if (ctx.lastFocus === 'terminal') {
      return ACTIONS.die_terminal_2 ? ACTIONS.die_terminal_2(ctx) : { msgs: [{ delay: 700, text: '2番' }] };
    }
    const m2 = ACTIONS.machine_2(ctx);
    return {
      ...m2,
      msgs: [{ delay: 600, text: '2番ね' }, ...m2.msgs],
    };
  },
  pick_3: (ctx) => {
    if (ctx.lastFocus === 'bgm_menu' && !ctx.flags.alphaPlayed) {
      return ACTIONS.bgm_play_alpha(ctx);
    }
    if (ctx.lastFocus === 'terminal') {
      return ACTIONS.terminal_3(ctx);
    }
    const m3 = ACTIONS.machine_3(ctx);
    return {
      ...m3,
      msgs: [{ delay: 600, text: '3番ね' }, ...m3.msgs],
    };
  },
  pick_4: (ctx) => {
    if (ctx.lastFocus === 'bgm_menu' && !ctx.flags.alphaPlayed) {
      return ACTIONS.die_bgm_4 ? ACTIONS.die_bgm_4(ctx) : { msgs: [{ delay: 700, text: '4番' }] };
    }
    return { msgs: [{ delay: 700, text: '4番？何を選ぶ？' }] };
  },
  // 機械の中身を見る（lastFocusが機械の時）
  machine_inside: (ctx) => {
    if (ctx.lastFocus === 'machine_1') return ACTIONS.machine_1(ctx);
    if (ctx.lastFocus === 'machine_2') return ACTIONS.machine_2(ctx);
    if (ctx.lastFocus === 'machine_3') return ACTIONS.machine_3(ctx);
    return { msgs: [{ delay: 700, text: 'どこの中？' }] };
  },
  machine_1: (ctx) => {
    const layer = ctx.machineLayers['1'];
    if (ctx.foldedMachines.has('1')) {
      return { msgs: [{ delay: 700, text: '左の洗濯機はもう開けた' }] };
    }
    const layers = [
      [
        { delay: 700, text: '左の洗濯機、止まってる' },
        { delay: 2000, text: '中に洗濯物が入ったまま' },
        { delay: 2200, text: '取り出す？' },
      ],
      [
        { delay: 700, text: '取り出した', image: 'M1-1' },
        { delay: 2200, text: 'ジャージ、3年A組のゼッケン' },
        { delay: 2200, text: 'ポケットに何かある' },
      ],
      [
        { delay: 700, text: 'ポケット探る' },
        { delay: 2000, text: 'チューナー', image: 'B1-Tuner' },
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
      return { msgs: [{ delay: 700, text: '真ん中の洗濯機はもう開けた' }] };
    }
    const layers = [
      [
        { delay: 700, text: '真ん中の洗濯機、止まってる' },
        { delay: 2000, text: '中に洗濯物' },
        { delay: 2200, text: '取り出す？' },
      ],
      [
        { delay: 700, text: '取り出した', image: 'M2-1' },
        { delay: 2200, text: 'ヨガウェア、ラベンダーの香り' },
        { delay: 2200, text: 'ポケットに何か' },
      ],
      [
        { delay: 700, text: 'しおり、出てきた' },
        { delay: 2200, text: '', image: 'B2-3' },
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
      return { msgs: [{ delay: 700, text: '右の洗濯機はもう開けた' }] };
    }
    const layers = [
      [
        { delay: 700, text: '右の洗濯機、止まってる' },
        { delay: 2000, text: '中に洗濯物' },
        { delay: 2200, text: '取り出す？' },
      ],
      [
        { delay: 700, text: '取り出した', image: 'M3-1' },
        { delay: 2200, text: 'スーツのジャケット' },
        { delay: 2200, text: '内ポケットに名刺' },
      ],
      [
        { delay: 700, text: '名刺の裏', image: 'B3-3-α' },
        { delay: 2400, text: '滲んでて読めない' },
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
    // 直前に開けた機械を畳む（lastFocusで分かる）
    if (ctx.lastFocus === 'machine_1' || ctx.lastFocus === 'machine_2' || ctx.lastFocus === 'machine_3') {
      const num = ctx.lastFocus.split('_')[1];
      const labels = { '1': '左', '2': '真ん中', '3': '右' };
      return {
        msgs: [
          { delay: 700, text: `${labels[num]}の洗濯機、畳んだ` },
          { delay: 2000, text: '中身は取り出した' },
        ],
        addFolded: num,
      };
    }
    return {
      msgs: [
        { delay: 700, text: 'どれ畳む？' },
        { delay: 2000, text: '左、真ん中、右？' },
      ],
    };
  },
  // 洗濯機を止める（畳むと同じ扱い）
  machine_stop: (ctx) => {
    if (ctx.lastFocus === 'machine_1' || ctx.lastFocus === 'machine_2' || ctx.lastFocus === 'machine_3') {
      const num = ctx.lastFocus.split('_')[1];
      const labels = { '1': '左', '2': '真ん中', '3': '右' };
      return {
        msgs: [
          { delay: 700, text: `${labels[num]}の洗濯機、止めた` },
        ],
      };
    }
    return {
      msgs: [
        { delay: 700, text: 'どれ止める？' },
        { delay: 2000, text: '左、真ん中、右？' },
      ],
    };
  },
  // カウンター全景（最初に「カウンター」と言われた時の応答）
  counter_general: () => ({
    msgs: [
      { delay: 700, text: 'カウンター、撮るね' },
      { delay: 2200, text: '', image: 'A8-Counter-Front' },
    ],
    setFlag: 'seenCounter',
    setFocus: 'counter',
  }),
  // カウンター下のBGM装置
  counter_under: () => ({
    msgs: [
      { delay: 700, text: 'カウンターの下、覗き込む' },
      { delay: 2200, text: '撮った', image: 'A8-Counter' },
    ],
    setFlag: 'foundBgm',
    setFocus: 'counter_under',
  }),
  bgm_power: (ctx) => ({
    msgs: ctx.flags.foundBgm
      ? [
          { delay: 700, text: '電源入れた' },
          { delay: 2200, text: '', image: 'A8-Counter-Menu' },
        ]
      : [
          { delay: 700, text: 'え、何の？' },
        ],
    setFlag: 'bgmPowered',
    setFocus: 'bgm_menu',
  }),
  // カウンター上の決済端末
  counter_terminal: () => ({
    msgs: [
      { delay: 700, text: '決済端末', image: 'A8-Terminal' },
    ],
    setFlag: 'seenTerminal',
    setFocus: 'terminal',
  }),
  terminal_3: () => ({
    msgs: [
      { delay: 700, text: '3番押した、再印字' },
      { delay: 2200, text: 'レシート出てきた', image: 'A8-Receipt' },
      { delay: 2400, text: '……BGMサーバー、カウンター下、って書いてある' },
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
          { delay: 700, text: 'え、何の？' },
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
          { delay: 2400, text: '弦張ってるけど、チューニング狂ってる' },
          { delay: 2400, text: 'バンドの時の感覚で分かる' },
        ]
      : [
          { delay: 700, text: 'ここにギターはない' },
        ],
    setFlag: 'tookGuitar',
    setFocus: 'guitar',
  }),
  // ライトで照らす
  use_light: (ctx) => ({
    msgs: ctx.stage === 'back_room'
      ? [
          { delay: 700, text: 'ライトつけた' },
          { delay: 2200, text: '床、明るくなった' },
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
      { delay: 2200, text: '「決済データがありません」' },
      { delay: 2200, text: '何も起きない' },
    ],
  }),
  die_terminal_2: () => ({
    msgs: [
      { delay: 700, text: '2番、取消を押した' },
      { delay: 2200, text: '「データがありません」' },
    ],
  }),
  die_bgm_1: () => ({
    msgs: [
      { delay: 700, text: '1番、Morning Healing' },
      { delay: 2200, text: '432Hz、明るい音' },
      { delay: 2400, text: '……あれ、空気が' },
      { delay: 2400, text: '何か、ザワッと' },
      // 怪異①の声（震える赤いテキスト）「チガウ」の連呼
      { delay: 3500, text: 'ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2800, text: 'ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2500, text: 'ﾁ ｶﾞ ｳ  ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2500, text: 'ﾁｶﾞｳﾁｶﾞｳﾁｶﾞｳ', isGlitch: true, isGhost: true },
      { delay: 3000, text: '止まらない、止まらない' },
      { delay: 2400, text: 'あ──', isGlitch: true, isFading: true },
    ],
    triggerStage: 'end_bad_a',
  }),
  die_bgm_2: () => ({
    msgs: [
      { delay: 700, text: '2番、Relaxation' },
      { delay: 2200, text: '528Hz、ピアノの音' },
      { delay: 2400, text: '……何か、おかしい' },
      { delay: 2400, text: '空気が、ザワッと' },
      // 怪異①の声「チガウ」
      { delay: 3500, text: 'ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2800, text: 'ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2500, text: 'ﾁ ｶﾞ ｳ  ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2500, text: 'ﾁｶﾞｳﾁｶﾞｳﾁｶﾞｳ', isGlitch: true, isGhost: true },
      { delay: 3000, text: '止まらない、止まらない' },
      { delay: 2400, text: 'あ──', isGlitch: true, isFading: true },
    ],
    triggerStage: 'end_bad_a',
  }),
  die_bgm_4: () => ({
    msgs: [
      { delay: 700, text: '4番、Focus Boost' },
      { delay: 2200, text: '680Hz、高い音' },
      { delay: 2400, text: '耳に刺さる' },
      { delay: 2400, text: '空気が、ザワッと' },
      // 怪異①の声「チガウ」
      { delay: 3500, text: 'ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2800, text: 'ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2500, text: 'ﾁ ｶﾞ ｳ  ﾁ ｶﾞ ｳ', isGlitch: true, isGhost: true },
      { delay: 2500, text: 'ﾁｶﾞｳﾁｶﾞｳﾁｶﾞｳ', isGlitch: true, isGhost: true },
      { delay: 3000, text: '止まらない、止まらない' },
      { delay: 2400, text: 'あ──', isGlitch: true, isFading: true },
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
    // 第2幕（奥の部屋）= 怪異②（篠田）からのメッセージ
    if (ctx.stage === 'back_room') {
      return {
        msgs: [
          { delay: 700, text: '……振り向く' },
          { delay: 2400, text: 'あ', isGlitch: true },
          { delay: 2400, text: 'いる', isGlitch: true },
          { delay: 2000, text: '──' },
          // ここから怪異②（篠田）からのメッセージ（ゆっくり）
          { delay: 3500, text: 'ﾅ', isGlitch: true, isGhost: true },
          { delay: 3000, text: 'ﾅ ｵ', isGlitch: true, isGhost: true },
          { delay: 3000, text: 'ﾅ ｵ ｼ', isGlitch: true, isGhost: true },
          { delay: 3000, text: 'ﾅ ｵ ｼ ﾃ', isGlitch: true, isGhost: true },
          { delay: 4000, text: '', isFading: true },
        ],
        triggerStage: 'end_bad_b',
      };
    }
    // crisis 4以上 = 怪異①（ヨガ女性）が後ろに張り付いてる、振り向くと即死
    if (ctx.crisis >= 4) {
      return {
        msgs: [
          { delay: 700, text: '……振り向く' },
          { delay: 2400, text: 'あ', isGlitch: true },
          { delay: 2400, text: 'いる', isGlitch: true },
          { delay: 2000, text: '──' },
          // ここから怪異①（ヨガ女性）からのメッセージ（ゆっくり、ネムラセテ）
          { delay: 3500, text: 'ﾈ', isGlitch: true, isGhost: true },
          { delay: 3000, text: 'ﾈ ﾑ', isGlitch: true, isGhost: true },
          { delay: 3000, text: 'ﾈ ﾑ ﾗ', isGlitch: true, isGhost: true },
          { delay: 3000, text: 'ﾈ ﾑ ﾗ ｾ', isGlitch: true, isGhost: true },
          { delay: 3000, text: 'ﾈ ﾑ ﾗ ｾ ﾃ', isGlitch: true, isGhost: true },
          { delay: 4000, text: '', isFading: true },
        ],
        triggerStage: 'end_bad_a',
      };
    }
    // 第1幕（平穏時）では振り向いてカウンター発見
    return {
      msgs: [
        { delay: 700, text: '……振り向く' },
        { delay: 2400, text: 'カウンターがあった', image: 'A8-Counter-Front' },
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
    { delay: 2400, text: 'あなた、急いで' },
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
    { delay: 2400, text: 'あなた、いるよね? いるよね??' },
  ],
  collapse: [ // 4:45 (285秒経過)
    { delay: 1000, text: 'ｲﾔﾀﾞ ｲﾔﾀﾞ ｺﾅｲﾃﾞ', isGlitch: true },
    { delay: 2200, text: 'ﾀｽｹﾃ ｵﾈｶﾞｲ', isGlitch: true },
  ],
  back_panic: [ // 第2幕 4:00
    { delay: 1000, text: 'あなた、また?' },
    { delay: 2200, text: '死にたくない、絶対' },
    { delay: 2400, text: 'ｺﾞﾒﾝ ｵﾈｶﾞｲ ｲﾔﾀﾞ', isGlitch: true },
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
  '裏': 'machine_back',
  // オブジェクト
  '鏡': 'mirror', 'かがみ': 'mirror', 'ミラー': 'mirror',
  '時計': 'clock', 'とけい': 'clock',
  '掲示板': 'board', 'けいじばん': 'board', 'ボード': 'board',
  'カウンター': 'counter_general', '受付': 'counter_general',
  '洗濯機': 'machines_ask', 'せんたくき': 'machines_ask', '機械': 'machines_ask',
  '左の洗濯機': 'machine_1', '左の機械': 'machine_1', '左側': 'machine_1',
  '真ん中': 'machine_2', '真ん中の洗濯機': 'machine_2', '中央': 'machine_2', '中央の洗濯機': 'machine_2', 'まんなか': 'machine_2',
  '右の洗濯機': 'machine_3', '右の機械': 'machine_3',
  '探る': 'machine_inside', '探って': 'machine_inside', 'もっと探る': 'machine_inside', 'もっと': 'machine_inside',
  '中': 'machine_inside', 'なか': 'machine_inside',
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
  // 数字単独（文脈で分岐させる、デフォルトは machine_X だが、bgm_power の後なら BGM選択）
  '1': 'pick_1', '一': 'pick_1', '1番': 'pick_1', '一番': 'pick_1',
  '2': 'pick_2', '二': 'pick_2', '2番': 'pick_2', '二番': 'pick_2',
  '3': 'pick_3', '三': 'pick_3', '3番': 'pick_3', '三番': 'pick_3',
  '4': 'pick_4', '四': 'pick_4', '4番': 'pick_4', '四番': 'pick_4',
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
        isGhost: msg.isGhost,
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
      crisis,
    };
    const result = action(ctx);

    if (result.msgs) queueRei(result.msgs);
    if (result.setFlag) setFlags((f) => ({ ...f, [result.setFlag]: true }));
    if (result.incrementMachine) {
      setMachineLayers((m) => ({ ...m, [result.incrementMachine]: Math.min(3, (m[result.incrementMachine] || 0) + 1) }));
    }
    if (result.addFolded) {
      setFoldedMachines((s) => new Set([...s, result.addFolded]));
    }
    if (result.setFocus !== undefined) setLastFocus(result.setFocus);
    if (result.triggerStage) {
      setTimeout(() => {
        setStage(result.triggerStage);
        if (result.resetTimer) setBackRoomStart(Date.now());
      }, 1500);
    }
    setTries((t) => t + 1);
  }, [loopCount, stage, flags, machineLayers, foldedMachines, tries, lastFocus, crisis, queueRei]);

  // 辞書外のフォールバック応答（プログレス段階に応じて誘導）
  const getFallbackResponse = useCallback((ctx) => {
    // ヒントを出さずに、淡々と「分からない」「特に何もない」を返す
    const variants = [
      [
        { delay: 700, text: 'ごめん、よく分からない' },
      ],
      [
        { delay: 700, text: 'うーん' },
        { delay: 1500, text: 'それ、どこ？' },
      ],
      [
        { delay: 700, text: 'えっと' },
        { delay: 1500, text: 'もう一回言って？' },
      ],
      [
        { delay: 700, text: '特に何もない気がする' },
      ],
      [
        { delay: 700, text: 'うん？' },
      ],
    ];
    return variants[ctx.tries % variants.length];
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
      loopCount, stage, flags, machineLayers, foldedMachines, tries, lastFocus, crisis,
    };
    const actionId = matchInput(text, ctx);
    
    if (actionId) {
      executeAction(actionId);
    } else {
      // 辞書外でも玲が会話を繋ぐ（フォールバック応答）
      const fallback = getFallbackResponse(ctx);
      queueRei(fallback);
    }
  }, [inputText, isLocked, isEnded, loopCount, stage, flags, machineLayers, foldedMachines, tries, lastFocus, crisis, executeAction, getFallbackResponse, queueRei]);

  // リセット
  const reset = useCallback(() => {
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
    setLastFocus(null);
    setCrisis(0);
    setBattery(80);
    setGlitchLevel(0);
    setTries(0);
    setExploreStart(null);
    setBackRoomStart(null);
    setIsTyping(false);
    setIsLocked(false);
    queueRef.current = [];
    processingRef.current = false;
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
                  : msg.isGhost
                  ? 'bg-black text-red-500 font-mono tracking-widest text-base border border-red-900'
                  : `bg-gray-700 text-white ${msg.isGlitch ? 'font-mono tracking-wider text-red-300' : ''}`
              }`}
              style={
                msg.isGhost
                  ? {
                      textShadow: '0 0 8px #ff0040, 2px 0 #ff0040, -2px 0 #00d0ff',
                      letterSpacing: '0.3em',
                      animation: 'ghostShake 0.4s infinite, ghostGlow 1.5s infinite',
                    }
                  : msg.isGlitch
                  ? { textShadow: '2px 0 #ff0040, -2px 0 #00d0ff' }
                  : {}
              }
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
