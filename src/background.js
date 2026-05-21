chrome.action.onClicked.addListener(() => {
  const appUrl = chrome.runtime.getURL('app/index.html');
  const extOrigin = 'chrome-extension://' + chrome.runtime.id;

  chrome.tabs.query({}, (tabs) => {
    const match = tabs.find(t =>
      t.url === appUrl ||
      t.url === 'chrome://newtab/' ||
      (t.url && t.url.startsWith(extOrigin))
    );

    if (match) {
      chrome.windows.update(match.windowId, { focused: true });
      chrome.tabs.update(match.id, { active: true });
    } else {
      chrome.tabs.create({ url: appUrl });
    }
  });
});
