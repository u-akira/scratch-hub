(async () => {
  const sha = self.sha;
  const projectId = self.projectId;
  const github = new GitHubAPI(
    self.github.baseUrl,
    self.github.user,
    self.github.repository,
    self.github.token
  );

  const getFile = async (endpoint) => {
    try {
      const data = await github.get(endpoint)();
      return data; // ファイルのデータを返す
    } catch (error) {
      if (error.status === 404) {
        console.error(`File not found at path: ${filePath}`);
        return null; // ファイルが存在しない場合はnullを返す
      } else {
        console.error("GitHub API GETエラー:", error);
        throw new Error(`GitHub API GETエラー: ${error.message}`);
      }
    }
  };

  const filePath = encodeURIComponent(projectId + "/project.sb3");
  const endpoint = `repos/${github.user}/${github.repository}/contents/${filePath}?ref=${sha}`;

  try {
    // GitHubからファイルを取得する
    const shaResult = await getFile(endpoint);

    if (!shaResult || !shaResult.content) {
      console.error("File content is not available.");
      return;
    }

    const title = $("#frc-title-1088").val();
    const decodedContent = atob(shaResult.content); // Base64デコード

    // デコードされたデータを Blob として処理する
    const byteArray = new Uint8Array(decodedContent.length);
    for (let i = 0; i < decodedContent.length; i++) {
      byteArray[i] = decodedContent.charCodeAt(i);
    }

    // Blobを生成
    const blob = new Blob([byteArray], {
      type: "application/octet-stream",
    });

    // ダウンロードリンク生成
    const downloadUrl = URL.createObjectURL(blob);
    console.log(`Generated download URL: ${downloadUrl}`);

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${title}.sb3`; // タイトルを使用
    document.body.appendChild(a); // 必要に応じて DOM に追加
    a.click();
    document.body.removeChild(a); // クリーンアップ

    URL.revokeObjectURL(downloadUrl);
    console.log("File downloaded successfully.");
  } catch (error) {
    console.error("Error occurred during file download:", error);
  }
})();
