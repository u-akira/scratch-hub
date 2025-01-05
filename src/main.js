"use strict";

let github;
let context = {};

$(document).ready(() => {
  initializeApp();
});

function initializeApp() {
  initContext()
    .then(setAllRepositories)
    .then(getProjectId)
    .then(setAllCommits)
    .then(enableCommitButton)
    .catch(handleError);

  setupEventHandlers();
}

function initContext() {
  context = {};
  return new Promise((resolve, reject) => {
    const items = ["token", "user", "baseUrl", "repository"];
    chrome.storage.sync.get(items, (item) => {
      if (!item.token)
        return reject(new Error("GitHub トークンが設定されていません。"));
      github = new GitHubAPI(
        item.baseUrl,
        item.user,
        item.repository,
        item.token
      );
      resolve();
    });
  });
}

function setAllRepositories() {
  return fetchAllRepositories().then((repos) => {
    $(".repo-menu").empty();
    repos.forEach((repo) => {
      const option = `<option value="${repo.name}">${repo.name}</option>`;
      $(".repo-menu").append(option);
    });
  });
}

function fetchAllRepositories() {
  const allRepos = [];
  const fetchPage = (page) =>
    $.ajax({
      url: `${github.baseUrl}/user/repos?affiliation=owner&per_page=100&page=${page}`,
      headers: { Authorization: `token ${github.token}` },
    }).then((repos) => {
      allRepos.push(...repos);
      return repos.length ? fetchPage(page + 1) : allRepos;
    });

  return fetchPage(1);
}

function getProjectId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const projectId = tabs[0].url.split("/").filter(Boolean).pop();
        $("#project-id").attr("data-project-id", projectId);
      }
    });

    chrome.storage.sync.get(["repository"], (item) => {
      $("#repository").val(item.repository || "");
      resolve();
    });
  });
}

function setAllCommits() {
  return fetchAllCommits().then((commits) => {
    $("#message-list ul").empty();

    commits.forEach((commit) => {
      if (!commit) {
        console.warn("Skipped a commit due to missing data:", commit);
        return;
      }

      renderCommit(commit);
    });
  });
}

function fetchAllCommits() {
  const allCommits = [];
  const param = getParam();

  return chrome.storage.sync.get(["user"]).then(({ user }) => {
    const fetchPage = (page) =>
      $.ajax({
        url: `${github.baseUrl}/repos/${user}/${
          param.repository
        }/commits?sha=main&path=${encodeURIComponent(
          param.projectId + "/project.sb3"
        )}&per_page=100&page=${page}`,
        headers: { Authorization: `token ${github.token}` },
      })
        .then((commits) => {
          allCommits.push(...commits);
          return commits.length ? fetchPage(page + 1) : allCommits;
        })
        .catch((error) => {
          if (error.status === 404) {
            console.warn("No commits found for this branch and file.");
            return [];
          } else {
            console.error("Error fetching commits:", error);
            return [];
          }
        });

    return fetchPage(1);
  });
}

function renderCommit(commit) {
  const date = new Date(commit.commit.author.date).toLocaleString();
  const message = commit.commit.message;
  const sha = commit.sha;

  const li = $("<li></li>").addClass("Box-row");
  const downloadButton = createDownloadButton(sha);
  const dateSpan = $("<span></span>").addClass("commit-date").text(date);
  const messageSpan = $("<span></span>")
    .addClass("commit-message")
    .text(message);

  li.append(dateSpan, downloadButton, $("<br>"), messageSpan);
  $("#message-list ul").append(li);
}

function createDownloadButton(sha) {
  return $("<button></button>")
    .addClass("btn btn-secondary btn-sm download")
    .attr("data-commit-sha", sha)
    .append(
      $("<img>")
        .attr("src", "image/download.svg")
        .attr("alt", "Download")
        .addClass("icon")
    );
}

function enableCommitButton() {
  $("#commit").removeClass("disabled");
}

function handleError(error) {
  console.error(error);
  $("#commit").removeClass("disabled");
  $("#result")
    .removeClass("d-none")
    .addClass("flash-error")
    .text(error.message);
}

function setupEventHandlers() {
  // タブ切り替えの処理
  $(".tabnav-tab").click(function () {
    const target = $(this).attr("href").substring(1);
    $(".tabnav-tab").removeClass("selected");
    $(this).addClass("selected");

    $(".tab-content").hide();
    $(`#${target}`).show();
  });

  // リポジトリ選択時の処理
  $("#repository").change(() => {
    const selectedRepo = $("#repository").val();
    chrome.storage.sync.set({ repository: selectedRepo });
    github.repository = selectedRepo;
  });

  // Commit ボタンのクリック処理
  $("#commit").click(() => handleCommitButtonClick());
}

