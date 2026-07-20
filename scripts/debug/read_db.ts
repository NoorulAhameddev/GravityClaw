import Database from "better-sqlite3";
const db = new Database("gravity.db");

const rows = db.prepare("SELECT * FROM memory ORDER BY timestamp DESC LIMIT 20").all();
console.log(JSON.stringify(rows, null, 2));
