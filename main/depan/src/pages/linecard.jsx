import { memo } from "react";

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
    offline: { label: "Offline", bg: "#94a3b8", fg: "#0b111a" },
  };//planned_stop(light_red),normal(running),model_change(biru),downtime(red),rest(kuning)

  function getStatusConfig(status) {
    const key = String(status || "offline").trim().toLowerCase().replace(/[\s-]+/g, "_");
    return STATUS_CONFIG[key] || {
      label: status || "Unknown",
      bg: "#94a3b8",
      fg: "#0b111a",
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

  function formatPercent(value) {
    const number = toNumber(value);
    const rounded = Number(number.toFixed(1));
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function calculateOee(explicitOee, availability, performance, quality) {
    if (explicitOee > 0) return explicitOee;
    if (availability > 0 || performance > 0 || quality > 0) {
      return (availability * performance * quality) / 10000;
    }
    return 0;
  }

  function getOeeColor(oee) {
    if (oee >= 80) return "#20d487";
    if (oee >= 30) return "#f3b64d";
    return "#ef3f5f";
  }

  function LineCard({ lineId, line, onSelectLine }) {
    const status = getLineValue(line, ["machine_mode", "mode", "status"], "offline");
    const count = toNumber(getLineValue(line, ["product_count", "count"], 0));
    const target = toNumber(getLineValue(line, ["target", "hourly_plan"], 0));
    const reject = toNumber(getLineValue(line, ["product_reject", "reject"], 0));
    const explicitOee = toNumber(getLineValue(line, ["oee"], 0));
    const model = getLineValue(line, ["model"], "No model");
    const availability = toNumber(getLineValue(line, ["availability_pct", "availability_pctm"], 0));
    const performance = toNumber(getLineValue(line, ["performance_pct"], 0));
    const quality = toNumber(getLineValue(line, ["quality_pct"], 0));
    const oee = calculateOee(explicitOee, availability, performance, quality);
    const oeeDisplay = formatPercent(oee);
    const availabilityDisplay = formatPercent(availability);
    const performanceDisplay = formatPercent(performance);
    const qualityDisplay = formatPercent(quality);
    const progress = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
    const cfg = getStatusConfig(status);
    const ringValue = Math.max(0, Math.min(100, oee)) * 3.6;
    const oeeColor = getOeeColor(oee);

    return (
      <button
        className="line-card"
        type="button"
        style={{ "--status-color": cfg.bg, "--status-fg": cfg.fg, "--oee-color": oeeColor, "--oee-angle": `${ringValue}deg` }}
        onClick={() => onSelectLine(lineId)}
        aria-label={`Open ${line?.line_id ?? lineId} details`}
      >
        <span className="line-card__shine" aria-hidden="true"></span>
        <div className="line-card__body">
          <div className="line-card__top">
            <div>
              <span className="line-id-label">Line</span>
              <span className="line-id-value">{line?.line_id ?? lineId}</span>
            </div>
            <div className="oee-ring" data-value-size={oeeDisplay.length > 3 ? "compact" : "normal"} aria-label={`OEE ${oeeDisplay}%`}>
              <span className="oee-value" key={oeeDisplay}>{oeeDisplay}%</span>
              <span className="oee-label">OEE</span>
            </div>
          </div>

          <div className="line-model-panel">
            <span className="line-model-label">Current Model</span>
            <span className="line-model-value">{model}</span>
          </div>

          <div className="status-panel">
            <span className="status-panel__label">Mode</span>
            <span className="status-panel__value">{cfg.label}</span>
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

          <div className="metric-strip" aria-label="OEE components">
            <div>
              <span>A</span>
              <strong className="metric-value" key={`a-${availabilityDisplay}`}>{availabilityDisplay}%</strong>
            </div>
            <div>
              <span>P</span>
              <strong className="metric-value" key={`p-${performanceDisplay}`}>{performanceDisplay}%</strong>
            </div>
            <div>
              <span>Q</span>
              <strong className="metric-value" key={`q-${qualityDisplay}`}>{qualityDisplay}%</strong>
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

  export default memo(LineCard);
