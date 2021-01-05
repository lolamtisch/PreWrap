var oldLog = console.log;
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

var activePresence = null;

const MIN_SLIDE_TIME = 5000;

class Presence {
    constructor(presenceOptions) {
        this._events = [];
        this.playback = true;
        this.internalPresence = {};
        this.mode = "active";


        console.log('######', presenceOptions, mCategory);
        this.clientId = presenceOptions.clientId;

        if(mCategory === 'music') {
            this.mode = 'passive';
        }

        activePresence = this;

        this.register();
    }

    register() {
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
        if (presenceData instanceof Slideshow) presenceData = presenceData.currentSlide;
        if(presenceData && Object.keys(presenceData).length) {
          presenceData.largeImageText = serviceName;
        }
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

    getPageletiable(letiable) {
        return new Promise(resolve => {
            let script = document.createElement("script"),
                _listener = (data) => {
                    script.remove();
                    resolve(JSON.parse(data.detail));

                    window.removeEventListener("PreWrap_Pageletiable", _listener, true);
                };

            window.addEventListener("PreWrap_Pageletiable", _listener);

            script.id = "PreWrap_Pageletiables";
            script.appendChild(
                document.createTextNode(`
                    var pmdPL = new CustomEvent(
                        "PreWrap_Pageletiable",
                        {
                            detail: (typeof window["${letiable}"] === "string")
                                ? window["${letiable}"]
                                : JSON.stringify(window["${letiable}"])
                        }
                    );
                    window.dispatchEvent(pmdPL);
                `)
            );

            (document.body || document.head || document.documentElement).appendChild(
                script
            );
        });
    }

    setTrayTitle(trayTitle) {}

    getExtensionVersion(numeric = true) {
        const version = chrome.runtime.getManifest().version;
        if (onlyNumeric) return parseInt(version.replace(/\D/g, ""));
        return version;
    }

    async getLogs(regExp = false) {
        let logs = (await this.getPageletiable("console")).logs;
        if (regExp) {
            logs = logs.filter(
                log => typeof log === "string" && new RegExp(regExp).test(log)
            );
        }
        if (logs == undefined) logs = [];
        return logs;
    }

    info(text) {
        console.log(
            `[PRESENCE] [INFO] ${text}`,
        );
    }

    success(text) {
        console.log(
            `[PRESENCE] [SUCCESS] ${text}`,
        );
    }

    error(text) {
        console.error(
            `[PRESENCE] [ERROR] ${text}`,
        );
    }

    getTimestampsfromMedia(element) {
        return this.getTimestamps(element.currentTime, element.duration);
    }

    getTimestamps(elementTime, elementDuration) {
        const startTime = Date.now();
        const endTime = Math.floor(startTime / 1000) - elementTime + elementDuration;
        return [Math.floor(startTime / 1000), endTime];
    }

    timestampFromFormat(format) {
        return format
            .split(":")
            .map(time => {
                return parseInt(time);
            })
            .reduce((prev, time) => 60 * prev + time);
    }

    createSlideshow() {
        return new Slideshow;
    }
}

class SlideshowSlide {
	id;
	data;
	_interval;

	constructor(id, data, interval) {
		this.id = id;
		this.data = data;
		this.interval = interval;
	}

	get interval() {
		return this._interval;
	}

	set interval(interval) {
		if (interval <= MIN_SLIDE_TIME) {
			interval = MIN_SLIDE_TIME;
		}
		this._interval = interval;
	}

	updateData(data = null) {
		this.data = data || this.data;
	}

	updateInterval(interval = null) {
		this.interval = interval || this.interval;
	}
}

class Slideshow {
    index = 0;
    slides = [];
	currentSlide = {};

    constructor() {
		this.pollSlide()
	}

    pollSlide() {
        if (this.index > this.slides.length - 1) this.index = 0;
		if (this.slides.length !== 0) {
			const slide = this.slides[this.index];
			this.currentSlide = slide.data;
			this.index++;
			setTimeout(() => {
				this.pollSlide();
            }, slide.interval);
            activePresence.register();
		} else {
			this.currentSlide = {};
			setTimeout(() => {
				this.pollSlide();
			}, MIN_SLIDE_TIME);
		}
    }

    addSlide(id, data, interval) {
        if (this.hasSlide(id)) return this.updateSlide(id, data, interval);
        const slide = new SlideshowSlide(id, data, interval);
        this.slides.push(slide);
        return slide;
    }

    deleteSlide(id) {
        this.slides = this.slides.filter(slide => slide.id !== id);
    }

    deleteAllSlides() {
        this.slides = [];
        this.currentSlide = {};
    }

    updateSlide(id, data = null, interval = null) {
		for (const slide of this.slides) {
			if (slide.id === id) {
				slide.updateData(data);
				slide.updateInterval(interval);
				return slide;
			}
		}
    }

    hasSlide(id) {
		return this.slides.some(slide => slide.id === id);
    }

    getSlides() {
		return this.slides;
	}
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
