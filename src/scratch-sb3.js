//----------------------------------------------------------
// 1. tokenを取得する api.scratch.mit.edu/projects/${id}
// 2. project.jsonをダウンロードする https://projects.scratch.mit.edu/${id}?token={$token}
// 3. project.jsonを読み込み、assets情報をダウンロードする
// 4. project_idフォルダ配下に保存
// 5. zipで圧縮する
// 6. sb3にリネームする
//----------------------------------------------------------

const projectId = self.projectId;
chrome.runtime.sendMessage({
  log: "scratch-api.js が実行されました${projectId}",
});
const apiUrl = `https://api.scratch.mit.edu/projects/${projectId}`;

fetch(apiUrl)
  .then((response) => response.json())
  .then((data) => {
    console.log("取得したプロジェクトデータ:", data);
    chrome.runtime.sendMessage({
      log: `取得したプロジェクトデータ: ${JSON.stringify(data)}`,
    });
  })
  .catch((error) => {
    console.error("APIエラー:", error);
  });
