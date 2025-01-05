//----------------------------------------------------------
// 1. tokenを取得する api.scratch.mit.edu/projects/${id}
// 2. project.jsonをダウンロードする https://projects.scratch.mit.edu/${id}?token={$token}
// 3. project.jsonを読み込み、assets情報を取得する
// 4. 全て取得後、zipファイル(blob)を作成する
//----------------------------------------------------------

const param = self.param;
const github = self.github;

const projectMetaUrl = `https://api.scratch.mit.edu/projects/${param.projectId}`;

fetch(projectMetaUrl)
  .then((response) => response.json())
  .then((data) => {
    token = data["project_token"];

    const projectUrl = `https://projects.scratch.mit.edu/${param.projectId}/?token=${token}`;

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

                //chrome.runtime.sendMessage({ commit: base64Content });

                const headers = {
                  Accept: "application/vnd.github+json",
                  Authorization: `Bearer ${github.token}`,
                  "Content-Type": "application/json",
                };

                // ブランチの存在確認
                const branchUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/branches/main`;
                const branchExists = checkBranchExists(branchUrl, headers);
                if (!branchExists) {
                  console.warn("Branch not found. Creating branch...");
                  createBranch(main);
                }
                // ファイルをGitHubに更新
                updateFileOnGitHub(param, base64Content, headers);
              };

              const checkBranchExists = async (branchUrl, headers) => {
                try {
                  const response = await fetch(branchUrl, {
                    method: "GET",
                    headers,
                  });
                  console.log("ブランチ確認中OK:");
                  return response.ok;
                } catch (error) {
                  console.error("ブランチ確認中のエラー:", error);
                  throw new Error("ブランチ確認中にエラーが発生しました");
                }
              };

              const updateFileOnGitHub = async (
                param,
                base64Content,
                headers
              ) => {
                const filePath = `${param.projectId}/project.sb3`;
                const apiUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/contents/${filePath}`;

                try {
                  const sha = await getFileSha(apiUrl, headers);

                  const requestData = {
                    message: param.message,
                    content: base64Content,
                    branch: param.branch,
                  };

                  if (sha) {
                    requestData.sha = sha;
                  }

                  const response = await fetch(apiUrl, {
                    method: "PUT",
                    headers: headers,
                    body: JSON.stringify(requestData),
                  });

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(
                      `GitHub APIエラー: ${response.status}, ${JSON.stringify(
                        errorData
                      )}`
                    );
                  }

                  const data = await response.json();
                  console.log("GitHub APIレスポンス:", data);
                } catch (error) {
                  console.error("GitHub APIエラー:", error);
                  chrome.runtime.sendMessage({
                    error: `GitHubへのコミットでエラーが発生しました: ${error.message}`,
                  });
                  throw error;
                }
              };

              const getFileSha = async (apiUrl, headers) => {
                const response = await fetch(apiUrl, {
                  method: "GET",
                  headers,
                });
                if (response.ok) {
                  const data = await response.json();
                  return data.sha;
                } else if (response.status === 404) {
                  return null;
                } else {
                  throw new Error(`GitHub API GETエラー: ${response.status}`);
                }
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

async function createBranch(branch) {
  const apiUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/git/refs`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${github.token}`,
    "Content-Type": "application/json",
  };

  try {
    // ベースブランチのSHAを取得
    const baseBranchApiUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/branches/main`;
    const baseBranchResponse = await fetch(baseBranchApiUrl, { headers });

    if (!baseBranchResponse.ok) {
      throw new Error(
        `Failed to fetch base branch main: ${baseBranchResponse.statusText}`
      );
    }

    const baseBranchData = await baseBranchResponse.json();
    const baseSha = baseBranchData.commit.sha;

    // 新しいブランチを作成
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create branch ${branch}: ${response.statusText}`
      );
    }

    console.log(`Branch ${branch} created successfully.`);
  } catch (error) {
    console.error("Error creating branch:", error);
    throw error;
  }
}
