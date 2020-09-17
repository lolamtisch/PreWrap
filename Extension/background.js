chrome.runtime.onMessageExternal.addListener(function (request, sender, sendResponse) {
    if (request.action == "presence") {
        chrome.tabs.sendMessage(request.tab, {type: 'presence', data: request.info}, function (response) {
            sendResponse(response);
        });
    }
    return true;
});

initWebNavigationListener();
async function initWebNavigationListener() {
    conent();
    ifr();
    async function conent() {
        chrome.webNavigation.onCompleted.removeListener(navigationListener);
        var config = await getFilter();
        console.log('Add navigation listener', config);
        if (!config.length) return;
        chrome.webNavigation.onCompleted.addListener(navigationListener, { url: config });
    }

    async function ifr() {
        chrome.webNavigation.onCompleted.removeListener(iframeNavigationListener);
        var config = await getIframeFilter();
        console.log("Add Iframe navigation listener", config);
        if (!config.length) return;
        chrome.webNavigation.onCompleted.addListener(iframeNavigationListener, { url: config });
    }

}

chrome.storage.onChanged.addListener(function (changes, namespace) {
    for (var key in changes) {
        var storageChange = changes[key];
        console.log(
        'Storage key "%s" in namespace "%s" changed. ' +
            'Old value was "%s", new value is "%s".',
        key,
        namespace,
        storageChange.oldValue,
        storageChange.newValue
        );
        if (namespace === 'sync' && (key === 'activePages' || key === 'allowedIframes')) {
            initWebNavigationListener();
        }
        if (key === "missingPermissions" || key === "missingIframes") {
            setBadge();
        }
    }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    switch (request.type) {
        case "iframeDomains":
            checkIframeDomains(request.data.domains);
            sendResponse();
            break;
        case "iframeData":
            chrome.tabs.sendMessage(sender.tab.id, {
                type: "iframeDataEvent",
                data: request.data,
                sender,
            });
            break;
        case "requestPermissions":
            chrome.permissions.request(request.data.permissions, (accepted) => {
                console.log("Permissions accepted", accepted);
                if (accepted) {
                    if (request.data.sync) chrome.storage.sync.set(request.data.sync);
                    if (request.data.local) chrome.storage.local.set(request.data.local);
                    if (request.data.permissions.origins) reloadTabsByOrigin(request.data.permissions.origins);
                }
            });
            break;
        default:
            console.log(request);
            throw 'Unknown request'
    }
});

function reloadTabsByOrigin(origins) {
    chrome.tabs.query({ url: origins.map(el => el+'*')}, (tabs) => {
        console.log('Reload tabs', tabs);
        tabs.forEach(tab => {
            chrome.tabs.reload(tab.id);
        })
    });
}

function getFilter() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('activePages', (res) => {
            if (res.activePages && Object.values(res.activePages).length) {
                console.log('Active Pages', res.activePages);
                var filter = [];
                Object.keys(res.activePages).forEach(page => {
                    const found = pages.find(p => p.service === page);
                    if (found) {
                        if (found.regExp) filter.push({urlMatches: found.regExp});
                        if (Array.isArray(found.url)) {
                            found.url.forEach(el => {
                                filter.push({hostEquals: el});
                            });

                        } else {
                            filter.push({hostEquals: found.url});
                        }
                    }

                })
                resolve(filter);
                return;
            }
            resolve([]);
        })
    });
}

function getIframeFilter() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('allowedIframes', (res) => {
            if (res.allowedIframes && Object.values(res.allowedIframes).length) {
                console.log('AllowedIframes', res.allowedIframes);
                var filter = [];
                res.allowedIframes.forEach(ifr => {
                    filter.push({ hostEquals: ifr.replace(/(^https?:|\/)/gi, '') });
                })
                resolve(filter);
                return;
            }
            resolve([]);
        })
    });
}

