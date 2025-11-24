const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const NODE_ID = process.env.NODE_ID || "1";
const PORT = process.env.PORT || (3000 + parseInt(NODE_ID));

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

app.set("view engine", "ejs");

// In-memory logs for this node
let txLogs = [];

// ROUTES --------------------------------

app.get("/", (req, res) => {
    res.render("index", { nodeId: NODE_ID });
});

app.get("/monitor", (req, res) => {
    res.render("monitor", { nodeId: NODE_ID });
});

// Add a log entry
app.post("/log", (req, res) => {
    const entry = {
        node: NODE_ID,
        time: new Date().toISOString(),
        action: req.body.action,
    };
    txLogs.push(entry);
    console.log(`[Node ${NODE_ID}]`, entry);
    res.send({ ok: true });
});

// Get logs
app.get("/logs", (req, res) => {
    res.send(txLogs);
});

app.listen(PORT, () => {
    console.log(`Node ${NODE_ID} running at http://localhost:${PORT}`);
});
