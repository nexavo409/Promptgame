// Prompt Architect — Lesson Curriculum
// 8 sequential lessons + free practice. Each teaches one prompt engineering technique.

export const LESSONS = [
  {
    id: 'lesson-01',
    number: 1,
    title: '最小プロンプト',
    technique: 'お題を素直に伝える',
    summary: 'まずは難しいことを考えず、お題をそのままAIに渡してみましょう。これが全ての基準になります。',
    explainer: `プロンプトエンジニアリングの第一歩は「とにかく書いてみる」こと。
お題を素直に文章にしてAIに渡すだけで、ある程度の答えは返ってきます。
ここを基準点として、次のレッスンから少しずつ改善していきます。`,
    hint: '長く考えなくてOK。「〇〇について教えて」「△△を作って」レベルで十分。',
    examplePrompt: 'リモートワークのメリットを教えてください。',
    topic: {
      category: 'neutral',
      difficulty: 'standard',
      title: 'リモートワークのメリット',
      brief: 'リモートワークの主なメリットを説明してください。',
    },
    passCondition: { type: 'each', threshold: 5 },
  },
  {
    id: 'lesson-02',
    number: 2,
    title: '役割を与える（ペルソナ）',
    technique: '"You are a..." / "あなたは〇〇です"',
    summary: 'AIに役割を与えると、回答の専門性と方向性が一気に定まります。最もコスパの良い技法のひとつ。',
    explainer: `「あなたは新人エンジニアの教育担当です」のように役割を与えると、
AIはその役割らしい語彙・抽象度・構成で回答します。
「専門家として」「初心者の視点で」「批判的に」など視点を切り替えるだけで、同じお題でも出力が大きく変わります。`,
    hint: 'プロンプトの先頭に「あなたは〇〇です」と1行追加してみよう。',
    examplePrompt: 'あなたは10年経験のフロントエンドエンジニアです。\nReactの状態管理について新人に説明してください。',
    topic: {
      category: 'tech',
      difficulty: 'standard',
      title: 'Reactの状態管理を新人に説明',
      brief: 'Reactの状態管理（useState / useReducer / Context など）の使い分けを新人エンジニアに説明してください。',
    },
    passCondition: { type: 'axis', axis: 'utility', threshold: 7 },
  },
  {
    id: 'lesson-03',
    number: 3,
    title: '出力構造を指定する',
    technique: '箇条書き・表・段落数の指定',
    summary: '出力フォーマットを指定するだけで、AIの回答は「読める」「使える」ものに変わります。',
    explainer: `「3つの箇条書きで」「メリット・デメリットの表で」「200字以内の段落で」など、
出力の形を指示するとAIの回答が安定します。
特に後で使い回すドキュメントや、チームに共有するメモを作る時に効果絶大。`,
    hint: 'プロンプトの最後に「箇条書きで」「表で」「〇〇の構造で」と1行加えてみよう。',
    examplePrompt: 'Gitの基本操作（add / commit / push）を新人向けに説明してください。\n以下の形式で出力してください:\n- 各コマンドにつき、「何をするか」「いつ使うか」「具体例」を1行ずつ箇条書き',
    topic: {
      category: 'education',
      difficulty: 'standard',
      title: '新人向け Git 基本操作',
      brief: '新人エンジニア向けに Git の基本操作（add / commit / push）を説明してください。',
    },
    passCondition: { type: 'axis', axis: 'utility', threshold: 7 },
  },
  {
    id: 'lesson-04',
    number: 4,
    title: '具体例で示す（Few-shot）',
    technique: '入力 → 出力 の例を 2〜3 個提示',
    summary: 'AIに「こう書いてほしい」と言葉で説明するより、例を見せるほうが正確です。',
    explainer: `Few-shot プロンプティングは、AIに具体的な入出力例を 2〜3 個示してから本番の入力を与える技法。
例があるとAIは「同じパターンで書けばいい」と理解し、形式・トーン・粒度を真似てくれます。
形式の踏襲が重要な場面（議事録テンプレ、定型メール、UI コピーなど）で特に有効。`,
    hint: '「例1: 入力=... → 出力=...」「例2: 入力=... → 出力=...」 のあとに本番の入力を書く。',
    examplePrompt: `製品レビューを「★評価+1行コメント」の形式に変換してください。

例1:
入力: 「すごく使いやすくて毎日使ってます」
出力: ★★★★★ 毎日使うほど気に入っています

例2:
入力: 「悪くないけど期待ほどではなかった」
出力: ★★★☆☆ 期待より少し物足りない

本番:
入力: 「最初は戸惑ったけど慣れたら手放せなくなった」
出力:`,
    topic: {
      category: 'creative',
      difficulty: 'standard',
      title: 'レビューを定型に変換',
      brief: '自由形式の製品レビュー「最初は戸惑ったけど慣れたら手放せなくなった」を「★評価+1行コメント」形式に変換してください。',
    },
    passCondition: { type: 'axis', axis: 'accuracy', threshold: 7 },
  },
  {
    id: 'lesson-05',
    number: 5,
    title: '制約をかける',
    technique: '字数制限・禁止事項・出力範囲の限定',
    summary: '「やらないこと」を明示するのは「やること」を書くのと同じくらい強力です。',
    explainer: `制約は AI の暴走を防ぎます。たとえば:
- 文字数制限: 「200字以内で」
- 禁止事項: 「専門用語は使わない」「絵文字は使わない」
- 出力範囲: 「結論だけ、理由は省略」
事実重視の文章や、特定の読者向けに調整したい時に必須の技法。`,
    hint: '「〇〇しない」「△△字以内」「□□は省略」のような制約を明示しよう。',
    examplePrompt: 'AI（人工知能）とは何かを、小学生にも分かるように説明してください。\n制約:\n- 200字以内\n- 専門用語（機械学習、ニューラルネットワーク等）は使わない\n- 身近な例えを1つ含める',
    topic: {
      category: 'education',
      difficulty: 'standard',
      title: 'AIを小学生に説明',
      brief: 'AI（人工知能）とは何かを、小学生にも分かるように説明してください。',
    },
    passCondition: { type: 'axis', axis: 'accuracy', threshold: 7 },
  },
  {
    id: 'lesson-06',
    number: 6,
    title: '段階的に考えさせる',
    technique: '検討手順を指定する / ステップごとに整理させる',
    summary: '複雑な問題では、答えだけを求めるより、検討ステップを指定した方が抜け漏れが減ります。',
    explainer: `複雑な問題で「結論だけ書いて」と頼むと、AIは飛躍した答えを出しがちです。
そこで「Step 1 で○○を整理 → Step 2 で△△を検討 → Step 3 で結論を述べる」のように
**検討手順を指定** すると、AIは構造化された回答を返し、抜け漏れが減ります。
内部の長い思考を全部書かせる必要はありません。ユーザーが確認できる「要点だけ」を段階で示してもらうのがコツ。`,
    hint: '「以下の形式で出力してください: 1. ○○の整理 2. △△の検討 3. 最終結論」のように手順を指定。',
    examplePrompt: `次の問題を解いてください。

以下の形式で出力してください:
1. 必要な条件の整理
2. 計算または検討ステップの要約
3. 最終結論

内部の思考過程を長く書く必要はありません。ユーザーが確認できる要点だけを示してください。

問題:
12人のチームで、ペアプロを毎日2時間ずつ行う。各メンバーは週に2回は別のメンバーとペアを組む必要がある。週5日として、何通りのペア組み合わせを計画する必要があるか。`,
    topic: {
      category: 'tech',
      difficulty: 'high',
      title: 'ペアプロ組み合わせの計画',
      brief: '12人のチームで、ペアプロを毎日2時間ずつ行う。各メンバーは週に2回は別のメンバーとペアを組む必要がある。週5日として、何通りのペア組み合わせを計画する必要があるか。',
    },
    passCondition: { type: 'axis', axis: 'accuracy', threshold: 7 },
  },
  {
    id: 'lesson-07',
    number: 7,
    title: '自己批評ループ',
    technique: '"下書き → 自己批評 → 改善版" の3段階指示',
    summary: 'AIに自分の答えを批評させ、改善させると、出力品質が一段上がります。',
    explainer: `自己批評ループは、AIの出力を AI 自身に見直させる技法。
1. まず下書きを書く
2. 「この下書きの弱点を3つ挙げて」と批評させる
3. 「弱点を修正した改善版を出して」と指示する
これだけで、1発で書くより質の高い出力が得られます。`,
    hint: '「まず下書き、次にその弱点を3つ、最後に改善版を提示」と1つのプロンプトに書く。',
    examplePrompt: `新規SaaSプロダクトの市場投入戦略を提案してください。以下の3段階で進めてください:

ステップ1: まず下書き案を簡潔に出す
ステップ2: その下書きの弱点・抜け漏れを3つ指摘する
ステップ3: 弱点を解消した改善版を出す`,
    topic: {
      category: 'business',
      difficulty: 'high',
      title: 'SaaS市場投入戦略の提案',
      brief: '中小企業向けの新しいプロジェクト管理SaaSを市場投入する戦略を提案してください。',
    },
    passCondition: { type: 'each', threshold: 7 },
  },
  {
    id: 'lesson-08',
    number: 8,
    title: '統合チャレンジ',
    technique: 'これまで学んだ技法を全部使う',
    summary: '役割・構造・制約・例示・段階的な検討手順・自己批評を組み合わせて、実用的なプロンプトを書きましょう。',
    explainer: `これまで学んだ技法を組み合わせて、実務でそのまま使えるレベルのプロンプトを書いてみましょう。
全部使う必要はありませんが、お題に応じて適切な技法を選んで組み合わせるのがポイント。
合計 24 点以上で通過。腕試しのつもりで挑んでください。`,
    hint: 'Lesson 1〜7 で学んだ技法から、このお題に合うものを 3 つ以上組み合わせよう。',
    examplePrompt: `あなたは10年のキャリアを持つプロダクトマネージャーです。

タスク: 新しいタスク管理アプリの「初回起動オンボーディング」のコピーライティングを提案してください。

ステップ1: 想定ユーザーを3パターン定義する
ステップ2: 各ユーザーに合うオンボーディング画面のコピーを提案
ステップ3: 自分の提案の弱点を1つ挙げ、改善版を出す

出力形式:
- ユーザーパターンは表形式で
- コピーは「タイトル / 本文 / CTA」の3行構造
- 改善版は変更点を明示

制約:
- コピーは各画面50字以内
- 否定形・専門用語は避ける`,
    topic: {
      category: 'business',
      difficulty: 'high',
      title: 'タスク管理アプリのオンボーディングコピー',
      brief: '新しいタスク管理アプリの「初回起動オンボーディング」のコピーライティングを提案してください。',
    },
    passCondition: { type: 'total', threshold: 24 },
  },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map(l => [l.id, l]));

