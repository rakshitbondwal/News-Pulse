"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList
} from "recharts";
import {
  getClusters, getClusterDetail, getTimeline, triggerIngest, getIngestStatus
} from "../lib/api";

const SOURCES = ["BBC", "NPR", "Al Jazeera"];
const COLORS = ["#FFB000", "#5EC8C0", "#E8846B", "#8FA6C4", "#C9A0E8", "#7FBF7F", "#F2C879", "#D98BA8"];

const FONT_DISPLAY = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
const FONT_MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace";
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const BG = "#0B0E11";
const PANEL = "#14181D";
const BORDER = "#242A31";
const TEXT = "#E8E6E0";
const MUTED = "#7C838C";
const ACCENT = "#FFB000";

function timeAgo(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Home() {
  const [clusters, setClusters] = useState([]);
  const [clusterSources, setClusterSources] = useState({});
  const [selectedSources, setSelectedSources] = useState(SOURCES);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const timeline = await getTimeline();
    setClusters(timeline);

    const detailPromises = timeline.map(c => getClusterDetail(c.id));
    const details = await Promise.all(detailPromises);
    const sourceMap = {};
    details.forEach(d => {
      sourceMap[d.id] = [...new Set(d.articles.map(a => a.source))];
    });
    setClusterSources(sourceMap);
    setLoading(false);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSource = (src) => {
    setSelectedSources(prev =>
      prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]
    );
  };

  const visibleClusters = clusters.filter(c => {
    const srcs = clusterSources[c.id] || [];
    return srcs.some(s => selectedSources.includes(s));
  });

  const sortedByStart = [...visibleClusters].sort((a, b) => new Date(a.start) - new Date(b.start));

  const minTime = sortedByStart.length
    ? Math.min(...sortedByStart.map(c => new Date(c.start).getTime()))
    : 0;
  const maxTime = sortedByStart.length
    ? Math.max(...sortedByStart.map(c => new Date(c.end).getTime()))
    : 0;
  const totalSpan = Math.max(maxTime - minTime, 1000 * 60 * 60);
  const minBarWidth = totalSpan * 0.035;

  const chartData = sortedByStart.map((c, i) => {
    const start = new Date(c.start).getTime();
    const end = new Date(c.end).getTime();
    const rawDuration = end - start;
    return {
      label: c.label,
      id: c.id,
      wireCode: `WIRE-${String(i + 1).padStart(2, "0")}`,
      offset: start - minTime,
      duration: Math.max(rawDuration, minBarWidth),
      hours: (rawDuration / 3600000).toFixed(1),
      count: c.count,
      colorIdx: i % COLORS.length,
    };
  });

  const topStories = [...visibleClusters].sort((a, b) => b.count - a.count).slice(0, 6);

  const openClusterById = async (clusterId) => {
    if (!clusterId) return;
    const detail = await getClusterDetail(clusterId);
    setSelectedCluster(detail);
  };

  const handleBarClick = (data) => {
    const id = data?.id || data?.payload?.id;
    openClusterById(id);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("DISPATCHING SCRAPE + CLUSTER JOB...");
    const { jobId } = await triggerIngest();

    const poll = setInterval(async () => {
      const status = await getIngestStatus(jobId);
      if (status.status === "completed") {
        clearInterval(poll);
        setRefreshMsg("RECEIVED. UPDATING WIRE...");
        await loadData();
        setRefreshing(false);
        setRefreshMsg("");
      } else if (status.status === "failed") {
        clearInterval(poll);
        setRefreshMsg("TRANSMISSION FAILED: " + status.error);
        setRefreshing(false);
      }
    }, 3000);
  };

  const pillStyle = (active) => ({
    padding: "0.4rem 1rem",
    borderRadius: 3,
    border: active ? `1px solid ${ACCENT}` : `1px solid ${BORDER}`,
    background: active ? "rgba(255,176,0,0.08)" : "transparent",
    color: active ? ACCENT : MUTED,
    cursor: "pointer",
    fontSize: "0.75rem",
    fontFamily: FONT_MONO,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    transition: "all 0.15s ease",
  });

  const CustomBarLabel = (props) => {
    const { x, y, width, height, index } = props;
    const item = chartData[index];
    if (!item) return null;
    return (
      <text x={x + width + 8} y={y + height / 2} fill={MUTED} fontFamily={FONT_MONO} fontSize={11} dominantBaseline="middle">
        {item.count} art.
      </text>
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload.find(p => p.dataKey === "duration");
    if (!item) return null;
    const d = item.payload;
    return (
      <div style={{ background: "#0B0E11", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "0.6rem 0.8rem", fontFamily: FONT_MONO, fontSize: "0.75rem" }}>
        <div style={{ color: TEXT, marginBottom: "0.3rem" }}>{d.label}</div>
        <div style={{ color: MUTED }}>{d.hours} hrs active · {d.count} articles</div>
        <div style={{ color: ACCENT, marginTop: "0.3rem" }}>Click to view articles →</div>
      </div>
    );
  };

  return (
    <main style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: FONT_SANS }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "2.5rem 2rem" }}>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          borderBottom: `1px solid ${BORDER}`, paddingBottom: "1rem", marginBottom: "0.5rem"
        }}>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: ACCENT, letterSpacing: "0.15em", marginBottom: "0.3rem" }}>
              LIVE TOPIC WIRE
            </div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: "2.4rem", fontWeight: 400, margin: 0, letterSpacing: "0.01em" }}>
              News Pulse
            </h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: "0.6rem 1.2rem",
              background: refreshing ? "transparent" : ACCENT,
              color: refreshing ? MUTED : "#0B0E11",
              border: refreshing ? `1px solid ${BORDER}` : "none",
              borderRadius: 3,
              cursor: refreshing ? "not-allowed" : "pointer",
              fontFamily: FONT_MONO,
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {refreshing ? "Refreshing" : "Refresh Data"}
          </button>
        </div>

        <div style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: MUTED, marginBottom: "1.5rem" }}>
          {lastUpdated ? `LAST UPDATE ${lastUpdated.toLocaleTimeString()}` : "LOADING..."}
          {refreshMsg && <span style={{ color: ACCENT, marginLeft: "1rem" }}>{refreshMsg}</span>}
        </div>

        <div style={{ marginBottom: "2rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {SOURCES.map(src => (
            <button key={src} onClick={() => toggleSource(src)} style={pillStyle(selectedSources.includes(src))}>
              {src}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>

          <div style={{ flex: "1 1 65%", minWidth: 0 }}>
            {loading ? (
              <p style={{ fontFamily: FONT_MONO, color: MUTED, fontSize: "0.85rem" }}>LOADING TIMELINE...</p>
            ) : (
              <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1.5rem" }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: MUTED, marginBottom: "0.8rem", letterSpacing: "0.05em" }}>
                  ACTIVE WINDOW PER TOPIC — BAR LENGTH = TIME SPAN, LABEL = ARTICLE COUNT
                </div>
                <ResponsiveContainer width="100%" height={Math.max(chartData.length * 56, 200)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 60 }} barCategoryGap={18}>
                    <CartesianGrid horizontal={false} stroke={BORDER} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      domain={[0, "dataMax"]}
                      tickFormatter={(val) => {
                        const date = new Date(minTime + val);
                        return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                      }}
                      tick={{ fontSize: 10, fill: MUTED, fontFamily: FONT_MONO }}
                      axisLine={{ stroke: BORDER }}
                      tickLine={{ stroke: BORDER }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={190}
                      tick={{ fontSize: 12, fill: TEXT, fontFamily: FONT_SANS }}
                      axisLine={{ stroke: BORDER }}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="offset" stackId="a" fill="transparent" />
                    <Bar dataKey="duration" stackId="a" radius={[2, 2, 2, 2]} onClick={handleBarClick} cursor="pointer">
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={COLORS[entry.colorIdx]} />
                      ))}
                      <LabelList content={CustomBarLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {selectedCluster && (
              <div style={{ marginTop: "1.5rem", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.3rem" }}>
                  <div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: ACCENT, letterSpacing: "0.1em", marginBottom: "0.3rem" }}>
                      DISPATCH DETAIL
                    </div>
                    <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "1.5rem", fontWeight: 400, margin: 0 }}>
                      {selectedCluster.label}
                    </h2>
                  </div>
                  <button onClick={() => setSelectedCluster(null)} style={{ background: "none", border: "none", color: MUTED, fontSize: "1rem", cursor: "pointer", fontFamily: FONT_MONO }}>
                    CLOSE ✕
                  </button>
                </div>
                <p style={{ fontFamily: FONT_MONO, color: MUTED, fontSize: "0.75rem", marginBottom: "1.2rem" }}>
                  {selectedCluster.article_count} ARTICLES
                </p>
                {selectedCluster.articles
                  .filter(a => selectedSources.includes(a.source))
                  .map(a => (
                    <div key={a.id} style={{ padding: "0.9rem 0", borderTop: `1px solid ${BORDER}` }}>
                      <a href={a.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: TEXT, textDecoration: "none", fontSize: "0.95rem" }}>
                        {a.title}
                      </a>
                      <div style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: MUTED, marginTop: "0.4rem", letterSpacing: "0.03em" }}>
                        {a.source.toUpperCase()} · {new Date(a.published_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={{ flex: "1 1 35%", minWidth: 260 }}>
            <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1.2rem" }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: ACCENT, letterSpacing: "0.15em", marginBottom: "1rem" }}>
                TOP STORIES
              </div>
              {topStories.map((c, i) => (
                <div
                  key={c.id}
                  onClick={() => openClusterById(c.id)}
                  style={{ padding: "0.8rem 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: MUTED }}>#{i + 1}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: "0.7rem", color: ACCENT }}>{c.count} art.</span>
                  </div>
                  <div style={{ fontFamily: FONT_SANS, fontSize: "0.9rem", color: TEXT, marginTop: "0.3rem", lineHeight: 1.3 }}>
                    {c.label}
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: "0.68rem", color: MUTED, marginTop: "0.3rem" }}>
                    updated {timeAgo(c.end)}
                  </div>
                </div>
              ))}
              {topStories.length === 0 && (
                <div style={{ fontFamily: FONT_MONO, fontSize: "0.75rem", color: MUTED }}>No stories match current filters.</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
