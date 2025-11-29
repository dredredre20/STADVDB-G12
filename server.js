require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");

const NODE_ID = process.env.NODE_ID || "1";
const PORT = process.env.PORT || (3000 + parseInt(NODE_ID));

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// --- Logs for monitor UI ---
let txLogs = [];
function log(msg) {
    const entry = {
        node: NODE_ID,
        time: new Date().toISOString(),
        msg
    };
    txLogs.push(entry);
    console.log(`[Node ${NODE_ID}]`, msg);
}


// --- MySQL connection ---

let pool;

(async () => {
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // Test connection
        const conn = await pool.getConnection();
        console.log(`✓ MySQL connected successfully on Node ${NODE_ID}`);
        conn.release();

    } catch (err) {
        console.error("✗ MySQL connection FAILED:", err.message);
    }
})();

// --- Transaction state ---
// --- Recovery & Replication State ---
// let replicationQueue = [];

let commitLog = []; // for saving trasanctions that are already done
let isNodeFailed = false;

const NODE_URLS = [
    "http://ccscloud.dlsu.edu.ph:60148",
    "http://ccscloud.dlsu.edu.ph:60149",
    "http://ccscloud.dlsu.edu.ph:60150"
];

// Change index if incorrect accessing 
function getCurrentNodeUrl() {
    return NODE_URLS[parseInt(NODE_ID) - 1];
}


let txs = {}; 
let config = {
    isolation: "read_committed",
    lockMode: "strict_2pl"
};

// --- Replication function ---
async function replicateTransaction(commitEntry) {
    const isCentral = NODE_ID === "1";

    // Helper to do the POST /sync call
    async function postSync(url, commitsPayload) {
        try {
            const resp = await fetch(url + "/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ commits: commitsPayload })
            });
            const json = await resp.json().catch(() => ({ ok: resp.ok }));
            if (resp.ok) {
                log(`Replicated tx=${commitEntry.txId} to ${url}`);
            } else {
                log(`Replication FAILED tx=${commitEntry.txId} to ${url}: ${JSON.stringify(json)}`);
            }
        } catch (err) {
            log(`Replication FAILED tx=${commitEntry.txId} to ${url}: ${err.message}`);
        }
    }

    if (isCentral) {
        // For central node, determine genre for each title_id then group by target node
        const titleIds = Object.keys(commitEntry.updates);
        if (titleIds.length === 0) return;

        try {
            // Query genres for all title_ids
            const placeholders = titleIds.map(() => '?').join(',');
            const [rows] = await pool.query(
                `SELECT title_id, genre FROM imdb WHERE title_id IN (${placeholders})`,
                titleIds
            );

            // Build a map for title_id to genre
            const genreMap = {};
            for (const r of rows) {
                genreMap[r.title_id] = (r.genre || "").toString().toLowerCase();
            }

            // Group updates by node URL
            const nodeUpdates = {};
            for (const title of titleIds) {
                const rating = commitEntry.updates[title];
                const genre = genreMap[title] || null;

                if (genre === "comedy") {
                    const url = NODE_URLS[1]; // Node 2
                    nodeUpdates[url] = nodeUpdates[url] || {};
                    nodeUpdates[url][title] = rating;
                } else  { // assume drama
                    const url = NODE_URLS[2]; // Node 3
                    nodeUpdates[url] = nodeUpdates[url] || {};
                    nodeUpdates[url][title] = rating;
                } 
            }
            for (const [url, updatesObj] of Object.entries(nodeUpdates)) {
                const groupedCommit = {
                    txId: commitEntry.txId,
                    timestamp: commitEntry.timestamp,
                    updates: updatesObj,
                    sourceNode: getCurrentNodeUrl()
                };
                await postSync(url, [groupedCommit]);
            }
        } catch (err) {
            log(`REPLICATION (central) FAILED tx=${commitEntry.txId}: ${err.message}`);
        }
    } else {
        // For node 2 or 3, replicate full commit entry to central node
        const centralUrl = NODE_URLS[0];
        try {
            await postSync(centralUrl, [commitEntry]);
        } catch (err) {
            log(`REPLICATION (fragment->central) FAILED tx=${commitEntry.txId}: ${err.message}`);
        }
    }
}

// --------------------------------
// ROUTES
// --------------------------------

app.get("/", (req, res) => {
    res.render("index", { nodeId: NODE_ID });
});

app.get("/monitor", (req, res) => {
    res.render("monitor", { nodeId: NODE_ID });
});

// Logs
app.get("/logs", (req, res) => {
    res.send(txLogs);
});

// --- CONFIG (isolation + lockMode) ---
app.post("/config", (req, res) => {
    config.isolation = req.body.isolation || config.isolation;
    config.lockMode = req.body.lockMode || config.lockMode;

    log(`CONFIG: iso=${config.isolation}, lock=${config.lockMode}`);

    res.send({ ok: true, config });
});

// --------------------------------
// TRANSACTION API
// --------------------------------

// BEGIN
app.post("/tx/begin", (req, res) => {
    const { txId, isolation } = req.body;

    txs[txId] = {
        txId,
        isolation: isolation || config.isolation,
        buffered: {},
        startTime: Date.now(),
        status: "active"
    };

    log(`BEGIN tx=${txId} iso=${txs[txId].isolation}`);

    res.send({ ok: true });
});

// Active transactions for monitor/timeline
app.get("/active", (req, res) => {
    try {
        const active = Object.values(txs).filter(t => t.status === "active").map(t => ({
            txId: t.txId,
            node: NODE_ID,
            startTime: t.startTime,
            isolation: t.isolation
        }));

        res.send({ ok: true, active });
    } catch (err) {
        res.status(500).send({ ok: false, error: err.message });
    }
});