// Free practice topics — picked from the original topic pool.
export const FREE_TOPICS = [
  { id: 'free-biz-launch', category: 'business', difficulty: 'standard',
    title: '新規SaaSプロダクトの市場投入戦略',
    brief: '中小企業向けの新しいプロジェクト管理SaaSを市場投入する。3ヶ月以内に有料顧客100社を獲得するための戦略を立案せよ。' },
  { id: 'free-tech-api', category: 'tech', difficulty: 'standard',
    title: 'タスク管理APIの設計',
    brief: 'マルチテナントのタスク管理サービス向けに、コアAPI（タスクCRUD、コメント、通知）を設計せよ。' },
  { id: 'free-edu-explain', category: 'education', difficulty: 'standard',
    title: '機械学習を中学生に説明',
    brief: '機械学習とは何かを中学生にも理解できるよう説明し、身近な例を含めよ。' },
  { id: 'free-cre-story', category: 'creative', difficulty: 'standard',
    title: '短編小説の冒頭シーン',
    brief: '雨が降り続く街を舞台とした短編小説の、印象的な冒頭2〜3シーンを作成せよ。' },
  { id: 'free-aca-remote', category: 'academic', difficulty: 'standard',
    title: 'リモートワークの生産性に関するレビュー',
    brief: 'リモートワークが個人およびチームの生産性に与える影響について、既存知見を整理し論点を提示せよ。' },
  { id: 'free-tech-incident', category: 'tech', difficulty: 'high',
    title: '本番障害のポストモーテム',
    brief: 'マイクロサービス環境で発生した断続的な500エラーについて、原因分析と再発防止策をまとめよ。' },
  { id: 'free-biz-pivot', category: 'business', difficulty: 'high',
    title: 'スタートアップのピボット判断',
    brief: 'シード期スタートアップが既存事業の伸び悩みに直面している。ピボットすべきか、現方針を維持すべきかの判断材料を整理せよ。' },
  { id: 'free-edu-curriculum', category: 'education', difficulty: 'high',
    title: 'プロンプトエンジニアリング研修設計',
    brief: '社会人初学者向けに2日間のプロンプトエンジニアリング研修カリキュラムを設計せよ。' },
];

export const CATEGORY_LABEL = {
  business: 'ビジネス',
  academic: '学術',
  creative: '創作',
  tech: '技術',
  education: '教育',
  neutral: '汎用',
};

/** Check if a judge result passes a lesson's condition. */
export function checkPass(judge, condition) {
  const total = (judge.accuracy || 0) + (judge.utility || 0) + (judge.novelty || 0);
  if (condition.type === 'each') {
    return judge.accuracy >= condition.threshold
        && judge.utility >= condition.threshold
        && judge.novelty >= condition.threshold;
  }
  if (condition.type === 'axis') {
    return (judge[condition.axis] || 0) >= condition.threshold;
  }
  if (condition.type === 'total') {
    return total >= condition.threshold;
  }
  return false;
}

export function passText(condition) {
  if (condition.type === 'each') return `すべての軸で ${condition.threshold}点 以上`;
  if (condition.type === 'axis') {
    const labels = { accuracy: '正しさ', utility: '役立ち', novelty: '新しさ' };
    return `${labels[condition.axis] || condition.axis} ${condition.threshold}点 以上`;
  }
  if (condition.type === 'total') return `合計 ${condition.threshold}点 以上 (30点満点)`;
  return '';
}
