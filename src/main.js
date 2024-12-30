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
        $("#branch").val(projectId);
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
    commits.forEach(renderCommit);
  });
}

function fetchAllCommits() {
  const allCommits = [];
  const repo = $("#repository").val();
  const branch = $("#branch").val();

  return chrome.storage.sync.get(["user"]).then(({ user }) => {
    const fetchPage = (page) =>
      $.ajax({
        url: `${github.baseUrl}/repos/${user}/${repo}/commits?sha=${branch}&per_page=100&page=${page}`,
        headers: { Authorization: `token ${github.token}` },
      }).then((commits) => {
        allCommits.push(...commits);
        return commits.length ? fetchPage(page + 1) : allCommits;
      });

    return fetchPage(1);
  });
}

function renderCommit(commit) {
  const date = new Date(commit.commit.author.date).toLocaleString();
  const message = commit.commit.message;

  const li = $("<li></li>").addClass("Box-row");
  const downloadButton = createDownloadButton();
  const dateSpan = $("<span></span>").addClass("commit-date").text(date);
  const messageSpan = $("<span></span>")
    .addClass("commit-message")
    .text(message);

  li.append(dateSpan, downloadButton, $("<br>"), messageSpan);
  $("#message-list ul").append(li);
}

function createDownloadButton() {
  return $("<button></button>")
    .addClass("btn btn-secondary btn-sm download")
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

function handleCommitButtonClick() {
  if ($("#commit").hasClass("disabled")) return;

  $("#commit").addClass("disabled");
  $("#result").addClass("d-none");

  const param = getParam();

  if (!param.branch) {
    handleError(new Error("ブランチが指定されていません。"));
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      handleError(new Error("アクティブなタブが見つかりません。"));
      return;
    }

    const activeTab = tabs[0];
    const tabId = activeTab.id;

    executeScripts(tabId, param)
      .then(() => {
        $("#commit").removeClass("disabled");
        $("#result").removeClass("d-none").text(`commit に成功しました。`);
      })
      .catch((err) => {
        console.error(`commit に失敗しました:`, err);
        $("#commit").removeClass("disabled");
        $("#result")
          .removeClass("d-none")
          .addClass("flash-error")
          .text(`commitに失敗しました: ${err.message}`);
      });
  });
}

function getParam() {
  return {
    branch: $("#branch").val(),
    repository: $("#repository").val(),
    message: $("#message").val() || "",
  };
}

function executeScripts(tabId, param) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        args: [param.branch, param.repository, param.message],
        func: (projectId, repository, message) => {
          window.projectId = projectId;
          window.repository = repository;
          window.message = message;
        },
      },
      () => {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: [
              "lib/jszip.min.js",
              "lib/FileSaver.min.js",
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

/*
$(() => {
  initContext()
    .then(setAllRepositories)
    .then(getProjectId)
    .then(setAllCommits)
    .then(() => {
      if (github.repository === undefined) {
        return;
      }
    })
    .then(() => {
      $("#commit").click(() => {
        if (!$("#commit").hasClass("disabled")) {
          $("#commit").addClass("disabled");
          $("#result").addClass("d-none");

          //getParam();
          const projectId = $("#branch").val();
          const repository = $("#repo").val();
          const message = $("#message").val();

          if (!projectId) {
            console.error("プロジェクトIDが未指定です。");
            $("#commit").removeClass("disabled");
            return;
          }

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
              console.error("タブが取得できませんでした");
              $("#commit").removeClass("disabled");
              return;
            }
            const activeTab = tabs[0];
            const tabId = activeTab.id;

            chrome.scripting.executeScript(
              {
                target: { tabId: tabId },
                args: [projectId, repository, message],
                func: (projectId, repository, message) => {
                  console.log("取得したID:", projectId);
                  window.projectId = projectId;
                  window.repository = repository;
                  window.message = message;
                },
              },
              () => {
                chrome.scripting.executeScript(
                  {
                    target: { tabId: tabId },
                    files: [
                      "lib/jszip.min.js",
                      "lib/FileSaver.min.js",
                      "src/scratch-sb3.js",
                    ],
                  },
                  (injectionResult) => {
                    if (chrome.runtime.lastError) {
                      console.error(
                        "スクリプトの実行エラー:",
                        chrome.runtime.lastError
                      );
                    } else {
                      console.log(
                        "Content script executed successfully",
                        injectionResult
                      );
                    }

                    $("#commit").removeClass("disabled");
                  }
                );
              }
            );
          });
        }
      });

     

      $("#commit").removeClass("disabled");
    })
    .catch((err) => {
      $("#commit").removeClass("disabled");
      $("#result").removeClass("d-none").addClass("flash-error").text(err);
    });
});



function pushToGithub(param) {
  const repository = param.repository;
  const branch = param.branch;
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

function initUserInfo() {
  return checkGitHubAPI()
    .then(github.get(`users/${github.user}`))
    .then((user) => {
      return new Promise((resolve) => {
        context.name = user.name;
        context.email = user.email;
        resolve();
      });
    });
}

function existContents(filepath, pTree) {
  var loop = function (filepaths, index, pTree, resolve) {
    var path = filepaths[index];
    var result = {};
    for (var i in pTree) {
      if (pTree[i].path.toString() === path.toString()) {
        var length = filepaths.length;
        if (index === length - 1 && pTree[i].type.toString() === "blob") {
          result = pTree[i];
          break;
        } else if (pTree[i].type.toString() === "tree") {
          result = pTree[i];
          break;
        }
      }
    }
    switch (result.type) {
      case "blob":
        resolve({ ok: true, sha: pTree[i].sha });
        break;
      case "tree":
        $.ajax({
          url:
            `${github.baseUrl}/repos/` +
            `${github.user}/${github.repo}/git/trees/${pTree[i].sha}`,
          headers: { Authorization: `token ${github.token}` },
        })
          .done((tree) => {
            loop(filepaths, index + 1, tree.tree, resolve);
          })
          .fail(() => {
            resolve({ ok: false });
          });
        break;
      default:
        resolve({ ok: false });
    }
  };

  return new Promise((resolve) => {
    loop(filepath.split("/"), 0, pTree, resolve);
  });
}


*/
