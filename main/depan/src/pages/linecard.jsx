  const STATUS_CONFIG = {
    normal: { label: "Running", bg: "#1fcb6b", fg: "#06210f", pulse: true },
    running: { label: "Running", bg: "#1fcb6b", fg: "#06210f", pulse: true },
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

  function getLineValue(line, keys, fallback = 0) {
    for (const key of keys) {
      if (line?.[key] !== undefined && line?.[key] !== null) return line[key];
    }
    return fallback;
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function LineCard({ lineId, line, onClick }) {
    const status = getLineValue(line, ["status", "mode", "machine_mode"], "offline");
    const count = toNumber(getLineValue(line, ["product_count", "count"], 0));
    const target = toNumber(getLineValue(line, ["target", "hourly_plan"], 0));
    const reject = toNumber(getLineValue(line, ["product_reject", "reject"], 0));
    const oee = toNumber(getLineValue(line, ["oee"], 0));
    const progress = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
    const cfg = getStatusConfig(status);

    return (
      <button
        className="line-card"
        type="button"
        style={{ "--status-color": cfg.bg }}
        onClick={onClick}
        aria-label={`Open ${line?.line_id ?? lineId} details`}
      >
        <div className="line-card__body">
          <div className="line-card__top">
            <div>
              <span className="line-id-label">Line</span>
              <span className="line-id-value">{line?.line_id ?? lineId}</span>
            </div>
            <div className="oee">
              <span className="oee-label">OEE</span>
              <span className="oee-value">{oee}%</span>
            </div>
          </div>

          <div
            className="status-bar"
            data-pulse={cfg.pulse}
            style={{ background: cfg.bg, color: cfg.fg }}
          >
            <span className="status-dot"></span>
            {cfg.label}
          </div>

          <div className="progress-block">
            <div className="progress-head">
              <span className="progress-label">Progress</span>
              <span className="progress-pct">{progress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Count / Target</span>
              <span className="stat-value">
                {count.toLocaleString()} / {target.toLocaleString()}
              </span>
            </div>
            <div className={`stat stat--reject ${reject === 0 ? "is-zero" : ""}`}>
              <span className="stat-label">Reject</span>
              <span className="stat-value">{reject.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  export default LineCard;
