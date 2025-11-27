function logTo(id, message) {
    document.getElementById(id).textContent =
        JSON.stringify(message, null, 2);
}

async function createReviewTx() {
    const url = document.getElementById("nodeUrl").value;
    const movieId = document.getElementById("movieId").value;
    const rating = document.getElementById("rating").value;

    if (rating < 1 || rating > 10) {
        alert("Rating must be between 1 and 10.");
        return;
    }
    
    const action = `ADD_REVIEW: tconst=${movieId}, rating=${rating}`;

    const res = await fetch(url + "/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
    });

    await res.json()
    if (res.ok) {
        logTo("output", { status: `Review transaction for ${movieId} created successfully.` });
    }
}

async function refreshLogs() {
    const url = document.getElementById("nodeUrl").value;
    const res = await fetch(url + "/logs");
    const data = await res.json();
    logTo("logBox", data);
}

if (document.getElementById("logBox")) {
    setInterval(refreshLogs, 1000);
}

function redirectToMonitor() {
    window.location.href = "/monitor";
}

function redirectToIndex() {
    window.location.href = "/";
}

