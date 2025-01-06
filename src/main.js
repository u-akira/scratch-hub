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
  const fetchPage = (page) => {
    return github
      .get(`user/repos?affiliation=owner&per_page=100&page=${page}`)()
      .then((repos) => {
        allRepos.push(...repos);
        return repos.length ? fetchPage(page + 1) : allRepos;
      });
  };

  return fetchPage(1);
}

function getProjectId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const url = tabs[0].url;

        try {
          const extractProjectId = (url) => {
            const parts = url.split("/").filter(Boolean); // 空の要素を除外
            const projectIndex = parts.findIndex((part) => part === "projects");

            // "projects"の次の部分がプロジェクトID
            if (projectIndex !== -1 && parts[projectIndex + 1]) {
              return parts[projectIndex + 1];
            }

            // プロジェクトIDが見つからない場合
            throw new Error("Invalid Scratch project URL");
          };

          const projectId = extractProjectId(url);
          $("#project-id").attr("data-project-id", projectId);
        } catch (error) {
          console.error(error.message);
          reject(error);
          return;
        }
      }

      // ストレージからリポジトリを取得
      chrome.storage.sync.get(["repository"], (item) => {
        $("#repository").val(item.repository || "");
        resolve();
      });
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
  const filePath = encodeURIComponent(param.projectId + "/project.sb3");

  return chrome.storage.sync.get(["user"]).then(({ user }) => {
    const fetchPage = (page) => {
      return github
        .get(
          `repos/${user}/${param.repository}/commits?sha=main&path=${filePath}&per_page=100&page=${page}`
        )()
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
    };

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
    const selectedRepository = $("#repository").val();
    chrome.storage.sync.set({ repository: selectedRepository });
    github.repository = selectedRepository;
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
              "lib/jquery.min.js",
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
