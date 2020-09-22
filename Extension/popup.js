var app = new Vue({
    el: "#app",
    data: {
        active: 'home',
        pages: pages,
        matchedPages: [],
        activePages: { pages: {} },
        missingPermissions: [],
        searchWord: '',
        currentTabUrl: '',
        currentTabId: 0,
        sync: {
            allowedIframes: [],
            missingIframes: [],
            blockedIframes: [],
        }
    },
    created: function () {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            this.currentTabUrl = tabs[0].url;
            this.currentTabId = tabs[0].id;
            this.matchedPages = await Promise.all(this.pages
                .filter((page) =>
                    checkIfDomain(page, this.currentTabUrl)
                )
                .map(page => {
                    page.settings = [];
                    return page;
                }).map(page => {
                    return new Promise(resolve => {
                        chrome.runtime.sendMessage({ type: "serviceSettings", data: {service: page.service, mode: 'all'}}, (res) => {
                            if(res) {
                                page.settings = res;
                            }
                            resolve(page);
                        })
                    })
                })
            );
        });

        ActivePages().then((aPages) => {
            this.activePages = aPages;
        });

        chrome.storage.local.get("missingPermissions", (res) => {
            var cur = [];
            if (
                res.missingPermissions &&
                Object.values(res.missingPermissions).length
            ) {
                cur = res.missingPermissions;
            }
            this.missingPermissions = cur;
            chrome.storage.onChanged.addListener(function (changes, namespace) {
                for (var key in changes) {
                    var storageChange = changes[key];
                    if (namespace === "local" && key === "missingPermissions") {
                        this.missingPermissions = storageChange.newValue;
                    }
                }
            });
        });

        chrome.storage.sync.get(Object.keys(this.sync), (res) => {
            Object.keys(this.sync).forEach(op => {
                if (res[op] && Object.values(res[op]).length) {
                    Vue.set(this.sync, op, res[op]);
                }
            })
            chrome.storage.onChanged.addListener(function (changes, namespace) {
                for (var key in changes) {
                    var storageChange = changes[key];
                    if (namespace === "sync" && typeof this.sync[key] !== 'undefined') {
                        Vue.set(this.sync, key, storageChange.newValue);
                    }
                }
            });
        });
    },
    watch: {
        sync: {
            handler(value) {
                chrome.storage.sync.set(value);
            },
            deep: true
        }
    },
    computed: {
        enabledPages() {
            var ac = this.activePages.pages;
            if (!ac.length) return [];
            return this.pages.filter((p) => ac.includes(p.service));
        },
        filteredPages() {
            return this.pages.filter((p) => {
                return p.service.toLowerCase().includes(this.searchWord.toLowerCase());
            });
        }
    },
    methods: {
        requestPermissions() {
            chrome.runtime.sendMessage({ type: "requestPermissions", data: {
                permissions: { origins: this.missingPermissions.concat(this.sync.missingIframes) },
                sync: {
                    allowedIframes: this.sync.allowedIframes.concat(this.sync.missingIframes),
                    missingIframes: []
                },
                local: {
                    missingPermissions: [],
                }
            } });
        },
        getHostname(url) {
            return new URL(url).hostname;
        },
        togglePage(meta, active = false) {
            this.activePages.togglePage(meta);

            if (this.activePages.isPageActive(meta) && this.currentTabUrl) {
                var origins = [];
                if (active) origins.push(this.currentTabUrl);
                if (Array.isArray(meta.url)) {
                    meta.url.forEach(el => {
                        origins.push("http://" + el + "/");
                        origins.push('https://' + el + '/');
                    });
                } else if(meta.url) {
                    origins.push("http://" + meta.url + "/");
                    origins.push("https://" + meta.url + "/");
                }
                console.log(origins);
                chrome.runtime.sendMessage({ type: "requestPermissions", data: {
                    permissions: { origins: origins }
                }});
            }
        },
        blockIframe(origin) {
            this.sync.missingIframes = this.sync.missingIframes.filter(el => el !== origin);
            if (!this.sync.blockedIframes.includes(origin)) this.sync.blockedIframes.push(origin);
        },
        deBlockIframe(origin) {
            this.sync.blockedIframes = this.sync.blockedIframes.filter(el => el !== origin);
            if (!this.sync.missingIframes.includes(origin)) this.sync.missingIframes.push(origin);
        },
        updateSetting(meta, option, value) {
            chrome.runtime.sendMessage({
              type: "serviceSettings",
              data: {
                service: meta.service,
                mode: "set",
                key: option,
                value: value,
              },
            });
            const t = meta.settings.find(el => el.id === option)//.value = value;
            if(t) Vue.set(t, 'value', value);
        },
        filterSettings(settings) {
            return settings.filter(set => {
                if (set.hidden) return false;

                if (set.if) {
                    matches = true;
                    for (const key in set.if) {
                        const condition = set.if[key];
                        var angry = settings.find(set => set.id === key);
                        if (angry && angry.value !== condition) matches = false;
                    }
                    if(!matches) return false;
                }

                return true;
            });
        }
    },
});

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

async function ActivePages() {
    var obj = {
        pages: [],
        async init() {
            return this.retrievePages();
        },
        togglePage (meta) {
            if (this.pages.includes(meta.service)) {
                this.removePage(meta);
            } else {
                this.addPage(meta);
            }
        },
        removePage (meta) {
            this.pages = this.pages.filter(el => el !== meta.service);
            return this.savePages();
        },
        addPage (meta) {
            this.pages.push(meta.service);

            return this.savePages();
        },
        isPageActive (meta) {
            if (this.pages.includes(meta.service)) return true;
            return false;
        },
        async savePages () {
            return new Promise((resolve) => {
                chrome.storage.sync.set({activePages: this.pages}, () => {
                    resolve();
                })
            })
        },
        async retrievePages () {
            return new Promise((resolve) => {
                chrome.storage.sync.get('activePages', (res) => {
                    if (res.activePages && res.activePages.length) {
                        this.pages = res.activePages;
                    }
                    resolve(this.pages);
                })
            })
        }
    }

    await obj.init();

    return obj;
}
