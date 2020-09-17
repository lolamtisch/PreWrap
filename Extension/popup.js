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
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            this.currentTabUrl = tabs[0].url;
            this.currentTabId = tabs[0].id;
            this.matchedPages = this.pages.filter((page) =>
                checkIfDomain(page, this.currentTabUrl)
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
            var ac = Object.keys(this.activePages.pages);
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
        togglePage(meta) {
            this.activePages.togglePage(meta);

            if (this.activePages.isPageActive(meta) && this.currentTabUrl) {
                var origins = [];
                origins.push(this.currentTabUrl);
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
        pages: {},
        async init() {
            return this.retrievePages();
        },
        togglePage (meta) {
            if (this.pages[meta.service]) {
                this.removePage(meta);
            } else {
                this.addPage(meta);
            }
        },
        removePage (meta) {
            if (Vue) {
                Vue.delete(this.pages, meta.service);
            } else {
                delete this.pages[meta.service];
            }

            return this.savePages();
        },
        addPage (meta) {
            if (Vue) {
                Vue.set(this.pages, meta.service, true);
            }else{
                this.pages[meta.service] = true;
            }

            return this.savePages();
        },
        isPageActive (meta) {
            if (this.pages[meta.service]) return true;
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
                    if (res.activePages && Object.values(res.activePages).length) {
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
