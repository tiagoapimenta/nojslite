(() => {
  const sessionHolder = [];
  const requestHolder = [];
  let sessionLoaded = false;
  let domainsLoaded = false;
  let data = {};
  const domains = {};

  const updateTabsDomain = (key, item) => {
    if (key.startsWith('www.')) {
      key = key.substring(4);
    }
    Object.entries(data).forEach(([id, value]) => {
      if (host === '' || value.tmpJs && value.js && value.tmpCookie && value.cookie) {
        return;
      }
      let host = value.domain
      if (host.startsWith('www.')) {
        host = host.substring(4);
      }
      if (key !== host && value.sub && `.${key}` !== host.substring(host.length - key.length - 1)) {
        return;
      }
      let changed = false;
      if ((!value.tmpJs || !value.js) && value.js !== item.js) {
        changed = true;
        value.js = item.js;
        browser.tabs.reload(parseInt(id), { bypassCache: true });
      }
      if ((!value.tmpCookie || !value.cookie) && value.cookie !== item.cookie) {
        changed = true;
        value.cookie = item.cookie;
      }
      if (changed) {
        browser.storage.session.set({ data });
      }
    });
  };
  const updateDomains = item => {
    Object.entries(item).forEach(([key, value]) => {
      const old = domains.hasOwnProperty(key) ? domains[key] : { sub: false, js: false, cookie: false };
      if (old.sub !== value.sub || old.js !== value.js || old.cookie !== value.cookie) {
        updateTabsDomain(key, value);
      }
      if (value.sub || value.js || value.cookie) {
        domains[key] = value;
      } else {
        delete domains[key];
      }
    });
    const keys = Object.keys(item);
    Object.keys(domains).forEach(key => {
      if (!keys.includes(key)) {
        delete domains[key];
        updateTabsDomain(key, { sub: false, js: false, cookie: false });
      }
    })
  };
  const findDomain = host => {
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    const domain = Object.entries(domains).find(([key, value]) => {
      if (key.startsWith('www.')) {
        key = key.substring(4);
      }
      return key === host || value.sub && `.${key}` === host.substring(host.length - key.length - 1);
    });
    let [js, cookie] = [false, false];
    if (domain !== undefined) {
      js = domain[1].js;
      cookie = domain[1].cookie;
    }
    return { js, cookie };
  }
  const updateTab = (id, url, loaded) => {
    let host = '';
    if (url !== undefined) {
      const addr = new URL(url);
      if (addr.protocol !== 'moz-extension:') {
        host = addr.hostname;
        if (host.trim() === '' || host === 'newtab' || host === 'blank') {
          host = '';
        }
      }
    }
    let changed = false;
    if (!data.hasOwnProperty(id)) {
      changed = true;
      data[id] = {
        domain: null,
        js: false,
        cookie: false,
        tmpJs: false,
        tmpCookie: false
      };
    }
    if (data[id].domain !== host) {
      data[id].domain = host;
      const { js, cookie, tmpJs, tmpCookie } = data[id];
      if (!(tmpJs && js) || !(tmpCookie && cookie)) {
        const domain = findDomain(host);
        if (!tmpJs && data[id].js !== domain.js) {
          changed = true;
          data[id].js = domain.js;
        }
        if (!tmpCookie && data[id].cookie !== domain.cookie) {
          changed = true;
          data[id].cookie = domain.cookie;
        }
      }
    }
    if (changed) {
      browser.storage.session.set({ data });
    }
    if (!data[id].js && loaded && host !== '') {
      browser.scripting.executeScript({
        target: {
          tabId: id,
          allFrames: true
        },
        injectImmediately: true,
        world: 'MAIN',
        func: () => {
          [...document.getElementsByTagName('noscript')].forEach(tag => {
            if (tag.firstChild) {
              const div = document.createElement('div');
              tag.getAttributeNames().forEach(attr => {
                div.setAttribute(attr, tag.getAttribute(attr));
              });
              div.innerHTML = tag.innerHTML;
              // new DOMParser().parseFromString(tag.textContent, 'text/html').body.childNodes.forEach(node => div.appendChild(document.importNode(node, true))); // this does not trigger meta tag changes, see duckduckgo.com -> html.duckduckgo.com
              tag.parentNode.replaceChild(div, tag);
            }
          });
        }
      });
    }
  };
  const updateSettings = item => {
    if (item.isolate !== undefined) {
      browser.privacy.websites.firstPartyIsolate.set({ value: item.isolate });
    }
    if (item.resist !== undefined) {
      browser.privacy.websites.resistFingerprinting.set({ value: item.resist });
    }
    if (item.position !== undefined) {
      browser.browserSettings.newTabPosition.set({ value: item.position ? 'relatedAfterCurrent' : 'afterCurrent' });
    }
    if (item.domains !== undefined) {
      updateDomains(item.domains);
    }
  };
  const completeDomainLoad = () => {
    requestHolder.forEach(item => item());
    requestHolder.splice(0, requestHolder.length);
  };
  const requestListener = details => {
    let headers = details.requestHeaders;
    const id = details.tabId;
    if (id !== undefined && (details.documentUrl !== undefined || !data.hasOwnProperty(id) || data[id].domain === '')) {
      updateTab(id, details.documentUrl !== undefined ? details.documentUrl : details.url, false);
    }
    const { cookie } = (id !== undefined && data.hasOwnProperty(id)) ? data[id] : {};
    if (cookie !== true) {
      headers = headers.filter(header => header.name.toLowerCase() !== 'cookie');
    }
    return { requestHeaders: headers };
  };

  browser.storage.local.get().then(item => {
    updateSettings(item);
    domainsLoaded = true;
    if (sessionLoaded) {
      completeDomainLoad();
    }
  });
  browser.storage.session.get().then(item => {
    if (item.data !== undefined) {
      data = item.data;
    }
    sessionLoaded = true;
    sessionHolder.forEach(item => item(data));
    sessionHolder.splice(0, sessionHolder.length);
    if (domainsLoaded) {
      completeDomainLoad();
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.domains !== undefined) {
      updateSettings({
        isolate: changes.isolate !== undefined ? changes.isolate.newValue : undefined,
        resist: changes.resist !== undefined ? changes.resist.newValue : undefined,
        position: changes.position !== undefined ? changes.position.newValue : undefined,
        domains: changes.domains !== undefined ? changes.domains.newValue : undefined,
      })
    }
  });
  browser.webRequest.onBeforeSendHeaders.addListener(
    details => {
      if (sessionLoaded && domainsLoaded) {
        return requestListener(details);
      }
      return new Promise(resolve => {
        requestHolder.push(() => {
          resolve(requestListener(details));
        });
      });
    },
    {
      urls: ['<all_urls>'],
    },
    ['blocking', 'requestHeaders']
  );
  browser.webRequest.onHeadersReceived.addListener(
    details => {
      let headers = details.responseHeaders;
      const id = details.tabId;
      const { js, cookie } = (id !== undefined && data.hasOwnProperty(id)) ? data[id] : {}; // id in data
      if (js !== true && (details.type === 'main_frame' || details.type === 'sub_frame')) {
        headers.push({
          name: 'Content-Security-Policy',
          value: "script-src 'none';"
        });
      }
      if (cookie !== true) {
        headers = headers.filter(header => header.name.toLowerCase() !== 'set-cookie');
      }
      return { responseHeaders: headers };
    },
    {
      urls: ['<all_urls>'],
      types: ['main_frame', 'sub_frame']
    },
    ['blocking', 'responseHeaders']
  );
  browser.tabs.onCreated.addListener(tab => {
    if (tab.id !== undefined) {
      updateTab(tab.id, tab.url, false);
    }
  });
  browser.tabs.onUpdated.addListener((id, info, tab) => {
    updateTab(
      id,
      info.status === 'loading' ? undefined : (info.url !== undefined ? info.url : tab.url),
      info.status === 'complete'
    );
  });
  browser.tabs.onRemoved.addListener((id, info) => {
    if (data.hasOwnProperty(id)) {
      delete data[id];
      browser.storage.session.set({ data });
    }
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getTabSettings') {
      if (sessionLoaded) {
        sendResponse(data);
      } else {
        sessionHolder.push((item) => {
          sendResponse(item);
        });
      }
    } else if (message.action === 'setTabSettings') {
      const old = data.hasOwnProperty(message.id) ? data[message.id] : { js: false, cookie: false };
      data[message.id] = message.data;
      browser.storage.session.set({ data });
      if (old.js !== message.data.js) {
        browser.tabs.reload(parseInt(message.id), { bypassCache: true });
      }
    }
  });
// TODO: options page - management
})();
