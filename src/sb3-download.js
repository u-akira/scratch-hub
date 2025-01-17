(async () => {
  const sha = self.sha;
  const projectId = self.projectId;
  const github = new GitHubAPI(
    self.github.baseUrl,
    self.github.user,
    self.github.repository,
    self.github.token
  );

  const getDownloadUrl = async (endpoint) => {
    try {
      console.log("Fetching download URL from GitHub API...");
      const data = await github.get(endpoint)();
      console.log("GitHub API GET response:", data);

      // 正常なレスポンスかどうかを確認
      if (data && data.download_url) {
        return data.download_url;
      } else {
        console.warn("Download URL is not available in the response.");
        return null;
      }
    } catch (error) {
      if (error.status === 404) {
        console.error(`File not found at path: ${endpoint}`);
        return null;
      } else {
        console.error("GitHub API GETエラー:", error);
        throw new Error(`GitHub API GETエラー: ${error.message}`);
      }
    }
  };

  const filePath = `${projectId}/project.sb3`;
  const endpoint = `repos/${github.user}/${github.repository}/contents/${filePath}?ref=${sha}`;

  try {
    const title = $("#frc-title-1088").val();
    const downloadUrl = await getDownloadUrl(endpoint);

    if (!downloadUrl) {
      console.error("Failed to fetch the download URL.");
      return;
    }

    fetch(downloadUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);

        a.href = url;
        a.download = `${title}.sb3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
        console.log("File downloaded successfully.");
      })
      .catch((error) => {
        console.error("ファイルのダウンロードに失敗しました:", error);
      });
  } catch (error) {
    console.error("Error occurred during file download:", error);
  }
})();
