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
    pool = mysql.createPool({
        host: process.env.DB_HOST || "127.0.0.1",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASS || "",
        database: process.env.DB_NAME || "node_1",
        waitForConnections: true,
        connectionLimit: 10,
    });
})();

// --- Transaction state ---
let txs = {}; 
let config = {
    isolation: "read_committed",
    lockMode: "strict_2pl"
};

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
        buffered: {}
    };

    log(`BEGIN tx=${txId} iso=${txs[txId].isolation}`);

    res.send({ ok: true });
});

// READ
app.post("/tx/read", async (req, res) => {
    const { txId, title_id } = req.body;

    try {
        const [rows] = await pool.query(
            "SELECT * FROM imdb WHERE title_id = ? LIMIT 1",
            [title_id]
        );

        log(`READ tx=${txId} title=${title_id}`);

        res.send({ ok: true, row: rows[0] || null });
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

        log(`COMMIT tx=${txId}`);

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

// --------------------------------
// START SERVER
// --------------------------------

app.listen(PORT, () => {
    console.log(`Node ${NODE_ID} running at http://localhost:${PORT}`);
});
