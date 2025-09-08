/**
 * 高速化された機密ファイル検索Google Apps Script
 * 検索キーワード: 給与, 源泉, 証明書, 健康保険
 * パフォーマンス最適化版
 */

// 検索するキーワードリスト
const SENSITIVE_KEYWORDS = SETTINGS.SENSITIVE_KEYWORDS;

// パフォーマンス設定
const BATCH_SIZE = 1000;           // 一度に処理するファイル数
const MAX_CONCURRENT = 5;          // 並列処理数
const CACHE_TIMEOUT = 300000;      // キャッシュタイムアウト（5分）

// キャッシュオブジェクト
const cache = {};

// メイン関数 - 高速化版
function findSensitiveSharedFiles() {
  const DRIVE_ID = SETTINGS.DRIVE_ID;
  
  if (DRIVE_ID === 'YOUR_DRIVE_ID_HERE') {
    console.log('❌ ドライブIDを設定してください！');
    return;
  }
  
  const startTime = new Date();
  const day = startTime.getDay(); // 日: 0, 月: 1, ..., 土: 6

  if (day === 0 || day === 6) {
    console.log("週末は実施しません");
    return;
  }

  console.log(`🚀 高速検索開始: ${DRIVE_ID}`);
  
  try {
    const results = [];
    const driveInfo = getDriveInfo(DRIVE_ID);
    console.log(`📁 ドライブ名: ${driveInfo.name}`);
    
    // 高速検索実行
    searchFilesOptimized(DRIVE_ID, results);
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    if (results.length > 0) {
      console.log(`⚠️  ${results.length}個の危険ファイルを${duration}秒で発見！`);
      // saveResultsToSpreadsheet(results, driveInfo.name);
      // printResults(results);
      sendResultsToSlack(results);
    } else {
      console.log(`✅ 機密ファイルなし（実行時間: ${duration}秒）`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error.toString());
  }
}

/**
 * 最適化されたファイル検索
 */
function searchFilesOptimized(driveId, results) {
  console.log('🔍 最適化検索を実行中...');
  
  // ステップ1: キーワードベース検索で対象ファイルを絞り込み
  const candidateFiles = findCandidateFiles(driveId);
  console.log(`📋 候補ファイル数: ${candidateFiles.length}`);
  
  if (candidateFiles.length === 0) {
    return;
  }
  
  // ステップ2: バッチ処理で権限チェック
  processFilesInBatches(candidateFiles, results);
}

/**
 * キーワードベースで候補ファイルを高速検索
 */
function findCandidateFiles(driveId) {
  const candidateFiles = [];
  
  // 各キーワードで並列検索
  SENSITIVE_KEYWORDS.forEach(keyword => {
    console.log(`🔎 キーワード検索: "${keyword}"`);
    
    let pageToken = null;
    do {
      try {
        // キーワードを含むファイル名で直接検索
        const response = Drive.Files.list({
          q: `name contains '${keyword}' and trashed=false`,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          corpora: 'drive',
          driveId: driveId,
          fields: 'nextPageToken, files(id, name, mimeType, parents, webViewLink, owners)',
          pageSize: BATCH_SIZE,
          pageToken: pageToken
        });
        
        if (response.files) {
          response.files.forEach(file => {
            // 重複チェック
            if (!candidateFiles.some(f => f.id === file.id)) {
              candidateFiles.push({
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                parents: file.parents || [],
                webViewLink: file.webViewLink,
                owners: file.owners,
                keyword: keyword
              });
            }
          });
        }
        
        pageToken = response.nextPageToken;
        
      } catch (error) {
        console.error(`キーワード"${keyword}"検索エラー:`, error.toString());
        break;
      }
    } while (pageToken);
  });
  
  return candidateFiles;
}

/**
 * ファイルパスを効率的に取得
 */
function getFilePath(file, driveId) {
  const cacheKey = `path_${file.id}`;
  
  // キャッシュチェック
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_TIMEOUT)) {
    return cache[cacheKey].path;
  }
  
  try {
    const pathParts = [];
    let currentParents = file.parents;
    
    // 最大10階層まで遡る（無限ループ防止）
    for (let i = 0; i < 10 && currentParents && currentParents.length > 0; i++) {
      const parentId = currentParents[0];
      
      // ドライブルートに到達
      if (parentId === driveId) {
        break;
      }
      
      try {
        const parent = Drive.Files.get(parentId, {
          fields: 'name, parents',
          supportsAllDrives: true
        });
        
        pathParts.unshift(parent.name);
        currentParents = parent.parents;
        
      } catch (error) {
        break;
      }
    }
    
    pathParts.push(file.name);
    const fullPath = pathParts.join('/');
    
    // キャッシュに保存
    cache[cacheKey] = {
      path: fullPath,
      timestamp: Date.now()
    };
    
    return fullPath;
    
  } catch (error) {
    return file.name; // エラー時はファイル名のみ
  }
}

