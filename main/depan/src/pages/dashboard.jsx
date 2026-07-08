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

function Sidebar({ activePage, onSelectPage, onMenu, onLogout, isMobileNavOpen, onCloseMobileNav, sites = [], user }) {
  function handleSelectPage(page) {
    onSelectPage(page);
    onCloseMobileNav();
  }

  const displayName = user?.name || user?.email || "User";

  return (
    <aside className={`sidebar ${isMobileNavOpen ? "is-mobile-open" : ""}`} aria-label="Main navigation">
      <div className="sidebar__group sidebar__group--top">
        <div className="sidebar-brand">
          <img src="https://github.com/wblsugihara/image/blob/main/sugi_white.png?raw=true" alt="Sugihara Grand Industries" />
          <div>
            <strong>Sugihara</strong>
            <span>Production Assets</span>
          </div>
        </div>

        <button className="sidebar-user" type="button" aria-label="Open profile summary" onClick={onMenu}>
          <span className="sidebar-user__avatar">{displayName.charAt(0).toUpperCase()}</span>
          <span className="sidebar-user__meta">
            <strong>{displayName}</strong>
            <small>Control room</small>
          </span>
        </button>

        <div className="sidebar-switch" aria-label="Production scope">
          <span className="is-active">Lines</span>
          <span>Sites</span>
        </div>
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

      <div className="sidebar-sites" aria-label="Active sites">
        <div className="sidebar-sites__title">
          <span>Active Sites</span>
          <strong>{sites.length}</strong>
        </div>
        {sites.map((site) => (
          <div className="sidebar-site" key={site.key}>
            <span className={`sidebar-site__dot sidebar-site__dot--${site.key}`}></span>
            <div>
              <strong>{site.name}</strong>
              <small>{site.actual.toLocaleString()} output</small>
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar__group sidebar__group--bottom">
        <div className="sidebar-dtu" aria-label="Digital Transformation Unit" title="Digital Transformation Unit">
          <span>DTU</span>
          <small>Digital Transformation Unit</small>
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
    normal: { label: "Running", bg: "#20d487", fg: "#04150f" },
    running: { label: "Running", bg: "#20d487", fg: "#04150f" },
    loading: { label: "Loading", bg: "#4ea1ff", fg: "#05111f" },
    delay: { label: "Delay", bg: "#f3b64d", fg: "#1b1203" },
    rest: { label: "Rest", bg: "#f3b64d", fg: "#1b1203" },
    downtime: { label: "Downtime", bg: "#ef3f5f", fg: "#ffffff" },
    down: { label: "Downtime", bg: "#ef3f5f", fg: "#ffffff" },
    planned_stop: { label: "Planned Stop", bg: "#ea5f7b", fg: "#ffffff" },
    maintenance: { label: "Planned Stop", bg: "#ea5f7b", fg: "#ffffff" },
    idle: { label: "Idle", bg: "#f3b64d", fg: "#1b1203" },
    model_change: { label: "Model Change", bg: "#4ea1ff", fg: "#05111f" },
    offline: { label: "Offline", bg: "#596677", fg: "#ffffff" },
  };//planned_stop(light_red),normal(running),model_change(biru),downtime(red),rest(kuning)

function getStatusConfig(status) {
  const key = String(status || "offline").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_CONFIG[key] || {
    label: status || "Unknown",
    bg: "#596677",
    fg: "#ffffff",
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
        style={{ "--status-color": cfg.bg, "--status-fg": cfg.fg }}
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

          <div className="status-panel">
            <span className="status-panel__value">{cfg.label}</span>
          </div>

          <div className="modal-model-row">
            <span className="stat-label">Current Model</span>
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
  const displayName = user?.name || user?.email || "User";
  const displayId = user?.id || user?.email || "Signed in";
  const avatarLetter = displayName.charAt(0).toUpperCase();

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
          <div className="profile-avatar">{avatarLetter}</div>
          <div className="profile-info">
            <div className="profile-name">{displayName}</div>
            <div className="profile-id">{displayId}</div>
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

function getLineSnapshot(line) {
  const status = getLineValue(line, ["machine_mode", "mode", "status"], "offline");
  const count = getNumber(getLineMetric(line, ["product_count", "count"]));
  const target = getNumber(getLineMetric(line, ["target", "hourly_plan"]));
  const reject = getNumber(getLineMetric(line, ["product_reject", "reject"]));
  const progress = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
  const oee = getLineOee(line);
  const cfg = getStatusConfig(status);

  return {
    count,
    cfg,
    model: getLineValue(line, ["model"], "No model"),
    oee,
    progress,
    reject,
    status,
    target,
  };
}

function MiniTrend({ tone = "neutral" }) {
  return (
    <svg className={`mini-trend mini-trend--${tone}`} viewBox="0 0 180 68" aria-hidden="true">
      <path className="mini-trend__grid" d="M0 46H180M0 24H180"></path>
      <path className="mini-trend__ghost" d="M0 52C20 42 32 44 46 51C64 60 78 61 96 43C111 28 125 24 144 32C158 38 168 31 180 18"></path>
      <path className="mini-trend__line" d="M0 54C18 39 30 43 44 49C62 57 74 54 91 39C108 24 124 26 140 35C157 45 168 33 180 21"></path>
      <circle className="mini-trend__dot" cx="142" cy="35" r="3.5"></circle>
      <circle className="mini-trend__dot" cx="180" cy="21" r="3.5"></circle>
    </svg>
  );
}

function CompactLineCard({ lineId, line, onSelectLine, tone = "neutral" }) {
  const snapshot = getLineSnapshot(line);

  return (
    <button
      className="compact-line-card"
      type="button"
      style={{ "--status-color": snapshot.cfg.bg, "--status-fg": snapshot.cfg.fg }}
      onClick={() => onSelectLine(lineId)}
      aria-label={`Open ${line?.line_id ?? lineId} details`}
    >
      <div className="compact-line-card__top">
        <span className="compact-line-card__icon">{lineId.slice(-1)}</span>
        <div>
          <small>{snapshot.cfg.label}</small>
          <strong>{line?.line_id ?? lineId}</strong>
        </div>
        <span className="compact-line-card__open" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7"></path>
            <path d="M8 7h9v9"></path>
          </svg>
        </span>
      </div>
      <div className="compact-line-card__metric">
        <span>OEE</span>
        <strong>{formatPercent(snapshot.oee)}%</strong>
        <small>{snapshot.progress}% target progress</small>
      </div>
      <MiniTrend tone={tone} />
    </button>
  );
}

function PortfolioPanel({ sites, totalSummary }) {
  return (
    <aside className="portfolio-panel">
      <div className="portfolio-panel__brand">
        <img src="https://github.com/wblsugihara/image/blob/main/sugi_white.png?raw=true" alt="" />
        <span>Live</span>
      </div>
      <h2>Production Portfolio</h2>
      <p>Real-time output, OEE, and reject view across Port Klang and Sendayan.</p>
      <div className="portfolio-panel__actions">
        <button type="button">Overall {totalSummary.oee}% OEE</button>
        <button type="button">{totalSummary.actual.toLocaleString()} Output</button>
      </div>
      <div className="portfolio-sites">
        {sites.map((site) => (
          <div className="portfolio-site" key={site.key}>
            <div>
              <strong>{site.name}</strong>
              <small>{site.actual.toLocaleString()} / {site.target.toLocaleString()}</small>
            </div>
            <span>{site.progress}%</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ActiveLinePanel({ lineId, line, onSelectLine }) {
  const snapshot = getLineSnapshot(line);
  const availability = formatPercent(getNumber(getLineMetric(line, ["availability_pct", "availability_pctm"])));
  const performance = formatPercent(getNumber(getLineMetric(line, ["performance_pct"])));
  const quality = formatPercent(getNumber(getLineMetric(line, ["quality_pct"])));

  return (
    <section className="active-line-panel" style={{ "--status-color": snapshot.cfg.bg, "--status-fg": snapshot.cfg.fg }}>
      <div className="active-line-panel__toolbar">
        <span>Your active production</span>
        <div className="active-line-panel__icons" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div className="active-line-panel__body">
        <div className="active-line-panel__main">
          <p className="last-update">Last Update - live socket</p>
          <div className="active-line-title">
            <h2>{line?.line_id ?? lineId}</h2>
            <span>{snapshot.cfg.label}</span>
            <button type="button" onClick={() => onSelectLine(lineId)}>View Profile</button>
          </div>
          <span className="active-line-panel__label">Current OEE</span>
          <strong className="active-line-panel__value">{formatPercent(snapshot.oee)}%</strong>
          <div className="active-line-actions">
            <button type="button">Target {snapshot.target.toLocaleString()}</button>
            <button type="button">Reject {snapshot.reject.toLocaleString()}</button>
          </div>
        </div>
        <div className="period-card">
          <div>
            <h3>Production Period</h3>
            <span>Daily contribution</span>
          </div>
          <div className="period-track">
            <span style={{ left: `${snapshot.progress}%` }}></span>
          </div>
          <small>{snapshot.progress}% of plan</small>
        </div>
      </div>
      <div className="active-metric-row">
        <div>
          <span>Availability</span>
          <strong>{availability}%</strong>
        </div>
        <div>
          <span>Performance</span>
          <strong>{performance}%</strong>
        </div>
        <div>
          <span>Quality</span>
          <strong>{quality}%</strong>
        </div>
        <div>
          <span>Model</span>
          <strong>{snapshot.model}</strong>
        </div>
      </div>
    </section>
  );
}

function MobileHero({ displayName, totalSummary, sites }) {
  const firstName = displayName.split(" ")[0] || "Team";

  return (
    <section className="mobile-hero">
      <p>Hello, {firstName}</p>
      <h1>How's Production Today?</h1>
      <div className="mobile-site-strip">
        {sites.map((site) => (
          <span key={site.key} className={site.progress >= 80 ? "is-good" : ""}>
            <strong>{site.oee}%</strong>
            {site.name}
          </span>
        ))}
        <span>
          <strong>{totalSummary.rejects}</strong>
          Reject
        </span>
      </div>
    </section>
  );
}

function MobileMetricDeck({ totalSummary }) {
  return (
    <section className="mobile-metric-deck" aria-label="Mobile production overview">
      <div className="mobile-score-card">
        <span>OEE Score</span>
        <strong>{totalSummary.oee}%</strong>
        <div className="dot-matrix" aria-hidden="true">
          {Array.from({ length: 28 }).map((_, index) => (
            <span className={index < Math.round((totalSummary.oee / 100) * 28) ? "is-lit" : ""} key={index}></span>
          ))}
        </div>
      </div>
      <div className="mobile-output-card">
        <span>Output</span>
        <strong>{totalSummary.actual.toLocaleString()}</strong>
        <small>{totalSummary.progress}% target</small>
        <div className="mini-bars" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div className="mobile-ring-card">
        <span>Quality Balance</span>
        <strong>{totalSummary.rejects}</strong>
        <small>reject</small>
      </div>
    </section>
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

  const displayName = user?.name || user?.email || "User";
  const focusLineId = useMemo(() => {
    const runningLine = ALL_LINE_IDS.find((lineId) => {
      const status = String(getLineValue(seededLines[lineId], ["machine_mode", "mode", "status"], "offline"))
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

      return status === "normal" || status === "running";
    });

    return runningLine || PORT_KLANG_LINES[0];
  }, [seededLines]);
  const runningLineCount = useMemo(() => {
    return ALL_LINE_IDS.filter((lineId) => {
      const status = String(getLineValue(seededLines[lineId], ["machine_mode", "mode", "status"], "offline"))
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

      return status === "normal" || status === "running";
    }).length;
  }, [seededLines]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
      ALL_LINE_IDS.forEach((lineId) => socket.emit("join-line", lineId));
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
        sites={siteSummaries}
        user={user}
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
        <header className="dashboard-topbar">
          <button
            className="user-chip"
            type="button"
            aria-label="Open profile summary"
            onClick={() => {
              setProfileOpen(true);
              setMobileNavOpen(false);
            }}
          >
            <span className="user-chip__avatar">{displayName.charAt(0).toUpperCase()}</span>
            <span className="user-chip__text">
              <span>{displayName}</span>
              <small>Control room</small>
            </span>
          </button>
          <button className="live-shift-btn" type="button">Live Shift</button>
          <div className="topbar-actions">
            <button type="button" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              <span>{runningLineCount}</span>
            </button>
            <div className="search-pill" aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <span>Search...</span>
            </div>
            <button type="button" aria-label="Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </header>

        {activePage === "progress" && (
          <>
            <MobileHero displayName={displayName} totalSummary={totalSummary} sites={siteSummaries} />
            <MobileMetricDeck totalSummary={totalSummary} />

            <section className="dashboard-title-row">
              <div>
                <p className="dashboard-eyebrow">Recommended lines for live focus</p>
                <h1>Production Line Overview</h1>
              </div>
              <div className="dashboard-filter-row" aria-label="Dashboard filters">
                <span>24H</span>
                <span>OEE</span>
                <span>Output</span>
              </div>
            </section>

            <section className="command-grid">
              <div className="command-main">
                <div className="compact-line-grid">
                  {PORT_KLANG_LINES.map((lineId, index) => (
                    <CompactLineCard
                      key={lineId}
                      lineId={lineId}
                      line={seededLines[lineId]}
                      tone={index === 2 ? "danger" : "neutral"}
                      onSelectLine={setSelectedLineId}
                    />
                  ))}
                </div>
              </div>
              <PortfolioPanel sites={siteSummaries} totalSummary={totalSummary} />
            </section>

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
            </section>

            <ActiveLinePanel
              lineId={focusLineId}
              line={seededLines[focusLineId]}
              onSelectLine={setSelectedLineId}
            />

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
