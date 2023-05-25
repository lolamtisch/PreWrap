if (typeof oldLog !== 'undefined' && oldLog) {
  console.error('Content and Iframe executed at the same time');
  console.log = oldLog;
}

console.log = (function () {
    return Function.prototype.bind.call(
        console.log,
        console,
        "%cIframe",
        "background-color: #312f40; color: white; padding: 2px 10px; border-radius: 3px;"
    );
})();

var activeIframePresence = null;

class iFrame {
    constructor() {
        this._events = [];
        console.log('loaded', this.getUrl())
        activeIframePresence = this;
    }

    getUrl() {
        return window.location.href;
    }

    on(eventName, callback) {
        this._events[eventName] = callback;
    }

    send(data) {
        console.log("send", data);
        chrome.runtime.sendMessage({ type: "iframeData", data: data });
    }

    callEvent() {
        this._events["UpdateData"]();
    }
}

chrome.runtime.onMessage.addListener(function (info, sender, sendResponse) {
    if (info.type === 'presence') {
        console.log('Iframe data requested', info);
        activeIframePresence.callEvent();
    }
});

setTimeout(() => {
    setInterval(() => {
        checkForIframes();
    }, 3 * 60 * 1000);
    checkForIframes();
}, 10000);

function checkForIframes() {
    if (typeof checkIframe !== "undefined" && checkIframe) {
        frames = document.getElementsByTagName("iframe");
        console.log("Frames found", frames.length);
        var urlsD = [];
        for (i = 0; i < frames.length; ++i) {
            let frame = frames[i];
            if (frame.src) {
                urlsD.push(frame.src);
            }
        }
        console.log("domains", serviceNameWrap, urlsD);
        chrome.runtime.sendMessage({
            type: "iframeDomains",
            data: {
                page: serviceNameWrap,
                domains: urlsD,
            },
        });
    }
}
