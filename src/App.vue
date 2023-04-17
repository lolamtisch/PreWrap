<template>
    <div>
        <div class="header">
            <a @click="active='home'" :class="{active: active==='home'}">Home</a>
            <a @click="active='active'" :class="{active: active==='active'}">Active</a>
            <a @click="active='blocked'" :class="{active: active==='blocked'}">Blocked</a>
            <a @click="active='search'" :class="{active: active==='search'}">Search</a>
        </div>
        <div class="section" v-if="active==='home'">

            <div class="healthError" v-if="healthError">
                <h2>ERROR</h2>
                {{healthError.text}}
                <a v-if="healthError.link" :href="healthError.link.href" target="_blank">{{healthError.link.text}}</a>
            </div>

            <div class="perm box" v-if="missingPermissions.length || sync.missingIframes.length">
                <h2>Missing Permissions</h2>
                <div v-if="missingPermissions.length">
                    <h3><span>Pages</span></h3>
                    <div v-for="iframe in missingPermissions" :key="iframe.origin" class="permP">
                        <div>{{iframe.page}}</div><div>{{iframe.origin}}</div>
                    </div>
                    <br>
                </div>

                <div v-if="sync.missingIframes.length">
                    <h3><span>Iframes</span></h3>
                    <div v-for="iframe in sync.missingIframes" :key="iframe" class="permP">
                        {{iframe.page}} <span @click="blockIframe(iframe)">X</span>
                    </div>
                </div>

                <div class="missingPermission" v-if="missingPermissions.length || sync.missingIframes.length">
                    <button id="request" @click="requestPermissions">Request Permissions</button>
                </div>
            </div>
            <div class="matched">
                <div v-if="!matchedPages.length">No presence for this page found</div>
                <div v-for="page in matchedPages" :key="page.service" class="page-box-outer" :class="{active: activePages.isPageActive(page)}">
                    <div class="page-box" @click="togglePage(page, true)" :class="{active: activePages.isPageActive(page)}">
                        <div class="checkbox">
                            <img v-if="activePages.isPageActive(page)" :src="'./../vendor/delete-black-18dp.svg'" width="18" height="18">
                            <img v-else :src="'./../vendor/get_app-black-18dp.svg'" width="18" height="18">
                        </div>
                        <div class="img">
                            <img :src="page.logo" width="23">
                        </div>
                        <div class="text">
                            {{page.service}}

                        </div>
                    </div>
                    <div v-if="page.settings && page.settings.length && filterSettings(page.settings).length" class="settings-box">
                        <div v-for="setting in filterSettings(page.settings)" :key="setting.id">
                            <div v-if="typeof setting.value === 'boolean'">
                                <input type="checkbox" :checked="setting.value"
                                    @change="updateSetting(page, setting.id, $event.target.checked)" />
                                {{setting.title}}
                            </div>
                            <div v-if="typeof setting.value === 'string'">
                                {{setting.title}}
                                <input type="text" :value="setting.value" spellcheck="false"
                                    @input="updateSetting(page, setting.id, $event.target.value)" :ref="setting.id"
                                    :placeholder="setting.placeholder" />
                            </div>
                            <div v-if="typeof setting.value === 'number'">
                                {{setting.title}}
                                <select @change="updateSetting(page, setting.id, parseInt($event.target.value))">
                                    <option v-for="(opt, key) in setting.values" :key="key" :value="key" :selected="key === setting.value">{{opt}}
                                    </option>
                                </select>
                            </div>




                        </div>
                    </div>
                </div>

            </div>
        </div>
        <div class="section" v-if="active==='active'">
            <div class="matched" style="border: 0px">
                <h2>Active Presences</h2>
                <br>
                <div>
                    <div class="page-box" v-for="page in enabledPages" :key="page.service" @click="togglePage(page)"
                        :class="{active: activePages.isPageActive(page)}">
                        <div class="checkbox">
                            <img v-if="activePages.isPageActive(page)" :src="'./../vendor/delete-black-18dp.svg'" width="18" height="18">
                            <img v-else :src="'./../vendor/get_app-black-18dp.svg'" width="18" height="18">
                        </div>
                        <div class="img">
                            <img :src="page.logo" width="23">
                        </div>
                        <div class="text">
                            {{page.service}}
                        </div>
                    </div>
                </div>
                <div class="perm box" v-if="sync.allowedIframes.length" style="border: 0px; padding-left: 0; padding-right: 0;">
                    <div>
                        <h3><span>Iframes</span></h3>
                        <div v-for="iframe in sync.allowedIframes" :key="iframe" class="permP">
                            {{getHostname(iframe)}} <span @click="blockIframe(iframe)">X</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="section" v-if="active==='blocked'">
            <div class="perm box" v-if="sync.blockedIframes.length">
                <h2>Blocked Domains</h2>

                <div v-if="sync.blockedIframes.length">
                    <h3><span>Iframes</span></h3>
                    <div v-for="iframe in sync.blockedIframes" :key="iframe" class="permP">
                        {{getHostname(iframe)}} <span @click="deBlockIframe(iframe)">X</span>
                    </div>
                </div>
            </div>
            <div v-else>
                <h3><span>No blocked domains</span></h3>
            </div>
        </div>
        <div class="section" v-if="active==='search'">
            <input v-model="searchWord" placeholder="Search"/>
            <div class="matched">
                <div class="page-box" v-for="page in filteredPages" :key="page.service" @click="togglePage(page)"
                    :class="{active: activePages.isPageActive(page)}">
                    <div class="checkbox">
                        <img v-if="activePages.isPageActive(page)" :src="'./../vendor/delete-black-18dp.svg'" width="18" height="18">
                        <img v-else :src="'./../vendor/get_app-black-18dp.svg'" width="18" height="18">
                    </div>
                    <div class="img">
                        <img :src="page.logo" width="23">
                    </div>
                    <div class="text">
                        {{page.service}}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import Vue from 'vue';
