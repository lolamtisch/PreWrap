console.log = (function () {
    return Function.prototype.bind.call(
        console.log,
        console,
        "%cContent",
        "background-color: #694ba1; color: white; padding: 2px 10px; border-radius: 3px;"
    );
})();

var extensionId = "agnaejlkbiiggajjmnpmeheigkflbnoo"; //Chrome
if (typeof browser !== 'undefined' && typeof chrome !== "undefined") {
    extensionId = "{57081fef-67b4-482f-bcb0-69296e63ec4f}"; //Firefox
}

activePresence = null;

class Presence {
    _events = [];
    playback = true;
    internalPresence = {};
    mode = 'active';

    constructor(presenceOptions) {
        console.log('######', presenceOptions, mCategory);
        this.clientId = presenceOptions.clientId;

        if(mCategory === 'music') {
            this.mode = 'passive';
        }

        activePresence = this;

        chrome.runtime.sendMessage(extensionId, { mode: this.mode }, function (response) {
            console.log('Presence registred', response)
        });
    }

    on(eventName/*: "UpdateData" | "iFrameData"*/, callback) {
        this._events[eventName] = callback;
    }

    callEvent() {
        this._events["UpdateData"]();
    }

    callIframeEvent(data) {
        console.log('Iframe Data', data);
        this._events["iFrameData"](data);
    }

    setActivity(presenceData/*: presenceData = {}*/, playback/*: boolean = true*/) {
        console.log('presence', presenceData);
        this.internalPresence = presenceData;
        this.playback = playback;
    }

    getActivity() {
        return this.internalPresence;
    }

    getPresence(focus) {
        var activity = this.getActivity();
        console.log("activity", activity);
        if (!activity || !Object.keys(activity).length) return {};
        if (!focus && this.mode === 'passive' && !this.playback && activity.smallImageKey !== 'play') return {};
        return {
            clientId: this.clientId,
            presence: this.getActivity(),
        };
    }

    clearActivity() {
        this.internalPresence = {};
    }

    getStrings(strings, languageKey = 'en') {
        for (var key in strings) {
            strings[key] = language[strings[key]];
        }
        return Promise.resolve(strings);
    }

    getSetting(key) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage(
                {
                    type: "serviceSettings",
                    data: { service: serviceName, mode: "get", key: key },
                },
                (res) => {
                    console.log(key, res)
                    resolve(res);
                }
            );
        })
    }

    hideSetting(key) {
        chrome.runtime.sendMessage({
            type: "serviceSettings",
            data: { service: serviceName, mode: "hidden", key: key, value: true },
        });
    }

    showSetting(key) {
        chrome.runtime.sendMessage({
            type: "serviceSettings",
            data: { service: serviceName, mode: "hidden", key: key, value: false },
        });
    }

    setTrayTitle(trayTitle) {}
}

chrome.runtime.onMessage.addListener(function (info, sender, sendResponse) {
    if (info.type === 'presence') {
        try{
            console.log("Presence requested", info);
            activePresence.callEvent();
            setTimeout(() => {
                try {
                    sendResponse(activePresence.getPresence(info.data.active));
                } catch (e) {
                    console.error("Activity error", e);
                    sendResponse({});
                }
            }, 500);
        } catch(e) {
            console.error('Presence error', e);
            sendResponse({});
        }
        return true;
    } else if (info.type === "iframeDataEvent") {
        activePresence.callIframeEvent(info.data);
        activePresence.callEvent();
    }
});

setTimeout(() => {
    setInterval(() => {
        checkForIframes();
    }, 3 * 60 * 1000);
    checkForIframes();
}, 10000);

function checkForIframes() {
    if (typeof checkIframe !== 'undefined' && checkIframe) {
        frames = document.getElementsByTagName("iframe");
        console.log('Frames found', frames.length);
        var urlsD = [];
        for (i = 0; i < frames.length; ++i) {
            let frame = frames[i];
            if (frame.src) {
                urlsD.push(frame.src);
            }
        }
        console.log("domains", urlsD);
        chrome.runtime.sendMessage({
            type: "iframeDomains",
            data: {
                domains: urlsD,
            },
        });
    }
}

