require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");
const e = require("express");

const NODE_ID = process.env.NODE_ID || "1";
// Fix: Align default PORT with the hardcoded NODE_URLS (60148 + index)
const PORT = process.env.PORT || (60148 + parseInt(NODE_ID) - 1);

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

// --- Saving Committed Logs ---
const file = require("fs");
const COMMIT_LOG_FILE = `commit-log-node-${NODE_ID}.json`;
let commitLog = []; // for saving trasanctions that are already done
let isNodeFailed = false;

function loadingCommittedLog(){
    try {
        if (file.existsSync(COMMIT_LOG_FILE)){
            const curr_data = file.readFileSync(COMMIT_LOG_FILE, 'utf8');
            commitLog = JSON.parse(curr_data);
            console.log(`Loaded commits from ${COMMIT_LOG_FILE}`);
        }
    } catch (err){
        commitLog = [] // new array for saving if there is no file saved yet
    }
}

function saveCommitLog(){
    try {
        file.writeFileSync(COMMIT_LOG_FILE, JSON.stringify(commitLog, null, 2));
    } catch(err){
        console.error('Failed to save commit log:', err);

    }
}

loadingCommittedLog() // let this run as long as the server functions

const NODE_URLS = [
    "http://ccscloud.dlsu.edu.ph:60148",
    "http://ccscloud.dlsu.edu.ph:60149",
    "http://ccscloud.dlsu.edu.ph:60150"
];

const INTERNAL_URLS = [
    "http://10.2.14.48:80",
    "http://10.2.14.49:80",
    "http://10.2.14.50:80"
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

async function postSync(url, commits) {
    try {
        console.log(`[POSTSYNC] Sending ${commits.length} commit(s) to: ${url}/sync`);
        
        const res = await fetch(url + "/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commits })
        });

        console.log(`[POSTSYNC] Received response: ${res.status} ${res.statusText}`);

        // Try to read response body
        let data;
        try {
            data = await res.json();
            console.log(`[POSTSYNC] Response JSON:`, data);
        } catch (jsonErr) {
            console.warn(`[POSTSYNC] Failed to parse JSON response: ${jsonErr.message}`);
            data = await res.text();
            console.log(`[POSTSYNC] Response text:`, data);
        }

        if (!res.ok) {
            throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        }

        return data;
    } catch (err) {
        console.error(`[POSTSYNC] SYNC FAILED to ${url}:`, err);
        throw err;
    }
}

// --- Replication function ---
async function replicateTransaction(commitEntry) {
    const isCentral = NODE_ID === "1";

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
                    const url = INTERNAL_URLS[1]; // Node 2
                    nodeUpdates[url] = nodeUpdates[url] || {};
                    nodeUpdates[url][title] = rating;
                } else  { // assume drama
                    const url = INTERNAL_URLS[2]; // Node 3
                    nodeUpdates[url] = nodeUpdates[url] || {};
                    nodeUpdates[url][title] = rating;
                } 
            }

            console.log(nodeUpdates) // contains info about the url of the node and the value to be updated

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
        const centralUrl = INTERNAL_URLS[0];
        try {
            await postSync(centralUrl, [commitEntry]);
        } catch (err) {
            log(`REPLICATION (fragment->central) FAILED tx=${commitEntry.txId}: ${err.message}`);
        }
    }
}

app.post("/sync", async (req, res) => {
    const { commits } = req.body;
    if (!Array.isArray(commits)) return res.status(400).send({ ok: false, error: "Invalid commits" });

    try {
        for (const entry of commits) {
            const conn = await pool.getConnection();
            await conn.beginTransaction();

            for (const [title, rating] of Object.entries(entry.updates)) {
                await conn.query(
                    "UPDATE imdb SET average_rating = ? WHERE title_id = ?",
                    [rating, title]
                );
            }

            await conn.commit();
            conn.release();

            commitLog.push(entry);
            log(`REPLICATED tx=${entry.txId} from ${entry.sourceNode}`);
        }

        saveCommitLog();
        res.send({ ok: true });
    } catch (err) {
        res.status(500).send({ ok: false, error: err.message });
    }
});


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
// TRANSACTION API (REAL MYSQL TX)
// --------------------------------

