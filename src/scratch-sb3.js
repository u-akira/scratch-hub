//----------------------------------------------------------
// 1. tokenを取得する api.scratch.mit.edu/projects/${id}
// 2. project.jsonをダウンロードする https://projects.scratch.mit.edu/${id}?token={$token}
// 3. project.jsonを読み込み、assets情報を取得する
// 4. 全て取得後、zipファイル(blob)を作成する
//----------------------------------------------------------

const param = self.param;
const github = new GitHubAPI(
  self.github.baseUrl,
  self.github.user,
  self.github.repository,
  self.github.token
);

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

                const headers = {
                  Accept: "application/vnd.github+json",
                  Authorization: `Bearer ${github.token}`,
                  "Content-Type": "application/json",
                };

                // ブランチの存在確認
                //const branchUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/branches/main`;
                const branchExists = checkBranchExists();
                if (!branchExists) {
                  console.warn("Branch not found. Creating branch...");
                  createBranch(main);
                }
                // ファイルをGitHubに更新
                updateFileOnGitHub(param, base64Content, headers);
              };

              const checkBranchExists = async () => {
                try {
                  const endpoint = `repos/${github.user}/${github.repository}/branches/main`;
                  const response = await github.get(endpoint)();
                  console.log("ブランチ確認中OK:", response);
                  return true;
                } catch (error) {
                  if (error.status === 404) {
                    console.warn(`ブランチ main は存在しません。`);
                    return false;
                  } else {
                    console.error("ブランチ確認中のエラー:", error);
                    throw new Error("ブランチ確認中にエラーが発生しました");
                  }
                }
              };

              const updateFileOnGitHub = async (param, base64Content) => {
                const filePath = `${param.projectId}/project.sb3`;
                const endpoint = `repos/${github.user}/${github.repository}/contents/${filePath}`;

                try {
                  // ファイルのSHAを取得
                  const sha = await getFileSha(endpoint);

                  // リクエストデータを構築
                  const requestData = {
                    message: param.message,
                    content: base64Content,
                    branch: param.branch,
                  };
                  if (sha) {
                    requestData.sha = sha;
                  }

                  // ファイル更新APIを呼び出し
                  const response = await github.put(endpoint, requestData)();
                  console.log("GitHub APIレスポンス:", response);

                  return response; // 更新後のレスポンスを返す
                } catch (error) {
                  console.error("GitHub APIエラー:", error);
                  chrome.runtime.sendMessage({
                    error: `GitHubへのコミットでエラーが発生しました: ${error.message}`,
                  });
                  throw error; // エラーを再スロー
                }
              };

              const getFileSha = async (endpoint) => {
                try {
                  const response = await github.get(endpoint)();
                  return response.sha; // ファイルのSHAを返す
                } catch (error) {
                  if (error.status === 404) {
                    console.warn(`ファイル "${filePath}" が存在しません。`);
                    return null; // ファイルが存在しない場合はnullを返す
                  } else {
                    console.error("GitHub API GETエラー:", error);
                    throw new Error(`GitHub API GETエラー: ${error.message}`);
                  }
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
  const baseBranch = "main";
  const baseBranchEndpoint = `repos/${github.user}/${github.repository}/branches/${baseBranch}`;
  const createBranchEndpoint = `repos/${github.user}/${github.repository}/git/refs`;

  try {
    // ベースブランチのSHAを取得
    const baseBranchData = await github.get(baseBranchEndpoint)();
    const baseSha = baseBranchData.commit.sha;

    // 新しいブランチを作成
    const requestData = {
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    };

    const response = await github.post(createBranchEndpoint, requestData)();
    console.log(`Branch ${branch} created successfully.`, response);

    return response; // 作成したブランチのデータを返す
  } catch (error) {
    console.error(`Error creating branch "${branch}":`, error);
    throw new Error(`Failed to create branch "${branch}": ${error.message}`);
  }
}

/*
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
  */
