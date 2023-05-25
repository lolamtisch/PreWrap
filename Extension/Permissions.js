import {pages} from "./Pages/pages.js";

async function getActivePageConfigs() {
    const activePages = await getActivePages();
    const configs = await Promise.all(activePages.map((page) => getConfig(page)));
    return configs;
}

export async function neededPermissions() {
    const configs = await getActivePageConfigs();
    const permissions = [];
    for (const config of configs) {
        permissions.push(...config.permissions);
    }
    console.log('Permissions', permissions);
    return permissions;
}

export async function missingPermissions() {
    const permissions = await neededPermissions();
    return new Promise((resolve, reject) => {
        chrome.permissions.contains({origins: permissions}, (result) => {
            if (result) {
                resolve([]);
            } else {
                resolve(permissions);
            }
        });
    })
}

export async function getConfig(page) {
    const navigation = [];
    const matches = [];
    const permissions = [];
    const found = pages.find(p => p.service === page);
    const iframe = {
        navigation: [],
        matches: [],
    }
    let customPermissions = [];
    if (found) {
        customPermissions = await getPageCustomPermissions(page);

        if (found.regExp) navigation.push({urlMatches: found.regExp});
        if (found.regExp && found.regExp.includes('[.]html')) navigation.push({ originAndPathMatches: found.regExp });
        if (found.iFrameRegExp) iframe.navigation.push({urlMatches: found.iFrameRegExp});
        if (found.iFrameRegExp && found.iFrameRegExp.includes('[.]html')) iframe.navigation.push({ originAndPathMatches: found.iFrameRegExp });
        if (Array.isArray(found.url)) {
            found.url.forEach(el => {
                matches.push( '*://' + el + '/*');
                permissions.push("http://" + el + "/");
                permissions.push('https://' + el + '/');
            });
        } else {
            matches.push('*://' + found.url + '/*');
            permissions.push("http://" + found.url + "/");
            permissions.push('https://' + found.url + '/');
        }

        for (const custom of customPermissions) {
            permissions.push(custom.origin);
            if (custom.iframe) {
                iframe.matches.push(custom.origin.replace(/\/$/g, '/*'));
            } else {
                matches.push(custom.origin.replace(/\/$/g, '/*'));
            }
        }
    }
    return { config: found, navigation: navigation, matches: matches, permissions: permissions, customPermissions: customPermissions, iframe: iframe };
}

export async function getActivePages() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get('activePages', (res) => {
            let activePages = [];
            if (res.activePages && Object.values(res.activePages).length) {
                activePages = res.activePages;
            }
            resolve(activePages);
        });
    })
}

export async function getPageCustomPermissions(page) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get("mv3_permissions", (res) => {
            var cur = [];
            if (res.mv3_permissions && Object.values(res.mv3_permissions).length) {
                cur = res.mv3_permissions;
            }
            const found = cur.filter((el) => el.page === page);
            resolve(found);
        });
    })
}

export function addMissingRequest(page, origin, iframe) {
    chrome.storage.local.get("mv3_missingPermissions", (res) => {
        var cur = [];
        if (res.mv3_missingPermissions && Object.values(res.mv3_missingPermissions).length) {
            cur = res.mv3_missingPermissions;
        }
        if (cur.find((el) => el.origin === origin)) return;
        cur.push({ origin: origin, page: page, iframe: iframe });
        chrome.storage.local.set({"mv3_missingPermissions": cur});
    });
}

export function hasMissingRequests() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("mv3_missingPermissions", (res) => {
            var cur = [];
            if (res.mv3_missingPermissions && Object.values(res.mv3_missingPermissions).length) {
                cur = res.mv3_missingPermissions;
            }
            resolve(cur.length > 0);
        });
    })
}
