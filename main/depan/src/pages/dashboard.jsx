import { useEffect, useMemo, useRef, useState } from "react";
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
const HISTORY_LIMIT = 28;
const LINE_DOCUMENTATION_URLS = {
  ABB4: "https://abb4grafana.sugidigital.org/d/fe9tzft54x1xcf/abb4-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
  ABB7: "https://abb7grafana.sugidigital.org/",
  ABB2: "https://abb2pkgrafana.sugidigital.org/d/adfnddq/abb2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
  SDY1: "https://l1sdygrafana.sugidigital.org/d/adqr5dg/line-1-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
  SDY2: "https://l2sdygrafana.sugidigital.org/d/ad6zlmx/line-2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s",
};
const ADMIN_STORAGE_KEY = "productionOverviewAdminUsers";
const ADMIN_ROLES = ["Admin", "Supervisor", "Line Leader", "Operator", "Viewer"];
const ADMIN_SITES = ["Port Klang", "Sendayan"];

function normalizeAdminSites(sites) {
  const list = Array.isArray(sites) ? sites : [];
  const filtered = list.filter((site) => ADMIN_SITES.includes(site));
  return filtered.length > 0 ? filtered : [ADMIN_SITES[0]];
}

function createCurrentAdminUser(user) {
  const displayName = user?.name || user?.email || "Local Admin";

  return {
    id: user?.id || user?.email || "local-admin",
    name: displayName,
    email: user?.email || "admin@local.test",
    role: "Admin",
    status: "Active",
    sites: [...ADMIN_SITES],
    lastSeen: "Signed in now",
  };
}

function sanitizeAdminUser(record, index) {
  const fallbackName = `User ${index + 1}`;
  const name = String(record?.name || fallbackName).trim();
  const email = String(record?.email || `${name.toLowerCase().replace(/\s+/g, ".")}@sugihara.local`).trim();
  const role = ADMIN_ROLES.includes(record?.role) ? record.role : "Viewer";
  const status = record?.status === "Paused" ? "Paused" : "Active";

  return {
    id: String(record?.id || `admin-user-${index}-${Date.now()}`),
    name,
    email,
    role,
    status,
    sites: normalizeAdminSites(record?.sites),
    lastSeen: record?.lastSeen || "Not yet active",
  };
}

function getInitialAdminUsers(user) {
  const currentUser = createCurrentAdminUser(user);
  const fallbackUsers = [
    currentUser,
    {
      id: "pk-supervisor",
      name: "Port Klang Supervisor",
      email: "pk.supervisor@sugihara.local",
      role: "Supervisor",
      status: "Active",
      sites: ["Port Klang"],
      lastSeen: "Today, 07:45",
    },
    {
      id: "sendayan-lead",
      name: "Sendayan Line Lead",
      email: "sendayan.lead@sugihara.local",
      role: "Line Leader",
      status: "Active",
      sites: ["Sendayan"],
      lastSeen: "Today, 07:18",
    },
    {
      id: "quality-viewer",
      name: "Quality Viewer",
      email: "quality.viewer@sugihara.local",
      role: "Viewer",
      status: "Paused",
      sites: [...ADMIN_SITES],
      lastSeen: "Yesterday, 17:10",
    },
  ];

  try {
    const savedUsers = JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEY) || "[]");
    const source = Array.isArray(savedUsers) && savedUsers.length > 0 ? savedUsers : fallbackUsers;
    const sanitized = source.map(sanitizeAdminUser);
    const hasCurrentUser = sanitized.some((adminUser) => adminUser.id === currentUser.id);

    return hasCurrentUser ? sanitized : [currentUser, ...sanitized];
  } catch {
    return fallbackUsers;
  }
}

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

function clampPercent(value) {
  return Math.max(0, Math.min(100, getNumber(value)));
}

function getLineComponents(line) {
  return {
    availability: clampPercent(getLineMetric(line, ["availability_pct", "availability_pctm"])),
    performance: clampPercent(getLineMetric(line, ["performance_pct"])),
    quality: clampPercent(getLineMetric(line, ["quality_pct"])),
  };
}

