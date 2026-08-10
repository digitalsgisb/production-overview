import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./wallboard.css";

const DEFAULT_API_URL = `${window.location.protocol}//${window.location.hostname}:3200`;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || DEFAULT_API_URL;
const SITES = [
  { name: "Port Klang", lines: ["ABB2", "ABB4", "ABB7"] },
  { name: "Sendayan", lines: ["SDY1", "SDY2"] },
];
const ALL_LINE_IDS = SITES.flatMap((site) => site.lines);
const STATUS_CONFIG = {
  normal: { label: "Running", color: "#20d487" }, running: { label: "Running", color: "#20d487" },
  loading: { label: "Loading", color: "#4f8cff" }, delay: { label: "Delay", color: "#f5a524" },
  rest: { label: "Rest", color: "#35cddd" }, downtime: { label: "Downtime", color: "#ef455c" },
  down: { label: "Downtime", color: "#ef455c" }, planned_stop: { label: "Planned Stop", color: "#fb7185" },
  maintenance: { label: "Maintenance", color: "#a78bfa" }, idle: { label: "Idle", color: "#e8d44c" },
  model_change: { label: "Model Change", color: "#8b7cf6" }, offline: { label: "Offline", color: "#667386" },
};

function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function lineValue(line, keys, fallback = 0) {
  for (const key of keys) if (line?.[key] !== undefined && line?.[key] !== null && line?.[key] !== "") return line[key];
  return fallback;
}
function clampPercent(value) { return Math.max(0, Math.min(100, numberValue(value))); }
function getOee(line) {
  const explicit = numberValue(lineValue(line, ["oee"]));
  const availability = numberValue(lineValue(line, ["availability_pct", "availability_pctm"]));
  const performance = numberValue(lineValue(line, ["performance_pct"]));
  const quality = numberValue(lineValue(line, ["quality_pct"]));
  return availability > 0 || performance > 0 || quality > 0
    ? clampPercent((availability + performance + quality) / 3)
    : clampPercent(explicit);
}
function formatPercent(value) {
  const rounded = Number(numberValue(value).toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
function getStatus(line) {
  const raw = String(lineValue(line, ["machine_mode", "mode", "status"], "offline"));
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return { ...(STATUS_CONFIG[key] || { label: raw || "Unknown", color: "#667386" }), key };
}
function fallbackLine(lineId) {
  return { line_id: lineId, status: "offline", product_count: 0, product_reject: 0, target: 0, availability_pct: 0, performance_pct: 0, quality_pct: 0 };
}
function getSiteName(lineId) { return SITES.find((site) => site.lines.includes(lineId))?.name || "Production"; }
function oeeTone(oee) { return oee >= 80 ? "good" : oee >= 60 ? "watch" : "alert"; }
function formatSigned(value) { return `${value > 0 ? "+" : ""}${value.toLocaleString()}`; }
function getBalanceDetail(value) {
  if (value < 0) return `${Math.abs(value).toLocaleString()} left`;
  if (value > 0) return `${value.toLocaleString()} ahead`;
  return "On plan";
}

function WallboardLineCard({ lineId, line }) {
  const status = getStatus(line);
  const oee = getOee(line);
  const count = numberValue(lineValue(line, ["product_count", "count"]));
  const target = numberValue(lineValue(line, ["target", "hourly_plan"]));
  const rejects = numberValue(lineValue(line, ["product_reject", "reject"]));
  const progress = target > 0 ? clampPercent((count / target) * 100) : 0;
  const planBalance = count - target;
  const model = lineValue(line, ["model"], "No model");
  const components = [["Availability", lineValue(line, ["availability_pct", "availability_pctm"])], ["Performance", lineValue(line, ["performance_pct"])], ["Quality", lineValue(line, ["quality_pct"])] ];
  return (
    <article className={`wall-line wall-line--${oeeTone(oee)} ${status.key === "offline" ? "is-offline" : ""}`} style={{ "--line-status": status.color, "--line-progress": `${progress}%` }}>
      <div className="wall-line__head">
        <div className="wall-line__identity">
          <span className="wall-line__site">{getSiteName(lineId)}</span>
          <h2>{line?.line_id || lineId}</h2>
          <div className="wall-line__status"><span aria-hidden="true"></span>{status.label}</div>
        </div>
        <div className="wall-line__oee-value" aria-label={`OEE ${formatPercent(oee)} percent`}>
          <span>OEE</span>
          <strong>{formatPercent(oee)}%</strong>
        </div>
      </div>
      <div className="wall-line__model">
        <span>Model</span>
        <strong>{model}</strong>
      </div>
      <div className="wall-line__progress">
        <div><span>Progress</span><strong>{Math.round(progress)}%</strong></div>
        <div className="wall-line__track"><span></span></div>
      </div>
      <div className="wall-line__components">
        {components.map(([label, value]) => <div key={label}><span>{label[0]}</span><strong>{formatPercent(value)}%</strong></div>)}
      </div>
      <div className="wall-line__output">
        <div><span>Actual</span><strong>{count.toLocaleString()}</strong></div>
        <div><span>Plan</span><strong>{target.toLocaleString()}</strong></div>
        <div className={`wall-line__balance ${planBalance < 0 ? "is-behind" : planBalance > 0 ? "is-ahead" : ""}`}>
          <span>Balance</span><strong>{formatSigned(planBalance)}</strong><small>{getBalanceDetail(planBalance)}</small>
        </div>
        <div className={rejects > 0 ? "has-rejects" : ""}><span>Reject</span><strong>{rejects.toLocaleString()}</strong></div>
      </div>
    </article>
  );
}

function SummaryMetric({ label, value, detail, tone = "default", progress }) {
  return <div className={`wall-summary__metric wall-summary__metric--${tone}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}{progress !== undefined && <div className="wall-summary__track" aria-hidden="true"><span style={{ width: `${clampPercent(progress)}%` }}></span></div>}</div>;
}

function Wallboard({ onLogout }) {
  const [lines, setLines] = useState({});
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);
  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token: localStorage.getItem("token") } });
    socket.on("connect", () => { setConnected(true); ALL_LINE_IDS.forEach((lineId) => socket.emit("join-line", lineId)); });
    socket.on("disconnect", () => setConnected(false));
    socket.on("line:data", (data) => { setLines((current) => ({ ...current, [data.line_id]: data.line })); setLastUpdated(new Date()); });
    socket.on("line:update", (data) => {
      setLines((current) => ({ ...current, [data.line_id]: { ...(current[data.line_id] || fallbackLine(data.line_id)), ...data.changes } }));
      setLastUpdated(new Date());
    });
    socket.on("session:revoked", () => onLogout?.());
    socket.on("connect_error", (error) => { setConnected(false); if (error?.data?.code === "AUTH_REQUIRED") onLogout?.(); });
    return () => socket.disconnect();
  }, [onLogout]);

  const seededLines = useMemo(() => ALL_LINE_IDS.map((lineId) => lines[lineId] || fallbackLine(lineId)), [lines]);
  const summary = useMemo(() => {
    const actual = seededLines.reduce((total, line) => total + numberValue(lineValue(line, ["product_count", "count"])), 0);
    const target = seededLines.reduce((total, line) => total + numberValue(lineValue(line, ["target", "hourly_plan"])), 0);
    const rejects = seededLines.reduce((total, line) => total + numberValue(lineValue(line, ["product_reject", "reject"])), 0);
    const oee = seededLines.reduce((total, line) => total + getOee(line), 0) / seededLines.length;
    const running = seededLines.filter((line) => getStatus(line).label === "Running").length;
    const progress = target > 0 ? clampPercent((actual / target) * 100) : 0;
    return { actual, target, rejects, oee, running, progress, planBalance: actual - target };
  }, [seededLines]);

  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* Browser may block fullscreen. */ }
  }

  return (
    <main className="wallboard">
      <header className="wallboard__header">
        <div className="wallboard__brand"><img src="/sugihara-grand-white.png" alt="Sugihara Grand Industries" /><div><h1>Production Control Center</h1></div></div>
        <div className="wallboard__header-right">
          {!connected && <div className="wallboard__connection"><span aria-hidden="true"></span>Data feed reconnecting</div>}
          <div className="wallboard__clock"><strong>{now.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false })}</strong><span>{now.toLocaleDateString("en-MY", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}</span></div>
          <button className="wallboard__icon-btn" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"} title={isFullscreen ? "Exit full screen" : "Enter full screen"}>
            {isFullscreen ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg>}
          </button>
          <button className="wallboard__icon-btn" type="button" onClick={() => window.location.assign("/")} aria-label="Return to dashboard" title="Return to dashboard"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
        </div>
      </header>
      <section className="wall-summary" aria-label="Factory summary">
        <SummaryMetric label="OEE" value={`${formatPercent(summary.oee)}%`} detail={`${summary.running}/${ALL_LINE_IDS.length} running`} tone={oeeTone(summary.oee)} />
        <SummaryMetric label="Output" value={summary.actual.toLocaleString()} detail={`Plan ${summary.target.toLocaleString()}`} tone="blue" />
        <SummaryMetric label="Plan" value={`${Math.round(summary.progress)}%`} detail={getBalanceDetail(summary.planBalance)} tone="cyan" progress={summary.progress} />
        <SummaryMetric label="Reject" value={summary.rejects.toLocaleString()} tone={summary.rejects > 0 ? "alert" : "good"} />
      </section>
      <section className="wallboard__lines" aria-label="Live production lines">
        {ALL_LINE_IDS.map((lineId) => <WallboardLineCard key={lineId} lineId={lineId} line={lines[lineId] || fallbackLine(lineId)} />)}
      </section>
      <footer className="wallboard__footer">
        <div>{SITES.map((site) => { const running = site.lines.filter((lineId) => getStatus(lines[lineId] || fallbackLine(lineId)).label === "Running").length; return <span key={site.name}><i></i>{site.name}: {running}/{site.lines.length} running</span>; })}</div>
        <span>Last update: {lastUpdated ? lastUpdated.toLocaleTimeString("en-MY", { hour12: false }) : "Waiting for live data"}</span>
      </footer>
    </main>
  );
}

export default Wallboard;
