import {pages} from "./Pages/pages.js";

export async function neededPermissions() {
    const activePages = await getActivePages();
    const permissions = [];
    for (const page of activePages) {
        const config = getConfig(page);
        permissions.push(...config.permissions);
    }
    await new Promise((resolve, reject) => {
        chrome.storage.sync.get("mv3_permissions", (res) => {
            var cur = [];
            if (res.mv3_permissions && Object.values(res.mv3_permissions).length) {
                cur = res.mv3_permissions;
            }
            for (const perm of cur) {
                permissions.push(perm.origin);
            }
            resolve();
        });
    })
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

export function getConfig(page) {
    const navigation = [];
    const matches = [];
    const permissions = [];
    const found = pages.find(p => p.service === page);
    if (found) {
        if (found.regExp) navigation.push({urlMatches: found.regExp});
        if (found.regExp && found.regExp.includes('[.]html')) navigation.push({ originAndPathMatches: found.regExp });
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
    }
    return { config: found, navigation: navigation, matches: matches, permissions: permissions };
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

export function addMissingRequest(page, origin) {
    chrome.storage.local.get("mv3_missingPermissions", (res) => {
        var cur = [];
        if (res.mv3_missingPermissions && Object.values(res.mv3_missingPermissions).length) {
            cur = res.mv3_missingPermissions;
        }
        if (cur.find((el) => el.origin === origin)) return;
        cur.push({ origin: origin, page: page });
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