// BEGIN TRANSACTION (allocate connection, set isolation, start TX)
app.post("/tx/begin", async (req, res) => {
    const { txId, isolation } = req.body;

    if (!txId) return res.status(400).send({ ok: false, error: "txId required" });
    if (txs[txId]) return res.status(400).send({ ok: false, error: "Transaction already exists" });

    try {
        const conn = await pool.getConnection();

        const isoLevel = {
            read_uncommitted: "READ UNCOMMITTED",
            read_committed: "READ COMMITTED",
            repeatable_read: "REPEATABLE READ",
            serializable: "SERIALIZABLE"
        }[isolation || config.isolation];

        await conn.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isoLevel}`);
        await conn.beginTransaction();

        txs[txId] = {
            txId,
            conn,
            isolation: isolation || config.isolation,
            buffered: {},
            startTime: Date.now(),
            status: "active"
        };

        log(`BEGIN tx=${txId} iso=${isolation || config.isolation}`);
        res.send({ ok: true });

    } catch (err) {
        log(`BEGIN_FAIL tx=${txId} err=${err.message}`);
        res.status(500).send({ ok: false, error: err.message });
    }
});


// READ (dirty-read if RU, snapshot read otherwise)
app.post("/tx/read", async (req, res) => {
    const { txId, title_id } = req.body;
    const tx = txs[txId];

    if (!tx) return res.status(400).send({ ok: false, error: "Unknown transaction" });

    try {
        let row = null;
        const conn = tx.conn;

        // Dirty Read Mode
        if (tx.isolation === "read_uncommitted") {
            await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");

            const [rows] = await conn.query(
                "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
                [title_id]
            );
            row = rows[0] || null;

        } else {
            // Normal MVCC consistent read
            const [rows] = await conn.query(
                "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
                [title_id]
            );
            row = rows[0] || null;
        }

        const rating = row ? row.average_rating : "null";
        log(`READ tx=${txId} title=${title_id} rating=${rating}`);

        res.send({ ok: true, row });

    } catch (err) {
        log(`READ_FAIL tx=${txId} title=${title_id} err=${err.message}`);
        try { await tx.conn.rollback(); tx.conn.release(); } catch {}
        delete txs[txId];
        res.status(500).send({ ok: false, error: err.message });
    }
});


// UPDATE (strict 2PL: SELECT ... FOR UPDATE)
app.post("/tx/update", async (req, res) => {
    const { txId, title_id, new_rating } = req.body;
    const tx = txs[txId];

    if (!tx) return res.status(400).send({ ok: false, error: "Unknown tx" });

    const conn = tx.conn;

    try {
        // Lock row with X-lock
        const [rows] = await conn.query(
            "SELECT average_rating FROM imdb WHERE title_id = ? LIMIT 1 FOR UPDATE",
            [title_id]
        );
        const oldRating = rows[0] ? rows[0].average_rating : null;

        // Buffer write (for replication grouping)
        tx.buffered[title_id] = Number(new_rating);

        log(`WRITE-BUFFERED tx=${txId} title=${title_id} old=${oldRating} new=${new_rating}`);

        res.send({ ok: true });

    } catch (err) {
        log(`UPDATE_FAIL tx=${txId} err=${err.message}`);
        try { await conn.rollback(); conn.release(); } catch {}
        delete txs[txId];
        res.status(500).send({ ok: false, error: err.message });
    }
});


// COMMIT
app.post("/tx/commit", async (req, res) => {
    const { txId } = req.body;
    const tx = txs[txId];

    if (!tx) return res.status(400).send({ ok: false, error: "Unknown tx" });
    if (isNodeFailed)
        return res.status(500).send({ ok: false, error: "Node is failed." });

    const conn = tx.conn;

    try {
        for (const [title, rating] of Object.entries(tx.buffered)) {
            await conn.query(
                "UPDATE imdb SET average_rating = ? WHERE title_id = ?",
                [rating, title]
            );
        }

        await conn.commit();
        conn.release();

        const commitEntry = {
            txId,
            timestamp: Date.now(),
            updates: tx.buffered,
            sourceNode: getCurrentNodeUrl()
        };

        commitLog.push(commitEntry);
        saveCommitLog();
        log(`COMMIT tx=${txId}`);

        await replicateTransaction(commitEntry);

        delete txs[txId];
        res.send({ ok: true });

    } catch (err) {
        log(`COMMIT_FAIL tx=${txId} err=${err.message}`);
        try { await conn.rollback(); conn.release(); } catch {}
        delete txs[txId];
        res.status(500).send({ ok: false, error: err.message });
    }
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
    const currentNodeIndex = parseInt(NODE_ID) - 1;

    for (let i = 0; i < NODE_URLS.length; i++) {
        if (i === currentNodeIndex) continue;

        const nodeUrl = NODE_URLS[i];
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




// ABORT
app.post("/tx/abort", async (req, res) => {
    const { txId } = req.body;
    const tx = txs[txId];

    if (tx && tx.conn) {
        try {
            await tx.conn.rollback();
            tx.conn.release();
        } catch {}
    }

    log(`ABORT tx=${txId}`);
    delete txs[txId];
    res.send({ ok: true });
});


// --------------------------------
// START SERVER
// --------------------------------

app.listen(PORT, () => {
    console.log(`Node ${NODE_ID} running at http://ccscloud.dlsu.edu.ph:${PORT}`);
});
