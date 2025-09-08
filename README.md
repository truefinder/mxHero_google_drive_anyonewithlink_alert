# mxHero_google_drive_anyonewithlink_alert

Google Drive内の機密ファイルを自動で検出し、不適切な共有設定がされているファイルを特定するGoogle Apps Scriptです。

## 機能

- 指定したキーワードを含むファイルの自動検出
- 外部共有設定（リンクを知っている人と共有、ドメイン共有など）の確認
- 検出結果のSlack通知
- 高速な検索処理（バッチ処理・並列処理の実装）
- キャッシュ機能によるパフォーマンス最適化

## セットアップ方法

1. Google Apps Scriptプロジェクトを作成
2. `SETTINGS.gs`ファイルを作成し、以下の設定を行う：
   ```javascript
   const SETTINGS = {
     DRIVE_ID: "YOUR_DRIVE_ID_HERE",
     SENSITIVE_KEYWORDS: ["給与", "源泉", "証明書", "健康保険"],
     WEBHOOK: "YOUR_SLACK_WEBHOOK_URL"
   }
   ```
3. スクリプトに必要な権限を付与
4. トリガーを設定（平日毎日実行することを推奨）
5. （テスト）findSensitiveSharedFiles 実施

## 使用方法

1. `SETTINGS.gs`にGoogle DriveのIDを設定
2. 検索したいキーワードを`SENSITIVE_KEYWORDS`に追加
3. Slack通知を受け取りたい場合は、WebhookのURLを設定
4. スクリプトを実行

## 注意事項

- 大規模なドライブの場合、実行時間が長くなる可能性があります
- Google Apps Scriptの実行時間制限（6分）に注意してください
- 週末（土日）は自動的にスキップされます

## 作成者

Seunghyun Seo 

## ライセンス

Apache License 2.0
