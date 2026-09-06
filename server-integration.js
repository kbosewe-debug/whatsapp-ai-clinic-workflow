// Add near the top of server.js:
const path = require("path");

// Add after app.use(express.json()):
app.use(express.static(path.join(__dirname, "public")));

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
