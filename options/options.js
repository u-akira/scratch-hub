"use strict";

$(() => {
  $(".message a").click((e) => {
    $(".error").hide();
    $(".login-container").animate(
      {
        height: "hide",
        opacity: "hide",
      },
      "slow"
    );
    $(`.${e.target.name}-login-container`).animate(
      {
        height: "show",
        opacity: "show",
      },
      "slow"
    );
  });
  $("#login").click((e) => {
    login(getGithubParam());
    //addCred(getGithubParam());
  });
  $("#logout").click((e) => {
    logout();
  });

  checkToken()
    .then((item) => {
      $(".login-container").hide();
      $(".logout-container").show();
      let user = item.user,
        domain,
        userLink,
        tokenLink;

      domain = "@Github.com";
      userLink = `https://github.com/${item.user}`;
      tokenLink = "https://github.com/settings/tokens";
      if (item.baseUrl !== "https://api.github.com") {
        let match = item.baseUrl.match(/:\/\/(.*)\/api\/v3/);
        if (!match || !match[1]) {
          domain = "";
          userLink = "";
          tokenLink = "";
        } else {
          domain = `@${match[1].match(/\w+\.\w+(?=\/|$)/)}`;
          userLink = `https://${match[1]}/${item.user}`;
          tokenLink = `https://${match[1]}/settings/tokens`;
        }
      }

      $("#login-user").text(`${user}${domain}`).attr("href", userLink);
      $("#token").attr("href", tokenLink);
    })
    .then(() => {
      auth();
    })
    .catch((err) => {
      //not logged in
    });
});

function getGithubParam() {
  const scm = "github";
  const username = $("#username").val();
  const token = $("#accesstoken").val();
  // const apiKey = $('#api-key').val();
  const apiKey = null;
  const baseUrl = `https://api.github.com`;
  const otp = $("#otp").val();
  return {
    scm,
    username,
    token,
    apiKey,
    baseUrl,
    otp,
  };
}

function addCred(param) {
  if (param.username === "") {
    return;
  }
  if (param.password === "" && param.token === "") {
    return;
  }

  if (param.apiKey && param.apiKey !== "") {
    const payload = {
      code: param.apiKey,
      client_id:
        "971735641612-am059p55sofdp30p2t4djecn72l6kmpf.apps.googleusercontent.com",
      client_secret: __SECRET__,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      grant_type: "authorization_code",
      access_type: "offline",
    };
    $.ajax({
      url: "https://www.googleapis.com/oauth2/v4/token",
      method: "POST",
      dataType: "json",
      contentType: "application/json",
      data: JSON.stringify(payload),
    }).done((response) => {
      chrome.storage.sync.set(
        {
          gapiRefreshToken: response.refresh_token,
          gapiToken: response.access_token,
        },
        () => {
          login(param);
        }
      );
    });
  } else {
    login(param);
  }
}

function login(param) {
  if (param.scm === "github") {
    addStar(param.token).then(() => {
      chrome.storage.sync.set(
        {
          scm: param.scm,
          user: param.username,
          token: param.token,
          baseUrl: param.baseUrl,
        },
        () => {
          location.reload();
        }
      );
      chrome.storage.local.get("tab", (item) => {
        if (item.tab) {
          chrome.tabs.reload(item.tab);
        }
      });
    });
  }
}

function loginGithub(param) {
  const username = param.username;
  const password = param.password;
  const baseUrl = param.baseUrl;
  const otp = param.otp;
  const payload = {
    scopes: ["repo", "gist"],
  };
  let headers = {
    Authorization: "Basic " + btoa(`${username}:${password}`),
  };
  if (otp && otp !== "") {
    headers["X-GitHub-OTP"] = otp;
  }
  $.ajax({
    url: `${baseUrl}/authorizations`,
    headers: headers,
    method: "POST",
    dataType: "json",
    contentType: "application/json",
    data: JSON.stringify(payload),
  })
    .done((response) => {
      addStar(response.token)
        .then(() => {
          return $.getJSON(`${baseUrl}/user`, {
            access_token: response.token,
          });
        })
        .then((userinfo) => {
          chrome.storage.sync.set(
            {
              scm: param.scm,
              user: userinfo.login,
              token: response.token,
              baseUrl: baseUrl,
            },
            () => {
              location.reload();
            }
          );
          chrome.storage.local.get("tab", (item) => {
            if (item.tab) {
              chrome.tabs.reload(item.tab);
            }
          });
        });
    })
    .fail((err) => {
      if (
        err.status == 401 &&
        err.getResponseHeader("X-GitHub-OTP") !== null &&
        $(".login-item-otp").filter(":visible").length == 0
      ) {
        $(".login-item").animate(
          {
            height: "toggle",
            opacity: "toggle",
          },
          "slow"
        );
      } else {
        $(".error").show();
      }
    });
}

function logout() {
  chrome.storage.sync.remove(
    ["scm", "token", "user", "baseUrl", "gapiToken", "gapiRefreshToken"],
    () => {
      location.reload();
    }
  );
  chrome.storage.local.get("tab", (item) => {
    if (item.tab) {
      chrome.tabs.reload(item.tab);
    }
  });
}

function checkToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["scm", "token", "user", "baseUrl"], (item) => {
      if (item.token && item.token !== "") {
        resolve(item);
      } else reject(new Error("can not get access token"));
    });
  });
}

function addStar(token) {
  if (!$("#star").is(":checked") || $("#star").is(":hidden")) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    $.ajax({
      url: `https://api.github.com/user/starred/leonhartX/gas-github`,
      headers: {
        "Content-Length": 0,
        Authorization: `token ${token}`,
      },
      method: "PUT",
    }).always(resolve);
  });
}

function auth() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        cmd: "login",
        interactive: true,
      },
      (token) => {
        if (token == null) {
          reject("can not get oauth token, currently only support Chrome");
        } else {
          chrome.storage.sync.set({
            gapiToken: token,
          });
          resolve(token);
        }
      }
    );
  });
}
