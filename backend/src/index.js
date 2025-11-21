require("dotenv").config();
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// test backend route
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Backend running", time: new Date() });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
