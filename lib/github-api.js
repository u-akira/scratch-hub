(function (exports) {
  "use strict";

  var GitHubAPI;
  GitHubAPI = (() => {
    function GitHubAPI(baseUrl, user, repository, token) {
      this.baseUrl = baseUrl;
      this.user = user;
      this.repository = repository;
      this.token = token;
    }

    GitHubAPI.prototype.fetch = function (method, endpoint, data) {
      return new Promise((resolve, reject) => {
        var params = {
          url: `${this.baseUrl}/${endpoint}`,
          headers: {
            Authorization: `token ${this.token}`,
          },
        };

        console.log("GitHubAPI fetch params:", params);
        switch (method) {
          case "GET":
            break;
          case "PUT":
          case "POST":
          case "PATCH":
            $.extend(params, {
              method: method,
              crossDomain: true,
              dataType: "json",
              contentType: "application/json",
              data: JSON.stringify(data),
            });
            break;
          default:
            throw "undefined HTTP method: " + method;
        }
        $.ajax(params)
          .done((data) => {
            console.log("GitHubAPI fetch data:", data);
            resolve(data);
          })
          .fail((jqXHR, textStatus, errorThrown) => {
            const errorObject = {
              endpoint: endpoint,
              status: jqXHR.status,
              responseText: jqXHR.responseText || "",
              textStatus: textStatus,
              errorThrown: errorThrown,
            };
            reject(errorObject);
          });
      });
    };

    GitHubAPI.prototype.get = function (endpoint) {
      const _this = this;
      return function () {
        return _this.fetch("GET", endpoint, null);
      };
    };

    GitHubAPI.prototype.put = function (endpoint, data) {
      const _this = this;
      return function () {
        return _this.fetch("PUT", endpoint, data);
      };
    };

    GitHubAPI.prototype.post = function (endpoint, data) {
      const _this = this;
      return function () {
        return _this.fetch("POST", endpoint, data);
      };
    };

    GitHubAPI.prototype.patch = function (endpoint, data) {
      const _this = this;
      return function () {
        return _this.fetch("PATCH", endpoint, data);
      };
    };

    return GitHubAPI;
  })();

  exports.GitHubAPI = GitHubAPI;
})(this);
