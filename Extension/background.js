import {pages} from "./Pages/pages.js";
import {language} from "./Pages/locale.js";
import {getConfig, missingPermissions, hasMissingRequests, getActivePages, addMissingRequest} from "./Permissions.js";

chrome.runtime.onMessageExternal.addListener(function (request, sender, sendResponse) {
    if (request.action == "presence") {
        chrome.tabs.sendMessage(request.tab, {type: 'presence', data: request.info}, function (response) {
            sendResponse(response);
        });
    }
    return true;
});


async function init() {
    const activePages = await getActivePages();
    await registerPages(activePages);
    await setBadge();
}

async function registerPages(activePages) {
    console.log('Active Pages', activePages);
    await chrome.scripting.unregisterContentScripts();
    chrome.webNavigation.onCompleted.removeListener();

    for (let i = 0; i < activePages.length; i++) {
        const page = activePages[i];
        try {
            var config = getConfig(page);
            console.log('[R]', page, config);

            await registerScript(page, config);
            await registerNavigation(page, config);

        } catch (e) {
            console.error(`Could not register: ${page} |`, e);
        }
    }
}

var originCache = [];

async function registerScript(page, config) {
    const js = [`./Presence.js`, `./Pages/${page}/index.js`];

    if (config.config.readLogs) {
        js.push(`./logReader.js`);
    }

    return chrome.scripting.registerContentScripts([{
        allFrames: true,
        id: page,
        js: js,
        matches: config.matches,
    }]);
}

async function registerNavigation(page, config) {
    if (config.navigation.length) {
        return chrome.webNavigation.onCompleted.addListener(data => {
            const origin = new URL(data.url).origin+'/';
            console.log('[P]', 'Check Permissions', page, origin)
            chrome.permissions.contains({ origins: [origin] }, perm => {
                if (!perm) {
                    console.error('[P]', 'No Permission', origin);
                    addMissingRequest(page, origin);
                    return;
                }
            });
        }, { url: config.navigation });
    }
}

chrome.storage.onChanged.addListener(async function (changes, namespace) {
    for (var key in changes) {
        var storageChange = changes[key];
        console.log(
            'Storage key "%s" in namespace "%s" changed. ',
            key,
            namespace,
        );
        switch (key) {
            case 'activePages':
                await registerPages(storageChange.newValue);
                await setBadge();
                break;
            case 'mv3_missingPermissions':
                await setBadge();
                break;
        }
    }
});
chrome.permissions.onAdded.addListener(
    async function () {
        const activePages = await getActivePages();
        await registerPages(activePages);
        await setBadge();
    }
)
chrome.permissions.onRemoved.addListener(
    async function () {
        const activePages = await getActivePages();
        await registerPages(activePages);
        await setBadge();
    }
)

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
        case "serviceSettings":
            serviceSettings(request.data).then(res => sendResponse(res));
            return true;
        case "getStrings":
            const strings = request.data;
            for (var key in request.data) {
                strings[key] = language[strings[key]];
            }
            sendResponse(strings);
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
        if (!data.frameId) {
            console.log('Do not inject iframe on root page');
            return;
        }
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

        var page = findPageWithOrigin(permConfig.origins[0]);
        if (!page) {
            page = findPageWithOrigin(data.url);
        }

        if (!page) {
            console.error('No Page found for', permConfig.origins[0]);
            return
        }
        console.log("Inject", page.service);

        if (data.frameId) {
            console.log('Do not inject root page script in iframes');
            return;
        }

        chrome.tabs.executeScript(data.tabId, {
            file: "Presence.js",
            frameId: data.frameId,
        });
        chrome.tabs.executeScript(data.tabId, {
            file: "Pages/"+page.service+"/index.js",
            frameId: data.frameId,
        });

        if (page.readLogs) {
            console.log('Inject log reader');
            chrome.tabs.executeScript(data.tabId, {
                file: "logReader.js",
                frameId: data.frameId,
            });
        }
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

