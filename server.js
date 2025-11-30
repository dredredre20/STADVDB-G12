require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");

const NODE_ID = process.env.NODE_ID || "1";
const PORT = process.env.PORT || (3000 + parseInt(NODE_ID, 10));

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

// --- MySQL connection pool ---
let pool;

(async () => {
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 20,
            queueLimit: 0
        });

        const conn = await pool.getConnection();
        console.log(`✓ MySQL connected successfully on Node ${NODE_ID}`);
        conn.release();

    } catch (err) {
        console.error("✗ MySQL connection FAILED:", err.message);
        process.exit(1);
    }
})();

// --- Transaction registry ---
let txs = {}; // txId -> { conn, isolation, startTime, status }

// Defaults
let config = {
    isolation: "read_committed",
    lockMode: "strict_2pl"
};

// Convert isolation name to SQL value
function isoToSql(iso) {
    switch ((iso || "").toLowerCase()) {
        case "read_uncommitted": return "READ UNCOMMITTED";
        case "read_committed": return "READ COMMITTED";
        case "repeatable_read": return "REPEATABLE READ";
        case "serializable": return "SERIALIZABLE";
        default: return "READ COMMITTED";
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

// Logs for monitoring
app.get("/logs", (req, res) => {
    res.send(txLogs);
});

// Update config
app.post("/config", (req, res) => {
    config.isolation = req.body.isolation || config.isolation;
    config.lockMode = req.body.lockMode || config.lockMode;
    log(`CONFIG iso=${config.isolation} lockMode=${config.lockMode}`);
    res.send({ ok: true, config });
});

// Active transactions
app.get("/active", (req, res) => {
    const active = Object.values(txs).map(t => ({
        txId: t.txId,
        node: NODE_ID,
        startTime: t.startTime,
        isolation: t.isolation
    }));
    res.send({ ok: true, active });
});

// --------------------------------
// TRANSACTION API 
// --------------------------------

// BEGIN TRANSACTION
app.post("/tx/begin", async (req, res) => {
    const { txId, isolation } = req.body;
    if (!txId) return res.status(400).send({ ok: false, error: "txId required" });
    if (txs[txId]) return res.status(400).send({ ok: false, error: "Tx already exists" });

    try {
        const conn = await pool.getConnection();
        await conn.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isoToSql(isolation || config.isolation)}`);
        await conn.beginTransaction();

        txs[txId] = {
            txId,
            conn,
            isolation: isolation || config.isolation,
            startTime: Date.now(),
            status: "active"
        };

        log(`BEGIN tx=${txId} iso=${isolation || config.isolation}`);
        res.send({ ok: true });

    } catch (err) {
        log(`BEGIN_FAIL tx=${txId} error=${err.message}`);
        res.status(500).send({ ok: false, error: err.message });
    }
});

// READ inside transaction if exists, otherwise autocommit
// READ inside transaction if exists, otherwise autocommit
app.post("/tx/read", async (req, res) => {
    const { txId, title_id } = req.body;
    if (!title_id)
        return res.status(400).send({ ok: false, error: "title_id required" });

    try {
        let row = null;
        let tx = txs[txId];

        if (tx && tx.conn) {
            const conn = tx.conn;

            if (tx.isolation === "read_uncommitted") {
                // ⭐ ENABLE TRUE DIRTY READ (no MVCC snapshot)
                await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");

                const [rows] = await conn.query(
                    "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
                    [title_id]
                );
                row = rows[0] || null;
            } 
            else {
                // Normal MVCC consistent read
                const [rows] = await conn.query(
                    "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
                    [title_id]
                );
                row = rows[0] || null;
            }
        }
        else {
            // Autocommit read outside transaction
            const [rows] = await pool.query(
                "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
                [title_id]
            );
            row = rows[0] || null;
        }

        const rating = row ? row.average_rating : "null";
        log(`READ tx=${txId || "NO_TX"} title=${title_id} rating=${rating}`);

        res.send({ ok: true, row });

    } catch (err) {
        log(`READ_FAIL tx=${txId} title=${title_id} error=${err.message}`);
        res.status(500).send({ ok: false, error: err.message });
    }
});


// UPDATE using SELECT FOR UPDATE + UPDATE
app.post("/tx/update", async (req, res) => {
    const { txId, title_id, new_rating } = req.body;

    if (!txId) return res.status(400).send({ ok: false, error: "txId required" });
    if (!txs[txId]) return res.status(400).send({ ok: false, error: "Unknown tx" });
    if (!title_id) return res.status(400).send({ ok: false, error: "title_id required" });

    const conn = txs[txId].conn;

    try {
        // Lock row
        const [rows] = await conn.query(
            "SELECT average_rating FROM imdb WHERE title_id = ? LIMIT 1 FOR UPDATE",
            [title_id]
        );
        const oldRating = rows[0] ? rows[0].average_rating : null;

        // Apply update inside transaction
        await conn.query(
            "UPDATE imdb SET average_rating = ? WHERE title_id = ?",
            [Number(new_rating), title_id]
        );

        log(`WRITE tx=${txId} title=${title_id} old=${oldRating} new=${new_rating}`);

        res.send({ ok: true, old: oldRating, new: Number(new_rating) });

    } catch (err) {
        log(`UPDATE_FAIL tx=${txId} title=${title_id} error=${err.message}`);

        try { await conn.rollback(); } catch (e) {}
        try { conn.release(); } catch (e) {}
        delete txs[txId];

        res.status(500).send({ ok: false, error: err.message });
    }
});

// COMMIT transaction
app.post("/tx/commit", async (req, res) => {
    const { txId } = req.body;

    if (!txId) return res.status(400).send({ ok: false, error: "txId required" });
    const tx = txs[txId];
    if (!tx) return res.status(400).send({ ok: false, error: "Unknown tx" });

    const conn = tx.conn;

    try {
        await conn.commit();
        conn.release();

        log(`COMMIT tx=${txId}`);

        delete txs[txId];
        res.send({ ok: true });

    } catch (err) {
        log(`COMMIT_FAIL tx=${txId} error=${err.message}`);

        try { await conn.rollback(); } catch (e) {}
        try { conn.release(); } catch (e) {}
        delete txs[txId];

        res.status(500).send({ ok: false, error: err.message });
    }
});

// ABORT / ROLLBACK
app.post("/tx/abort", async (req, res) => {
    const { txId } = req.body;

    if (!txId) return res.status(400).send({ ok: false, error: "txId required" });
    const tx = txs[txId];
    if (!tx) return res.status(400).send({ ok: false, error: "Unknown tx" });

    const conn = tx.conn;

    try {
        await conn.rollback();
        conn.release();
    } catch (err) {}

    log(`ABORT tx=${txId}`);
    delete txs[txId];

    res.send({ ok: true });
});

// --------------------------------
// START SERVER
// --------------------------------
app.listen(PORT, () => {
    console.log(`Node ${NODE_ID} running at http://localhost:${PORT}`);
});
