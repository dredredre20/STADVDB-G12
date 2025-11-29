function getNodeUrl() {
    return document.getElementById("nodeUrl").value;
}

function writeOutput(data) {
    document.getElementById("output").textContent =
        JSON.stringify(data, null, 2);
}

// transaction log shown in `#output`
let currentTxId = null;
function appendLog(entry) {
    const out = document.getElementById("output");
    const time = new Date().toISOString();
    const text = typeof entry === "string" ? entry : JSON.stringify(entry, null, 2);
    // keep previous content and append a new line
    if (out.textContent && out.textContent.length > 0) out.textContent += "\n";
    out.textContent += `[${time}] ${text}`;
}

// --- APPLY SETTINGS TO NODE ---
async function applySettings() {
    console.log("Applying settings...");
    const url = getNodeUrl();
    const isolation = document.getElementById("isolationLevel").value;

    const res = await fetch(url + "/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isolation})
    });

    const data = await res.json();

    if (res.ok) {
        alert("Settings applied successfully!");
        writeOutput(data);
    } else {
        alert("Failed to apply settings");
        writeOutput(data);
    }
}

// --- TRANSACTION ACTIONS ---
async function beginTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;
    const isolation = document.getElementById("isolationLevel").value;

    // start a new terminal session for this tx
    currentTxId = txId;
    document.getElementById("output").textContent = "";
    appendLog(`BEGIN tx=${txId} iso=${isolation}`);

    try {
        const res = await fetch(url + "/tx/begin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txId, isolation })
        });

        const json = await res.json();
        appendLog(json);
    } catch (err) {
        appendLog({ ok: false, error: err.message });
    }
}

async function readTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;
    const titleId = document.getElementById("titleId").value;

    appendLog(`READ tx=${txId} title=${titleId}`);

    try {
        const res = await fetch(url + "/tx/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txId, title_id: titleId })
        });

        const json = await res.json();

        //if row exists show rating and title info
        if (json.ok && json.row) {
            const rating = json.row.average_rating;
            appendLog(`VALUE tx=${txId} title=${titleId} rating=${rating}`);
        }

        appendLog(json);

    } catch (err) {
        appendLog({ ok: false, error: err.message });
    }
}


async function updateTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;
    const titleId = document.getElementById("titleId").value;
    const newRating = document.getElementById("newRating").value;

    appendLog(`UPDATE tx=${txId} title=${titleId} new_rating=${newRating}`);
    try {
        const res = await fetch(url + "/tx/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txId, title_id: titleId, new_rating: newRating })
        });

        const json = await res.json();
        appendLog(json);
    } catch (err) {
        appendLog({ ok: false, error: err.message });
    }
}

async function commitTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;

    appendLog(`COMMIT tx=${txId}`);
    try {
        const res = await fetch(url + "/tx/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txId })
        });

        const json = await res.json();
        appendLog(json);
        if (json && json.ok) {
            // notify user and clear inputs for this transaction
            alert(`Transaction ${txId} committed`);
            currentTxId = null;
            document.getElementById("txId").value = "";
            document.getElementById("titleId").value = "";
            document.getElementById("newRating").value = "";
        } else {
            appendLog({ ok: false, error: json && json.error ? json.error : 'Commit failed' });
        }
    } catch (err) {
        appendLog({ ok: false, error: err.message });
    }
}

async function abortTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;

    appendLog(`ABORT tx=${txId}`);
    try {
        const res = await fetch(url + "/tx/abort", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txId })
        });

        const json = await res.json();
        appendLog(json);
        if (json && json.ok) {
            alert(`Transaction ${txId} aborted`);
            currentTxId = null;
            document.getElementById("txId").value = "";
            document.getElementById("titleId").value = "";
            document.getElementById("newRating").value = "";
        } else {
            appendLog({ ok: false, error: json && json.error ? json.error : 'Abort failed' });
        }
    } catch (err) {
        appendLog({ ok: false, error: err.message });
    }
}

// --- NAVIGATION ---
function goMonitor() {
    window.location.href = "/monitor";
}

function goIndex() {
    window.location.href = "/";
}

async function refreshLogs() {
    const url = getNodeUrl();
    document.getElementById("logBox").textContent = "";
    const res = await fetch(url + "/logs");
    const data = await res.json();
    document.getElementById("logBox").textContent =
        JSON.stringify(data, null, 2);
}

async function loadSchedule() {
    const table = document.getElementById("scheduleTable");

    table.innerHTML = "<tr><td>Loading distributed logs...</td></tr>";

    // The 3 node URLs
    const nodeUrls = [
        "http://ccscloud.dlsu.edu.ph:60148",
        "http://ccscloud.dlsu.edu.ph:60149",
        "http://ccscloud.dlsu.edu.ph:60150"
    ];

    let allLogs = [];

    // Fetch logs from each node
    for (const url of nodeUrls) {
        try {
            const res = await fetch(url + "/logs");
            const data = await res.json();

            // Attach node id to logs
            data.forEach(log => log.nodeUrl = url);

            allLogs = allLogs.concat(data);
        } catch (err) {
            console.error("Failed to fetch logs from:", url, err);
        }
    }

    // Sort all logs by timestamp
    allLogs.sort((a, b) => new Date(a.time) - new Date(b.time));

    // Extract txIds
    const txIds = [...new Set(
        allLogs.map(l => {
            const match = /tx=([A-Za-z0-9]+)/.exec(l.msg);
            return match ? match[1] : null;
        }).filter(Boolean)
    )];

    // Build header
    let html = "<tr><th>Time</th>";
    txIds.forEach(tx => html += `<th>${tx}</th>`);
    html += "</tr>";

    // Build rows
    allLogs.forEach((entry, index) => {
        const t = "t" + (index + 1);
        html += `<tr><td>${t}</td>`;

        txIds.forEach(tx => {
            const match = /tx=([A-Za-z0-9]+)/.exec(entry.msg);
            const txInLog = match ? match[1] : null;

            if (txInLog === tx) {
                html += `<td>${entry.msg}</td>`;
            } else {
                html += "<td></td>";
            }
        });

        html += "</tr>";
    });

    table.innerHTML = html;
}


function checkScheduleAvailability() {
    const url = document.getElementById("nodeUrl").value;
    const scheduleBtn = document.getElementById("scheduleBtn");
    const warning = document.getElementById("scheduleWarning");

    const isNode1 = url.includes("60148");

    if (!isNode1) {
        scheduleBtn.disabled = true;
        warning.textContent = "Schedule viewer only works on Node 1 (Central Aggregator)";
        document.getElementById("scheduleTable").innerHTML = "";
    } else {
        scheduleBtn.disabled = false;
        warning.textContent = "";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const nodeSelect = document.getElementById("nodeUrl");
    nodeSelect.addEventListener("change", checkScheduleAvailability);

    // Run once on page load
    checkScheduleAvailability();
});


