// ProChat Web Extension Background Service Worker
const browserAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

browserAPI.runtime.onInstalled.addListener(() => {
  console.log('ProChat Extension installed successfully.');
});

