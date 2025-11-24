function logTo(id, message) {
    document.getElementById(id).textContent =
        JSON.stringify(message, null, 2);
}

async function createReviewTx() {
    const url = document.getElementById("nodeUrl").value;
    const movieId = document.getElementById("movieId").value;
    const rating = document.getElementById("rating").value;

    const action = `ADD_REVIEW: tconst=${movieId}, rating=${rating}`;

    const res = await fetch(url + "/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
    });

    logTo("output", await res.json());
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
