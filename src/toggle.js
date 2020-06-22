// 10000 millliseconds is 10 seconds
// 60000 milliseconds is 1 minute
// 300000 milliseconds is 5 minutes
// 900000 milliseconds is 15 minutes
const millisecondsLimit = 10000
const extensionName = 'tabWindowLimiter'

function getMillisecondTime(pastMilliseconds = 0) {
    let date = new Date();
    return String(date.getTime() - pastMilliseconds);
}

function isAboveThreshold(millisecondString) {
    res = getMillisecondTime() - parseInt(millisecondString) > millisecondsLimit
    localStorage.setItem("testa", res)

    return getMillisecondTime() - parseInt(millisecondString) > millisecondsLimit
}

function toggleActive() {
    let dateString = localStorage.getItem(extensionName)

    if (isAboveThreshold(dateString)) {
        localStorage.setItem(extensionName, getMillisecondTime())
        document.getElementById(extensionName).value = "Enable"
    } else {
        localStorage.setItem(extensionName, getMillisecondTime(millisecondsLimit))
        document.getElementById(extensionName).value = "Disable" 
    }
}

function generateHtml(tab) {
    const millisecondsString = localStorage.getItem(extensionName)

    // Set it to enabled by default
    if (millisecondsString === null) {
        localStorage.setItem(extensionName, getMillisecondTime(millisecondsLimit))
    }

    const text = isAboveThreshold(millisecondsString) ? "Disable" : "Enable"
    const div = document.getElementById('active');

    div.innerHTML += `<input id="${extensionName}" type="button" value="${text}"></input>`
    document.getElementById(extensionName).addEventListener("click", function(){toggleActive()});
}

chrome.tabs.query({active: true, lastFocusedWindow: true}, tabs => {
    generateHtml(tabs[0]);
    // use `url` here inside the callback because it's asynchronous!
});