// https://api.premid.app/v2/langFile/extension/en
var language = {
  "extension.2.0.new1":
    "Users can now add presences by themself. *Add some now!*",
  "extension.2.0.new2": "Find some *new presences* in their natural habitat",
  "extension.2.0.new3": "Auto updating is a thing now",
  "extension.2.0.new4": "Users can create presences now",
  "extension.2.0.new5": "*Docs* for these creative developers out there",
  "extension.2.0.new6": "All new website design",
  "extension.2.0.new7": "More features for our Discord-Bot",
  "extension.2.0.new8": "Our new API is a running beast",
  "extension.2.0.change1": "Revamped popup and tabs layout and style",
  "extension.2.0.fix1": "A lot of (un)known bugs ran away",
  "extension.2.0.fix2": "Everything is running much faster now",
  "extension.2.0.1.fix1": "Fixes old app error even if you have the latest one",
  "extension.description.short": "Your Rich Presence for web services!",
  "extension.description.full":
    "YOU HAVE TO INSTALL OUR OFFICIAL APPLICATION TO GET IT WORKING\n   {0} {1}\n\nYou can use your media keys to control the playback of these services. When you watch/listen to something with one of our supported services, the browser extension sends the video's/song's metadata to our desktop client and PreMiD processes it. PreMiD sends the information to Discord with the correct form and then automatically sets its status.\nSupported services\n   {2} Have a look at {3}\n\nNeed help?\n   {4} {5}\n\nOur Discord server\n   {6} Talk to the people behind PreMiD {7}\n\nWe're Open Source!\n   {9} Great stuff should be open to the public {10}",
  "popup.navigation.settings": "Settings",
  "popup.navigation.credits": "Credits",
  "popup.headings.settings": "Settings",
  "popup.headings.general": "General",
  "popup.headings.description": "Description",
  "popup.setting.enabled": "Enabled",
  "popup.setting.mediaControl": "Media Controls",
  "popup.setting.titleMenubar": "Title Menubar",
  "popup.setting.autoLaunch": "Auto launch",
  "popup.headings.presences": "Presences",
  "popup.presences.manage": "Manage",
  "popup.presences.noPresences": "No Presences added",
  "popup.presences.done": "Done",
  "popup.presences.load": "Load Presence",
  "popup.buttons.presenceStore": "Presence Store",
  "popup.buttons.help": "Need Help?",
  "popup.credits.error.heading": "Oh noes!",
  "popup.credits.error.message": "Error while loading credits",
  "popup.info.notConnected": "Not connected",
  "popup.info.notConnected.message":
    "PreMiD was unable to connect to its application! Is it installed and running? *Troubleshooting*",
  "popup.info.unsupportedAppVersion": "Outdated App",
  "popup.info.unsupportedAppVersion.message":
    "Your PreMiD app is outdated. Please update it in order to continue using PreMiD.",
  "popup.category.all": "All",
  "popup.category.anime": "Anime",
  "popup.category.music": "Music",
  "popup.category.games": "Games",
  "popup.category.socials": "Socials",
  "popup.category.videos": "Videos & Streams",
  "popup.category.other": "Other",
  "presence.playback.playing": "Playing back",
  "presence.playback.paused": "Playback paused",
  "presence.activity.browsing": "Browsing...",
  "presence.activity.live": "Live",
  "presence.activity.reading": "Reading",
  "presence.activity.searching": "Searching",
  "presence.media.info.episode": "Episode {0}",
  "tab.button.changelog": "Changelog",
  "tab.button.wiki": "Wiki",
  "tab.installed.heading": "Thank you",
  "tab.installed.subHeading": "for installing {0}",
  "tab.installed.start": "Start using {0}",
  donate: "Donate",
  "tab.installed.error":
    "**Oh no!** We couldn't connect to the application... Is it already installed?",
  "tab.installed.link.troubleshooting": "Troubleshooting",
  "tab.installed.link.installApplication": "Install application",
  "tab.updated.heading": "Level up!",
  "tab.updated.subHeading": "{0} has been updated!",
  "tab.updated.new": "New",
  "tab.updated.changed": "Changed",
  "tab.updated.fixed": "Fixed",
};