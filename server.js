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

// Lock 
let lockTable = {}; 

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
// LOCKING HELPERS 
// --------------------------------

function canAcquireSharedLock(titleId, txId) {
    const entry = lockTable[titleId];
    if (!entry) return true; // no lock
    if (entry.mode === "S") return true; // multiple shared allowed
    if (entry.mode === "X" && entry.holder === txId) return true; // re-entrant
    return false;
}

function canAcquireExclusiveLock(titleId, txId) {
    const entry = lockTable[titleId];
    if (!entry) return true; // no lock
    if (entry.holder === txId) return true; // re-entrant upgrade
    return false; // Someone else holds a lock
}

function acquireSharedLock(titleId, txId) {
    if (!lockTable[titleId]) {
        lockTable[titleId] = { holder: txId, mode: "S", readers: new Set([txId]) };
    } else {
        lockTable[titleId].readers.add(txId);
    }
}

function acquireExclusiveLock(titleId, txId) {
    lockTable[titleId] = { holder: txId, mode: "X" };
}

function releaseLocks(txId) {
    for (const key of Object.keys(lockTable)) {
        const entry = lockTable[key];

        if (entry.mode === "X" && entry.holder === txId) {
            delete lockTable[key];
        }

        if (entry.mode === "S" && entry.readers.has(txId)) {
            entry.readers.delete(txId);
            if (entry.readers.size === 0) delete lockTable[key];
        }
    }
}


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
// READ (dirty-read if RU, shared/exclusive lock if serializable)
app.post("/tx/read", async (req, res) => {
    const { txId, title_id } = req.body;
    const tx = txs[txId];

    if (!tx) return res.status(400).send({ ok: false, error: "Unknown transaction" });

    try {
        let row = null;
        const conn = tx.conn;
        const iso = tx.isolation;
        const lockMode = config.lockMode;

        // --- DIRTY READ (RU) ---
        if (iso === "read_uncommitted") {
            await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
            const [rows] = await conn.query(
                "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
                [title_id]
            );
            row = rows[0] || null;
        }

        // --- SERIALIZABLE LOCK LOGIC ---
        else if (iso === "serializable") {

            // SHARED LOCK
            if (lockMode === "shared_lock") {
                const global = await requestGlobalLock(txId, title_id, "S");

                if (!global.ok) {
                    log(`WAITING-GLOBAL tx=${txId} for S-lock on ${title_id} (held by ${global.holder})`);
                    return res.status(423).send({ ok: false, waiting: true, holder: global.holder });
                }

                if (!canAcquireSharedLock(title_id, txId)) {
                    const holder = lockTable[title_id].holder;
                    log(`WAITING tx=${txId} for S-lock on ${title_id} (held by ${holder})`);
                    return res.status(423).send({ ok: false, waiting: true, holder });
                }

                acquireSharedLock(title_id, txId);
            }


            // EXCLUSIVE LOCK (for reads)
            else if (lockMode === "exclusive_lock") {
                const global = await requestGlobalLock(txId, title_id, "X");

                if (!global.ok) {
                    log(`WAITING-GLOBAL tx=${txId} for X-lock on ${title_id} (held by ${global.holder})`);
                    return res.status(423).send({ ok: false, waiting: true, holder: global.holder });
                }

                if (!canAcquireExclusiveLock(title_id, txId)) {
                    const holder = lockTable[title_id].holder;
                    log(`WAITING tx=${txId} for X-lock on ${title_id} (held by ${holder})`);
                    return res.status(423).send({ ok: false, waiting: true, holder });
                }

                acquireExclusiveLock(title_id, txId);
            }

            // NO LOCK MODE
            else {
                const [rows] = await conn.query(
                    "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
                    [title_id]
                );
                row = rows[0] || null;
            }
        }

        // --- NORMAL READ (RC/RR) ---
        else {
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
        // FIRST: request GLOBAL LOCK from Node 1
        if (tx.isolation === "serializable") {
            const global = await requestGlobalLock(txId, title_id, "X");

            if (!global.ok) {
                log(`WAITING-GLOBAL tx=${txId} for X-lock on ${title_id} (held by ${global.holder})`);
                return res.status(423).send({ ok: false, waiting: true, holder: global.holder });
            }
        }

       // SECOND: acquire LOCAL EXCLUSIVE LOCK
        if (!canAcquireExclusiveLock(title_id, txId)) {
            const holder = lockTable[title_id].holder;
            log(`WAITING tx=${txId} for X-lock on ${title_id} (held by ${holder})`);
            return res.status(423).send({ ok: false, waiting: true, holder });
        }
        
        acquireExclusiveLock(title_id, txId);


        // THEN lock the record in MySQL
        const [rows] = await conn.query(
            "SELECT average_rating FROM imdb WHERE title_id = ?",
            [title_id]
        );

        const oldRating = rows[0] ? rows[0].average_rating : null;

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

        await fetch(INTERNAL_URLS[0] + "/global-unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txId })
        });
        releaseLocks(txId);


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

    for (let i = 0; i < INTERNAL_URLS.length; i++) {
        if (i === currentNodeIndex) continue;

        const nodeUrl = INTERNAL_URLS[i];
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
    await fetch(INTERNAL_URLS[0] + "/global-unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txId })
    });
    releaseLocks(txId);

    delete txs[txId];
    res.send({ ok: true });
});


//GLOBAL LOCKING MECHANISM
let globalLockTable = {};

app.post("/global-lock", (req, res) => {
    const { txId, title_id, mode, nodeId } = req.body;

    const entry = globalLockTable[title_id];

    if (!entry) {
        globalLockTable[title_id] = { holder: txId, mode, node: nodeId };
        log(`GLOBAL-LOCK GRANTED tx=${txId} node=${nodeId} title=${title_id} mode=${mode}`);
        return res.send({ ok: true, granted: true });
    }

    if (entry.holder === txId) {
        return res.send({ ok: true, granted: true }); // reentrant
    }

    log(`GLOBAL-LOCK WAIT tx=${txId} node=${nodeId} title=${title_id} (held by ${entry.holder} on node ${entry.node})`);
    return res.send({ ok: false, wait: true, holder: entry.holder });
});

app.post("/global-unlock", (req, res) => {
    const { txId } = req.body;

    if (!txId) return res.status(400).send({ ok: false, error: "txId required" });

    let unlocked = 0;

    for (const key of Object.keys(globalLockTable)) {
        const entry = globalLockTable[key];

        if (entry.holder === txId) {
            delete globalLockTable[key];
            unlocked++;
        }
    }

    log(`GLOBAL-UNLOCK tx=${txId} released ${unlocked} lock(s)`);

    res.send({ ok: true, unlocked });
});


async function requestGlobalLock(txId, title_id, mode) {
    // Only Node 1 runs global lock manager.
    const globalManager = INTERNAL_URLS[0]; // Node 1 internal IP

    try {
        const res = await fetch(globalManager + "/global-lock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                txId,
                title_id,
                mode,
                nodeId: NODE_ID
            })
        });

        const data = await res.json();
        return data;

    } catch (err) {
        log(`GLOBAL-LOCK ERROR: ${err.message}`);
        return { ok: false, error: err.message };
    }
}



// --------------------------------
// START SERVER
// --------------------------------

app.listen(PORT, () => {
    console.log(`Node ${NODE_ID} running at http://ccscloud.dlsu.edu.ph:${PORT}`);
});