chrome.action.onClicked.addListener(tab => {
    console.log('click');
});

function findPageWithOrigin(origin) {
    if (originCache[origin]) return origin;
    return pages.filter(page => activePages.includes(page.service)).find(page => checkIfDomain(page, origin));
}

function checkIfDomain(meta, url) {
    let res;
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

function serviceSettings(options) {
    return new Promise((resolve, reject) => {
        var serId = options.service;
        var meta = pages.filter((p) => p.service === serId);
        if (!meta) {
            resolve();
            return;
        }
        meta = meta[0];
        const sKey = "settings_" + serId
        chrome.storage.local.get(sKey, (res) => {
            if (res[sKey] && Object.values(res[sKey]).length) {
                meta.settings = meta.settings.map( el => {
                    var e = res[sKey].find(set => set.id === el.id);
                    if (e) return e;
                    return el;
                });
            }

            if (!meta.settings) {
                resolve();
                return;
            };

            switch (options.mode) {
                case "all":
                    resolve(meta.settings);
                    break;
                case "get":
                    var r = meta.settings.find(s => s.id === options.key);
                    if (r) {
                        resolve(r.value);
                        return;
                    }
                    resolve();
                    break;
                case "set":
                    var r = meta.settings.find(s => s.id === options.key);
                    if (r) {
                      r.value = options.value;
                      var set = {};
                      set[sKey] = meta.settings;
                      chrome.storage.local.set(JSON.parse(JSON.stringify(set)));
                    }
                    resolve();
                    break;
                case "hidden":
                    var r = meta.settings.find(s => s.id === options.key);
                    if (r) {
                      r.hidden = options.value;
                      var set = {};
                      set[sKey] = meta.settings;
                      chrome.storage.local.set(JSON.parse(JSON.stringify(set)));
                    }
                    resolve();
                    break;
                default:
                    throw "Unknown mode";
            }
        });
    })
}

// checkForMissingPermissions();
function checkForMissingPermissions() {
    iframePermCheck();
    cleanUpPermissions();
    function iframePermCheck() {
        chrome.storage.sync.get(["allowedIframes", "missingIframes"], (res) => {
            var allowed = [];
            var missing = [];
            if (res.allowedIframes && Object.values(res.allowedIframes).length) {
                allowed = res.allowedIframes;
            }
            if (res.missingIframes && Object.values(res.missingIframes).length) {
                missing = res.missingIframes;
            }

            Promise.all(allowed.map(al => {
                return new Promise((resolve) => {
                    chrome.permissions.contains({ origins: [al] }, (perm) => {
                        if (!perm && !missing.includes(al)) {
                            missing.push(al);
                            resolve();
                        }
                    });
                })
            })).then(() => {
                chrome.storage.sync.set({ missingIframes: missing });
            })
        });
    }
    function cleanUpPermissions() {
        chrome.storage.sync.get(["allowedIframes"], (res) => {
            var allowedIframes = [];
            if (res.allowedIframes && Object.values(res.allowedIframes).length) {
                allowedIframes = res.allowedIframes;
            }
            chrome.permissions.getAll((perms) => {
                console.log('Active Permissions', perms);
                if (perms.origins && perms.origins.length) {
                    const removePerm = perms.origins.filter((origin) => {
                        if (allowedIframes.includes(origin) || allowedIframes.includes(origin.replace('*', ''))) return false;
                        if (findPageWithOrigin(origin)) return false;
                        if (/^https?:\/\/\d+/.test(origin)) return false;
                        return true;
                    });
                    if (removePerm) {
                        console.log('Unneeded permissions', removePerm);
                        chrome.permissions.remove({origins: removePerm});
                    }
                }
            });
        });
    }
}

async function setBadge() {
    const missing = await missingPermissions();
    if (missing.length || await hasMissingRequests()){
        chrome.action.setBadgeText({ text: "❌" });
    } else {
        chrome.action.setBadgeText({ text: "" });
    }
}

init();
