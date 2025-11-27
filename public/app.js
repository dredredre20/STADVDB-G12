function getNodeUrl() {
    return document.getElementById("nodeUrl").value;
}

function writeOutput(data) {
    document.getElementById("output").textContent =
        JSON.stringify(data, null, 2);
}

// --- APPLY SETTINGS TO NODE ---
async function applySettings() {
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

    const res = await fetch(url + "/tx/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId, isolation })
    });

    writeOutput(await res.json());
}

async function readTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;
    const titleId = document.getElementById("titleId").value;

    const res = await fetch(url + "/tx/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId, title_id: titleId })
    });

    writeOutput(await res.json());
}

async function updateTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;
    const titleId = document.getElementById("titleId").value;
    const newRating = document.getElementById("newRating").value;

    const res = await fetch(url + "/tx/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId, title_id: titleId, new_rating: newRating })
    });

    writeOutput(await res.json());
}

async function commitTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;

    const res = await fetch(url + "/tx/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId })
    });

    writeOutput(await res.json());
}

async function abortTx() {
    const url = getNodeUrl();
    const txId = document.getElementById("txId").value;

    const res = await fetch(url + "/tx/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId })
    });

    writeOutput(await res.json());
}

// --- MONITOR ---
function goMonitor() {
    window.location.href = "/monitor";
}

function goIndex() {
    window.location.href = "/";
}

async function refreshLogs() {
    const res = await fetch("/logs");
    const data = await res.json();
    document.getElementById("logBox").textContent =
        JSON.stringify(data, null, 2);
}
