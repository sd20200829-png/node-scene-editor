# LoopLoveShell

Ren'Py で「ループ動画 + テキスト + 選択肢」で進行する恋愛ノベルのガワ（MVP）です。`game/data/scenes.json` と `game/assets/videos/` を差し替えることで内容を増やせます。

## 使い方（動画とJSONを差し替える手順）
1. `game/data/scenes.json` を編集し、シーン情報を追加します（UTF-8）。
2. `game/assets/videos/` に `.webm` 動画を配置し、`video` にファイル名を指定します。
3. Ren'Py Launcher でプロジェクトを起動して再生します。

### JSON 形式
```json
{
  "start": "s0001",
  "scenes": {
    "s0001": {
      "video": "scene_0001.webm",
      "text": "本文",
      "choices": [
        { "label": "選択肢", "to": "s0002" }
      ]
    }
  }
}
```


## フォント適用フロー（文字が表示されない場合）
1. Ren'Py プロジェクトの `game/assets/fonts/` に日本語対応フォント（例: `NotoSansJP-Regular.otf`）を配置します。
2. 本プロジェクトは起動時に次の順でフォントを探索し、見つかったものをシーン表示に適用します。
   - `assets/fonts/NotoSansJP-Regular.otf`
   - `assets/fonts/NotoSansJP-Medium.otf`
   - `assets/fonts/SourceHanSansJP-Regular.otf`
   - `assets/fonts/SourceHanSans-Regular.otf`
   - `assets/fonts/font.ttf`
   - `assets/fonts/custom.ttf`
3. どれも存在しない場合は Ren'Py デフォルトフォントにフォールバックします。
4. 文字が消える/豆腐になる場合は、まず上記いずれかの日本語フォントを配置して再起動してください。


## 生成スクリプトの安全ガード（Ren'Py 8.5.2向け）
- 生成 `script.rpy` は `config.quit_action` を安全ラッパーに設定し、終了確認は `renpy.confirm(message)` を使用します。
- ラベル名の自動生成時、以下の禁止識別子に衝突した場合は `scene_` プレフィックスへ自動リネームします。
  - `layout`, `Layout`, `ui`, `renpy`, `store`, `config`, `persistent`, `start`, `label`, `menu`, `screen`, `python`, `init`, `style`, `transform`, `define`, `default`, `jump`, `return`
- 生成時に禁止識別子衝突があれば `# LINT WARNING:` コメントを `script.rpy` 先頭に出力します。

## 動作確認メモ（クラッシュ再発防止）
1. ノード編集後に `JSON / script.rpy 更新` で生成内容を反映。
2. `変更を保存` で `game/script.rpy` と `game/scenes.json` を保存。
3. Ren'Py 起動後、以下を確認。
   - 通常シーンで背景動画・テキスト・選択肢が表示される
   - ESCまたはメニューから終了確認を開いて「キャンセル/終了」してもクラッシュしない
   - `AttributeError: 'Layout' object has no attribute 'yesno_prompt'` が再発しない

## 推奨動画規格
- 形式: WebM (VP9 + Opus 推奨)
- 解像度: 1280x720 または 1920x1080
- フレームレート: 30fps
- ループに合わせて冒頭と末尾を自然につなげると良いです

## Windows ビルド手順
1. Ren'Py Launcher でプロジェクトを開く。
2. `Build Distributions` を選択。
3. `Windows` をチェックしてビルド。
4. `dist/` 配下に生成された ZIP を配布します。

## エラーハンドリング
- `scenes.json` が無い/壊れている: エラー画面を表示します。
- `video` が無い/見つからない: "Missing video" を表示して進行します。
- `to` が存在しない: エラーメッセージを表示し、タイトルへ戻るボタンが出ます。

## ノードベースエディタ（試作）
`editor/index.html` をブラウザで開くと、シーンをノードで編集できます。

- スタートシーン（s0001）から開始。
- 各ノードに背景動画をドラッグ＆ドロップすると動画ファイル名を保持し、ノード内に静止サムネイル表示。
- 文章入力欄でテキストを編集。
- ノード右クリック → 「選択肢を追加」で新しいシーンノードを自動生成して接続（対応する選択肢ポートに紐づきます）。
- 選択肢テキストに `帰る`（旧: `ゲームをやめる` も互換対応）を入力すると、特殊ノード `end_game`（ゲーム終了）へ自動接続。
- ポートにマウスを重ねると、対応する選択肢テキストをポップ表示。
- 作成した選択肢はドラッグで表示順を並べ替え可能。
- 入力/出力どちらのポートからでもエッジをドラッグして接続先変更可能。既存エッジ自体をドラッグして切り離し・再接続もできます。
- 背景動画とBGMを各ノードへドロップ可能。ドロップ済みBGMは全ノードのBGMプルダウンから選択可能。
- 各ノードの `▶ シーンプレビュー` で、背景動画を 1920:1050 比率で全体表示（余白はパッド色）し、透明テキストウインドウ付きでゲームシーン遷移をプレビュー可能。
- `ノード整列` ボタンで、ストーリーが左→右に流れるレイアウトへ自動整列。
- ワークスペース右下のミニマップで全体配置と現在表示範囲を確認・移動可能。
- ノード右クリックメニューに「ゲーム終了を追加」「ノード削除」を追加（「ゲーム終了を追加」は選択肢ラベル `帰る` を追加して `end_game` へ接続）。
- ポート右クリックメニューに「ポート削除」を追加（出力ポートは対応選択肢を削除、入力ポートは流入接続を解除）。
- 非スタートノードで入力が空になると削除確認（Yesで削除 / Noで維持）。
- 「空ノードを整理」で、最終的に入力が空の非スタートノードを一括削除（特殊ノードは除外）。
- 右ペインに `scenes.json` と `script.rpy` の生成プレビューを表示。
- `script.rpy` 生成時、Movie displayable を `image` として定義し、動画設定のあるシーンでは `show <image名>` で背景動画を再生。
- `script.rpy` 生成時、`assets/fonts/` の候補フォント（yomogi / NotoSansJP / SourceHanSans など）を順に探索し、最初に見つかったフォントを `gui.text_font` / `gui.name_text_font` / `gui.interface_text_font` に適用。
- ツールバーの `変更を読み込む` で、過去に保存した `game/scenes.json` を読み込んでノードを復元（必須項目/形式を検証し、自動修復して取り込み）。
- ツールバーの `未使用アセット削除` で、現在のノードで参照されていない `assets/videos` / `assets/bgm` を削除。
- ツールバーの `変更を保存` で、初回のみ Ren'Py プロジェクトの `game` フォルダを選択して保存先を固定し、以後は `script.rpy`・`scenes.json`・投入済みアセット（`assets/videos`, `assets/bgm`）を同じ場所へ保存。
