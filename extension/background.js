const HOST_NAME = "com.emacs.eww";

function openInEww(url) {
  chrome.runtime.sendNativeMessage(HOST_NAME, { url }, () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to open in eww:", chrome.runtime.lastError.message);
    }
  });
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.url) openInEww(tab.url);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-link-in-eww",
    title: "Open link in eww",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "open-page-in-eww",
    title: "Open page in eww",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.menuItemId === "open-link-in-eww" ? info.linkUrl : tab.url;
  if (url) openInEww(url);
});