function getAverageComponents(lines) {
  if (lines.length === 0) {
    return { availability: 0, performance: 0, quality: 0 };
  }

  const totals = lines.reduce(
    (sum, line) => {
      const components = getLineComponents(line);
      return {
        availability: sum.availability + components.availability,
        performance: sum.performance + components.performance,
        quality: sum.quality + components.quality,
      };
    },
    { availability: 0, performance: 0, quality: 0 },
  );

  return {
    availability: totals.availability / lines.length,
    performance: totals.performance / lines.length,
    quality: totals.quality / lines.length,
  };
}

function createFlatHistory(value, time = Date.now()) {
  const safeValue = clampPercent(value);
  return Array.from({ length: 8 }, (_, index) => ({
    time: time - (8 - index) * 3000,
    value: safeValue,
  }));
}

function appendHistoryPoint(series = [], value, time = Date.now()) {
  const base = series.length > 0 ? series : createFlatHistory(value, time);
  return [...base, { time, value: clampPercent(value) }].slice(-HISTORY_LIMIT);
}

function appendTelemetryHistory(previous, sample) {
  const time = Date.now();
  const nextLines = ALL_LINE_IDS.reduce((acc, lineId) => {
    acc[lineId] = appendHistoryPoint(previous.lines?.[lineId], sample.lines[lineId] ?? 0, time);
    return acc;
  }, {});

  return {
    overall: appendHistoryPoint(previous.overall, sample.overall, time),
    lines: nextLines,
  };
}

