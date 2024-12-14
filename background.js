"use strict";

// アクションがクリックされたときに動作
chrome.action.onClicked.addListener((tab) => {
  const url = tab.url || "";

  // ScratchサイトのURLでのみポップアップを設定
  if (url.startsWith("https://scratch.mit.edu/projects/")) {
    chrome.action.setPopup({ tabId: tab.id, popup: "popup.html" });
  } else {
    chrome.notifications.create(
      {
        type: "basic",
        title: "注意",
        message:
          "この拡張機能は Scratch のプロジェクトページのみで利用可能です。",
        iconUrl: "icons/icon.png",
      },
      (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error("通知エラー:", chrome.runtime.lastError);
        } else {
          console.log("通知ID:", notificationId);
        }
      }
    );
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.log) {
    console.log("バックグラウンドログ:", message.log);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchProject") {
    const projectId = request.projectId;
    const url = `https://api.scratch.mit.edu/projects/${projectId}`;

    // Fetch APIを使ってデータを取得
    fetch(url)
      .then((response) => {
        if (response.ok) {
          return response.json(); // JSON形式で返す
        } else {
          throw new Error("プロジェクトの取得に失敗しました");
        }
      })
      .then((data) => {
        console.log("取得したプロジェクトデータ:", data); // 取得したデータを表示
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        console.error("エラー:", error.message);
        sendResponse({ success: false, error: error.message });
      });

    // 非同期処理の完了を待機するためにtrueを返す
    return true;
  }
});
