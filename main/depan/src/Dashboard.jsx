import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import LineModal from "./LineModal.jsx";
import "./Dashboard.css";

const API_BASE_URL = "http://localhost:3000";
const API_KEY = "your-api-key-here"; // must match process.env.API_KEY on server.js

/*
 * server.js only tracks 3 real lines total (ABB4, ABB1, ABB7) with NO
 * site/location concept at all — "Port Klang" / "Sendayan" don't exist
 * on the backend. Per your instruction, lines are split client-side:
 * Port Klang -> ABB1, ABB4   |   Sendayan -> ABB7
 * If you add a real `site` field to ProductionLine later, replace this
 * mapping with data from the server instead.
 */
const SITE_LINE_MAP = {
  klang: ["ABB1", "ABB4"],
  sendayan: ["ABB7"],
};
const ALL_LINE_IDS = [...SITE_LINE_MAP.klang, ...SITE_LINE_MAP.sendayan];

// Still mock — no historical/weekly endpoint exists on server.js yet.
const SITES = [
  { key: "klang", name: "Port Klang", todayOutput: 228, oee: 67, barWidth: 67, actual: "19k", target: "28.5k", actualPct: 67 },
  { key: "sendayan", name: "Sendayan", todayOutput: 342, oee: 58, barWidth: 58, actual: "14k", target: "24k", actualPct: 58 },
];
const WEEKLY = [
  { day: "MON", oee: 60, prod: 55 },
  { day: "TUE", oee: 45, prod: 48 },
  { day: "WED", oee: 78, prod: 80 },
  { day: "THU", oee: 32, prod: 30 },
  { day: "FRI", oee: 40, prod: 38 },
];

// Maps server.js `mode` values to this UI's status vocabulary.
function toCardStatus(mode) {
  if (mode === "running") return "running";
  if (mode === "idle" || mode === "delay") return "delay";
  return "offline"; // covers 'offline', 'down', null, undefined
}

// Builds the shape MachineCard expects from a raw ProductionLine object.
function toMachineCardData(line) {
  if (!line) return null;
  const status = toCardStatus(line.mode);
  const hasCount = line.product_count != null && line.session_id;
  return {
    name: line.line_id,
    status,
    oee: line.oee != null ? `${line.oee}%` : "N/A",
    // No "target" field exists on ProductionLine yet — left as N/A until
    // the backend adds one (e.g. a per-shift target count).
    progress: null,
    target: "N/A",
    current: hasCount ? line.product_count : "N/A",
  };
}