function getTrendMeta(points = []) {
  if (points.length === 0) {
    return { current: 0, delta: 0, max: 0, min: 0 };
  }

  const values = points.map((point) => clampPercent(point.value));
  const current = values[values.length - 1];
  const previous = values.length > 1 ? values[values.length - 2] : current;

  return {
    current,
    delta: current - previous,
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

function getTrendGeometry(points = [], width = 420, height = 174) {
  const normalized = points.length > 0 ? points : createFlatHistory(0);
  const top = 12;
  const right = 12;
  const bottom = 22;
  const left = 16;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xStep = normalized.length > 1 ? plotWidth / (normalized.length - 1) : 0;

  const coordinates = normalized.map((point, index) => {
    const x = left + index * xStep;
    const y = top + ((100 - clampPercent(point.value)) / 100) * plotHeight;
    return { x, y, value: clampPercent(point.value) };
  });

  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const areaPath = `${linePath} L${last.x.toFixed(2)} ${height - bottom} L${first.x.toFixed(2)} ${height - bottom} Z`;

  return {
    areaPath,
    coordinates,
    grid: [25, 50, 75].map((value) => top + ((100 - value) / 100) * plotHeight),
    height,
    last,
    linePath,
    width,
  };
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

function getInitials(name) {
  return String(name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";
}

function AdminControlDrawer({
  currentUserId,
  isOpen,
  onAddUser,
  onClose,
  onRemoveUser,
  onUpdateUser,
  users,
}) {
  const [query, setQuery] = useState("");
  const [draftUser, setDraftUser] = useState({
    email: "",
    name: "",
    role: "Viewer",
    sites: [ADMIN_SITES[0]],
  });

  useEffect(() => {
    if (!isOpen) return undefined;

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
  }, [isOpen, onClose]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return users;

    return users.filter((adminUser) => {
      const haystack = [
        adminUser.name,
        adminUser.email,
        adminUser.role,
        adminUser.status,
        ...(adminUser.sites || []),
      ].join(" ").toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [query, users]);
  const activeCount = users.filter((adminUser) => adminUser.status === "Active").length;
  const adminCount = users.filter((adminUser) => adminUser.role === "Admin").length;

  function handleDraftSite(site) {
    setDraftUser((current) => {
      const currentSites = normalizeAdminSites(current.sites);
      const nextSites = currentSites.includes(site)
        ? currentSites.filter((item) => item !== site)
        : [...currentSites, site];

      return {
        ...current,
        sites: nextSites.length > 0 ? nextSites : [site],
      };
    });
  }

  function handleUserSite(userId, site) {
    const adminUser = users.find((item) => item.id === userId);
    if (!adminUser) return;

    const currentSites = normalizeAdminSites(adminUser.sites);
    const nextSites = currentSites.includes(site)
      ? currentSites.filter((item) => item !== site)
      : [...currentSites, site];

    onUpdateUser(userId, {
      sites: nextSites.length > 0 ? nextSites : [site],
    });
  }

  function handleAddUser(event) {
    event.preventDefault();

    const name = draftUser.name.trim();
    const email = draftUser.email.trim();

    if (!name || !email) return;

    onAddUser({
      id: `admin-user-${Date.now()}`,
      name,
      email,
      role: draftUser.role,
      status: "Active",
      sites: normalizeAdminSites(draftUser.sites),
      lastSeen: "New user",
    });
    setDraftUser({
      email: "",
      name: "",
      role: "Viewer",
      sites: [ADMIN_SITES[0]],
    });
    setQuery("");
  }

  return (
    <>
      <button
        className={`admin-drawer-backdrop ${isOpen ? "is-visible" : ""}`}
        type="button"
        aria-label="Close admin control"
        onClick={onClose}
      ></button>
      <aside
        className={`admin-drawer ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-control-title"
        aria-hidden={!isOpen}
      >
        <header className="admin-drawer__header">
          <div>
            <p>System users</p>
            <h2 id="admin-control-title">Admin Control</h2>
          </div>
          <button className="admin-drawer__close" type="button" aria-label="Close admin control" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div className="admin-stat-grid" aria-label="User summary">
          <span><strong>{users.length}</strong>Total</span>
          <span><strong>{activeCount}</strong>Active</span>
          <span><strong>{adminCount}</strong>Admins</span>
        </div>

        <label className="admin-search" htmlFor="admin-user-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            id="admin-user-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users"
          />
        </label>

        <form className="admin-add-user" onSubmit={handleAddUser}>
          <div className="admin-section-title">Add User</div>
          <div className="admin-form-grid">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={draftUser.name}
                onChange={(event) => setDraftUser((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={draftUser.email}
                onChange={(event) => setDraftUser((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              <span>Role</span>
              <select
                value={draftUser.role}
                onChange={(event) => setDraftUser((current) => ({ ...current, role: event.target.value }))}
              >
                {ADMIN_ROLES.map((role) => (
                  <option value={role} key={role}>{role}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-site-picker" aria-label="New user site access">
            {ADMIN_SITES.map((site) => (
              <label key={site}>
                <input
                  type="checkbox"
                  checked={normalizeAdminSites(draftUser.sites).includes(site)}
                  onChange={() => handleDraftSite(site)}
                />
                <span>{site}</span>
              </label>
            ))}
          </div>
          <button className="admin-add-user__submit" type="submit">Add User</button>
        </form>

        <div className="admin-users-list" aria-label="Managed users">
          {filteredUsers.map((adminUser) => (
            <article className="admin-user-row" key={adminUser.id}>
              <div className="admin-user-row__head">
                <span className="admin-user-avatar">{getInitials(adminUser.name)}</span>
                <div className="admin-user-identity">
                  <strong>{adminUser.name}</strong>
                  <small>{adminUser.email}</small>
                </div>
                <span className={`admin-status-badge ${adminUser.status === "Active" ? "is-active" : ""}`}>
                  {adminUser.status}
                </span>
              </div>

              <div className="admin-user-row__controls">
                <label>
                  <span>Role</span>
                  <select
                    value={adminUser.role}
                    onChange={(event) => onUpdateUser(adminUser.id, { role: event.target.value })}
                  >
                    {ADMIN_ROLES.map((role) => (
                      <option value={role} key={role}>{role}</option>
                    ))}
                  </select>
                </label>
                <button
                  className={`admin-status-toggle ${adminUser.status === "Active" ? "is-active" : ""}`}
                  type="button"
                  onClick={() => onUpdateUser(adminUser.id, { status: adminUser.status === "Active" ? "Paused" : "Active" })}
                >
                  {adminUser.status === "Active" ? "Pause" : "Activate"}
                </button>
                <button
                  className="admin-remove-user"
                  type="button"
                  disabled={adminUser.id === currentUserId}
                  onClick={() => onRemoveUser(adminUser.id)}
                >
                  Remove
                </button>
              </div>

              <div className="admin-site-picker admin-site-picker--row" aria-label={`${adminUser.name} site access`}>
                {ADMIN_SITES.map((site) => (
                  <label key={site}>
                    <input
                      type="checkbox"
                      checked={normalizeAdminSites(adminUser.sites).includes(site)}
                      onChange={() => handleUserSite(adminUser.id, site)}
                    />
                    <span>{site}</span>
                  </label>
                ))}
              </div>
              <div className="admin-user-row__meta">Last seen: {adminUser.lastSeen}</div>
            </article>
          ))}
          {filteredUsers.length === 0 && (
            <div className="admin-empty-state">No users found</div>
          )}
        </div>
      </aside>
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

function LiveTrendChart({ points, className = "", tone = "violet", compact = false }) {
  const geometry = getTrendGeometry(points, compact ? 320 : 480, compact ? 148 : 210);

  return (
    <svg
      className={`live-trend live-trend--${tone} ${compact ? "live-trend--compact" : ""} ${className}`}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label="OEE trend over time"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`trendFill-${tone}-${compact ? "compact" : "wide"}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {geometry.grid.map((y) => (
        <path className="live-trend__grid" d={`M16 ${y.toFixed(2)}H${geometry.width - 12}`} key={y} />
      ))}
      <path className="live-trend__area" d={geometry.areaPath} fill={`url(#trendFill-${tone}-${compact ? "compact" : "wide"})`} />
      <path className="live-trend__line" d={geometry.linePath} />
      <circle className="live-trend__pulse" cx={geometry.last.x} cy={geometry.last.y} r={compact ? 6 : 7} />
      <circle className="live-trend__dot" cx={geometry.last.x} cy={geometry.last.y} r={compact ? 3.4 : 4.2} />
    </svg>
  );
}

function LiveFocusPanel({ history, totalSummary, sites }) {
  const meta = getTrendMeta(history.overall);
  const deltaLabel = `${meta.delta >= 0 ? "+" : ""}${formatPercent(meta.delta)}%`;

  return (
    <section className="live-focus-panel">
      <div className="live-focus-panel__header">
        <div>
          <p>Overall OEE vs Time</p>
          <h2>Live OEE Movement</h2>
        </div>
        <div className="live-focus-panel__now">
          <span>Live</span>
          <strong>{formatPercent(totalSummary.oee)}%</strong>
        </div>
      </div>
      <LiveTrendChart points={history.overall} className="live-focus-panel__chart" />
      <div className="live-focus-panel__footer">
        <div className="live-focus-panel__stats" aria-label="OEE trend statistics">
          <span>Min <strong>{formatPercent(meta.min)}%</strong></span>
          <span>Max <strong>{formatPercent(meta.max)}%</strong></span>
          <span className={meta.delta < 0 ? "is-negative" : "is-positive"}>Delta <strong>{deltaLabel}</strong></span>
        </div>
        <div className="live-focus-panel__sites">
          {sites.map((site) => (
            <div className="live-site-pill" key={site.key}>
              <span>{site.name}</span>
              <strong>{site.oee}%</strong>
              <div className="live-site-pill__track">
                <i style={{ width: `${site.oee}%` }}></i>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
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

function MobileMetricDeck({ totalSummary, history }) {
  const meta = getTrendMeta(history.overall);
  const components = [
    { key: "A", label: "Availability", value: totalSummary.components.availability },
    { key: "P", label: "Performance", value: totalSummary.components.performance },
    { key: "Q", label: "Quality", value: totalSummary.components.quality },
  ];

  return (
    <section className="mobile-metric-deck" aria-label="Mobile production overview">
      <div className="mobile-score-card">
        <div className="mobile-card-head">
          <span>OEE vs Time</span>
          <small>Live</small>
        </div>
        <strong>{formatPercent(totalSummary.oee)}%</strong>
        <LiveTrendChart points={history.overall} compact className="mobile-oee-chart" />
        <div className="mobile-chart-meta">
          <span>Min {formatPercent(meta.min)}%</span>
          <span>Max {formatPercent(meta.max)}%</span>
        </div>
      </div>
      <div className="mobile-output-card">
        <div className="mobile-card-head">
          <span>Output</span>
          <small>{totalSummary.progress}%</small>
        </div>
        <strong>{totalSummary.actual.toLocaleString()}</strong>
        <small>{totalSummary.progress}% target</small>
        <div className="mobile-progress-track" aria-hidden="true">
          <i style={{ width: `${totalSummary.progress}%` }}></i>
        </div>
      </div>
      <div className="mobile-ring-card">
        <div className="mobile-card-head">
          <span>APQ Components</span>
          <small>OEE</small>
        </div>
        <div className="mobile-apq-layout">
          <div className="mobile-oee-ring" style={{ "--oee-angle": `${clampPercent(totalSummary.oee) * 3.6}deg` }}>
            <strong>{formatPercent(totalSummary.oee)}%</strong>
            <small>OEE</small>
          </div>
          <div className="mobile-apq-list">
            {components.map((component) => (
              <div className="mobile-apq-row" key={component.key}>
                <span>{component.key}</span>
                <div>
                  <strong>{formatPercent(component.value)}%</strong>
                  <i><b style={{ width: `${clampPercent(component.value)}%` }}></b></i>
                </div>
              </div>
            ))}
          </div>
        </div>
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
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState(() => getInitialAdminUsers(user));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState({ overall: [], lines: {} });

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
    const components = getAverageComponents(allLines);
    const oee = allLines.length > 0
      ? Math.round(allLines.reduce((sum, line) => sum + getLineOee(line), 0) / allLines.length)
      : 0;
    const progress = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

    return { actual, components, target, rejects, oee, progress, lineCount: allLines.length };
  }, [seededLines]);

  const telemetrySample = useMemo(() => {
    return {
      overall: totalSummary.oee,
      lines: ALL_LINE_IDS.reduce((acc, lineId) => {
        acc[lineId] = getLineOee(seededLines[lineId] ?? createFallbackLine(lineId));
        return acc;
      }, {}),
    };
  }, [seededLines, totalSummary.oee]);

  const telemetrySampleRef = useRef(telemetrySample);

  useEffect(() => {
    telemetrySampleRef.current = telemetrySample;
  }, [telemetrySample]);

  useEffect(() => {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(adminUsers));
  }, [adminUsers]);

  useEffect(() => {
    const sampleTelemetry = () => {
      setTelemetryHistory((previous) => appendTelemetryHistory(previous, telemetrySampleRef.current));
    };
    const initialTimer = window.setTimeout(sampleTelemetry, 0);
    const timer = window.setInterval(sampleTelemetry, 3000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

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
      setAdminOpen(false);
      return;
    }

    setProfileOpen((open) => !open);
    setAdminOpen(false);
  }

  function handleLogout() {
    setProfileOpen(false);
    setAdminOpen(false);
    setMobileNavOpen(false);
    if (onLogout) onLogout();
  }

  function handleAddAdminUser(adminUser) {
    setAdminUsers((currentUsers) => [...currentUsers, sanitizeAdminUser(adminUser, currentUsers.length)]);
  }

  function handleUpdateAdminUser(userId, updates) {
    setAdminUsers((currentUsers) => (
      currentUsers.map((adminUser, index) => (
        adminUser.id === userId
          ? sanitizeAdminUser({ ...adminUser, ...updates }, index)
          : adminUser
      ))
    ));
  }

  function handleRemoveAdminUser(userId) {
    setAdminUsers((currentUsers) => currentUsers.filter((adminUser) => adminUser.id !== userId));
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
      <AdminControlDrawer
        currentUserId={createCurrentAdminUser(user).id}
        isOpen={adminOpen}
        onAddUser={handleAddAdminUser}
        onClose={() => setAdminOpen(false)}
        onRemoveUser={handleRemoveAdminUser}
        onUpdateUser={handleUpdateAdminUser}
        users={adminUsers}
      />
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
              setAdminOpen(false);
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
            <button
              className={adminOpen ? "is-active" : ""}
              type="button"
              aria-label="Admin control"
              aria-pressed={adminOpen}
              onClick={() => {
                setAdminOpen((open) => !open);
                setProfileOpen(false);
                setMobileNavOpen(false);
              }}
            >
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
            <MobileMetricDeck totalSummary={totalSummary} history={telemetryHistory} />

            <section className="dashboard-title-row">
              <div>
                <p className="dashboard-eyebrow">Live OEE timeline</p>
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
                <LiveFocusPanel history={telemetryHistory} totalSummary={totalSummary} sites={siteSummaries} />
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
