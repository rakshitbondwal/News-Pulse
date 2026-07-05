const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { exec } = require("child_process");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());

const cors = require("cors");
app.use(cors());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

let db;
const jobs = {};

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db("newspulse");
  console.log("Connected to MongoDB");
}

app.get("/clusters", async (req, res) => {
  try {
    const clusters = await db.collection("clusters").find({}).toArray();
    const shaped = clusters.map(c => ({
      id: c._id,
      label: c.label,
      article_count: c.article_count,
      start_time: c.start_time,
      end_time: c.end_time,
    }));
    res.json(shaped);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch clusters" });
  }
});

app.get("/clusters/:id", async (req, res) => {
  try {
    const cluster = await db.collection("clusters").findOne({ _id: new ObjectId(req.params.id) });
    if (!cluster) return res.status(404).json({ error: "Cluster not found" });

    const articles = await db.collection("articles")
      .find({ _id: { $in: cluster.article_ids } })
      .sort({ published_at: 1 })
      .toArray();

    res.json({
      id: cluster._id,
      label: cluster.label,
      article_count: cluster.article_count,
      start_time: cluster.start_time,
      end_time: cluster.end_time,
      articles: articles.map(a => ({
        id: a._id,
        title: a.title,
        source: a.source,
        url: a.url,
        published_at: a.published_at,
        summary: a.summary,
      })),
    });
  } catch (err) {
    res.status(400).json({ error: "Invalid cluster ID" });
  }
});

app.get("/timeline", async (req, res) => {
  try {
    const clusters = await db.collection("clusters").find({}).toArray();
    const timeline = clusters.map(c => ({
      id: c._id,
      label: c.label,
      start: c.start_time,
      end: c.end_time,
      count: c.article_count,
      intensity: c.article_count,
    }));
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: "Failed to build timeline" });
  }
});

app.post("/ingest/trigger", (req, res) => {
  const jobId = Date.now().toString();
  jobs[jobId] = { status: "running" };

  const scraperPath = path.join(__dirname, "..", "scraper");

  exec(
    `cd /d "${scraperPath}" && venv\\Scripts\\python.exe scraper.py && venv\\Scripts\\python.exe cluster.py`,
    { shell: "cmd.exe" },
    (error, stdout, stderr) => {
      if (error) {
        jobs[jobId] = { status: "failed", error: error.message };
        console.error(stderr);
        return;
      }
      jobs[jobId] = { status: "completed" };
      console.log(stdout);
    }
  );

  res.json({ jobId });
});

app.get("/ingest/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