async function handleCommitButtonClick() {
  if ($("#commit").hasClass("disabled")) return;

  $("#commit").addClass("disabled");
  $("#result").addClass("d-none");

  const param = getParam();

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      handleError(new Error("アクティブなタブが見つかりません。"));
      $("#commit").removeClass("disabled");
      return;
    }

    const activeTab = tabs[0];
    const tabId = activeTab.id;

    await executeScripts(tabId, param);

    /*
    const base64Content = await getMessageFromContentScript();
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${github.token}`,
      "Content-Type": "application/json",
    };

    // ブランチの存在確認
    const branchUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/branches/main`;
    const branchExists = await checkBranchExists(branchUrl, headers);
    if (!branchExists) {
      console.warn("Branch not found. Creating branch...");
      await createBranch(main);
    }

    // ファイルをGitHubに更新
    await updateFileOnGitHub(param, base64Content, headers);
    */

    $("#result").removeClass("d-none").text("commit に成功しました。");
  } catch (err) {
    console.error(`commit に失敗しました:`, err);
    $("#result")
      .removeClass("d-none")
      .addClass("flash-error")
      .text(`commitに失敗しました: ${err.message}`);
  } finally {
    $("#commit").removeClass("disabled");
  }
}

/*
const checkBranchExists = async (branchUrl, headers) => {
  try {
    const response = await fetch(branchUrl, { method: "GET", headers });
    return response.ok;
  } catch (error) {
    console.error("ブランチ確認中のエラー:", error);
    throw new Error("ブランチ確認中にエラーが発生しました");
  }
};

const updateFileOnGitHub = async (param, base64Content, headers) => {
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
        `GitHub APIエラー: ${response.status}, ${JSON.stringify(errorData)}`
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
  const response = await fetch(apiUrl, { method: "GET", headers });
  if (response.ok) {
    const data = await response.json();
    return data.sha;
  } else if (response.status === 404) {
    return null;
  } else {
    throw new Error(`GitHub API GETエラー: ${response.status}`);
  }
};

const getMessageFromContentScript = () => {
  return new Promise((resolve, reject) => {
    chrome.runtime.onMessage.addListener(function listener(request, sender) {
      if (request.commit) {
        chrome.runtime.onMessage.removeListener(listener); // リスナーを削除
        resolve(request.commit);
      }
    });

    setTimeout(() => {
      reject(new Error("コンテンツスクリプトからの応答がありませんでした"));
    }, 10000);
  });
};

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

function getParam() {
  return {
    projectId: $("#project-id").data("project-id"),
    repository: $("#repository").val(),
    message: $("#message").val() || "",
  };
}

function executeScripts(tabId, param) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        args: [param, github],
        func: (param, github) => {
          window.param = param;
          window.github = github;
        },
      },
      () => {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: [
              "lib/jszip.min.js",
              "lib/FileSaver.min.js",
              "lib/github-api.js",
              "src/scratch-sb3.js",
            ],
          },
          (injectionResult) => {
            if (chrome.runtime.lastError) {
              return reject(chrome.runtime.lastError);
            }

            console.log(
              "Content script executed successfully",
              injectionResult
            );
            resolve();
          }
        );
      }
    );
  });
}

$(document).ready(function () {
  // 動的に追加された .download ボタンにも対応
  $(document).on("click", ".download", async function () {
    try {
      console.log("Download button clicked.");
      await handleDownloadButtonClick.call(this);
    } catch (error) {
      console.error("Error in handleDownloadButtonClick:", error);
    }
  });

  async function handleDownloadButtonClick() {
    const tabs = await new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(tabs);
      });
    });

    if (tabs.length === 0) {
      console.error("アクティブなタブが見つかりません。");
      return;
    }

    const activeTab = tabs[0];
    const tabId = activeTab.id;
    const sha = $(this).data("commit-sha");
    const param = getParam();

    // パラメータとGitHubデータを設定
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        args: [sha, param.projectId, github],
        func: (sha, projectId, github) => {
          window.sha = sha;
          window.projectId = projectId;
          window.github = github;
        },
      },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error("Failed to set parameters:", chrome.runtime.lastError);
          return;
        }

        // sb3-download.js の実行
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: [
              "lib/FileSaver.min.js",
              "lib/jquery.min.js",
              "lib/github-api.js",
              "src/sb3-download.js",
            ],
          },
          (injectionResult) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Script injection failed:",
                chrome.runtime.lastError
              );
              return;
            }

            console.log("Scripts injected successfully", injectionResult);
          }
        );
      }
    );
  }
});

/*
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

    const sha = $(this).data("commit-sha");
    const param = getParam();
    const filePath = encodeURIComponent(param.projectId + "/project.sb3");
    const apiUrl = `${github.baseUrl}/repos/${github.user}/${github.repo}/contents/${filePath}?ref=${sha}`;

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${github.token}`,
      "Content-Type": "application/json",
    };

    try {
      // GitHubからファイルを取得する
      const shaResult = await getFile(apiUrl, headers);

      if (shaResult) {
        const decodedContent = atob(shaResult.content); // Base64デコード

        // デコードされたデータを Blob として処理する場合
        const byteArray = new Uint8Array(decodedContent.length);
        for (let i = 0; i < decodedContent.length; i++) {
          byteArray[i] = decodedContent.charCodeAt(i);
        }

        // Blobを生成
        const blob = new Blob([byteArray], {
          type: "application/octet-stream",
        });

        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `${title}.sb3`;
        a.click();

        URL.revokeObjectURL(downloadUrl);
      } else {
        console.error("File is not available.");
      }
    } catch (error) {
      console.error("Error occurred:", error);
    }
  }
    
});*/