/**
 * バッチ処理で権限チェック
 */
function processFilesInBatches(candidateFiles, results) {
  console.log('⚡ 権限チェック開始...');
  
  const totalBatches = Math.ceil(candidateFiles.length / BATCH_SIZE);
  
  for (let i = 0; i < totalBatches; i++) {
    const batch = candidateFiles.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    console.log(`📦 バッチ ${i + 1}/${totalBatches} (${batch.length}ファイル)`);
    
    // バッチ内で並列処理
    processBatchConcurrently(batch, results);
  }
}

/**
 * バッチ内並列処理
 */
function processBatchConcurrently(batch, results) {
  const chunks = [];
  const chunkSize = Math.ceil(batch.length / MAX_CONCURRENT);
  
  // チャンクに分割
  for (let i = 0; i < batch.length; i += chunkSize) {
    chunks.push(batch.slice(i, i + chunkSize));
  }
  
  // 各チャンクを処理
  chunks.forEach(chunk => {
    chunk.forEach(file => {
      checkFileOptimized(file, results);
    });
  });
}

/**
 * 最適化されたファイルチェック
 */
function checkFileOptimized(file, results) {
  try {
    // キーワードマッチング（再確認）
    const matchedKeywords = SENSITIVE_KEYWORDS.filter(keyword => 
      file.name.includes(keyword)
    );
    
    if (matchedKeywords.length === 0) {
      return;
    }
    
    
    // 権限チェック（キャッシュ使用）
    const permissions = getFilePermissions(file.id);
    const sharingInfo = checkExternalSharingOptimized(permissions);
    
    /** 
    if (sharingInfo.isShared) {
      // パス取得（必要な場合のみ）
      const filePath = getFilePath(file, null);
      
      results.push({
        fileId: file.id,
        fileName: file.name,
        filePath: filePath,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        matchedKeywords: matchedKeywords,
        sharingDetails: sharingInfo.details,
        owners: file.owners ? file.owners.map(o => o.emailAddress).join(', ') : 'N/A'
      });
      
      console.log(`⚠️  発見: ${file.name} [${matchedKeywords.join(', ')}]`);
    }
    */
    const filePath = getFilePath(file, null);
    results.push({
        fileId: file.id,
        fileName: file.name,
        filePath: filePath,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        matchedKeywords: matchedKeywords,
        sharingDetails: sharingInfo.details,
        owners: file.owners ? file.owners.map(o => o.emailAddress).join(', ') : 'N/A'
      });
      
      console.log(`⚠️  発見: ${file.name} [${matchedKeywords.join(', ')}]`);
    
  } catch (error) {
    console.error(`ファイルチェックエラー (${file.name}):`, error.toString());
  }
}

/**
 * キャッシュ付き権限取得
 */
function getFilePermissions(fileId) {
  const cacheKey = `perm_${fileId}`;
  
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_TIMEOUT)) {
    return cache[cacheKey].permissions;
  }
  
  try {
    const fileDetails = Drive.Files.get(fileId, {
      fields: 'permissions',
      supportsAllDrives: true
    });
    
    cache[cacheKey] = {
      permissions: fileDetails.permissions || [],
      timestamp: Date.now()
    };
    
    return fileDetails.permissions || [];
    
  } catch (error) {
    return [];
  }
}

/**
 * 最適化された外部共有チェック
 */
function checkExternalSharingOptimized(permissions) {
  if (!permissions || permissions.length === 0) {
    return { isShared: false, details: '共有なし' };
  }
  
  const sharingDetails = [];
  let hasExternalSharing = false;
  
  // 高リスク共有を優先チェック
  for (const permission of permissions) {
    if (permission.type === 'anyone') {
      hasExternalSharing = true;
      sharingDetails.push(`全体公開(${permission.role})`);
      break; // 最も危険なので即座に終了
    }
  }
  
  // ドメイン共有チェック
  if (!hasExternalSharing) {
    for (const permission of permissions) {
      if (permission.type === 'domain') {
        hasExternalSharing = true;
        sharingDetails.push(`ドメイン共有(${permission.role})`);
        break;
      }
    }
  }
  
  // ユーザー共有チェック
  if (!hasExternalSharing) {
    const userShares = permissions.filter(p => p.type === 'user' && p.emailAddress);
    if (userShares.length > 0) {
      hasExternalSharing = true;
      const userCount = userShares.length;
      sharingDetails.push(`ユーザー共有(${userCount}人)`);
    }
  }
  
  return {
    isShared: hasExternalSharing,
    details: sharingDetails.join(', ') || '内部のみ'
  };
}

