//----------------------------------------------------------
// 1. tokenを取得する api.scratch.mit.edu/projects/${id}
// 2. project.jsonをダウンロードする https://projects.scratch.mit.edu/${id}?token={$token}
// 3. project.jsonを読み込み、assets情報を取得する
// 4. 全て取得後、zipファイル(blob)を作成する
// 5. zipファイルをsb3にリネームし、githubにコミットする
//----------------------------------------------------------

const param = self.param;
const github = self.github;

/*
fetchProjectAssets(param)
  .then((base64Content) => {
    console.log("生成されたBase64データ:", base64Content);
    chrome.runtime.sendMessage({
      log: "生成されたBase64データ",
      base64Content,
    });
  })
  .catch((error) => {
    console.error("エラー:", error.message);
    chrome.runtime.sendMessage({
      error: `エラーが発生しました: ${error.message}`,
    });
  });
  */

const projectMetaUrl = `https://api.scratch.mit.edu/projects/${param.branch}`;

fetch(projectMetaUrl)
  .then((response) => response.json())
  .then((data) => {
    token = data["project_token"];

    const projectUrl = `https://projects.scratch.mit.edu/${param.branch}/?token=${token}`;

    fetch(projectUrl)
      .then((response) => response.json())
      .then((projectData) => {
        const projectJson = JSON.stringify(projectData);

        const zip = new JSZip(); // ZIPファイルを作成

        // プロジェクトのJSONデータをZIPに追加
        zip.file("project.json", projectJson);

        // コスチュームとサウンドのアセットを取得するためのPromiseリスト
        const fetchPromises = [];

        // ターゲット（ステージやスプライト）の情報を取得
        projectData.targets.forEach((target) => {
          // コスチューム情報を取得
          target.costumes.forEach((costume) => {
            const md5ext = costume.md5ext;
            const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

            const costumePromise = fetch(assetUrl)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(
                    `Failed to fetch ${costume.name} from ${assetUrl}`
                  );
                }
                return response.blob();
              })
              .then((blob) => {
                zip.file(md5ext, blob); // ZIPにアセットを追加
              })
              .catch((error) => {
                chrome.runtime.sendMessage({
                  log: `Error fetching costume asset ${costume.name}:`,
                  error: error.message,
                });
              });

            fetchPromises.push(costumePromise);
          });

          // サウンド情報を取得
          target.sounds.forEach((sound) => {
            const md5ext = sound.md5ext;
            const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

            const soundPromise = fetch(assetUrl)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(
                    `Failed to fetch ${sound.name} from ${assetUrl}`
                  );
                }
                return response.blob();
              })
              .then((blob) => {
                zip.file(md5ext, blob);
              })
              .catch((error) => {
                chrome.runtime.sendMessage({
                  log: `Error fetching sound asset ${sound.name}:`,
                  error: error.message,
                });
              });

            fetchPromises.push(soundPromise);
          });
        });

        // すべてのアセットのフェッチが完了した後にZIPを生成
        Promise.all(fetchPromises)
          .then(() => {
            zip.generateAsync({ type: "blob" }).then((content) => {
              // ZIPファイルをBase64エンコード
              const reader = new FileReader();
              reader.onload = function () {
                const base64Content = reader.result.split(",")[1]; // Base64エンコードされたデータ部分を取得

                chrome.runtime.sendMessage({ commit: base64Content });
              };

              reader.onerror = function (err) {
                reject(new Error("Base64エンコードエラー: " + err.message));
              };

              reader.readAsDataURL(content); // Blob を Base64 に変換
            });
          })
          .catch((err) => {
            chrome.runtime.sendMessage({
              error: "ZIP生成中にエラーが発生しました:",
              err,
            });
          });
      })
      .catch((error) => {
        chrome.runtime.sendMessage({
          log: `プロジェクトデータ取得エラー: ${error.message}`,
        });
      });
  })
  .catch((error) => {
    chrome.runtime.sendMessage({
      log: `APIエラー:: error`,
    });
  });

/*
function fetchProjectAssets(param) {
  return new Promise((resolve, reject) => {
    const projectMetaUrl = `https://api.scratch.mit.edu/projects/${param.branch}`;

    fetch(projectMetaUrl)
      .then((response) => response.json())
      .then((data) => {
        const token = data["project_token"];
        const projectUrl = `https://projects.scratch.mit.edu/${param.branch}/?token=${token}`;

        fetch(projectUrl)
          .then((response) => response.json())
          .then((projectData) => {
            const projectJson = JSON.stringify(projectData);

            const zip = new JSZip(); // ZIPファイルを作成
            zip.file("project.json", projectJson);

            const fetchPromises = [];

            projectData.targets.forEach((target) => {
              // コスチューム情報を取得
              target.costumes.forEach((costume) => {
                const md5ext = costume.md5ext;
                const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

                fetchPromises.push(
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
                      zip.file(md5ext, blob); // ZIPにアセットを追加
                    })
                );
              });

              // サウンド情報を取得
              target.sounds.forEach((sound) => {
                const md5ext = sound.md5ext;
                const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

                fetchPromises.push(
                  fetch(assetUrl)
                    .then((response) => {
                      if (!response.ok) {
                        throw new Error(
                          `Failed to fetch ${sound.name} from ${assetUrl}`
                        );
                      }
                      return response.blob();
                    })
                    .then((blob) => {
                      zip.file(md5ext, blob);
                    })
                );
              });
            });

            // ZIP生成
            Promise.all(fetchPromises)
              .then(() => {
                zip.generateAsync({ type: "blob" }).then((content) => {
                  const reader = new FileReader();
                  reader.onload = function () {
                    const base64Content = reader.result.split(",")[1]; // Base64データ部分を取得
                    resolve(base64Content); // 呼び出し元に返す
                  };

                  reader.onerror = function (err) {
                    reject(new Error("Base64エンコードエラー: " + err.message));
                  };

                  reader.readAsDataURL(content); // Blob を Base64 に変換
                });
              })
              .catch((err) => {
                reject(new Error("ZIP生成エラー: " + err.message));
              });
          })
          .catch((error) => {
            reject(new Error("プロジェクトデータ取得エラー: " + error.message));
          });
      })
      .catch((error) => {
        reject(new Error("プロジェクトメタデータ取得エラー: " + error.message));
      });
  });
}
  */
