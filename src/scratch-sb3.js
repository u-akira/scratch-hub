//----------------------------------------------------------
// 1. tokenを取得する api.scratch.mit.edu/projects/${id}
// 2. project.jsonをダウンロードする https://projects.scratch.mit.edu/${id}?token={$token}
// 3. project.jsonを読み込み、assets情報をダウンロードする
// 4. project_idフォルダ配下に保存
// 5. zipで圧縮する
// 6. sb3にリネームする
//----------------------------------------------------------

const projectId = self.projectId;
//chrome.storage.local.clear();

const projectMetaUrl = `https://api.scratch.mit.edu/projects/${projectId}`;

fetch(projectMetaUrl)
  .then((response) => response.json())
  .then((data) => {
    token = data["project_token"];

    const projectUrl = `https://projects.scratch.mit.edu/${projectId}/?token=${token}`;

    fetch(projectUrl)
      .then((response) => response.json())
      .then((projectData) => {
        const projectJson = JSON.stringify(projectData);

        const zip = new JSZip(); // ZIPファイルを作成

        // プロジェクトのJSONデータをZIPに追加
        zip.file("project.json", projectJson);

        // ターゲット（ステージやスプライト）の情報を取得
        projectData.targets.forEach((target) => {
          // コスチューム情報を取得
          target.costumes.forEach((costume) => {
            const md5ext = costume.md5ext;
            const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

            chrome.runtime.sendMessage({
              log: `Asset URL for costume "${costume.name}": ${assetUrl}`,
            });

            // アセットをフェッチしてZIPに追加
            fetch(assetUrl)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(
                    `Failed to fetch ${costume.name} from ${assetUrl}`
                  );
                }
                return response.blob();
              })
              .then((blob) => {
                zip.file(md5ext, blob);
              })
              .catch((error) =>
                chrome.runtime.sendMessage({
                  log: `Error fetching costume asset ${costume.name}:`,
                  error,
                })
              );
          });

          // サウンド情報を取得
          target.sounds.forEach((sound) => {
            const md5ext = sound.md5ext;
            const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

            // サウンドアセットをフェッチしてZIPに追加
            fetch(assetUrl)
              .then((response) => response.blob())
              .then((blob) => {
                zip.file(md5ext, blob);
              })
              .catch((error) =>
                chrome.runtime.sendMessage({
                  log: `Error fetching sound asset ${sound.name}:`,
                  error,
                })
              );
          });
        });

        // ZIPファイルを作成してダウンロード
        zip.generateAsync({ type: "blob" }).then((content) => {
          // ファイル名を指定してダウンロード
          saveAs(content, "project.zip");
        });

        /*
        // ターゲット（ステージやスプライト）の情報を取得
        projectData.targets.forEach((target) => {
          // コスチューム情報を取得
          target.costumes.forEach((costume) => {
            const assetId = costume.assetId;
            const md5ext = costume.md5ext;
            const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

            chrome.runtime.sendMessage({
              log: `Asset URL for costume "${costume.name}": ${assetUrl}`,
            });
          });

          // サウンド情報を取得
          target.sounds.forEach((sound) => {
            const assetId = sound.assetId;
            const md5ext = sound.md5ext;
            const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

            chrome.runtime.sendMessage({
              log: `Asset URL for sound "${sound.name}": ${assetUrl}`,
            });
          });
        });
        */

        /*
        // Storage に保存する
        const storageKey = `${projectId}_project`;
        const saveData = {};
        saveData[storageKey] = projectJson;

        chrome.storage.local.set(saveData, () => {
          if (chrome.runtime.lastError) {
            chrome.runtime.sendMessage({
              log: `Storage保存エラー: ${chrome.runtime.lastError.message}`,
            });
            console.error("Storage保存エラー:", chrome.runtime.lastError);
          } else {
            chrome.runtime.sendMessage({
              log: `プロジェクトデータを保存しました: ${storageKey}`,
            });
          }
        });
        */
      })
      .catch((error) => {
        chrome.runtime.sendMessage({
          log: `プロジェクトデータ取得エラー: ${error.message}`,
        });
        console.error("プロジェクトデータ取得エラー:", error);
      });
  })
  .catch((error) => {
    chrome.runtime.sendMessage({
      log: `APIエラー:: error`,
    });
    console.error("APIエラー:", error);
  });