/**
 * ドライブ情報取得（キャッシュ付き）
 */
function getDriveInfo(driveId) {
  const cacheKey = `drive_${driveId}`;
  
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }
  
  try {
    const drive = Drive.Drives.get(driveId);
    const info = { name: drive.name, type: 'shared' };
    cache[cacheKey] = info;
    return info;
  } catch (error) {
    try {
      const folder = Drive.Files.get(driveId);
      const info = { name: folder.name, type: 'folder' };
      cache[cacheKey] = info;
      return info;
    } catch (error2) {
      const info = { name: '不明なドライブ', type: 'unknown' };
      cache[cacheKey] = info;
      return info;
    }
  }
}

/**
 * 高速スプレッドシート保存
 */
function saveResultsToSpreadsheet(results, driveName) {
  try {
    console.log('💾 スプレッドシート作成中...');
    
    const spreadsheet = SpreadsheetApp.create(
      `【重要】機密ファイル検索_${driveName}_${new Date().toISOString().slice(0, 16).replace('T', '_')}`
    );
    const sheet = spreadsheet.getActiveSheet();
    
    // ヘッダー
    const headers = [
      'ファイルID', 'ファイル名', 'パス', 'タイプ', 
      'キーワード', '共有状態', '所有者', 'リンク'
    ];
    
    // データ準備
    const data = [headers];
    results.forEach(result => {
      data.push([
        result.fileId,
        result.fileName,
        result.filePath,
        result.mimeType,
        result.matchedKeywords.join(', '),
        result.sharingDetails,
        result.owners,
        result.webViewLink
      ]);
    });
    
    // 一括書き込み
    sheet.getRange(1, 1, data.length, headers.length).setValues(data);
    
    // 書式設定（一括）
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#dc3545')
      .setFontColor('white');
    
    if (results.length > 0) {
      sheet.getRange(2, 1, results.length, headers.length)
        .setBackground('#f8d7da');
    }
    
    // 列幅自動調整
    sheet.autoResizeColumns(1, headers.length);
    
    console.log(`📊 結果保存完了: ${spreadsheet.getUrl()}`);
    
  } catch (error) {
    console.error('スプレッドシート保存エラー:', error.toString());
  }
}

/**
 * 結果出力（最適化版）
 */
function printResults(results) {
  console.log('\n📋 === 検索結果詳細 ===');
  
  // 危険度順にソート
  results.sort((a, b) => {
    if (a.sharingDetails.includes('全体公開')) return -1;
    if (b.sharingDetails.includes('全体公開')) return 1;
    return a.matchedKeywords.length - b.matchedKeywords.length;
  });
  
  results.slice(0, 10).forEach((result, index) => {
    console.log(`\n${index + 1}. 🚨 ${result.fileName}`);
    console.log(`   キーワード: ${result.matchedKeywords.join(', ')}`);
    console.log(`   共有: ${result.sharingDetails}`);
    console.log(`   リンク: ${result.webViewLink}`);
  });
  
  if (results.length > 10) {
    console.log(`\n... 他${results.length - 10}件（スプレッドシートで確認）`);
  }
}

function sendResultsToSlack(results) {
  const webhookUrl = SETTINGS.WEBHOOK;

  results.forEach(result => {
    const message = 
      `⚠️ *検知*\n` +
      `*ファイル名*: ${result.fileName}\n` +
      `*ファイルパス*: ${result.filePath}\n` +
      // `🆔 *ファイルID*: ${result.fileId}\n` +
      // `📄 *MIMEタイプ*: ${result.mimeType}\n` +
      `*一致したキーワード*: ${result.matchedKeywords.join(', ')}\n` +
      `*共有リンク*: <${result.webViewLink}|ファイルを開く>\n` + "";
      // `👤 *オーナー*: ${Array.isArray(result.owners) ? result.owners.join(', ') : result.owners}\n` +
      // `🔐 *共有設定*: ${result.sharingDetails}`;
      

    const payload = {
      text: message
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };

    UrlFetchApp.fetch(webhookUrl, options);
    Utilities.sleep(1000); // レート制限を避けるため、1秒の待機
  });
}


/**
 * キャッシュクリア
 */
function clearCache() {
  Object.keys(cache).forEach(key => delete cache[key]);
  console.log('🧹 キャッシュをクリアしました');
}

/**
 * 高速テスト関数
 */
function testWithDriveIdFast(driveId) {
  if (!driveId) {
    console.log('❌ ドライブIDを入力してください');
    return;
  }
  
  console.log(`🚀 高速テスト実行: ${driveId}`);
  
  const originalDriveId = driveId;
  
  // 一時的にDRIVE_IDを設定
  const script = `
    const DRIVE_ID = '${originalDriveId}';
    findSensitiveSharedFiles();
  `;
  
  eval(script);
}
