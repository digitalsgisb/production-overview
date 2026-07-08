import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import LineCard from "./linecard.jsx";
import "./dashboard.css";

const DEFAULT_API_URL = `${window.location.protocol}//${window.location.hostname}:3200`;
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  DEFAULT_API_URL;

const PORT_KLANG_LINES = ["ABB4", "ABB7", "ABB2"];
const SENDAYAN_LINES = ["SDY1", "SDY2"];
const ALL_LINE_IDS = [...PORT_KLANG_LINES, ...SENDAYAN_LINES];
const LINE_DOCUMENTATION_URLS = {
  ABB4: "https://abb4grafana.sugidigital.org/d/fe9tzft54x1xcf/abb4-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
  ABB7: "https://abb7grafana.sugidigital.org/",
  ABB2: "https://abb2pkgrafana.sugidigital.org/d/adfnddq/abb2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
  SDY1: "https://l1sdygrafana.sugidigital.org/d/adqr5dg/line-1-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
  SDY2: "https://l2sdygrafana.sugidigital.org/d/ad6zlmx/line-2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
};

function Sidebar({ activePage, onSelectPage, onMenu, onLogout, isMobileNavOpen, onCloseMobileNav }) {
  function handleSelectPage(page) {
    onSelectPage(page);
    onCloseMobileNav();
  }

  return (
    <aside className={`sidebar ${isMobileNavOpen ? "is-mobile-open" : ""}`} aria-label="Main navigation">
      <div className="sidebar__group sidebar__group--top">
        <button
          className="icon-btn icon-btn--menu"
          type="button"
          aria-label="Menu"
          aria-expanded={isMobileNavOpen}
          onClick={onMenu}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <span className="sidebar-mobile-title">Navigation</span>
      </div>

      <nav className="sidebar__group sidebar__group--middle" aria-label="Primary">
        <button
          className={`icon-btn nav-btn ${activePage === "progress" ? "is-active" : ""}`}
          type="button"
          aria-label="Progress"
          aria-pressed={activePage === "progress"}
          onClick={() => handleSelectPage("progress")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18"></path>
            <path d="M18.7 8 13 13.7l-3-3L4 17.6"></path>
          </svg>
          <span className="icon-btn__tip">Progress</span>
        </button>

        <button
          className={`icon-btn nav-btn ${activePage === "attendance" ? "is-active" : ""}`}
          type="button"
          aria-label="Attendance"
          aria-pressed={activePage === "attendance"}
          onClick={() => handleSelectPage("attendance")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
            <path d="m9 16 2 2 4-4"></path>
          </svg>
          <span className="icon-btn__tip">Attendance</span>
        </button>

        <button
          className={`icon-btn nav-btn ${activePage === "history" ? "is-active" : ""}`}
          type="button"
          aria-label="History"
          aria-pressed={activePage === "history"}
          onClick={() => handleSelectPage("history")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7"></path>
            <path d="M3 4v5h5"></path>
            <path d="M12 7v5l4 2"></path>
          </svg>
          <span className="icon-btn__tip">History</span>
        </button>
      </nav>

      <div className="sidebar__group sidebar__group--bottom">
        <div className="sidebar-dtu" aria-label="Digital Transformation Unit" title="Digital Transformation Unit">
          <span>DTU</span>
          <span className="sidebar-dtu__tip">Digital Transformation Unit</span>
        </div>
        <button className="icon-btn icon-btn--logout" type="button" aria-label="Log out" onClick={onLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span className="icon-btn__tip">Log out</span>
        </button>
      </div>
    </aside>
  );
}

const WEEKLY_PROGRESS = [ //change later -
  { day: "MON", oee: 60, prod: 55 },
  { day: "TUE", oee: 45, prod: 48 },
  { day: "WED", oee: 78, prod: 80 },
  { day: "THU", oee: 32, prod: 30 },
  { day: "FRI", oee: 40, prod: 38 },
];

function getNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getLineValue(line, keys, fallback = "-") {
  for (const key of keys) {
    if (line?.[key] !== undefined && line?.[key] !== null && line?.[key] !== "") return line[key];
  }
  return fallback;
}

function getLineMetric(line, keys) {
  for (const key of keys) {
    if (line?.[key] !== undefined && line?.[key] !== null) return line[key];
  }
  return 0;
}

function getLineOee(line) {
  const explicitOee = getNumber(getLineMetric(line, ["oee"]));
  if (explicitOee > 0) return explicitOee;

  const availability = getNumber(getLineMetric(line, ["availability_pct", "availability_pctm"]));
  const performance = getNumber(getLineMetric(line, ["performance_pct"]));
  const quality = getNumber(getLineMetric(line, ["quality_pct"]));

  if (availability > 0 || performance > 0 || quality > 0) {
    return (availability * performance * quality) / 10000;
  }

  return 0;
}

function formatPercent(value) {
  const number = getNumber(value);
  const rounded = Number(number.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

 const STATUS_CONFIG = {
    normal: { label: "Running", bg: "#1fcb6b", fg: "#06210f", pulse: true },
    running: { label: "Running", bg: "#1fcb6b", fg: "#06210f", pulse: true },
    loading: { label: "Loading", bg: "#4c9ffe", fg: "#ffffff", pulse: false },
    delay: { label: "Delay", bg: "#f2a93b", fg: "#2a1b02", pulse: false },
    rest: { label: "Rest", bg: "#f2a93b", fg: "#ffffff", pulse: false },
    downtime: { label: "Downtime", bg: "#f00020", fg: "#ffffff", pulse: false },
    down: { label: "Downtime", bg: "#f00020", fg: "#ffffff", pulse: false },
    planned_stop: { label: "Planned Stop", bg: "#e06172", fg: "#ffffff", pulse: false },
    maintenance: { label: "Planned Stop", bg: "#e06172", fg: "#ffffff", pulse: false },
    idle: { label: "Idle", bg: "#f2a93b", fg: "#2a1b02", pulse: false },
    model_change: { label: "Model Change", bg: "#4c9ffe", fg: "#ffffff", pulse: false },
    offline: { label: "Offline", bg: "#4b5563", fg: "#ffffff", pulse: false },
  };//planned_stop(light_red),normal(running),model_change(biru),downtime(red),rest(kuning)

function getStatusConfig(status) {
  const key = String(status || "offline").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_CONFIG[key] || {
    label: status || "Unknown",
    bg: "#4b5563",
    fg: "#ffffff",
    pulse: false,
  };
}

function formatCompact(value) {
  if (value >= 1000) return `${Number(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function normalizeNames(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

// function formatDateTime(value) {
//   if (!value) return "-";

//   const date = new Date(value);
//   if (Number.isNaN(date.getTime())) return String(value);

//   return date.toLocaleString("en-MY", {
//     day: "2-digit",
//     month: "short",
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// }

function TeamNames({ names }) {
  const list = normalizeNames(names);

  if (list.length === 0) {
    return <span className="team-empty">Unassigned</span>;
  }

  return list.map((name) => (
    <span className="team-name" key={name}>{name}</span>
  ));
}

function TeamColumn({ title, names }) {
  return (
    <div className="team-col">
      <span className="team-col-title">{title}</span>
      <TeamNames names={names} />
    </div>
  );
}

function SupervisorRow({ operators }) {
  return (
    <div className="staff-wide-row">
      <span className="team-col-sub">Supervisor</span>
      <TeamNames names={operators?.supervisor} />
    </div>
  );
}

function LineLeaderRow({ operators }) {
  return (
    <div className="staff-wide-row">
      <span className="team-col-sub">Line Leaders</span>
      <TeamNames names={operators?.lineLeaders} />
    </div>
  );
}

function LineDetailModal({ lineId, line, onClose }) {
  useEffect(() => {
    if (!lineId) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [lineId, onClose]);

  if (!lineId) return null;

  const status = getLineValue(line, ["machine_mode", "mode", "status"], "offline");
  const count = getNumber(getLineMetric(line, ["product_count", "count"]));
  const target = getNumber(getLineMetric(line, ["target", "hourly_plan"]));
  const reject = getNumber(getLineMetric(line, ["product_reject", "reject"]));
  const oee = getLineOee(line);
  const availabilityPct = getNumber(getLineMetric(line, ["availability_pct", "availability_pctm"]));
  const performancePct = getNumber(getLineMetric(line, ["performance_pct"]));
  const qualityPct = getNumber(getLineMetric(line, ["quality_pct"]));
  const oeeDisplay = formatPercent(oee);
  const availabilityDisplay = formatPercent(availabilityPct);
  const performanceDisplay = formatPercent(performancePct);
  const qualityDisplay = formatPercent(qualityPct);
  // const hourlyOutput = getNumber(getLineMetric(line, ["hourly_output"]));
  // const standardCycle = getNumber(getLineMetric(line, ["standard_cycle_time", "standard_cycle"]));
  const progress = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
  const cfg = getStatusConfig(status);
  const operators = line?.operators ?? {};
  const documentationUrl = LINE_DOCUMENTATION_URLS[lineId];

  return (
    <div className="line-modal-overlay is-open" role="presentation" onMouseDown={onClose}>
      <section
        className="line-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="line-modal-title"
        style={{ "--status-color": cfg.bg }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="line-modal-head">
          <div>
            <span className="line-id-label">Line Detail</span>
            <h2 className="line-modal-title" id="line-modal-title">{line?.line_id ?? lineId}</h2>
          </div>
          <button className="line-modal-close" type="button" aria-label="Close line detail" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div className="line-modal-body">
          <div className="modal-top-row">
            <div>
              <span className="stat-label">OEE</span>
              <div className="modal-oee-value">{oeeDisplay}%</div>
            </div>
            <div className="modal-progress">
              <span className="stat-label">Progress</span>
              <div className="progress-head">
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>

          <div className="status-bar" data-pulse={cfg.pulse} style={{ background: cfg.bg, color: cfg.fg }}>
            <span className="status-dot"></span>
            {cfg.label}
          </div>

          <div className="modal-model-row">
            <span className="stat-label">Model</span>
            <span className="stat-value">{getLineValue(line, ["model"], "-")}</span>
          </div>

          <div className="modal-stats-row">
            <div className="modal-stat-cell">
              <span className="stat-label">Count</span>
              <span className="stat-value">{count.toLocaleString()}</span>
            </div>
            <div className="modal-stat-cell">
              <span className="stat-label">Target</span>
              <span className="stat-value">{target.toLocaleString()}</span>
            </div>
            <div className={`modal-stat-cell is-reject ${reject === 0 ? "is-zero" : ""}`}>
              <span className="stat-label">Reject</span>
              <span className="stat-value">{reject.toLocaleString()}</span>
            </div>
          </div>

          <div className="modal-stats-row modal-oee-components">
            <div className="modal-stat-cell">
              <span className="stat-label">Availability</span>
              <span className="stat-value">{availabilityDisplay}%</span>
            </div>
            <div className="modal-stat-cell">
              <span className="stat-label">Performance</span>
              <span className="stat-value">{performanceDisplay}%</span>
            </div>
            <div className="modal-stat-cell">
              <span className="stat-label">Quality</span>
              <span className="stat-value">{qualityDisplay}%</span>
            </div>
          </div>

          {/* <div className="modal-meta-grid">
            <div>
              <span className="stat-label">Hourly Output</span>
              <span className="stat-value">{hourlyOutput.toLocaleString()}</span>
            </div>
            <div>
              <span className="stat-label">Std Cycle</span>
              <span className="stat-value">{standardCycle}</span>
            </div>
            <div>
              <span className="stat-label">Last Updated</span>
              <span className="stat-value">{formatDateTime(line?.updated_at)}</span>
            </div>
          </div> */}

          <SupervisorRow operators={operators} />
          <LineLeaderRow operators={operators} />
          <div className="operator-grid">
            <TeamColumn title="Forming Op." names={operators.formingOperators} />
            <TeamColumn title="Waterjet Op." names={operators.waterjetOperators} />
            <TeamColumn title="Assembly Op." names={operators.assemblyOperators} />
            <TeamColumn title="Quality Op." names={operators.qualityOperators} />
          </div>

          <div className="modal-link-row">
            <a
              className={!documentationUrl ? "is-disabled" : ""}
              href={documentationUrl || "#"}
              target={documentationUrl ? "_blank" : undefined}
              rel={documentationUrl ? "noreferrer" : undefined}
              onClick={!documentationUrl ? (event) => event.preventDefault() : undefined}
            >
              Line Documentation
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileCard({ isOpen, onClose, sites, user }) {
  return (
    <>
      <div className={`profile-card ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
        <button className="profile-card__close" type="button" aria-label="Close profile card" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="profile-row">
          <div className="profile-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="profile-info">
            <div className="profile-name">{user?.name}</div>
            <div className="profile-id">{user?.id }</div>
          </div>
          {/* <div className="profile-status" title="Online"></div> */}
        </div>

        <div className="section-label">Active Sites</div>
        <div className="sites-stack">
          {sites.map((site) => (
            <div className={`site-card ${site.key}`} key={site.key}>
              <div className="site-top">
                <div className="site-name">{site.name}</div>
              </div>
              <div className="site-stats">
                <div>
                  <div className="loc-stat-label">Today Output</div>
                  <div className="loc-stat-value">{site.actual.toLocaleString()}</div>
                </div>
                <div>
                  <div className="loc-stat-label">OEE</div>
                  <div className="loc-stat-value">{site.oee}%</div>
                  <div className="loc-stat-sub">overall</div>
                </div>
              </div>
              <div className="site-bar-bg">
                <div className={`${site.key} site-bar-fill`} style={{ width: `${site.progress}%` }}></div>
              </div>
            </div>
          ))}
        </div>

        <div className="weekly-progress">
          <div className="chart-header">
            <div className="chart-title">Weekly Progress</div>
            <div className="chart-legend">
              <div className="legend-item"><div className="legend-dot legend-oee"></div>OEE</div>
              <div className="legend-item"><div className="legend-dot legend-prod"></div>Prod</div>
            </div>
          </div>
          <div className="bar-chart">
            {WEEKLY_PROGRESS.map((item) => (
              <div className="bar-group" key={item.day}>
                <div className="bar oee" style={{ height: `${item.oee}%` }}></div>
                <div className="bar prod" style={{ height: `${item.prod}%` }}></div>
                <div className="bar-label">{item.day}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="hbar-section">
          <div className="hbar-title">Production Count</div>
          <div className="hbar-subtitle">Actual vs Target - Today</div>
          <div className="hbar-legend">
            <div className="hbar-legend-item"><div className="hbar-legend-dot actual-dot"></div>Actual</div>
            <div className="hbar-legend-item"><div className="hbar-legend-dot target-dot"></div>Target</div>
          </div>

          {sites.map((site) => (
            <div className="hbar-group" key={site.key}>
              <div className="hbar-group-label">{site.name}</div>
              <div className="hbar-row">
                <div className="hbar-row-label">Actual</div>
                <div className="hbar-track-wrap"><div className="hbar-track"><div className="hbar-fill actual" style={{ width: `${site.progress}%` }}></div></div></div>
                <div className="hbar-val">{formatCompact(site.actual)}</div>
              </div>
              <div className="hbar-row">
                <div className="hbar-row-label">Target</div>
                <div className="hbar-track-wrap"><div className="hbar-track"><div className="hbar-fill target" style={{ width: "100%" }}></div></div></div>
                <div className="hbar-val">{formatCompact(site.target)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button className={`backdrop ${isOpen ? "is-visible" : ""}`} type="button" aria-label="Close profile card" onClick={onClose}></button>
    </>
  );
}

function createFallbackLine(lineId) {
  return {
    line_id: lineId,
    status: "offline",
    product_count: 0,
    product_reject: 0,
    target: 0,
    oee: 0,
    availability_pct: 0,
    availability_pctm: 0,
    performance_pct: 0,
    quality_pct: 0,
  };
}

function ProductionSection({ title, lineIds, lines, onSelectLine }) {
  const sectionLines = lineIds.map((lineId) => lines[lineId] ?? createFallbackLine(lineId));
  const runningCount = sectionLines.filter((line) => {
    const status = String(getLineValue(line, ["machine_mode", "mode", "status"], "offline"))
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return status === "normal" || status === "running";
  }).length;
  const actual = sectionLines.reduce((sum, line) => sum + getNumber(getLineMetric(line, ["product_count", "count"])), 0);
  const target = sectionLines.reduce((sum, line) => sum + getNumber(getLineMetric(line, ["target", "hourly_plan"])), 0);
  const sectionProgress = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

  return (
    <section className="plant-section">
      <div className="plant-heading">
        <div>
          <p className="plant-eyebrow">{lineIds.length} production lines</p>
          <h2 className="plant-title">{title}</h2>
        </div>
        <div className="plant-metrics" aria-label={`${title} summary`}>
          <span>{runningCount} running</span>
          <span>{actual.toLocaleString()} / {target.toLocaleString()}</span>
          <span>{sectionProgress}%</span>
        </div>
      </div>
      <div className="line-grid">
        {lineIds.map((lineId) => (
          <LineCard
            key={lineId}
            lineId={lineId}
            line={lines[lineId] ?? createFallbackLine(lineId)}
            onSelectLine={onSelectLine}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryCard({ label, value, detail, tone = "neutral" }) {
  return (
    <article className={`summary-card summary-card--${tone}`}>
      <span className="summary-card__label">{label}</span>
      <strong className="summary-card__value">{value}</strong>
      <span className="summary-card__detail">{detail}</span>
    </article>
  );
}

function PlaceholderPage({ title }) {
  return (
    <section className="placeholder-page">
      <h2>{title}</h2>
      <p>In progress</p>
    </section>
  );
}

function Dashboard({ user, onLogout }) {
  const [lines, setLines] = useState({});
  const [socketState, setSocketState] = useState("connecting");
  const [activePage, setActivePage] = useState("progress");
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState(null);

  const seededLines = useMemo(() => {
    return ALL_LINE_IDS.reduce((acc, lineId) => {
      acc[lineId] = lines[lineId] ?? createFallbackLine(lineId);
      return acc;
    }, {});
  }, [lines]);

  const siteSummaries = useMemo(() => {
    const buildSite = (key, name, lineIds) => {
      const siteLines = lineIds.map((lineId) => seededLines[lineId] ?? createFallbackLine(lineId));
      const actual = siteLines.reduce((sum, line) => sum + getNumber(getLineMetric(line, ["product_count", "count"])), 0);
      const target = siteLines.reduce((sum, line) => sum + getNumber(getLineMetric(line, ["target", "hourly_plan"])), 0);
      const oee = siteLines.length > 0
        ? Math.round(siteLines.reduce((sum, line) => sum + getLineOee(line), 0) / siteLines.length)
        : 0;
      const progress = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

      return { key, name, actual, target, oee, progress };
    };

    return [
      buildSite("klang", "Port Klang", PORT_KLANG_LINES),
      buildSite("sendayan", "Sendayan", SENDAYAN_LINES),
    ];
  }, [seededLines]);

  const totalSummary = useMemo(() => {
    const allLines = ALL_LINE_IDS.map((lineId) => seededLines[lineId] ?? createFallbackLine(lineId));
    const actual = allLines.reduce((sum, line) => sum + getNumber(getLineMetric(line, ["product_count", "count"])), 0);
    const target = allLines.reduce((sum, line) => sum + getNumber(getLineMetric(line, ["target", "hourly_plan"])), 0);
    const rejects = allLines.reduce((sum, line) => sum + getNumber(getLineMetric(line, ["product_reject", "reject"])), 0);
    const oee = allLines.length > 0
      ? Math.round(allLines.reduce((sum, line) => sum + getLineOee(line), 0) / allLines.length)
      : 0;
    const progress = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

    return { actual, target, rejects, oee, progress, lineCount: allLines.length };
  }, [seededLines]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
      setSocketState("connected");
      ALL_LINE_IDS.forEach((lineId) => socket.emit("join-line", lineId));
    });

    socket.on("connect_error", () => {
      setSocketState("offline");
    });

    socket.on("disconnect", () => {
      setSocketState("offline");
    });

    socket.on("line:data", (data) => {
      setLines((previousLines) => ({
        ...previousLines,
        [data.line_id]: data.line,
      }));
    });

    socket.on("line:update", (data) => {
      setLines((previousLines) => ({
        ...previousLines,
        [data.line_id]: {
          ...(previousLines[data.line_id] ?? createFallbackLine(data.line_id)),
          ...data.changes,
        },
      }));
    });

    return () => socket.disconnect();
  }, []);

  function handleMenu() {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileNavOpen((open) => !open);
      setProfileOpen(false);
      return;
    }

    setProfileOpen((open) => !open);
  }

  function handleLogout() {
    setProfileOpen(false);
    setMobileNavOpen(false);
    if (onLogout) onLogout();
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        onMenu={handleMenu}
        onLogout={handleLogout}
        isMobileNavOpen={mobileNavOpen}
        onCloseMobileNav={() => setMobileNavOpen(false)}
      />
      <button
        className={`mobile-nav-backdrop ${mobileNavOpen ? "is-visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
      ></button>
      <ProfileCard isOpen={profileOpen} onClose={() => setProfileOpen(false)} sites={siteSummaries} user={user} />
      <LineDetailModal
        lineId={selectedLineId}
        line={selectedLineId ? seededLines[selectedLineId] : null}
        onClose={() => setSelectedLineId(null)}
      />
      <main className="dashboard-content">
        <header className="dashboard-header">
          <div className="header-brand">
            <img className="brand-logo" src="https://github.com/wblsugihara/image/blob/main/sugi_white.png?raw=true" alt="Sugihara Grand Industries" />
            <div>
              <p className="dashboard-eyebrow">Live control room</p>
              <h1>Production Line Overview</h1>
              <p className="dashboard-subtitle">Port Klang and Sendayan production telemetry</p>
            </div>
          </div>
          <div className="header-actions">
            <time className="header-time" dateTime={new Date().toISOString()}>
              {new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
            </time>
            <div className={`connection-pill ${socketState}`}>
              <span></span>
              {socketState}
            </div>
          </div>
        </header>

        {activePage === "progress" && (
          <>
            <section className="summary-grid" aria-label="Production overview summary">
              <SummaryCard
                label="Overall OEE"
                value={`${totalSummary.oee}%`}
                detail={`${totalSummary.lineCount} monitored lines`}
                tone="oee"
              />
              <SummaryCard
                label="Actual Output"
                value={totalSummary.actual.toLocaleString()}
                detail={`${totalSummary.progress}% of ${totalSummary.target.toLocaleString()} target`}
                tone="output"
              />
              <SummaryCard
                label="Total Reject"
                value={totalSummary.rejects.toLocaleString()}
                detail="Across active sessions"
                tone={totalSummary.rejects > 0 ? "reject" : "stable"}
              />
              <SummaryCard
                label="Socket"
                value={socketState}
                detail="Backend WebSocket state"
                tone={socketState === "connected" ? "stable" : "reject"}
              />
            </section>

            <ProductionSection
              title="Port Klang"
              lineIds={PORT_KLANG_LINES}
              lines={seededLines}
              onSelectLine={setSelectedLineId}
            />
            <ProductionSection
              title="Sendayan"
              lineIds={SENDAYAN_LINES}
              lines={seededLines}
              onSelectLine={setSelectedLineId}
            />
          </>
        )}

        {activePage === "attendance" && <PlaceholderPage title="Attendance" />}
        {activePage === "history" && <PlaceholderPage title="History" />}
        {activePage === "logged-out" && <PlaceholderPage title="Logged out" />}

        <footer className="dashboard-footer">
          <span>© Digital Transformation Unit</span>
        </footer>
      </main>
    </div>
  );
}

export default Dashboard;
