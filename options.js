(() => {
  let domains = {};
  let settings = {};

  const updateExpertSettings = () => {
    const setRadio = (name, value) => {
      const radios = document.getElementsByName(name);
      for (const radio of radios) {
        const target = value === undefined ? 'default' : String(value);
        radio.checked = radio.value === target;
      }
    };
    setRadio('isolate', settings.isolate);
    setRadio('resist', settings.resist);
    setRadio('position', settings.position);
  };

  const setLabel = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      if (value === undefined) {
        el.textContent = 'default';
      } else if (value === true) {
        el.textContent = 'enabled';
      } else {
        el.textContent = 'disabled';
      }
    }
  };

  const saveDomains = () => {
    const toSave = {};
    for (const [host, val] of Object.entries(domains)) {
      if (!val.keep) {
        toSave[host] = { js: val.js, cookie: val.cookie, sub: val.sub };
      }
    }
    browser.storage.local.set({ domains: toSave });
  };

  const renderTable = () => {
    const tbody = document.getElementById('data');
    if (!tbody) {
      return;
    }
    tbody.innerHTML = '';

    const entries = Object.entries(domains);
    const sortedNew = entries.filter(([_, v]) => v.bottom);
    const sortedRest = entries.filter(([_, v]) => !v.bottom).sort((a, b) => a[0].localeCompare(b[0]));
    const sorted = [...sortedRest, ...sortedNew];

    for (const [host, val] of sorted) {
      const tr = document.createElement('tr');

      const tdDomain = document.createElement('td');
      tdDomain.textContent = host;
      tr.appendChild(tdDomain);

      const tdJs = document.createElement('td');
      const cbJs = document.createElement('input');
      cbJs.type = 'checkbox';
      cbJs.checked = val.js;
      cbJs.addEventListener('change', () => {
        val.js = cbJs.checked;
        handleToggle(host, val);
      });
      tdJs.appendChild(cbJs);
      tr.appendChild(tdJs);

      const tdCookie = document.createElement('td');
      const cbCookie = document.createElement('input');
      cbCookie.type = 'checkbox';
      cbCookie.checked = val.cookie;
      cbCookie.addEventListener('change', () => {
        val.cookie = cbCookie.checked;
        handleToggle(host, val);
      });
      tdCookie.appendChild(cbCookie);
      tr.appendChild(tdCookie);

      const tdSub = document.createElement('td');
      const cbSub = document.createElement('input');
      cbSub.type = 'checkbox';
      cbSub.checked = val.sub;
      cbSub.addEventListener('change', () => {
        val.sub = cbSub.checked;
        saveDomains();
      });
      tdSub.appendChild(cbSub);
      tr.appendChild(tdSub);

      const tdRemove = document.createElement('td');
      const btnRemove = document.createElement('button');
      btnRemove.textContent = '\u2716';
      btnRemove.addEventListener('click', () => {
        if (confirm('Remove ' + host + '?')) {
          delete domains[host];
          saveDomains();
          renderTable();
        }
      });
      tdRemove.appendChild(btnRemove);
      tr.appendChild(tdRemove);

      tbody.appendChild(tr);
    }
  };

  const handleToggle = (host, val) => {
    if (!val.js && !val.cookie) {
      val.keep = true;
    } else {
      delete val.keep;
    }
    saveDomains();
    renderTable();
  };

  const setSetting = (key, value) => {
    settings[key] = value;
    browser.storage.local.set({ [key]: value });
    if (value !== undefined) {
      const api = {
        isolate: browser.privacy.websites.firstPartyIsolate,
        resist: browser.privacy.websites.resistFingerprinting,
        position: browser.browserSettings.newTabPosition
      }[key];
      if (api) {
        api.set({ value: key === 'position' ? (value ? 'relatedAfterCurrent' : 'afterCurrent') : value });
      }
    }
  };

  window.addEventListener('load', () => {
    browser.privacy.websites.firstPartyIsolate.onChange.addListener(r => setLabel('isolateLabel', r.value));
    browser.privacy.websites.resistFingerprinting.onChange.addListener(r => setLabel('resistLabel', r.value));
    browser.browserSettings.newTabPosition.onChange.addListener(r => {
      document.getElementById('positionLabel').textContent = r.value;
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') {
        return;
      }
      if (changes.domains !== undefined) {
        const newDomains = changes.domains.newValue || {};
        const merged = {};
        for (const [host, val] of Object.entries(newDomains)) {
          merged[host] = { ...val };
          if (domains[host] && domains[host].bottom) {
            merged[host].bottom = true;
          }
        }
        for (const [host, val] of Object.entries(domains)) {
          if (val.keep && !merged[host]) {
            merged[host] = { ...val };
          }
        }
        domains = merged;
        renderTable();
      }
      if (changes.isolate !== undefined || changes.resist !== undefined || changes.position !== undefined) {
        if (changes.isolate !== undefined) {
          settings.isolate = changes.isolate.newValue;
        }
        if (changes.resist !== undefined) {
          settings.resist = changes.resist.newValue;
        }
        if (changes.position !== undefined) {
          settings.position = changes.position.newValue;
        }
        updateExpertSettings();
      }
    });

    document.getElementById('add').addEventListener('click', () => {
      const host = prompt('Enter domain name:');
      if (!host) {
        return;
      }
      const trimmed = host.trim();
      if (!trimmed) {
        return;
      }
      if (domains[trimmed]) {
        return;
      }

      domains[trimmed] = { js: true, cookie: true, sub: false, bottom: true };
      saveDomains();
      renderTable();
    });
    for (const name of ['isolate', 'resist', 'position']) {
      const radios = document.getElementsByName(name);
      for (const radio of radios) {
        radio.addEventListener('change', () => {
          if (radio.checked) {
            if (radio.value === 'default') {
              setSetting(name, undefined);
            } else {
              setSetting(name, radio.value === 'true');
            }
          }
        });
      }
    }
    browser.storage.local.get().then(item => {
      if (item.domains !== undefined) {
        domains = item.domains;
      }
      settings = {
        isolate: item.isolate,
        resist: item.resist,
        position: item.position
      };
      updateExpertSettings();
      renderTable();
    });
    browser.privacy.websites.firstPartyIsolate.get({}).then(r => setLabel('isolateLabel', r.value));
    browser.privacy.websites.resistFingerprinting.get({}).then(r => setLabel('resistLabel', r.value));
    browser.browserSettings.newTabPosition.get({}).then(r => {
      document.getElementById('positionLabel').textContent = r.value;
    });
  });
})();
