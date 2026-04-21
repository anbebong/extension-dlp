document.getElementById('open-options').onclick = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
};

document.getElementById('open-popup').onclick = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    window.close();
  }
};
