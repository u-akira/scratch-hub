//----------------------------------------------------------
// 1. tokenを取得する api.scratch.mit.edu/projects/${id}
// 2. project.jsonをダウンロードする https://projects.scratch.mit.edu/${id}?token={$token}
// 3. project.jsonを読み込み、assets情報を取得する
// 4. 全て取得後、zipファイルを作成する
// 5. zipファイルをsb3にリネームし、githubにコミットする
//----------------------------------------------------------

const projectId = self.projectId;
const repository = self.repository;
const message = self.message;

chrome.runtime.sendMessage({
  log: `パラメータ: ${repository},${message}`,
});

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
              // コミット
              // ZIPファイルをダウンロード（FileSaver.jsが必要）
              saveAs(content, "project.sb3");
            });
          })
          .catch((error) => {
            console.error("Error generating ZIP:", error);
          });
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

function pushToGithub(param) {
  const repository = param.repository;
  const branch = projectId;
  const message = param.message;
  initContext()
    .then(initUserInfo)
    .then(checkGitHubAPI)
    .then(
      () =>
        new Promise((resolve) => {
          github.repo = repository;
          resolve();
        })
    )
    .then(github.get(`repos/${github.user}/${github.repo}/branches/${branch}`))
    .then((branch) => {
      if (!(context.name && context.email)) {
        context.name = branch.commit.commit.author.name;
        context.email = branch.commit.commit.author.email;
      }
      var sha = branch.commit.commit.tree.sha;
      return github.get(
        `repos/${github.user}/${github.repo}/git/trees/${sha}`
      )();
    })
    .then((tree) => existContents(filepath, tree.tree, repository))
    .then((exist) => {
      if (exist.ok) {
        return github.get(
          `repos/${github.user}/${github.repo}/git/blobs/${exist.sha}`
        )();
      } else {
        return new Promise((resolve) => {
          resolve({});
        });
      }
    })
    .then((blob) => {
      var data = {};
      var content = `- ${url} : ${message}`;
      if (blob.content) {
        content = Base64.decode(blob.content) + `\n${content}`;
        data.sha = blob.sha;
      }
      $.extend(data, {
        message: message ? message : "Bookmark!",
        committer: {
          name: context.name,
          email: context.email,
        },
        content: Base64.encode(content),
        branch: branch,
      });
      return github.put(
        `repos/${github.user}/${github.repo}/contents/${filepath}`,
        data
      )();
    })
    .then(() => {
      $("#commit").removeClass("disabled");
      $("#result")
        .removeClass("d-none")
        .removeClass("flash-error")
        .text("Succsess!");
      chrome.storage.sync.set({
        repository: repository,
        branch: branch,
        filepath: filepath,
      });
    })
    .catch((err) => {
      $("#commit").removeClass("disabled");
      $("#result").removeClass("d-none").addClass("flash-error").text(err);
    });
}
