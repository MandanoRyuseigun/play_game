# play_game

## NoS 戦歴アーカイブ（GitHub Pages）

Nebula on the Ship の戦歴リザルトを Web で公開するページです。左の一覧から試合を選ぶと、マップの再生も含めてブラウザで見られます。試合ごとのリンクも作れるので、X などに貼って共有できます。

- 公開ページ: `https://mandanoryuseigun.github.io/play_game/`（下の「最初の設定」が済むと開けます）
- サンプル: `docs/matches/sample-match.html`（架空のダミーデータです。不要になったら削除してください）

### 最初の設定（1回だけ）

1. GitHub でこのリポジトリを開き、**Settings → Pages** を開きます。
2. 「Build and deployment」の Source を **Deploy from a branch** にします。
3. Branch で公開するブランチ（例: `main`）とフォルダ **`/docs`** を選び、Save を押します。
4. 数分待つと、上の URL でページが開けるようになります。
5. **Settings → Actions → General → Workflow permissions** を **Read and write permissions** にします（一覧の自動更新に必要です）。

### 試合を追加する

1. `nos-result-saver` のツールで、リザルトを「保存（操作できる版）」として保存します。
2. GitHub でこのリポジトリの `docs/matches` フォルダを開き、**Add file → Upload files** で保存した HTML をアップロードして、Commit changes を押します。
3. 自動で一覧（`docs/matches/matches.json`）が更新され、数分でページに反映されます。

一覧に表示される名前やメモを変えたいときは、`docs/matches/matches.json` の該当する試合の `title` や `note` を書き換えてください。書き換えた内容は、そのあと自動更新が走っても残ります。

試合を消したいときは、`docs/matches` から HTML ファイルを削除すれば一覧からも消えます。

### 公開前の注意

- 保存ファイルには、リザルトに表示されるプレイヤー名や役職などがすべて含まれます。一緒に遊んだ人に公開してよいか確認してください。
- 公開リポジトリなので、ファイルは誰でも見られます。削除しても履歴やコピーが残ることがあります。

## nos-result-saver

リザルトを保存するツールです。詳しくは [nos-result-saver/README.md](nos-result-saver/README.md) を見てください。
