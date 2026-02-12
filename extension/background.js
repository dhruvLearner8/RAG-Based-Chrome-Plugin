// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open_and_highlight") {
    const { url, snippet } = request;

    chrome.tabs.create({ url: url, active: true }, (tab) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);

          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (text) => {
                const words = text.split(/\s+/);
                const search = words.slice(0, 6).join(" ");
                const found = window.find(search);

                if (found) {
                  // Get the element that contains the found text
                  const selection = window.getSelection();
                  if (selection.rangeCount > 0) {
                    // Find the closest paragraph/block parent
                    let el = selection.getRangeAt(0).startContainer.parentElement;
                    while (el && !["P", "LI", "TD", "H1", "H2", "H3", "H4", "BLOCKQUOTE"].includes(el.tagName)) {
                      el = el.parentElement;
                    }
                    if (el) {
                      el.style.backgroundColor = "#faec5a";
                      el.style.borderRadius = "4px";
                      el.style.padding = "4px";
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    selection.removeAllRanges();
                  }
                }
              },
              args: [snippet]
            });
          }, 2000);
        }
      });
    });

    sendResponse({ success: true });
    return true;
  }
});
