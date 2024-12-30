"use strict";

let github;
let context = {};

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

      $("select#repository").change(() => {
        const repoName = $("#repository").val();
        chrome.storage.sync.set({ repository: repoName });
        github.repo = repoName;
      });

      $("#commit").removeClass("disabled");
    })
    .catch((err) => {
      $("#commit").removeClass("disabled");
      $("#result").removeClass("d-none").addClass("flash-error").text(err);
    });
});

function initContext() {
  context = {};
  return new Promise((resolve, reject) => {
    var items = ["token", "user", "baseUrl", "repository"];
    chrome.storage.sync.get(items, (item) => {
      if (!item.token) {
        reject(new Error("need login"));
      }
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
  return checkGitHubAPI()
    .then(getAllRepositories)
    .then((repos) => {
      return new Promise((resolve) => {
        $(".repo-menu").empty();
        repos.forEach((repo) => {
          let content = `<option data='${repo.name}'>${repo.name}</option>`;
          $(".repo-menu").append(content);
        });
        resolve();
      });
    });
}

function getProjectId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const url = tabs[0].url;
        const projectId = url.split("/").filter(Boolean).pop();

        $("#branch").val(projectId);
      }
    });

    //TDOO: 別メソッドにする
    chrome.storage.sync.get(["repository"], (item) => {
      $("#repository").val(item.repository ? item.repository : "");
      resolve();
    });
  });
}

function setAllCommits() {
  return checkGitHubAPI()
    .then(getAllCommits)
    .then((commits) => {
      return new Promise((resolve) => {
        commits.forEach((commit) => {
          const date = new Date(commit.commit.author.date).toLocaleString();
          const message = commit.commit.message;

          // リストアイテムを作成
          const li = $("<li></li>").addClass("Box-row");

          const downloadButton = $("<button></button>")
            .addClass("btn btn-secondary btn-sm")
            .append(
              $("<img>")
                .attr("src", "image/download.svg")
                .attr("alt", "Download")
                .addClass("icon")
            );

          const dateSpan = $("<span></span>")
            .addClass("commit-date")
            .text(date);

          const messageSpan = $("<span></span>")
            .addClass("commit-message")
            .text(message);

          li.append(dateSpan);
          li.append(downloadButton);

          li.append("<br>");
          li.append(messageSpan);

          // リストに追加
          $("#message-list ul").append(li);
        });
        resolve();
      });
    });
}

function checkGitHubAPI(data = {}) {
  return new Promise(function (resolve, reject) {
    if (github === undefined) {
      reject("GitHubAPI object is undefined.");
    } else {
      resolve(data);
    }
  });
}

function getParam() {
  const repository = $("#repo").val();
  const branch = $("#branch").val();
  const message = $("#message").val();
  return {
    repository,
    branch,
    message,
  };
}

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

function getAllRepositories() {
  var allRepos = [];
  var loop = function (page, resolve, reject) {
    $.ajax({
      url:
        `${github.baseUrl}/user/repos` +
        `?affiliation=owner&per_page=100&page=${page}`,
      headers: { Authorization: `token ${github.token}` },
    })
      .done((repos) => {
        repos = Object.keys(repos).map((key) => repos[key]);
        if (repos.length === 0) {
          resolve(allRepos);
        } else {
          allRepos = allRepos.concat(repos);
          loop(page + 1, resolve, reject);
        }
      })
      .fail((err) => reject(err));
  };
  return new Promise((resolve, reject) => loop(1, resolve, reject));
}

async function getAllCommits() {
  var allCommits = [];
  var repo = $("#repository").val();
  var branch = $("#branch").val();

  const data = await new Promise((resolve, reject) => {
    chrome.storage.sync.get(["user"], (data) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(data);
      }
    });
  });
  var user = data.user;

  var loop = function (page, resolve, reject) {
    $.ajax({
      url:
        `${github.baseUrl}/repos/${user}/${repo}/commits` +
        `?sha=${branch}&per_page=100&page=${page}`,
      headers: { Authorization: `token ${github.token}` },
    })
      .done((commits) => {
        commits = Object.keys(commits).map((key) => commits[key]);
        if (commits.length === 0) {
          resolve(allCommits);
        } else {
          allCommits = allCommits.concat(commits);
          loop(page + 1, resolve, reject);
        }
      })
      .fail((err) => reject(err));
  };
  return new Promise((resolve, reject) => loop(1, resolve, reject));
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

$(document).ready(function () {
  // タブ切り替えの処理
  $(".tabnav-tab").click(function () {
    var target = $(this).attr("href").substring(1);
    $(".tabnav-tab").removeClass("selected");
    $(this).addClass("selected");

    if (target === "history") {
      $("#commit").hide();
    }

    if (target === "commit") {
      $("#history").hide();
    }

    $("#" + target).show();
  });
});