// READ
app.post("/tx/read", async (req, res) => {
    const { txId, title_id } = req.body;

    try {
        const [rows] = await pool.query(
            "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
            [title_id]
        );

        const row = rows[0] || null;

        // LOG the rating for schedule viewer
        const rating = row ? row.average_rating : "null";
        log(`READ tx=${txId} title=${title_id} rating=${rating}`);

        res.send({ ok: true, row });
    } catch (err) {
        res.status(500).send({ ok: false, error: err.message });
    }
});

// UPDATE (buffer only)
app.post("/tx/update", (req, res) => {
    const { txId, title_id, new_rating } = req.body;
    if (!txs[txId]) return res.status(400).send({ ok: false, error: "Unknown tx" });

    txs[txId].buffered[title_id] = Number(new_rating);

    log(`BUFFER tx=${txId} title=${title_id} rating=${new_rating}`);

    res.send({ ok: true });
});

// COMMIT (apply buffered writes)
app.post("/tx/commit", async (req, res) => {
    const { txId } = req.body;
    const tx = txs[txId];

    if (!tx) return res.status(400).send({ ok: false, error: "Unknown tx" });

    if (isNodeFailed){
        return res.status(500).send({ ok: false, error: "Node is failed. Cannot commit transaction."});
    }

    try {
        const conn = await pool.getConnection();
        await conn.beginTransaction();

        for (const title of Object.keys(tx.buffered)) {
            const rating = tx.buffered[title];

            await conn.query(
                "UPDATE imdb SET average_rating = ? WHERE title_id = ?",
                [rating, title]
            );
        }

        await conn.commit();
        conn.release();

        // Log commit for recovery
        const commitEntry = {
            txId, 
            timestamp : Date.now(), 
            updates: tx.buffered,
            sourceNode: getCurrentNodeUrl()
        }
        commitLog.push(commitEntry);

        log(`COMMIT tx=${txId}`);

        await replicateTransaction(commitEntry); // change this later

        delete txs[txId];
        res.send({ ok: true });

    } catch (err) {
        res.status(500).send({ ok: false, error: err.message });
    }
});

// ABORT
app.post("/tx/abort", (req, res) => {
    const { txId } = req.body;
    delete txs[txId];

    log(`ABORT tx=${txId}`);

    res.send({ ok: true });
});


// Sync missed transactions during recovery
// This endpoint is called during commit to replicate to other nodes
app.post("/sync", async (req, res) => {
    const { commits } = req.body;
    let synced = 0;
    let failed = 0;

    for (const commit of commits) {
        try {
            const conn = await pool.getConnection();
            await conn.beginTransaction();

            // For every update in the commit, apply it
            for (const title of Object.keys(commit.updates)) {
                const rating = commit.updates[title];
                await conn.query(
                    "UPDATE imdb SET average_rating = ? WHERE title_id = ?",
                    [rating, title]
                );
            }

            await conn.commit();
            conn.release();

            commitLog.push(commit);
            synced++;
            log(`SYNCED tx=${commit.txId}`);
        } catch (err) {
            failed++;
            log(`SYNC FAILED tx=${commit.txId}: ${err.message}`);
        }
    }

    res.send({ ok: true, synced, failed });
});

// Get commit log for recovery
// This endpoint is called by recovering nodes to get missed transactions
app.get("/commit-log", (req, res) => {
    const { since } = req.query;
    const timestamp = since ? parseInt(since) : 0;
    
    const missedCommits = commitLog.filter(c => c.timestamp > timestamp);
    res.send({ ok: true, commits: missedCommits });
});


// Recover node
// This endpoint is called to signal the node to start recovering
app.post("/recover", async (req, res) => {
    isNodeFailed = false;
    log(`NODE RECOVERING...`);

    // Get last commit timestamp
    const lastCommit = commitLog.length > 0 
        ? commitLog[commitLog.length - 1].timestamp 
        : 0;

    // Sync from all other nodes
    let totalSynced = 0;
    for (const nodeUrl of NODE_URLS) {
        if (nodeUrl === getCurrentNodeUrl()) continue;

        try {
            const res = await fetch(`${nodeUrl}/commit-log?since=${lastCommit}`);
            const data = await res.json();

            if (data.ok && data.commits.length > 0) {
                // Apply each commit to the local node/db
                for (const commit of data.commits) {
                    try {
                        const conn = await pool.getConnection();
                        await conn.beginTransaction();

                        for (const title of Object.keys(commit.updates)) {
                            await conn.query(
                                "UPDATE imdb SET average_rating = ? WHERE title_id = ?",
                                [commit.updates[title], title]
                            );
                        }

                        await conn.commit();
                        conn.release();
                        commitLog.push(commit);
                        totalSynced++;
                        log(`RECOVERED tx=${commit.txId} from ${nodeUrl}`);
                    } catch (err) {
                        log(`RECOVERY FAILED tx=${commit.txId}: ${err.message}`);
                    }
                }
            }
        } catch (err) {
            log(`Failed to sync from ${nodeUrl}: ${err.message}`);
        }
    }

    log(`NODE RECOVERED - Synced ${totalSynced} transactions`);
    res.send({ ok: true, status: "up", synced: totalSynced });
});


// --------------------------------
// START SERVER
// --------------------------------

app.listen(PORT, () => {
    console.log(`Node ${NODE_ID} running at http://localhost:${PORT}`);
});
