# Prompt Architect — プロンプトエンジニアリング学習ツール

実際にプロンプトを書いて、AI に試させて、教師AIに講評してもらいながら学ぶ、段階別レッスン形式のWebアプリ。

## 動かし方

依存ゼロの静的Webアプリです。ES Modules を使うので簡易HTTPサーバ経由で開いてください。

### 推奨: 同梱の dev サーバ（キャッシュ無効化済み）

```powershell
python dev-server.py 5173
```

(macOS / Linux なら `python3 dev-server.py 5173`)

ブラウザで http://localhost:5173/ を開きます。`Cache-Control: no-store` ヘッダを返すので、JSを編集 → 更新で即反映されます。

### 公開デプロイ (GitHub Pages)

`main` に push すると自動デプロイされます: **https://nexavo409.github.io/Promptgame/**

(初回のみ GitHub の Settings → Pages → Source を "GitHub Actions" に設定してください。)

スマホからもこの URL でアクセス可能です。

### AI バックエンドの設定（任意）

ヘッダ右上の ⚙ をクリックして設定:

- **OpenAI互換サーバー URL** (優先される):
  - LM Studio: `http://192.168.1.3:1234` （ベースURLでOK、自動で `/v1/chat/completions` 付与）
  - Ollama: `http://192.168.1.3:11434`
  - vLLM: `http://192.168.1.3:8000`
  - OpenWebUI: `http://my-openwebui:8080/api/chat/completions` （完全URL推奨）
- **Bearer トークン** (任意・OpenWebUI など認証必須のサーバ用)
- **Anthropic API キー** (`sk-ant-...`): クラウド Claude を使う
- 全て空: 決定論的モック採点（オフラインで挙動確認用）

優先順位: **OpenAI互換 → Anthropic → モック**

#### ローカル LLM のおすすめ

採点 / 講評 / 改善版生成は計4回のLLM往復があるため、**reasoning モデルは避けて非reasoning モデル**を推奨します（reasoning モデルは内部思考にトークンを消費して出力が空になりやすい）。

実測で快適な構成:
- **Gemma 4 E4B Q8** (約4GB, 47 t/s): 4Bながら日本語の指示追従が高品質
- **Qwen 2.5 7B / 14B Instruct (Q4_K_M)**: より大型でも非reasoning なら十分速い

LM Studio を別マシンで動かす場合、「Allow CORS」と「Listen on all network interfaces」を有効にしてください。

#### スマホから自宅の OpenWebUI に繋ぐ場合

- 同一 WiFi 内なら、OpenWebUI の URL をローカル IP で指定
- 外出先からアクセスする場合は Tailscale / Cloudflare Tunnel 等で OpenWebUI を公開
- スマホブラウザは `http://` の API への mixed-content をブロックすることがあるため、OpenWebUI 側に SSL を被せるのが理想

## レッスン構成（8 段階）

| # | 学ぶ技法 | お題例 |
|---|---|---|
| 1 | 最小プロンプト — お題を素直に伝える | リモートワークのメリット |
| 2 | 役割を与える（ペルソナ） | 平日の夕食メニュー提案（栄養士視点） |
| 3 | 出力構造を指定する（箇条書き・表・段落数） | 部屋干しのコツ（表形式） |
| 4 | 具体例で示す（Few-shot） | レビューを定型に変換 |
| 5 | 制約をかける（字数・禁止事項） | AIを小学生に説明 |
| 6 | 段階的に考えさせる（手順指定） | 子供の誕生日パーティー企画 |
| 7 | 自己批評ループ（下書き→批評→改善版） | 家族旅行プランの推敲 |
| 8 | 統合チャレンジ — 全部使って実用プロンプトを書く | 結婚祝いメッセージ3パターン |

お題は意図的に**万人向けの生活シーン**を選んでいます（技術職以外の人もそのまま学べます）。

各レッスンには:
- 📖 技法の解説
- 💡 ヒント
- 📝 サンプルプロンプト（クリックでエディタに挿入可）
- 🎯 通過条件（各軸または合計のスコア閾値）
- 📜 過去 5 回までの試行履歴 + 2件を選んで diff 比較

加えて **🆓 自由練習モード** と **🛠️ マイお題（自作）** で、実務に直結したお題でも練習可能。

## 採点

教師AI が 3 軸で 0〜10 点採点します。**AI出力の良し悪しではなく「プロンプト設計の良し悪し」を重視**します。

- **正しさ** (accuracy): プロンプトがお題の目的を正確に伝えられているか
- **役立ち** (utility): 出力形式・粒度・制約・対象読者が明示され、再現性が高いか
- **新しさ** (novelty): 独自の視点・比較軸・読者設定・構成上の工夫があるか

採点を厳しくする設計上のルール:
- お題をそのまま言い換えただけのプロンプトは accuracy≤6 / utility≤6 / novelty≤4 に抑制
- 各レッスンの「中心技法」(役割、出力形式、Few-shot、制約、手順、自己批評など) を使っていないと該当軸を減点
- 統合チャレンジでは複数技法の組み合わせがないと加点しない

通過後は教師AIが講評:

- 👍 良かった点
- 🌱 もっと良くするには
- 💡 今日のレッスン（汎用テクニック）

加えて「**AIに改善版を書かせる**」ボタンで、講評の提案を実際にプロンプトに反映した改善版が得られます。

## ファイル構成

```
index.html              トップHTML
styles.css              スタイル（テーマ・ダーク対応）
dev-server.py           no-cache 簡易HTTPサーバ（ローカル開発用）
src/
  data/
    lessons.js          8レッスン + 自由練習お題 + 通過判定
    custom-topics.js    マイお題の localStorage 管理
    prompt-library.js   プロンプトライブラリ（参考集）
  game/
    progress.js         レッスン進捗 + 下書き自動保存
    diff.js             LCS ベースの行 diff
  ai/
    client.js           OpenAI互換 / Anthropic / モック対応 + プロンプト品質キャップ
  ui/
    app.js              UIコントローラ
  util/
    theme.js            ライト / ダーク / 自動テーマ
    markdown.js         軽量Markdownレンダラ
    hero-typer.js       トップのタイプライターデモ
scripts/
  validate.mjs          lessons / passCondition / JSON抽出の自動テスト
.github/workflows/
  pages.yml             GitHub Pages 自動デプロイ
```

## テストの実行

```bash
node scripts/validate.mjs
```

74+ アサーション — レッスン構造、通過判定、旧TCG文言の混入チェック、JSON抽出の堅牢性などを検証します。

## 履歴

このプロジェクトは元々「プロンプト・トレーディングカードゲーム (Prompt Architect TCG)」として始まりました。
カードでプロンプトを組み立てて対戦するゲーム形式から、より教育目的に振り切ったレッスン形式へ移行しました。
TCG 版のコードは git 履歴の初回コミットに残っています。

## 既知の制限

- アカウント・クラウド同期なし。進捗は localStorage のみ（ブラウザを変えると別カウント）
- AI 判定はモデル応答のばらつきを含みます。重要な評価には複数回試行を推奨
- LM Studio で **reasoning モデル** (DeepSeek-R1 / QwQ / qwen-reasoning-distilled など) を使うと、思考トークンに max_tokens を消費して採点・改善版生成が失敗することがあります。非 reasoning モデル推奨

## ライセンス

MIT License — 学習ツール / 商用利用OK
