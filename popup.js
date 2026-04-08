(() => {
  let current = {};
  let data = {};
  let domains = {};
  let updateIcons = () => {};

  const findRawDomain = host => {
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    return Object.entries(domains).find(([key, value]) => {
      if (key.startsWith('www.')) {
        key = key.substring(4);
      }
      return key === host || value.sub && `.${key}` === host.substring(host.length - key.length - 1);
    });
  };
  const findDomain = host => {
    const domain = findRawDomain(host);
    let [js, cookie] = [false, false];
    if (domain !== undefined) {
      js = domain[1].js;
      cookie = domain[1].cookie;
    }
    return { js, cookie };
  }
  const updateDomains = item => {
    domains = item;
    if (current.host !== undefined && current.host !== '') {
      const domain = findDomain(current.host);
      if (current.js !== domain.js || current.cookie !== domain.cookie) {
        current.js = domain.js;
        current.cookie = domain.cookie
        updateIcons();
      }
    }
  };

  browser.storage.local.get().then(item => {
    if (item.domains !== undefined) {
      updateDomains(item.domains);
    }
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.domains !== undefined) {
      updateDomains(changes.domains.newValue);
    }
  });
  browser.runtime.sendMessage({ action: 'getTabSettings' }).then(reply => {
    data = reply;
    if (data.hasOwnProperty(current.id) && (data[current.id].tmpJs !== current.tmpJs || data[current.id].tmpCookie !== current.tmpCookie)) {
      current.tmpJs = data[current.id].tmpJs;
      current.tmpCookie = data[current.id].tmpCookie;
      updateIcons();
    }
  });

  window.addEventListener('load', () => {
    const label = document.getElementById('label');
    const els = document.getElementsByTagName('span');

    const selectTab = tab => {
      let host = tab.url === undefined ? '' : new URL(tab.url).hostname;
      if (host.trim() === '' || host === 'newtab' || host === 'blank') {
        host = '';
      }
      if (host === current.host && current.id === tab.id) {
        return;
      }
      const { js, cookie } = findDomain(host);
      current = {
        host,
        id: tab.id,
        js,
        cookie,
        tmpJs: false,
        tmpCookie: false
      };
      if (data.hasOwnProperty(tab.id)) {
        const item = data[tab.id];
        current.tmpJs = item.tmpJs;
        current.tmpCookie = item.tmpCookie;
      }
      label.innerText = `Site: ${host}`;
      updateIcons();
    };
    const updateDomain = () => {
      const host = current.host;
      const domain = findRawDomain(host);
      if (domain === undefined) {
        if (!current.js && !current.cookie) {
          return;
        }
        domains[current.host] = {
          sub: false,
          js: current.js,
          cookie: current.cookie
        };
      } else {
        if (current.js || current.cookie) {
          domain[1].js = current.js;
          domain[1].cookie = current.cookie;
        } else {
          delete domains[domain[0]];
        }
      }
      browser.storage.local.set({ domains });
    };
    const updateLocal = () => {
      let item = data.hasOwnProperty(current.id) ? data[current.id] : (data[current.id] = {});
      item.js = current.js || current.tmpJs;
      item.cookie = current.cookie || current.tmpCookie;
      item.tmpJs = current.tmpJs;
      item.tmpCookie = current.tmpCookie;
      browser.runtime.sendMessage({ action: 'setTabSettings', id: current.id, data: item });
    };
    const actions = {
      0: () => {
        const { js, tmpJs } = current;
        if (!js || tmpJs) {
          current.js = true;
          current.tmpJs = false;
          if (!js) {
            updateDomain();
          }
          if (tmpJs) {
            updateLocal();
          }
        }
      },
      1: () => {
        current.tmpJs = !current.tmpJs;
        updateLocal();
      },
      2: () => {
        const { js, tmpJs } = current;
        if (js || tmpJs) {
          current.js = false;
          current.tmpJs = false;
          if (js) {
            updateDomain();
          }
          if (tmpJs) {
            updateLocal();
          }
        }
      },
      3: () => {
        const { cookie, tmpCookie } = current;
        if (!cookie || tmpCookie) {
          current.cookie = true;
          current.tmpCookie = false;
          if (!cookie) {
            updateDomain();
          }
          if (tmpCookie) {
            updateLocal();
          }
        }
      },
      4: () => {
        current.tmpCookie = !current.tmpCookie;
        updateLocal();
      },
      5: () => {
        const { cookie, tmpCookie } = current;
        if (cookie || current.tmpCookie) {
          current.cookie = false;
          current.tmpCookie = false;
          if (cookie) {
            updateDomain();
          }
          if (tmpCookie) {
            updateLocal();
          }
        }
      }
    };

    updateIcons = () => {
      for (const el of els) {
        el.className = '';
      }
      if (current.host === '') {
        return;
      }
      let [id0, id1] = [2, 5];
      if (current.tmpJs) {
        id0 = 1;
      } else if (current.js) {
        id0 = 0;
      }
      if (current.tmpCookie) {
        id1 = 4;
      } else if (current.cookie) {
        id1 = 3;
      }
      els[id0].className = els[id1].className = 'active';
    };

    browser.tabs.onActivated.addListener(activeInfo => {
      browser.tabs.query({ currentWindow: true, active: true }, tabs => {
        selectTab(tabs.pop());
      });
    });
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tab.active && changeInfo.status === 'complete') {
        selectTab(tab);
      }
    });
    browser.tabs.query({ currentWindow: true, active: true }).then(tabs => {
      selectTab(tabs.pop());
    });

    for (let i = els.length; i--;) {
      const action = actions[i];
      els[i].addEventListener('click', () => {
        if (current.host === undefined || current.host === '') {
          return;
        }
        action();
        updateIcons();
      });
    }
  });
})();
