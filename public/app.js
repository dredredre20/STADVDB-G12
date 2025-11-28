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
    const lockMode = document.getElementById("lockMode").value;

    const res = await fetch(url + "/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isolation, lockMode })
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
    const url = document.getElementById("nodeUrl").value;
    const table = document.getElementById("scheduleTable");

    table.innerHTML = "<tr><td>Loading schedule...</td></tr>";

    const res = await fetch(url + "/all-logs");
    const data = await res.json();

    const logs = data.logs || [];

    // Extract transaction IDs
    const txIds = [...new Set(logs.map(l => {
        const match = /tx=([A-Za-z0-9]+)/.exec(l.msg);
        return match ? match[1] : null;
    }).filter(Boolean))];

    // Build table header
    let html = "<tr><th>Time</th>";
    txIds.forEach(tx => html += `<th>${tx}</th>`);
    html += "</tr>";

    // Build rows
    logs.forEach((entry, index) => {
        const timeLabel = "t" + (index + 1);

        html += `<tr><td>${timeLabel}</td>`;

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


