(async () => {
  console.log("aaa");
  const sha = window.sha;
  const projectId = window.projectId;
  const github = window.github;

  console.log("SHA:", sha);
  console.log("Project ID:", projectId);

  const getFile = async (apiUrl, headers) => {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers,
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    } else if (response.status === 404) {
      console.error("File not found at the given SHA.");
      return null;
    } else {
      throw new Error(`GitHub API GETエラー: ${response.status}`);
    }
  };

  const filePath = encodeURIComponent(projectId + "/project.sb3");
  const apiUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/contents/${filePath}?ref=${sha}`;

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${github.token}`,
    "Content-Type": "application/json",
  };

  try {
    // GitHubからファイルを取得する
    const shaResult = await getFile(apiUrl, headers);

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
