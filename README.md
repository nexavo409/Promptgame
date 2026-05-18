# Prompt Architect — プロンプトエンジニアリング学習ツール

実際にプロンプトを書いて、AI に試させて、教師AIに講評してもらいながら学ぶ、段階別レッスン形式のWebアプリ。

## 動かし方

依存ゼロの静的Webアプリです。ES Modules を使うので簡易HTTPサーバ経由で開いてください。

### 推奨: 同梱の dev サーバ（キャッシュ無効化済み）

```powershell
cd C:\Users\grm23\.claude\projects\2026-05-17
python dev-server.py 5173
```

ブラウザで http://localhost:5173/ を開きます。`Cache-Control: no-store` ヘッダを返すので、JSを編集 → 更新で即反映されます。

### 公開デプロイ (GitHub Pages)

`main` に push すると自動デプロイされます: **https://nexavo409.github.io/Promptgame/**

(初回のみ GitHub の Settings → Pages → Source を "GitHub Actions" に設定してください。)

スマホからもこの URL でアクセス可能です。

### AI バックエンドの設定（任意）

ヘッダ右上の ⚙ をクリックして設定:

- **OpenAI互換サーバー URL** (優先される):
  - LM Studio: `http://192.168.1.3:1234` （ベースURLでOK）
  - Ollama: `http://192.168.1.3:11434`
  - vLLM: `http://192.168.1.3:8000`
  - OpenWebUI: `http://my-openwebui:8080/api/chat/completions` （完全URL推奨）
- **Bearer トークン** (任意・OpenWebUI など認証必須のサーバ用)
- **Anthropic API キー** (`sk-ant-...`): クラウド Claude を使う
- 全て空: 決定論的モック採点（オフラインで挙動確認用）

優先順位: **OpenAI互換 → Anthropic → モック**

#### スマホから自宅の OpenWebUI に繋ぐ場合

- 同一 WiFi 内なら、OpenWebUI の URL をローカル IP で指定
- 外出先からアクセスする場合は Tailscale / Cloudflare Tunnel 等で OpenWebUI を公開
- スマホブラウザは `http://` の API への mixed-content をブロックすることがあるため、OpenWebUI 側に SSL を被せるのが理想

## レッスン構成（8 段階）

| # | 学ぶ技法 |
|---|---|
| 1 | 最小プロンプト — お題を素直に伝える |
| 2 | 役割を与える（ペルソナ） |
| 3 | 出力構造を指定する（箇条書き・表・段落数） |
| 4 | 具体例で示す（Few-shot） |
| 5 | 制約をかける（字数・禁止事項） |
| 6 | Chain of Thought（順を追って考えさせる） |
| 7 | 自己批評ループ |
| 8 | 統合チャレンジ — 全部使って実用プロンプトを書く |

各レッスンには:
- 📖 技法の解説
- 💡 ヒント
- 📝 サンプルプロンプト（クリックでエディタに挿入可）
- 🎯 通過条件（各軸または合計のスコア閾値）
- 📜 過去 5 回までの試行履歴

加えて **🆓 自由練習モード** — 任意のお題で何度でも実験できる。

## 採点

AI が 3 軸で 0〜10 点採点:

- **正しさ** (accuracy): お題に対する内容の的確さ・事実関係
- **役立ち** (utility): 実務での活用しやすさ・具体性
- **新しさ** (novelty): 他と差別化された視点・新しい切り口

通過後は教師AIが講評:

- 👍 良かった点
- 🌱 もっと良くするには
- 💡 今日のレッスン（汎用テクニック）

## ファイル構成

```
index.html              トップHTML
styles.css              スタイル
dev-server.py           no-cache 簡易HTTPサーバ
src/
  data/
    lessons.js          8レッスン + 自由練習お題
  game/
    progress.js         localStorage 進捗管理
  ai/
    client.js           Anthropic / LM Studio / モック対応
  ui/
    app.js              UIコントローラ
scripts/
  validate.mjs          lessons / passCondition の自動検証
```

## 履歴

このプロジェクトは元々「プロンプト・トレーディングカードゲーム (Prompt Architect TCG)」として始まりました。
カードでプロンプトを組み立てて対戦するゲーム形式から、より教育目的に振り切ったレッスン形式へ移行しました。
TCG 版のコードは git 履歴の初回コミットに残っています。

## 既知の制限

- アカウント・クラウド同期なし。進捗は localStorage のみ（ブラウザを変えると別カウント）
- AI 判定はモデル応答のばらつきを含みます。重要な評価には複数回試行を推奨
- LM Studio を別マシンで動かす場合、「Allow CORS」と「Listen on all network interfaces」を有効にしてください

## ライセンス

MVP 実装。