function useLiveClock() {
  const [time, setTime] = useState("00:00:00");

  useEffect(() => {
    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      setTime(`${h}:${m}:${s}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

function MachineCard({ machine, onClick }) {
  const hasProgress = machine.progress !== null && machine.progress !== undefined;
  const progressWidth = hasProgress ? `${machine.progress}%` : "0%";
  const initial = machine.name.replace("ABB", "A");

  return (
    <div className={`machine-card ${machine.status}`} onClick={onClick} style={{ cursor: "pointer" }}>
      <div className="mc-top">
        <div className="mc-pulse-wrap">
          <div className="mc-pulse-bg">{initial}</div>
          <div className="pulse-ring"></div>
        </div>
        <div className="mc-identity">
          <div className="mc-name">{machine.name}</div>
          <div className="mc-status-row">
            <div className="mc-status-dot"></div>
            <div className="mc-status-text">
              {machine.status.charAt(0).toUpperCase() + machine.status.slice(1)}
            </div>
          </div>
        </div>
        <div className="mc-oee">
          <div className="oee-val">{machine.oee}</div>
          <div className="oee-label">OEE</div>
        </div>
      </div>
      <div className="mc-progress">
        <div className="prog-header">
          <div className="prog-label">Progress</div>
          <div className="prog-val">{hasProgress ? `${machine.progress}%` : "N/A"}</div>
        </div>
        <div className="prog-bar-bg">
          <div className="prog-bar-fill" style={{ width: progressWidth }}></div>
        </div>
      </div>
      <div className="mc-footer">
        <div className="mc-footer-item">
          <span>Target </span>
          <strong>{machine.target}</strong>
        </div>
        <div className="mc-footer-item">
          <span>Current </span>
          <strong>{machine.current === "N/A" ? "N/A" : `${machine.current} / ${machine.target}`}</strong>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const liveClock = useLiveClock();
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [lines, setLines] = useState({});
  const [selectedLineId, setSelectedLineId] = useState(null);

  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ["websocket"] });

    socket.on("line:update", ({ line_id, line }) => {
      setLines((prev) => ({ ...prev, [line_id]: line }));
    });

    ALL_LINE_IDS.forEach((id) => {
      socket.emit("join-line", id);

      fetch(`${API_BASE_URL}/line/${id}`, { headers: { "x-api-key": API_KEY } })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setLines((prev) => ({ ...prev, [id]: data.line }));
        })
        .catch(() => {
          /* backend not reachable — card shows N/A defaults */
        });
    });

    return () => socket.disconnect();
  }, []);

  const selectedLine = selectedLineId ? lines[selectedLineId] : null;

  return (
    <div className="dash">
      {/* SIDEBAR */}
      <div className="sidebar">
        <button
          type="button"
          className="hamburger-btn"
          aria-label="Toggle user panel"
          onClick={() => setLeftPanelOpen((prev) => !prev)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className="logo-mark">G</div>
        <div className="nav-icon active">MS</div>
        <div className="nav-icon">A</div>
        <div className="nav-icon">H</div>
        <div className="sidebar-spacer"></div>
        <div className="sb-avatar">L</div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        <div className="body-grid">
          {/* LEFT PANEL */}
          <div className={`left-panel ${leftPanelOpen ? "open" : "closed"}`}>
            {/* PROFILE */}
            <div className="profile-row">
              <div className="profile-avatar">H</div>
              <div className="profile-info">
                <div className="profile-name">Haffizol</div>
                <div className="profile-role">Executive</div>
                <div className="profile-id">5000-067</div>
              </div>
              <div className="profile-status"></div>
            </div>

            {/* ACTIVE SITES */}
            <div className="section-label" style={{ fontSize: "16px", color: "#1A1A2E", marginBottom: 0 }}>
              Active Sites
            </div>
            <div className="sites-stack">
              {SITES.map((site) => (
                <div key={site.key} className={`site-card ${site.key}`}>
                  <div className="site-top">
                    <div className="site-name">{site.name}</div>
                  </div>
                  <div className="site-stats">
                    <div>
                      <div className="loc-stat-label">Today Output</div>
                      <div className="loc-stat-value">{site.todayOutput}</div>
                    </div>
                    <div>
                      <div className="loc-stat-label">OEE</div>
                      <div className="loc-stat-value">{site.oee}%</div>
                      <div className="loc-stat-sub">overall</div>
                    </div>
                  </div>
                  <div className="site-bar-bg">
                    <div className={`${site.key} site-bar-fill`} style={{ width: `${site.barWidth}%` }}></div>
                  </div>
                </div>
              ))}
            </div>

            {/* WEEKLY PROGRESS */}
            <div>
              <div className="chart-header">
                <div className="chart-title">Weekly Progress</div>
                <div className="chart-legend">
                  <div className="legend-item">
                    <div className="legend-dot" style={{ background: "#6C63FF" }}></div>OEE
                  </div>
                  <div className="legend-item">
                    <div className="legend-dot" style={{ background: "#3ECFCF" }}></div>Prod
                  </div>
                </div>
              </div>
              <div className="bar-chart">
                {WEEKLY.map((d) => (
                  <div className="bar-group" key={d.day}>
                    <div className="bar oee" style={{ height: `${d.oee}%` }}></div>
                    <div className="bar prod" style={{ height: `${d.prod}%` }}></div>
                    <div className="bar-label">{d.day}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* PRODUCTION COUNT */}
            <div className="hbar-section">
              <div className="hbar-title">Production Count</div>
              <div className="hbar-subtitle">Actual vs Target · Today</div>
              <div className="hbar-legend">
                <div className="hbar-legend-item">
                  <div className="hbar-legend-dot" style={{ background: "blue" }}></div>Actual
                </div>
                <div className="hbar-legend-item">
                  <div
                    className="hbar-legend-dot"
                    style={{ background: "yellow", border: "1px solid #c9c900" }}
                  ></div>
                  Target
                </div>
              </div>

              {SITES.map((site) => (
                <div className="hbar-group" key={site.key}>
                  <div className="hbar-group-label">{site.name}</div>
                  <div className="hbar-row">
                    <div className="hbar-row-label">Actual</div>
                    <div className="hbar-track-wrap">
                      <div className="hbar-track">
                        <div className="hbar-fill actual" style={{ width: `${site.actualPct}%` }}></div>
                      </div>
                    </div>
                    <div className="hbar-val">{site.actual}</div>
                  </div>
                  <div className="hbar-row">
                    <div className="hbar-row-label">Target</div>
                    <div className="hbar-track-wrap">
                      <div className="hbar-track">
                        <div className="hbar-fill target" style={{ width: "100%" }}></div>
                      </div>
                    </div>
                    <div className="hbar-val">{site.target}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CENTER PANEL */}
          <div className="center-panel">
            {/* PRODUCTION LINE HEADER */}
            <div className="production-line-header">
              <div className="production-line-logo">{/* logo placeholder */}LOGO</div>
              <div className="production-line-title">PRODUCTION LINE</div>
              <div className="live-clock" style={{ marginLeft: "auto" }}>
                {liveClock}
              </div>
            </div>

            {/* PORT KLANG */}
            <div className="sites-tabs">
              <div className="site-tab klang">Port Klang</div>
            </div>
            <div className="machines-section-title">Machine Status</div>
            <div className="machine-grid">
              {SITE_LINE_MAP.klang.map((id) => {
                const machine = toMachineCardData(lines[id]) || { name: id, status: "offline", oee: "N/A", progress: null, target: "N/A", current: "N/A" };
                return <MachineCard key={id} machine={machine} onClick={() => setSelectedLineId(id)} />;
              })}
            </div>

            {/* SENDAYAN */}
            <div className="sites-tabs" style={{ marginTop: "4px" }}>
              <div className="site-tab sendayan">Sendayan</div>
            </div>
            <div className="machines-section-title">Machine Status</div>
            <div className="machine-grid">
              {SITE_LINE_MAP.sendayan.map((id) => {
                const machine = toMachineCardData(lines[id]) || { name: id, status: "offline", oee: "N/A", progress: null, target: "N/A", current: "N/A" };
                return <MachineCard key={id} machine={machine} onClick={() => setSelectedLineId(id)} />;
              })}
            </div>
          </div>
        </div>

        <div className="footer-brand">SGISB DIGITAL TRANSFORMATION UNIT 2026</div>
      </div>

      {selectedLine && (
        <LineModal line={selectedLine} onClose={() => setSelectedLineId(null)} />
      )}
    </div>
  );
}