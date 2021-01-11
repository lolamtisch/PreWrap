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
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ type: "getStrings", data: strings}, (response) => {
                console.log('Language', response);
                resolve(response);
            });
        });
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
    constructor() {
        this.index = 0;
        this.slides = [];
        this.currentSlide = {};
		this.pollSlide();
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
