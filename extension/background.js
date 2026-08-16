const HOST_NAME = "com.emacs.eww";
const SEARCH_TIMEOUT_MS = 45000;
const POLL_INTERVAL_MS = 500;

let nativePort;
let reconnectTimer;
const queuedMessages = [];

function connectNativeHost() {
  if (nativePort) return;
  clearTimeout(reconnectTimer);
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
  } catch (error) {
    nativePort = null;
    reconnectTimer = setTimeout(connectNativeHost, 1000);
    return;
  }
  nativePort.onMessage.addListener(handleNativeMessage);
  nativePort.onDisconnect.addListener(() => {
    nativePort = null;
    reconnectTimer = setTimeout(connectNativeHost, 1000);
  });
  while (queuedMessages.length > 0) nativePort.postMessage(queuedMessages.shift());
}

async function handleNativeMessage(message) {
  if (message.action !== "fetch" || !message.id || !message.url) return;
  let response;
  try {
    response = await fetchInBackground(message);
  } catch (error) {
    response = {
      action: "fetch_result",
      id: message.id,
      outcome: "transient",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  nativePort?.postMessage(response);
}

async function fetchInBackground({ id, url, timeout }) {
  const targetWindow = await existingWindow();
  const before = await browserState(targetWindow.id);
  const timeoutNumber = Number(timeout);
  const boundedTimeout = Number.isFinite(timeoutNumber)
    ? Math.max(1000, Math.min(timeoutNumber, SEARCH_TIMEOUT_MS))
    : SEARCH_TIMEOUT_MS;
  const tab = await chrome.tabs.create({
    active: false,
    url,
    windowId: targetWindow.id,
  });
  let page;
  try {
    page = await waitForTerminalPage(tab.id, boundedTimeout);
  } finally {
    if (tab.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
  const after = await browserState(targetWindow.id);
  return {
    action: "fetch_result",
    id,
    ...page,
    telemetry: {
      activeTabBefore: before.activeTabId,
      activeTabAfter: after.activeTabId,
      focusedWindowBefore: before.focusedWindowId,
      focusedWindowAfter: after.focusedWindowId,
      createdTabId: tab.id,
      createdTabClosed: !(await chrome.tabs.get(tab.id).catch(() => null)),
    },
  };
}

async function existingWindow() {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const target = windows.find((window) => window.focused) || windows[0];
  if (!target) throw new Error("No existing Chrome window is available");
  return target;
}

async function browserState(windowId) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  const focusedWindow = await chrome.windows.getLastFocused();
  return {
    activeTabId: activeTab?.id ?? null,
    focusedWindowId: focusedWindow?.id ?? null,
  };
}

async function waitForTerminalPage(tabId, timeout) {
  const deadline = Date.now() + timeout;
  let lastPage;
  let emptyPolls = 0;
  let sawChallenge = false;
  while (Date.now() < deadline) {
    try {
      lastPage = await inspectPage(tabId);
      sawChallenge ||= lastPage.challenge;
      if (lastPage.resultCount > 0) {
        return { outcome: "success", url: lastPage.url, html: lastPage.html };
      }
      if (lastPage.manualChallenge || lastPage.serverError) {
        return {
          outcome: "transient",
          url: lastPage.url,
          message: lastPage.manualChallenge
            ? "Anna's Archive requires manual browser verification"
            : "Anna's Archive returned a server error",
        };
      }
      emptyPolls = lastPage.empty && lastPage.ready && lastPage.validSearchPage
        && !lastPage.challenge ? emptyPolls + 1 : 0;
      if (emptyPolls >= 2) {
        return { outcome: "empty", url: lastPage.url, html: lastPage.html };
      }
    } catch (error) {
      lastPage = { error: error instanceof Error ? error.message : String(error) };
    }
    await delay(POLL_INTERVAL_MS);
  }
  return {
    outcome: sawChallenge ? "transient" : "malformed",
    url: lastPage?.url,
    message: sawChallenge
      ? "Anna's Archive browser challenge did not finish"
      : lastPage?.error || "Anna's Archive search page could not be parsed",
  };
}

async function inspectPage(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const html = document.documentElement?.outerHTML || "";
      const text = document.body?.innerText || "";
      const title = document.title || "";
      const currentUrl = new URL(location.href);
      const resultCount = [...document.querySelectorAll("a.js-vim-focus[href]")].filter((anchor) => {
        try {
          const target = new URL(anchor.href, location.href);
          return target.origin === currentUrl.origin
            && /^\/md5\/[0-9a-f]{32}$/i.test(target.pathname);
        } catch {
          return false;
        }
      }).length;
      const challenge =
        /DDoS-Guard/i.test(title) ||
        /Checking your browser before accessing/i.test(text) ||
        document.querySelector("#js-challenge") !== null;
      const searchForm = document.querySelector("form.js-search-form[method='get']");
      const searchInput = searchForm?.querySelector(
        "input.js-search-main-input[name='q'][type='search']",
      );
      const emptyMarker = [...document.querySelectorAll("span.font-bold")].find(
        (element) => element.textContent.trim() === "No files found.",
      );
      const emptyContainerText = emptyMarker?.parentElement?.textContent || "";
      return {
        url: location.href,
        html,
        resultCount,
        ready: document.readyState === "complete",
        validSearchPage:
          currentUrl.protocol === "https:" &&
          /^annas-archive\.(gl|pk|gd)$/.test(currentUrl.hostname) &&
          currentUrl.pathname === "/search" &&
          searchForm !== null &&
          new URL(searchForm.action, location.href).pathname === "/search" &&
          searchInput !== null,
        empty:
          emptyMarker !== undefined &&
          /Try fewer or different search terms and filters\./.test(emptyContainerText),
        challenge,
        manualChallenge:
          /could not verify your browser automatically/i.test(text),
        serverError: /Our servers are not responding/i.test(text),
      };
    },
  });
  return result;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function openInEww(url) {
  const message = { action: "open_eww", url };
  if (nativePort) nativePort.postMessage(message);
  else {
    queuedMessages.push(message);
    connectNativeHost();
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.url) openInEww(tab.url);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
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
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.menuItemId === "open-link-in-eww" ? info.linkUrl : tab.url;
  if (url) openInEww(url);
});

connectNativeHost();