import { pages } from '../Extension/Pages/pages.js';
import { neededPermissions } from '../Extension/Permissions.js';

var extensionId = "agnaejlkbiiggajjmnpmeheigkflbnoo"; //Chrome
if (typeof browser !== 'undefined' && typeof chrome !== "undefined") {
    extensionId = "{57081fef-67b4-482f-bcb0-69296e63ec4f}"; //Firefox
}

export default {
    data: function() {
        return {
            active: 'home',
            pages: pages,
            healthError: null,
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
        };
    },
    created: function () {
        this.extensionHealth();
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

        chrome.storage.local.get("mv3_missingPermissions", (res) => {
            var cur = [];
            if (
                res.mv3_missingPermissions &&
                Object.values(res.mv3_missingPermissions).length
            ) {
                cur = res.mv3_missingPermissions;
            }
            this.missingPermissions = cur;
            chrome.storage.onChanged.addListener(function (changes, namespace) {
                for (var key in changes) {
                    var storageChange = changes[key];
                    if (namespace === "local" && key === "mv3_missingPermissions") {
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
            chrome.storage.sync.get("mv3_permissions", (res) => {
                var cur = [];
                if (res.mv3_permissions && Object.values(res.mv3_permissions).length) {
                    cur = res.mv3_permissions;
                }

                for (const perm of this.missingPermissions ) {
                    if (cur.find((el) => el.origin === perm.origin)) continue;
                    cur.push(perm);
                }

                chrome.storage.sync.set({"mv3_permissions": cur}, () => chrome.storage.local.set({"mv3_missingPermissions": []}, () => this.updatePermissions()));
            });
        },
        async updatePermissions() {
            const permissions = await neededPermissions();
            console.log('Requesting', permissions);
            chrome.permissions.request({ origins: permissions}, (accepted) => {
                console.log("Permissions accepted", accepted);
                window.close();
            });
        },
        getHostname(url) {
            return new URL(url).hostname;
        },
        togglePage(meta, active = false) {
            this.activePages.togglePage(meta);

            if (this.activePages.isPageActive(meta)) {
                this.updatePermissions();
            }
        },
        blockIframe(origin) {
            this.sync.missingIframes = this.sync.missingIframes.filter(el => el !== origin);
            this.sync.allowedIframes = this.sync.allowedIframes.filter(el => el !== origin);
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
                    let matches = true;
                    for (const key in set.if) {
                        const condition = set.if[key];
                        var angry = settings.find(set => set.id === key);
                        if (angry && angry.value !== condition) matches = false;
                    }
                    if(!matches) return false;
                }

                return true;
            });
        },
        extensionHealth() {
            console.log('Health check')
            var dLink = "https://chrome.google.com/webstore/detail/discord-rich-presence/agnaejlkbiiggajjmnpmeheigkflbnoo"; //Chrome
            if (typeof browser !== 'undefined' && typeof chrome !== "undefined") {
                dLink = "https://addons.mozilla.org/firefox/addon/discord-rich-presence/"; //Firefox
            }

            chrome.runtime.sendMessage(extensionId, { action: 'state' }, (response) => {
                console.log('Health check response', response, chrome.runtime.lastError);
                if (chrome.runtime.lastError || !response) {
                    this.healthError = {
                        text: 'Please install the helper extension',
                        link: {
                            href: dLink,
                            text: 'Download'
                        }
                    };
                } else if(response.error) {
                    this.healthError = {
                        text: response.error.message,
                    };
                    if(response.error.url) {
                        this.healthError.link = {
                            href: response.error.url,
                            text: 'Download'
                        }
                    }
                }
            });
        }
    },
}

function checkIfDomain(meta, url) {
    let res = false;
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

</script>

