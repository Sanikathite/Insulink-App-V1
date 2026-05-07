const moment = require('moment');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const errorMiddleware = require('./middlewares/error.middleware');

console.clear();
console.log(`==================== New Logs From ${moment(new Date()).format("DD-MM-YYYY hh:mm:ss A")} =====================`);

// require("dotenv").config({ path: __dirname + "/.env" });
// require("dotenv").config();

const app = express();
const { currentVersionNo } = require('./config/version.config');

const PORT = process.env.PORT || 3000;
const IP = 'localhost';
const PROTOCOL = 'http';

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH' ,'OPTIONS'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------- APP ROUTES / MIDDLEWARES -------------------
require("./app-config/middlewares")(app);
require("./app-config/routes")(app);  
require("./app-config/database")();


app.use(errorMiddleware);
// ------------------- SERVER -------------------
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PROTOCOL}://${IP}:${PORT} 🚀.`);

  // ------------------- AUTO-ESCALATION CRON JOB -------------------
  // cron.schedule("*/5 * * * *", async () => {
  //   try {
  //     console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] Running auto-escalation job...`);
  //     await autoEscalateTickets();
  //     console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] Auto-escalation job completed.`);
  //   } catch (err) {
  //     console.error("Error in auto-escalation job:", err);
  //   }
  // });
});
app.use('/file', express.static('file'));
// ------------------- SOCKET.IO -------------------
const io = require("socket.io")(server, { cors: { origin: "*" } });
app.set("socketio", io);

io.on("connection", (socket) => {
  console.log("🔌 Client connected");
  socket.on("disconnect", () => console.log("❌ Client disconnected"));
});

// ------------------- DB BACKUP (OPTIONAL) -------------------
// const { runBackupAndCleanup } = require('./helpers/dbBackupTool');
// const { HOST, DB, USER, PASSWORD } = require('./config/db.config');
// runBackupAndCleanup({ /* ... */ });

// ------------------- DEFAULT ROUTE -------------------
app.get("/", (req, res) => {
  res.json({ message: `Welcome to BRiOT application server version -> ${currentVersionNo}` });
});