function iframeNavigationListener(data) {
    console.log('####Iframe####', data);
    chrome.tabs.get(data.tabId, (tab) => {
        const iframeOrigin = new URL(tab.url).origin + "/";
        console.log("Iframe root origin", iframeOrigin);
        const page = findPageWithOrigin(iframeOrigin);
        if (!page) {
            console.error('Iframe No Page found for', iframeOrigin);
            return
        }
        console.log("Inject Iframe", page.service);
        chrome.tabs.executeScript(data.tabId, {
            file: "Iframe.js",
            frameId: data.frameId,
        });
        chrome.tabs.executeScript(data.tabId, {
            file: "Pages/" + page.service + "/iframe.js",
            frameId: data.frameId,
        });
    })
}

function navigationListener(data) {
    console.log('####Content####', data);
    const permConfig = { origins: [new URL(data.url).origin+'/'] };
    chrome.permissions.contains(permConfig, perm => {
        console.log('Permission', perm);
        if (!perm) {

            console.error("No Permission", permConfig);
            saveMissingPermission(permConfig.origins[0]);
            return;
        }

        const page = findPageWithOrigin(permConfig.origins[0]);
        console.log("Inject", page.service);
        if (!page) {
            console.error('No Page found for', iframeOrigin);
            return
        }
        chrome.tabs.executeScript(data.tabId, {
            file: "Presence.js",
            frameId: data.frameId,
        });
        chrome.tabs.executeScript(data.tabId, {
            file: "Pages/"+page.service+"/index.js",
            frameId: data.frameId,
        });
    });
}

function saveMissingPermission(origin) {
    chrome.storage.local.get("missingPermissions", (res) => {
        var cur = [];
        if (res.missingPermissions && Object.values(res.missingPermissions).length) {
            cur = res.missingPermissions;
        }
        if (cur.find((el) => el === origin)) return;
        cur.push(origin);
        chrome.storage.local.set({"missingPermissions": cur});
    });
}

chrome.browserAction.onClicked.addListener(tab => {
    console.log('click');
});

originCache = [];
function findPageWithOrigin(origin) {
    if (originCache[origin]) return origin;
    return pages.find(page => checkIfDomain(page, origin));
}

function checkIfDomain(meta, url) {
    if (typeof meta.regExp !== "undefined") {
        res = url.match(new RegExp(meta.regExp));

        if (res === null) return false;
        return res.length > 0;
    }

    if (Array.isArray(meta.url)) {
        res = meta.url.filter(mUrl => new URL(url).hostname === mUrl).length > 0;
    } else {
        res = new URL(url).hostname === meta.url;
    }
    return res;
}

function checkIframeDomains(domains) {
    console.log(domains);
    if(!domains.length) return;
    chrome.storage.sync.get(["allowedIframes", "missingIframes", "blockedIframes"], (res) => {
        var allowed = [];
        var missing = [];
        var blocked = [];
        if (res.allowedIframes && Object.values(res.allowedIframes).length) {
            allowed = res.allowedIframes;
        }

        if (res.missingIframes && Object.values(res.missingIframes).length) {
            missing = res.missingIframes;
        }

        if (res.blockedIframes && Object.values(res.blockedIframes).length) {
            blocked = res.blockedIframes;
        }

        console.log(allowed, missing, blocked);

        domains.forEach(domain => {
            if (!domain) return;
            const origin = new URL(domain).origin + "/";
            if (allowed.includes(origin)) return;
            if (missing.includes(origin)) return;
            if (blocked.includes(origin)) return;
            missing.push(origin);
        })

        chrome.storage.sync.set({ missingIframes: missing });
    });
}

setBadge();
function setBadge() {
    let miss = false;
    chrome.storage.sync.get("missingIframes", (obj) => {
        if (obj.missingIframes && obj.missingIframes.length) miss = true;
        chrome.storage.local.get("missingPermissions", (obj) => {
            if (obj.missingPermissions && obj.missingPermissions.length) miss = true;
            if (miss){
                chrome.browserAction.setBadgeText({ text: "❌" });
            } else {
                chrome.browserAction.setBadgeText({ text: "" });
            }
        });
    });
}