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

generateZip(github, param);

async function fetchProjectMeta(projectId) {
  const url = `https://api.scratch.mit.edu/projects/${projectId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch project metadata: ${response.status}`);
  }

  return response.json();
}

async function fetchProjectDetail(projectId, token) {
  const url = `https://projects.scratch.mit.edu/${projectId}/?token=${token}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch project detail: ${response.status}`);
  }

  return response.json();
}

async function fetchAsset(assetUrl, name) {
  const response = await fetch(assetUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch asset ${name} from ${assetUrl}`);
  }

  return response.blob();
}

async function processAssets(zip, targets) {
  const fetchPromises = [];

  for (const target of targets) {
    // コスチュームを処理
    for (const costume of target.costumes) {
      const md5ext = costume.md5ext;
      const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

      const costumePromise = fetchAsset(assetUrl, costume.name)
        .then((blob) => zip.file(md5ext, blob))
        .catch((error) => {
          console.error(
            `Error fetching costume asset ${costume.name}: ${error.message}`
          );
        });

      fetchPromises.push(costumePromise);
    }

    // サウンドを処理
    for (const sound of target.sounds) {
      const md5ext = sound.md5ext;
      const assetUrl = `https://assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

      const soundPromise = fetchAsset(assetUrl, sound.name)
        .then((blob) => zip.file(md5ext, blob))
        .catch((error) => {
          console.error(
            `Error fetching sound asset ${sound.name}: ${error.message}`
          );
        });

      fetchPromises.push(soundPromise);
    }
  }

  return Promise.all(fetchPromises);
}

async function generateZip(github, param) {
  try {
    const metaData = await fetchProjectMeta(param.projectId);
    const token = metaData.project_token;

    const projectData = await fetchProjectDetail(param.projectId, token);
    const projectJson = JSON.stringify(projectData);

    const zip = new JSZip();
    zip.file("project.json", projectJson);

    await processAssets(zip, projectData.targets);

    const content = await zip.generateAsync({ type: "blob" });
    const base64Content = await blobToBase64(content);

    await updateFileOnGitHub(github, param, base64Content);
  } catch (error) {
    console.error("Error generating ZIP:", error.message);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = (err) =>
      reject(new Error("Base64 encoding error: " + err.message));
    reader.readAsDataURL(blob);
  });
}

async function updateFileOnGitHub(github, param, base64Content) {
  const filePath = `${param.projectId}/project.sb3`;
  const endpoint = `repos/${github.user}/${github.repository}/contents/${filePath}`;

  try {
    // ファイルのSHAを取得
    const sha = await getFileSha(github, endpoint);

    // リクエストデータを構築
    const requestData = {
      message: param.message,
      content: base64Content,
    };
    if (sha) {
      requestData.sha = sha;
    }

    // ファイル更新APIを呼び出し
    const response = await github.put(endpoint, requestData)();
    console.log("GitHub API response:", response);

    return response; // 更新後のレスポンスを返す
  } catch (error) {
    console.error("GitHub API error:", error);
    throw new Error(`GitHub commit error: ${error.message}`);
  }
}

async function getFileSha(github, endpoint) {
  try {
    const response = await github.get(endpoint)();
    return response.sha; // ファイルのSHAを返す
  } catch (error) {
    if (error.status === 404) {
      console.warn(`File "${endpoint}" does not exist.`);
      return null; // ファイルが存在しない場合はnullを返す
    } else {
      console.error("GitHub API GET error:", error);
      throw new Error(`GitHub API GET error: ${error.message}`);
    }
  }
}
