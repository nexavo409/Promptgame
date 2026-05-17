// Topic pool — お題プール
// Each topic: { id, category, difficulty, title, brief }
//   difficulty: 'standard' | 'high' (high gets 1.3x score bonus)

export const TOPICS = [
  // business
  { id: 'biz-launch', category: 'business', difficulty: 'standard',
    title: '新規SaaSプロダクトの市場投入戦略',
    brief: '中小企業向けの新しいプロジェクト管理SaaSを市場投入する。3ヶ月以内に有料顧客100社を獲得するための戦略を立案せよ。' },
  { id: 'biz-pivot', category: 'business', difficulty: 'high',
    title: 'スタートアップのピボット判断',
    brief: 'シード期スタートアップが既存事業の伸び悩みに直面している。ピボットすべきか、現方針を維持すべきかの判断材料を整理せよ。' },
  { id: 'biz-pricing', category: 'business', difficulty: 'standard',
    title: 'BtoB SaaSの価格設計',
    brief: 'チームコラボツールの料金プランを3段階で設計する。各プランのターゲット・含まれる機能・価格を提示せよ。' },
  { id: 'biz-globalize', category: 'business', difficulty: 'high',
    title: '日本企業の東南アジア進出',
    brief: '国内で成功しているD2Cコスメブランドが東南アジア市場へ進出する。優先国・参入モデル・初期マーケ施策を提示せよ。' },

  // academic
  { id: 'aca-remote', category: 'academic', difficulty: 'standard',
    title: 'リモートワークの生産性に関するレビュー',
    brief: 'リモートワークが個人およびチームの生産性に与える影響について、既存知見を整理し論点を提示せよ。' },
  { id: 'aca-edu-ai', category: 'academic', difficulty: 'high',
    title: '生成AIの教育利用に関する研究設計',
    brief: '大学教育における生成AI利用が学習成果に与える影響を検証する研究計画の概要を作成せよ。' },
  { id: 'aca-policy', category: 'academic', difficulty: 'standard',
    title: '政策評価フレームの提案',
    brief: 'ある自治体の子育て支援政策の効果を評価するためのフレームワークを提案せよ。' },

  // creative
  { id: 'cre-shortstory', category: 'creative', difficulty: 'standard',
    title: '短編小説の冒頭シーン',
    brief: '雨が降り続く街を舞台とした短編小説の、印象的な冒頭2〜3シーンを作成せよ。' },
  { id: 'cre-character', category: 'creative', difficulty: 'standard',
    title: 'ファンタジー世界の主人公設計',
    brief: 'ハイファンタジー世界の主人公の背景・動機・葛藤・成長弧を設計せよ。' },
  { id: 'cre-brand', category: 'creative', difficulty: 'high',
    title: '新ブランドの世界観構築',
    brief: '都市生活者向けの新しいライフスタイルブランドの世界観・トーン・ストーリーを構築せよ。' },

  // tech
  { id: 'tech-api', category: 'tech', difficulty: 'standard',
    title: 'タスク管理APIの設計',
    brief: 'マルチテナントのタスク管理サービス向けに、コアAPI（タスクCRUD、コメント、通知）を設計せよ。' },
  { id: 'tech-incident', category: 'tech', difficulty: 'high',
    title: '本番障害のポストモーテム',
    brief: 'マイクロサービス環境で発生した断続的な500エラーについて、原因分析と再発防止策をまとめよ。' },
  { id: 'tech-review', category: 'tech', difficulty: 'standard',
    title: '新機能PRのレビュー観点',
    brief: '認証付きファイルアップロード機能を追加するプルリクエストのレビュー観点を整理せよ。' },

  // education
  { id: 'edu-explain', category: 'education', difficulty: 'standard',
    title: '機械学習を中学生に説明',
    brief: '機械学習とは何かを中学生にも理解できるよう説明し、身近な例を含めよ。' },
  { id: 'edu-curriculum', category: 'education', difficulty: 'high',
    title: 'プロンプトエンジニアリング研修設計',
    brief: '社会人初学者向けに2日間のプロンプトエンジニアリング研修カリキュラムを設計せよ。' },
  { id: 'edu-faq', category: 'education', difficulty: 'standard',
    title: '新人向けGit/GitHub FAQ',
    brief: '新人エンジニア向けにGit/GitHubの基本に関するFAQ集を作成せよ。' },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));

export const DIFFICULTY_BONUS = {
  standard: 1.0,
  high: 1.3,
};

export function randomTopic(rng = Math.random) {
  return TOPICS[Math.floor(rng() * TOPICS.length)];
}
