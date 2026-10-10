"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import atlas from "./data/atlas.json";

type Lens = "I/O" | "Task" | "Scope" | "Model" | "Metric" | "Pattern";
type ScoreMode = "raw" | "normalized";
type FieldColorMode = "Pattern" | "I/O family" | "Operation" | "Scope";
type FieldXMode = "progress" | "shots" | "logShots";
type WorkspaceView = "comparison" | "evidence" | "pipeline";
type Trajectory = (typeof atlas.trajectories)[number];
type ResultPoint = Trajectory["results"][number];

const lenses: Lens[] = ["I/O", "Task", "Scope", "Model", "Metric", "Pattern"];

const patternColors: Record<string, string> = {
  "Monotonic improvement": "#3f6b58",
  "Monotonic decline": "#864b50",
  "Improve then decline": "#80663c",
  "Decline then recover": "#59627d",
  "Mixed / non-monotonic": "#526c79",
  "Flat / stable": "#72787b",
  "Two-point improvement": "#4f716f",
  "Two-point decline": "#7d5b54",
  "Insufficient points": "#6d7275",
};

function valueForLens(trajectory: Trajectory, lens: Lens) {
  if (lens === "I/O") return trajectory.ioFamily;
  if (lens === "Task") return trajectory.taskGroup;
  if (lens === "Scope") return trajectory.semanticScope;
  if (lens === "Model") return trajectory.modelType;
  if (lens === "Metric") return trajectory.metricGroup;
  return trajectory.category;
}

const fieldPalette = ["#3f5f78", "#596c7c", "#6b5b73", "#4d6d68", "#74694f", "#6e5960", "#557080", "#776956", "#5f6d77", "#68745f"];

function stableColor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return fieldPalette[Math.abs(hash) % fieldPalette.length];
}

function fieldGroup(trajectory: Trajectory, mode: FieldColorMode) {
  if (mode === "Pattern") return trajectory.category;
  if (mode === "I/O family") return trajectory.ioFamily;
  if (mode === "Scope") return trajectory.semanticScope;
  return trajectory.semanticOperation;
}

function fieldColor(trajectory: Trajectory, mode: FieldColorMode) {
  const group = fieldGroup(trajectory, mode);
  return mode === "Pattern" ? (patternColors[group] ?? stableColor(group)) : stableColor(group);
}

function topGroupForLens(lens: Lens) {
  const counts = new Map<string, number>();
  for (const trajectory of atlas.trajectories) {
    const key = valueForLens(trajectory, lens);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function formatNumber(value: number | string | null, digits = 2) {
  if (value === null || value === "") return "NA";
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function formatDelta(value: number | null) {
  if (value === null) return "NA";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(Math.abs(value) < 1 ? 3 : 1)}`;
}


function TrajectoryChart({ trajectory }: { trajectory: Trajectory }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ScoreMode>("raw");
  const [hovered, setHovered] = useState<number | null>(null);

  const numericPoints = useMemo(() => {
    return trajectory.results
      .map((point) => {
        const score = mode === "raw" ? point.rawScore : point.analysisScore;
        if (typeof point.shotCount !== "number" || typeof score !== "number") return null;
        return { shot: point.shotCount, score, source: point };
      })
      .filter((point): point is { shot: number; score: number; source: ResultPoint } => point !== null);
  }, [mode, trajectory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = chartRef.current;
    if (!canvas || !container || numericPoints.length === 0) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const render = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(260, rect.width);
      const height = Math.max(240, rect.height);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const pad = { left: 46, right: 18, top: 24, bottom: 38 };
      const plotWidth = width - pad.left - pad.right;
      const plotHeight = height - pad.top - pad.bottom;
      const shots = numericPoints.map((point) => point.shot);
      const scores = numericPoints.map((point) => point.score);
      const minShot = Math.min(...shots);
      const maxShot = Math.max(...shots);
      let minScore = Math.min(...scores);
      let maxScore = Math.max(...scores);
      if (minScore === maxScore) {
        minScore -= Math.abs(minScore || 1) * 0.05;
        maxScore += Math.abs(maxScore || 1) * 0.05;
      }
      const scorePadding = (maxScore - minScore) * 0.12;
      minScore -= scorePadding;
      maxScore += scorePadding;
      const xFor = (shot: number) => pad.left + ((shot - minShot) / Math.max(1, maxShot - minShot)) * plotWidth;
      const yFor = (score: number) => pad.top + (1 - (score - minScore) / (maxScore - minScore)) * plotHeight;

      context.font = "10px Arial";
      context.textBaseline = "middle";
      for (let index = 0; index < 4; index += 1) {
        const ratio = index / 3;
        const y = pad.top + ratio * plotHeight;
        const label = maxScore - ratio * (maxScore - minScore);
        context.strokeStyle = "rgba(255,255,255,.11)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(pad.left, y);
        context.lineTo(width - pad.right, y);
        context.stroke();
        context.fillStyle = "rgba(255,255,255,.48)";
        context.textAlign = "right";
        context.fillText(formatNumber(label, Math.abs(label) < 2 ? 3 : 1), pad.left - 8, y);
      }

      context.textAlign = "center";
      for (const point of numericPoints) {
        context.fillStyle = "rgba(255,255,255,.48)";
        context.fillText(String(point.shot), xFor(point.shot), height - 18);
      }

      const accent = patternColors[trajectory.category] ?? "#8aa0ad";
      context.strokeStyle = accent;
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(xFor(numericPoints[0].shot), yFor(numericPoints[0].score));
      for (let index = 1; index < numericPoints.length; index += 1) {
        context.lineTo(xFor(numericPoints[index].shot), yFor(numericPoints[index].score));
      }
      context.stroke();

      numericPoints.forEach((point, index) => {
        const active = hovered === index;
        context.fillStyle = active ? "#ffffff" : accent;
        context.strokeStyle = "#102a30";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(xFor(point.shot), yFor(point.score), 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      });
    };

    render();

    let resizeFrame = 0;
    const handleResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(render);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, [hovered, mode, numericPoints, trajectory.category, trajectory.trajectoryId]);

  function handlePointer(event: React.PointerEvent<HTMLDivElement>) {
    if (numericPoints.length === 0 || !chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const padLeft = 46;
    const plotWidth = rect.width - padLeft - 18;
    const shots = numericPoints.map((point) => point.shot);
    const minShot = Math.min(...shots);
    const maxShot = Math.max(...shots);
    const pointerX = event.clientX - rect.left;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    numericPoints.forEach((point, index) => {
      const x = padLeft + ((point.shot - minShot) / Math.max(1, maxShot - minShot)) * plotWidth;
      if (Math.abs(pointerX - x) < distance) {
        distance = Math.abs(pointerX - x);
        nearest = index;
      }
    });
    setHovered(nearest);
  }

  const hoveredPoint = hovered === null ? null : numericPoints[hovered];

  return (
    <div className="chart-block">
      <div className="chart-toolbar">
        <div>
          <span className="chart-kicker">Score trajectory</span>
          <strong>{mode === "raw" ? trajectory.metric : "Direction-normalized score"}</strong>
        </div>
        <div className="score-toggle" role="group" aria-label="Chart score mode">
          <button className={mode === "raw" ? "active" : ""} type="button" onClick={() => setMode("raw")}>Raw</button>
          <button className={mode === "normalized" ? "active" : ""} type="button" onClick={() => setMode("normalized")}>Normalized</button>
        </div>
      </div>
      <div
        className="trajectory-chart"
        ref={chartRef}
        onPointerMove={handlePointer}
        onPointerLeave={() => setHovered(null)}
      >
        <canvas ref={canvasRef} aria-label={`${trajectory.metric} by shot count for ${trajectory.modelName}`} />
        {hoveredPoint ? (
          <div className="chart-tooltip">
            <span>{hoveredPoint.shot} shots</span>
            <strong>{formatNumber(hoveredPoint.score, 3)}</strong>
          </div>
        ) : null}
      </div>
      <div className="axis-caption"><span>Score</span><span>Shot count</span></div>
      <table className="sr-only">
        <caption>Shot-count scores</caption>
        <thead><tr><th>Shots</th><th>Score</th></tr></thead>
        <tbody>{numericPoints.map((point) => <tr key={point.shot}><td>{point.shot}</td><td>{point.score}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function TrajectoryDetail({
  trajectory,
  onDataNotes,
  onOpenEvidence,
}: {
  trajectory: Trajectory;
  onDataNotes: () => void;
  onOpenEvidence?: (trajectory: Trajectory) => void;
}) {
  return (
    <div className="inspector-content" key={trajectory.trajectoryId}>
      <div className="pattern-pill" style={{ "--pattern": patternColors[trajectory.category] } as React.CSSProperties}><span /> {trajectory.category}</div>
      <h2>{trajectory.modelName}</h2>
      <p className="preview-context">{trajectory.task}<br />{trajectory.dataset} · {trajectory.metric}</p>
      <TrajectoryChart trajectory={trajectory} />

      <div className="preview-details">
        <div><span>Baseline</span><strong>{formatNumber(trajectory.baselineRawScore, 3)}</strong></div>
        <div><span>Endpoint</span><strong>{formatNumber(trajectory.endpointRawScore, 3)}</strong></div>
        <div><span>Conditions</span><strong>{trajectory.numberOfConditions}</strong></div>
      </div>

      <div className="shot-table-wrap">
        <div className="detail-heading"><span>Reported shot setup</span><span>{trajectory.metricDirection?.replaceAll("_", " ")}</span></div>
        <table className="shot-table">
          <thead><tr><th>Shots</th><th>Raw score</th><th>Step Δ</th></tr></thead>
          <tbody>
            {trajectory.results.map((point, index) => (
              <tr key={`${point.shotCount}-${index}`}><td>{point.shotCount ?? "NA"}</td><td>{formatNumber(point.rawScore ?? point.rawScoreReported, 3)}</td><td>{formatNumber(point.stepChange, 3)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {trajectory.statisticalTests.length > 0 ? (
        <div className="stat-note">
          <span>Reported statistics</span>
          <strong>{trajectory.statisticalTests[0].testName ?? "Statistical comparison"}</strong>
          <p>{trajectory.statisticalTests[0].description ?? trajectory.statisticalTests[0].interpretation ?? "See the paper for the reported comparison."}</p>
        </div>
      ) : <div className="stat-note muted-note"><span>Reported statistics</span><p>No trajectory-linked significance claim is recorded for this setup.</p></div>}

      <div className="inspector-actions">
        {trajectory.resultTableLink ? <a className="source-button" href={trajectory.resultTableLink} target="_blank" rel="noreferrer">Open table in paper</a> : null}
        <button className="method-button" type="button" onClick={onDataNotes}>Methodology</button>
        {onOpenEvidence ? <button className="evidence-button" type="button" onClick={() => onOpenEvidence(trajectory)}>Open source evidence</button> : null}
      </div>
    </div>
  );
}

function quantile(values: number[], position: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function TrajectoryField({
  trajectories,
  selectedTrajectoryId,
  onSelect,
  embedded = false,
}: {
  trajectories: Trajectory[];
  selectedTrajectoryId: string;
  onSelect: (trajectory: Trajectory) => void;
  embedded?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [colorMode, setColorMode] = useState<FieldColorMode>("Pattern");
  const [xMode, setXMode] = useState<FieldXMode>("progress");
  const [inputFilter, setInputFilter] = useState("All inputs");
  const [outputFilter, setOutputFilter] = useState("All outputs");
  const [showMedian, setShowMedian] = useState(true);
  const [hoveredId, setHoveredId] = useState("");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; trajectory: Trajectory; score: number; shot: number } | null>(null);

  const inputTypes = useMemo(() => [...new Set(trajectories.map((item) => item.inputType))].sort(), [trajectories]);
  const outputTypes = useMemo(() => [...new Set(trajectories.map((item) => item.outputType))].sort(), [trajectories]);

  const prepared = useMemo(() => trajectories
    .filter((trajectory) => inputFilter === "All inputs" || trajectory.inputType === inputFilter)
    .filter((trajectory) => outputFilter === "All outputs" || trajectory.outputType === outputFilter)
    .map((trajectory) => {
      const rawPoints = trajectory.results
        .map((point) => typeof point.shotCount === "number" && typeof point.analysisScore === "number"
          ? { shot: point.shotCount, analysisScore: point.analysisScore }
          : null)
        .filter((point): point is { shot: number; analysisScore: number } => point !== null)
        .sort((a, b) => a.shot - b.shot);
      if (rawPoints.length < 2) return null;
      const baseline = rawPoints[0].analysisScore;
      const largestChange = Math.max(...rawPoints.map((point) => Math.abs(point.analysisScore - baseline)));
      const minShot = rawPoints[0].shot;
      const maxShot = rawPoints[rawPoints.length - 1].shot;
      return {
        trajectory,
        minShot,
        maxShot,
        points: rawPoints.map((point) => ({
          shot: point.shot,
          score: largestChange === 0 ? 0 : (point.analysisScore - baseline) / largestChange,
          progress: (point.shot - minShot) / Math.max(1, maxShot - minShot),
        })),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null), [inputFilter, outputFilter, trajectories]);

  const medianSeries = useMemo(() => {
    const interpolate = (points: (typeof prepared)[number]["points"], progress: number) => {
      if (progress <= points[0].progress) return points[0].score;
      if (progress >= points[points.length - 1].progress) return points[points.length - 1].score;
      for (let index = 1; index < points.length; index += 1) {
        if (progress <= points[index].progress) {
          const previous = points[index - 1];
          const current = points[index];
          const ratio = (progress - previous.progress) / Math.max(0.0001, current.progress - previous.progress);
          return previous.score + (current.score - previous.score) * ratio;
        }
      }
      return 0;
    };
    return Array.from({ length: 21 }, (_, index) => {
      const progress = index / 20;
      const values = prepared.map((item) => interpolate(item.points, progress));
      return { progress, lower: quantile(values, 0.25), median: quantile(values, 0.5), upper: quantile(values, 0.75) };
    });
  }, [prepared]);

  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of prepared) {
      const group = fieldGroup(item.trajectory, colorMode);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [colorMode, prepared]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || prepared.length === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;
    let resizeFrame = 0;
    const maxGlobalShot = Math.max(...prepared.flatMap((item) => item.points.map((point) => point.shot)), 1);

    const draw = (revealProgress: number) => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, rect.width);
      const height = Math.max(390, rect.height);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const pad = { left: 55, right: 22, top: 28, bottom: 44 };
      const plotWidth = width - pad.left - pad.right;
      const plotHeight = height - pad.top - pad.bottom;
      const shotPosition = (shot: number) => xMode === "logShots"
        ? Math.log1p(Math.max(0, shot)) / Math.log1p(maxGlobalShot)
        : shot / maxGlobalShot;
      const xFor = (point: { shot: number; progress: number }) => pad.left + (xMode === "progress" ? point.progress : shotPosition(point.shot)) * plotWidth;
      const yFor = (score: number) => pad.top + (1 - (score + 1) / 2) * plotHeight;

      context.font = "11px Arial";
      context.textBaseline = "middle";
      [-1, -0.5, 0, 0.5, 1].forEach((value) => {
        const y = yFor(value);
        context.strokeStyle = value === 0 ? "rgba(220,227,232,.45)" : "rgba(255,255,255,.10)";
        context.lineWidth = value === 0 ? 1.4 : 1;
        context.beginPath();
        context.moveTo(pad.left, y);
        context.lineTo(width - pad.right, y);
        context.stroke();
        context.fillStyle = "rgba(255,255,255,.48)";
        context.textAlign = "right";
        context.fillText(value > 0 ? `+${value}` : String(value), pad.left - 9, y);
      });

      context.textAlign = "center";
      const xTicks = xMode === "progress"
        ? [0, 0.25, 0.5, 0.75, 1].map((value) => ({ position: value, label: `${Math.round(value * 100)}%` }))
        : xMode === "logShots"
          ? [...new Set([0, 1, 2, 4, 8, 16, 32, 64, 128, maxGlobalShot].filter((value) => value <= maxGlobalShot))]
            .map((value) => ({ position: shotPosition(value), label: String(value) }))
          : [0, 0.25, 0.5, 0.75, 1].map((value) => ({ position: value, label: String(Math.round(value * maxGlobalShot)) }));
      xTicks.forEach(({ position, label }) => {
        const x = pad.left + position * plotWidth;
        context.fillStyle = "rgba(255,255,255,.48)";
        context.fillText(label, x, height - 18);
      });

      if (showMedian && xMode === "progress" && medianSeries.length) {
        context.fillStyle = "rgba(220,227,232,.10)";
        context.beginPath();
        medianSeries.forEach((point, index) => {
          const x = pad.left + point.progress * plotWidth;
          const y = yFor(point.upper * revealProgress);
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        [...medianSeries].reverse().forEach((point) => context.lineTo(pad.left + point.progress * plotWidth, yFor(point.lower * revealProgress)));
        context.closePath();
        context.fill();
      }

      const ordered = [...prepared].sort((a, b) => {
        const aActive = a.trajectory.trajectoryId === hoveredId || a.trajectory.trajectoryId === selectedTrajectoryId;
        const bActive = b.trajectory.trajectoryId === hoveredId || b.trajectory.trajectoryId === selectedTrajectoryId;
        return Number(aActive) - Number(bActive);
      });
      for (const item of ordered) {
        const isHovered = item.trajectory.trajectoryId === hoveredId;
        const isSelected = item.trajectory.trajectoryId === selectedTrajectoryId;
        const dimmed = Boolean(hoveredId) && !isHovered;
        context.strokeStyle = fieldColor(item.trajectory, colorMode);
        context.globalAlpha = isHovered ? 1 : isSelected ? 0.9 : dimmed ? 0.035 : 0.16;
        context.lineWidth = isHovered ? 3.2 : isSelected ? 2.4 : 1;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        item.points.forEach((point, index) => {
          const x = xFor(point);
          const y = yFor(point.score * revealProgress);
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.stroke();
      }
      context.globalAlpha = 1;

      if (showMedian && xMode === "progress" && medianSeries.length) {
        context.strokeStyle = "#dce3e8";
        context.lineWidth = 2.8;
        context.beginPath();
        medianSeries.forEach((point, index) => {
          const x = pad.left + point.progress * plotWidth;
          const y = yFor(point.median * revealProgress);
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.stroke();
      }
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const animate = (time: number) => {
      const linear = reduced ? 1 : Math.min(1, (time - start) / 800);
      draw(1 - Math.pow(1 - linear, 4));
      if (linear < 1) animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => draw(1));
    });
    resizeObserver.observe(container);
    return () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
    };
  }, [colorMode, hoveredId, medianSeries, prepared, selectedTrajectoryId, showMedian, xMode]);

  function nearestTrajectory(event: React.PointerEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!container || prepared.length === 0) return null;
    const rect = container.getBoundingClientRect();
    const pad = { left: 55, right: 22, top: 28, bottom: 44 };
    const plotWidth = rect.width - pad.left - pad.right;
    const plotHeight = rect.height - pad.top - pad.bottom;
    const maxGlobalShot = Math.max(...prepared.flatMap((item) => item.points.map((point) => point.shot)), 1);
    let nearest: { distance: number; trajectory: Trajectory; score: number; shot: number } | null = null;
    for (const item of prepared) {
      for (const point of item.points) {
        const shotPosition = xMode === "logShots"
          ? Math.log1p(Math.max(0, point.shot)) / Math.log1p(maxGlobalShot)
          : point.shot / maxGlobalShot;
        const x = pad.left + (xMode === "progress" ? point.progress : shotPosition) * plotWidth;
        const y = pad.top + (1 - (point.score + 1) / 2) * plotHeight;
        const distance = Math.hypot(event.clientX - rect.left - x, event.clientY - rect.top - y);
        if (!nearest || distance < nearest.distance) nearest = { distance, trajectory: item.trajectory, score: point.score, shot: point.shot };
      }
    }
    return nearest && nearest.distance <= 24 ? nearest : null;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const nearest = nearestTrajectory(event);
    if (!nearest) {
      setHoveredId("");
      setTooltip(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredId(nearest.trajectory.trajectoryId);
    setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, trajectory: nearest.trajectory, score: nearest.score, shot: nearest.shot });
  }

  const paperCount = new Set(prepared.map((item) => item.trajectory.paperId)).size;
  const routeCount = new Set(prepared.map((item) => item.trajectory.ioFamily)).size;

  return (
    <section className={`trajectory-field inview ${embedded ? "embedded-field" : ""}`} aria-labelledby="trajectory-field-title">
      <div className="field-heading">
        <div>
          <span className="section-kicker">Normalized trajectory comparison</span>
          <h2 id="trajectory-field-title">Trajectory shapes across experiments</h2>
          <p>Each trajectory subtracts its first score, then divides by its largest absolute change. Scores are sign-normalized so positive values always indicate improvement. This compares trajectory shape, not effect size.</p>
        </div>
        <div className="field-summary" aria-label="Visible data summary">
          <div><strong>{prepared.length}</strong><span>trajectories</span></div>
          <div><strong>{paperCount}</strong><span>papers</span></div>
          <div><strong>{routeCount}</strong><span>I/O routes</span></div>
        </div>
      </div>

      <div className="field-controls">
        <label><span>Input</span><select value={inputFilter} onChange={(event) => setInputFilter(event.target.value)}><option>All inputs</option>{inputTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Output</span><select value={outputFilter} onChange={(event) => setOutputFilter(event.target.value)}><option>All outputs</option>{outputTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Color</span><select value={colorMode} onChange={(event) => setColorMode(event.target.value as FieldColorMode)}><option>Pattern</option><option>I/O family</option><option>Operation</option><option>Scope</option></select></label>
        <div className="field-segment" role="group" aria-label="Horizontal axis">
          <span>X-axis</span>
          <button type="button" className={xMode === "progress" ? "active" : ""} onClick={() => setXMode("progress")}>Progress</button>
          <button type="button" className={xMode === "shots" ? "active" : ""} onClick={() => setXMode("shots")}>Shots</button>
          <button type="button" className={xMode === "logShots" ? "active" : ""} onClick={() => setXMode("logShots")}>Log shots</button>
        </div>
        <button type="button" className={`median-toggle ${showMedian ? "active" : ""}`} onClick={() => setShowMedian((value) => !value)} aria-pressed={showMedian}>Median + middle 50%</button>
      </div>

      <div
        className="field-canvas"
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label="Interactive trajectory field. Select a highlighted trajectory to inspect it."
        onPointerMove={handlePointerMove}
        onPointerLeave={() => { setHoveredId(""); setTooltip(null); }}
        onClick={() => { const selected = prepared.find((item) => item.trajectory.trajectoryId === hoveredId); if (selected) onSelect(selected.trajectory); }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          const selected = prepared.find((item) => item.trajectory.trajectoryId === hoveredId) ?? prepared[0];
          if (selected) onSelect(selected.trajectory);
        }}
      >
        <canvas ref={canvasRef} aria-label={`Normalized shapes for ${prepared.length} experimental trajectories`} />
        <div className="field-y-label" aria-hidden="true">Normalized shape</div>
        <div className="field-x-label" aria-hidden="true">{xMode === "progress" ? "Relative shot progression" : xMode === "logShots" ? "Reported shot count · log(1 + shots)" : "Reported shot count"}</div>
        {tooltip ? (
          <div className="field-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            <span>{tooltip.trajectory.taskSubtype} · {tooltip.shot} shots</span>
            <strong>{tooltip.trajectory.modelName}</strong>
            <small>{tooltip.trajectory.ioFamily} · shape {tooltip.score > 0 ? "+" : ""}{tooltip.score.toFixed(2)}</small>
          </div>
        ) : null}
      </div>

      <div className="field-legend" aria-label={`Legend colored by ${colorMode}`}>
        {legend.map(([name, count]) => <span key={name}><i style={{ background: colorMode === "Pattern" ? (patternColors[name] ?? stableColor(name)) : stableColor(name) }} />{name}<small>{count}</small></span>)}
      </div>
      <p className="field-footnote">A single paper may contribute many trajectories across models, datasets, and metrics, so trajectory counts are not independent study counts. The logarithmic axis uses log(1 + shots) to retain zero-shot observations.</p>
    </section>
  );
}

const pipelineStages = [
  {
    number: "01",
    title: "Candidate list",
    conciseInput: "Candidate-paper CSV with ACL Anthology IDs, titles, PDF URLs, and detected shot-count terms.",
    conciseProcedure: "Read each record in source order and pass it to PDF review. Candidate status is not treated as an inclusion decision.",
    conciseOutput: "Ordered paper IDs for local screening.",
    input: [
      ["acl_multishot_high_precision.csv", "One row per candidate paper, with its ACL Anthology ID, title, PDF URL, and shot-count terms detected in the full text."],
    ],
    output: [
      ["Candidate IDs", "The papers passed to local PDF screening in their recorded order."],
    ],
    steps: [
      "Read the candidate-paper CSV.",
      "Locate the PDF associated with each ACL Anthology ID.",
      "Treat every row as a paper requiring further review; a row in this file is not an inclusion decision.",
    ],
    files: [
      ["acl_multishot_high_precision.csv", "Candidate-paper metadata and detected shot-count terms."],
    ],
  },
  {
    number: "02",
    title: "PDF page screening",
    conciseInput: "Candidate PDFs and paper metadata.",
    conciseProcedure: "Extract page text and rank pages using explicit shot labels, demonstration terms, metric names, table references, statistical terms, and numeric structure.",
    conciseOutput: "Paper-level screening status and ranked candidate pages with source links.",
    input: [
      ["Paper PDFs", "The locally stored PDF for each candidate paper."],
      ["Candidate metadata", "Paper ID, title, PDF URL, and shot-count terms from the candidate CSV."],
    ],
    output: [
      ["paper_screening.csv", "One screening status per paper: candidate_table_review, ambiguous_review, or low_evidence."],
      ["page_candidates.csv", "The selected PDF pages, matched features, page score, and source-page URL."],
      ["screening_summary.json", "Counts of papers and candidate pages produced by the screen."],
    ],
    steps: [
      "Extract text from every PDF page.",
      "Count explicit shot labels, demonstration terms, metric names, table or figure references, statistical terms, and numeric lines.",
      "Assign a page score from those counts. High-priority pages require a score of at least 38 and at least two detected shot counts; the medium and low thresholds are 20 and 10.",
      "Retain the highest-scoring pages and adjacent pages for table extraction.",
      "Use the status only to order later review. This stage does not include or exclude a paper from the dataset.",
    ],
    files: [
      ["local_pipeline/run_local_pipeline.sh", "Runs the page-screening and structural-extraction scripts."],
      ["local_pipeline/screen_local.py", "Calculates page features, scores pages, and writes the screening outputs."],
    ],
  },
  {
    number: "03",
    title: "Table detection and excerpt preparation",
    conciseInput: "Ranked PDF pages, layout-preserving text, and detected shot counts.",
    conciseProcedure: "Retain table passages only when numeric cells align with multiple shot-count columns; route ambiguous passages to manual review.",
    conciseOutput: "Table blocks, a manual-review queue, and one bounded evidence excerpt per paper.",
    input: [
      ["page_candidates.csv", "Candidate page numbers and their source-page links."],
      ["Candidate PDF pages", "Layout-preserving text extracted from the selected pages."],
      ["Detected shot counts", "Shot-count terms recorded for the paper during earlier screening."],
    ],
    output: [
      ["table_blocks.csv", "Detected table or figure passages, captions, shot columns, metric terms, and source locations."],
      ["manual_review_queue.csv", "Blocks that could not be converted safely into aligned result rows."],
      ["contexts/*.txt", "A compact excerpt for each paper containing bibliographic text, candidate tables, and statistical passages."],
      ["compact_manifest.csv", "The ordered list of compact excerpts available for semantic review."],
    ],
    steps: [
      "Find lines containing at least two distinct shot-count columns.",
      "Test whether numeric cells align with those columns in the PDF layout text.",
      "Record the nearest table or figure caption, metric terms, page number, and source link.",
      "Do not convert rows with ambiguous alignment, multiple caption metrics, or mismatched shot columns into accepted result rows.",
      "Combine the retained table text with the title, abstract, detected shot counts, and up to two statistical passages.",
    ],
    files: [
      ["local_pipeline/extract_local.py", "Detects shot-count columns and aligned numeric rows in PDF layout text."],
      ["local_pipeline/prepare_compact_queue.py", "Builds one bounded evidence excerpt per paper."],
    ],
  },
  {
    number: "04",
    title: "Eligibility review and result extraction",
    conciseInput: "Paper evidence excerpts and the extraction schema.",
    conciseProcedure: "Verify that shots are prompt demonstrations and require exact comparable scores for at least two shot counts. Preserve reported uncertainty, statistics, and source locations.",
    conciseOutput: "Paper decisions, trajectory records, shot-level results, and batch workbooks.",
    input: [
      ["compact_manifest.csv", "The papers awaiting review and the path to each compact excerpt."],
      ["contexts/*.txt", "The text supplied for each paper: title, abstract, table passages, page numbers, and statistical passages."],
      ["Extraction schema", "The required fields and allowed values for paper decisions, trajectories, scores, statistics, and source locations."],
    ],
    output: [
      ["extraction.json", "For each paper: include, exclude, or uncertain; the reason; and any supported trajectories."],
      ["batch_extracted_rows.csv", "One row per extracted task, dataset, model, metric, and source-table combination."],
      ["batch_paper_review.csv", "One decision record for every paper processed in the batch."],
      ["batch_extracted_rows.xlsx", "The batch results and paper decisions in workbook form."],
    ],
    steps: [
      "Confirm that the reported shot count is the number of demonstrations placed in the prompt.",
      "Require exact numeric results for at least two shot counts with task, dataset, model, metric, and source table held constant.",
      "Exclude comparisons that change training data, model weights, retrieval depth, label count, or another intervention instead of prompt demonstration count.",
      "Copy reported scores and uncertainty values without estimating values from plots or prose.",
      "Record the source page, table or figure label, caption, and row label.",
      "Return uncertain when the excerpts indicate a relevant experiment but do not support exact extraction.",
    ],
    files: [
      ["compact_processor/run_compact_batch.sh", "Runs extraction, workbook construction, hyperlink insertion, and verification for one batch."],
      ["compact_processor/process_compact.py", "Selects excerpts, invokes extraction, validates the response, and writes batch files."],
      ["compact_processor/prompts/extract_batch.txt", "Defines the inclusion and extraction rules."],
      ["batch_processor/schema/extraction.schema.json", "Defines the required JSON structure and allowed field values."],
    ],
  },
  {
    number: "05",
    title: "Validation and dataset update",
    conciseInput: "Completed batch directories.",
    conciseProcedure: "Check files, row counts, schema fields, and links; remove duplicate trajectories; normalize metric direction; and classify numerical shape separately from statistical support.",
    conciseOutput: "Master extraction workbook and the JSON dataset used by the Atlas.",
    input: [
      ["Completed batch directories", "Paper decisions, extracted trajectories, summary counts, and source links from every processed batch."],
    ],
    output: [
      ["icl-master-extraction.xlsx", "The combined papers, trajectories, shot-level results, statistical tests, and metric definitions."],
      ["app/data/atlas.json", "The data used by the public Atlas interface."],
    ],
    steps: [
      "Confirm that every required batch file exists and that row counts agree with batch_summary.json.",
      "Confirm that each result-source URL is present as a workbook hyperlink.",
      "Combine batches and remove duplicate trajectories using paper, task, dataset, model, metric, and source row.",
      "Preserve the reported score as raw_score. Multiply lower-is-better scores by −1 only when producing analysis_score.",
      "Classify numerical trajectory shape separately from reported statistical significance.",
      "Generate the workbook and the JSON file used by the website.",
    ],
    files: [
      ["batch_processor/scripts/verify_batch.py", "Checks required files, row counts, workbook integrity, and hyperlink counts."],
      ["batch_processor/scripts/add_xlsx_hyperlinks.py", "Adds PDF page URLs to workbook cells."],
      ["work/master-workbook/build_master.mjs", "Combines batches and computes the master workbook fields."],
      ["icl-trend-atlas/scripts/import_workbook.py", "Converts the master workbook into the Atlas JSON file."],
    ],
  },
];

function ScreeningPipeline() {
  return (
    <section className="pipeline-panel workspace-panel" id="pipeline-panel" role="tabpanel" aria-labelledby="pipeline-tab">
      <div className="pipeline-heading">
        <h2>Methods: screening and extraction</h2>
        <p>Files are processed in five stages. The table states the input, decision procedure, and output of each stage.</p>
      </div>

      <p className="pipeline-status" aria-label="Current pipeline status">
        <strong>{atlas.meta.candidatePaperCount}</strong> candidates; <strong>{atlas.meta.reviewedPaperCount}</strong> reviewed; <strong>{atlas.meta.paperCount}</strong> included; <strong>{atlas.meta.remainingPaperCount}</strong> not yet reviewed.
      </p>

      <div className="pipeline-table-wrap">
        <table className="pipeline-table">
          <thead><tr><th>Stage</th><th>Input</th><th>Procedure</th><th>Output</th></tr></thead>
          <tbody>
            {pipelineStages.map((stage) => (
              <tr key={stage.number}>
                <th scope="row"><span>{stage.number}</span><strong>{stage.title}</strong></th>
                <td>{stage.conciseInput}</td>
                <td>{stage.conciseProcedure}</td>
                <td>
                  <p>{stage.conciseOutput}</p>
                  <details>
                    <summary>Implementation files</summary>
                    <ul>{stage.files.map(([name, description]) => <li key={name}><code>{name}</code><span>{description}</span></li>)}</ul>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="pipeline-rules" aria-labelledby="pipeline-rules-title">
        <h3 id="pipeline-rules-title">Inclusion and reporting rules</h3>
        <ul>
          <li>No score is estimated from a plot, bar height, color, or prose description.</li>
          <li>Inclusion requires exact scores for at least two prompt demonstration counts under a comparable experimental setting.</li>
          <li>Uncertainty, statistical tests, and significance are recorded only when the paper reports sufficient evidence.</li>
          <li>Every trajectory retains its source page and table or figure link and remains marked for source verification.</li>
        </ul>
      </section>
    </section>
  );
}

function CoverageAudit({ onChooseOperation }: { onChooseOperation: (operation: string) => void }) {
  const meta = atlas.meta;
  const operationCoverage = useMemo(() => {
    const buckets = new Map<string, { trajectories: number; papers: Set<string> }>();
    for (const trajectory of atlas.trajectories) {
      const current = buckets.get(trajectory.semanticOperation) ?? { trajectories: 0, papers: new Set<string>() };
      current.trajectories += 1;
      current.papers.add(trajectory.paperId);
      buckets.set(trajectory.semanticOperation, current);
    }
    return [...buckets.entries()]
      .map(([name, value]) => ({ name, trajectories: value.trajectories, papers: value.papers.size }))
      .sort((a, b) => a.papers - b.papers || a.trajectories - b.trajectories || a.name.localeCompare(b.name));
  }, []);
  const sparseOperations = operationCoverage.filter((item) => item.papers <= 2).slice(0, 6);

  return (
    <section className="coverage-audit inview" aria-labelledby="coverage-title">
      <div className="coverage-heading">
        <div>
          <span className="section-kicker">Dataset coverage</span>
          <h2 id="coverage-title">Extraction coverage by task operation</h2>
        </div>
        <p>Operations are ranked by distinct paper count. Categories supported by one or two papers are current coverage gaps, even when those papers report many trajectories.</p>
      </div>

      <div className="coverage-status" aria-label="Paper screening status">
        <div><strong>{meta.reviewedPaperCount}</strong><span>reviewed of {meta.candidatePaperCount}</span></div>
        <div><strong>{meta.paperCount}</strong><span>included with exact multi-shot results</span></div>
        <div><strong>{meta.remainingPaperCount}</strong><span>candidate papers remaining</span></div>
        <div><strong>{meta.readyQueueCount}</strong><span>ready in the compact queue</span></div>
      </div>

      <div className="coverage-body">
        <div className="gap-list">
          <div className="coverage-subhead"><span>Operations with the fewest papers</span><small>Select an operation to inspect its records</small></div>
          {sparseOperations.map((item, index) => (
            <button key={item.name} type="button" className="gap-row" onClick={() => onChooseOperation(item.name)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.name}</strong>
              <small>{item.papers} {item.papers === 1 ? "paper" : "papers"} · {item.trajectories} trajectories</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("comparison");
  const [lens, setLens] = useState<Lens>("Task");
  const [selectedGroup, setSelectedGroup] = useState(() => topGroupForLens("Task"));
  const [query, setQuery] = useState("");
  const [patternFilter, setPatternFilter] = useState("All patterns");
  const [evidenceFilter, setEvidenceFilter] = useState("All evidence");
  const [expandedPaper, setExpandedPaper] = useState("");
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState("");
  const [showDataNotes, setShowDataNotes] = useState(false);

  const groups = useMemo(() => {
    const buckets = new Map<string, Trajectory[]>();
    for (const trajectory of atlas.trajectories) {
      const key = valueForLens(trajectory, lens);
      const bucket = buckets.get(key) ?? [];
      bucket.push(trajectory);
      buckets.set(key, bucket);
    }
    return [...buckets.entries()]
      .map(([name, trajectories]) => ({
        name,
        trajectories,
        papers: new Set(trajectories.map((item) => item.paperId)).size,
      }))
      .sort((a, b) => b.trajectories.length - a.trajectories.length);
  }, [lens]);

  const activeGroup = groups.find((group) => group.name === selectedGroup) ?? groups[0];
  const matching = useMemo(() => activeGroup?.trajectories ?? [], [activeGroup]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return matching.filter((trajectory) => {
      const searchable = [
        trajectory.paperTitle,
        trajectory.paperId,
        trajectory.task,
        trajectory.dataset,
        trajectory.modelName,
        trajectory.modelType,
        trajectory.metric,
      ].join(" ").toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesPattern = patternFilter === "All patterns" || trajectory.category === patternFilter;
      const matchesEvidence = evidenceFilter === "All evidence" || trajectory.evidenceTier === evidenceFilter;
      return matchesQuery && matchesPattern && matchesEvidence;
    });
  }, [evidenceFilter, matching, patternFilter, query]);

  const paperGroups = useMemo(() => {
    const buckets = new Map<string, Trajectory[]>();
    for (const trajectory of filtered) {
      const bucket = buckets.get(trajectory.paperId) ?? [];
      bucket.push(trajectory);
      buckets.set(trajectory.paperId, bucket);
    }
    return [...buckets.entries()]
      .map(([paperId, trajectories]) => ({
        paperId,
        title: trajectories[0].paperTitle,
        trajectories,
      }))
      .sort((a, b) => b.trajectories.length - a.trajectories.length);
  }, [filtered]);

  const selectedTrajectory = filtered.find((item) => item.trajectoryId === selectedTrajectoryId) ?? filtered[0];
  const comparisonTrajectory = atlas.trajectories.find((item) => item.trajectoryId === selectedTrajectoryId) ?? atlas.trajectories[0];
  const effectiveExpandedPaper = paperGroups.some((paper) => paper.paperId === expandedPaper)
    ? expandedPaper
    : paperGroups[0]?.paperId ?? "";

  useEffect(() => {
    if (!showDataNotes) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDataNotes(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showDataNotes]);

  function chooseLens(nextLens: Lens) {
    setLens(nextLens);
    setSelectedGroup(topGroupForLens(nextLens));
    setQuery("");
    setPatternFilter("All patterns");
    setEvidenceFilter("All evidence");
  }

  function chooseGroup(name: string) {
    setSelectedGroup(name);
    setQuery("");
    setPatternFilter("All patterns");
    setEvidenceFilter("All evidence");
  }

  function selectFromField(trajectory: Trajectory) {
    setSelectedTrajectoryId(trajectory.trajectoryId);
  }

  function openEvidenceForTrajectory(trajectory: Trajectory) {
    setLens("I/O");
    setSelectedGroup(trajectory.ioFamily);
    setQuery("");
    setPatternFilter("All patterns");
    setEvidenceFilter("All evidence");
    setExpandedPaper(trajectory.paperId);
    setSelectedTrajectoryId(trajectory.trajectoryId);
    setWorkspaceView("evidence");
    window.requestAnimationFrame(() => {
      document.getElementById("research-workspace")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function chooseOperation(operation: string) {
    setWorkspaceView("evidence");
    setLens("Task");
    setSelectedGroup(operation);
    setQuery("");
    setPatternFilter("All patterns");
    setEvidenceFilter("All evidence");
    window.requestAnimationFrame(() => {
      document.getElementById("research-workspace")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  return (
    <main className="site-shell" id="top">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="ICL Atlas home">
          <span className="mark">IA</span>
          <span>ICL ATLAS</span>
        </a>
        <div className="data-pulse">
          <span className="pulse-dot" aria-hidden="true" />
          {atlas.meta.paperCount} papers · {atlas.meta.trajectoryCount} trajectories · {atlas.meta.resultCount} shot results
        </div>
        <div className="top-actions">
          <a className="dataset-download" href="./icl-master-extraction.xlsx" download>
            Download dataset <span>.xlsx</span>
          </a>
          <button className="update-button" type="button" onClick={() => setShowDataNotes(true)}>Data and methodology</button>
        </div>
      </header>

      <section className="workspace-shell" id="research-workspace" aria-label="ICL Atlas research workspace">
        <div className="workspace-tabs" role="tablist" aria-label="Research views">
          <button
            id="comparison-tab"
            type="button"
            role="tab"
            aria-selected={workspaceView === "comparison"}
            aria-controls="comparison-panel"
            className={workspaceView === "comparison" ? "active" : ""}
            onClick={() => setWorkspaceView("comparison")}
          >
            <span>01</span>
            <strong>Trajectory overview</strong>
          </button>
          <button
            id="evidence-tab"
            type="button"
            role="tab"
            aria-selected={workspaceView === "evidence"}
            aria-controls="evidence-panel"
            className={workspaceView === "evidence" ? "active" : ""}
            onClick={() => setWorkspaceView("evidence")}
          >
            <span>02</span>
            <strong>Source evidence</strong>
          </button>
          <button
            id="pipeline-tab"
            type="button"
            role="tab"
            aria-selected={workspaceView === "pipeline"}
            aria-controls="pipeline-panel"
            className={workspaceView === "pipeline" ? "active" : ""}
            onClick={() => setWorkspaceView("pipeline")}
          >
            <span>03</span>
            <strong>Screening pipeline</strong>
          </button>
        </div>

        {workspaceView === "comparison" ? (
          <section className="workspace-panel comparison-panel" id="comparison-panel" role="tabpanel" aria-labelledby="comparison-tab">
            <div className="comparison-layout">
              <TrajectoryField
                trajectories={atlas.trajectories}
                selectedTrajectoryId={selectedTrajectoryId}
                onSelect={selectFromField}
                embedded
              />
              <aside className="trajectory-inspector comparison-inspector" aria-live="polite">
                <div className="preview-label"><span>02</span> Selected experiment</div>
                {comparisonTrajectory ? (
                  <TrajectoryDetail
                    trajectory={comparisonTrajectory}
                    onDataNotes={() => setShowDataNotes(true)}
                    onOpenEvidence={openEvidenceForTrajectory}
                  />
                ) : <p className="no-selection">Select a trajectory to inspect its shot-by-shot curve.</p>}
              </aside>
            </div>
          </section>
        ) : workspaceView === "evidence" ? (
      <section className="atlas-frame workspace-panel" id="evidence-panel" role="tabpanel" aria-labelledby="evidence-tab" aria-label="ICL evidence explorer">
        <aside className="trend-rail">
          <div className="rail-heading">
            <div><span className="section-kicker">01 / Group selector</span><h2>Trajectory groups</h2></div>
            <span className="rail-count">{groups.length}</span>
          </div>

          <div className="lens-switch" role="tablist" aria-label="Group trajectories by">
            {lenses.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={lens === item} className={lens === item ? "active" : ""} onClick={() => chooseLens(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="group-list">
            {groups.map((group) => {
              const selected = activeGroup?.name === group.name;
              const distribution = Object.entries(group.trajectories.reduce<Record<string, number>>((counts, trajectory) => {
                counts[trajectory.category] = (counts[trajectory.category] ?? 0) + 1;
                return counts;
              }, {}));
              return (
                <button
                  key={group.name}
                  type="button"
                  className={`group-row ${selected ? "selected" : ""}`}
                  onClick={() => chooseGroup(group.name)}
                >
                  <span className="group-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="group-body">
                    <span className="group-name">{group.name}</span>
                    <span className="group-meta">{group.trajectories.length} trajectories · {group.papers} papers</span>
                    <span className="distribution" aria-hidden="true">
                      {distribution.map(([category, count]) => <span key={category} style={{ flex: count, background: patternColors[category] ?? "#6d7780" }} />)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="evidence-panel">
          <div className="evidence-heading">
            <div><span className="section-kicker">02 / Paper and trajectory records</span><p className="breadcrumb">Grouped by {lens}: <strong>{activeGroup?.name}</strong></p></div>
            <div className="headline-stat"><strong>{filtered.length}</strong><span>matching trajectories</span></div>
          </div>

          <div className="metric-ribbon">
            <div><span>Papers</span><strong>{paperGroups.length}</strong></div>
            <div><span>Endpoint improved</span><strong>{filtered.filter((item) => item.endpointOutcome === "Improved").length}</strong></div>
            <div><span>Any degradation</span><strong>{filtered.filter((item) => item.numericalDegradation).length}</strong></div>
          </div>

          <div className="filter-bar">
            <label className="search-field">
              <span className="sr-only">Search within selected trend</span>
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paper, model, dataset…" />
            </label>
            <label>
              <span className="sr-only">Filter by monotonicity pattern</span>
              <select value={patternFilter} onChange={(event) => setPatternFilter(event.target.value)}>
                <option>All patterns</option>
                {Object.keys(patternColors).map((pattern) => <option key={pattern}>{pattern}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by evidence tier</span>
              <select value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value)}>
                <option>All evidence</option><option>3+ points</option><option>2 points</option><option>Insufficient</option>
              </select>
            </label>
          </div>

          <div className="paper-list">
            {paperGroups.map((paper) => {
              const expanded = paper.paperId === effectiveExpandedPaper;
              return (
                <article className={`paper-card ${expanded ? "expanded" : ""}`} key={paper.paperId}>
                  <button className="paper-header" type="button" onClick={() => setExpandedPaper(expanded ? "" : paper.paperId)} aria-expanded={expanded}>
                    <span className="paper-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="paper-title-block">
                      <span className="paper-topline"><span>{paper.paperId}</span><span>{paper.trajectories.length} trajectories</span></span>
                      <strong>{paper.title}</strong>
                    </span>
                    <span className="expand-symbol" aria-hidden="true">{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded ? (
                    <div className="trajectory-list">
                      <div className="paper-source-row">
                        <span>{new Set(paper.trajectories.map((item) => item.modelName)).size} models · {new Set(paper.trajectories.map((item) => item.metric)).size} metrics</span>
                        {paper.trajectories[0].resultTableLink ? <a href={paper.trajectories[0].resultTableLink} target="_blank" rel="noreferrer">Open source table</a> : null}
                      </div>
                      {paper.trajectories.map((trajectory) => {
                        const selected = trajectory.trajectoryId === selectedTrajectory?.trajectoryId;
                        return (
                          <button key={trajectory.trajectoryId} type="button" className={`trajectory-row ${selected ? "selected" : ""}`} onClick={() => setSelectedTrajectoryId(trajectory.trajectoryId)}>
                            <span className="trajectory-main"><strong>{trajectory.modelName}</strong><span>{trajectory.dataset} · {trajectory.metric}</span></span>
                            <span className="trajectory-shots">{trajectory.lowestShot} to {trajectory.highestShot}<small>shots</small></span>
                            <span className="trajectory-change">{formatDelta(trajectory.normalizedEndpointChange)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {paperGroups.length === 0 ? (
              <div className="empty-state"><span>0</span><strong>No trajectories match these filters.</strong><button type="button" onClick={() => { setQuery(""); setPatternFilter("All patterns"); setEvidenceFilter("All evidence"); }}>Clear filters</button></div>
            ) : null}
          </div>
        </section>

        <aside className="trajectory-inspector" aria-live="polite">
          <div className="preview-label"><span>03</span> Reported shot conditions</div>
          {selectedTrajectory ? (
            <TrajectoryDetail trajectory={selectedTrajectory} onDataNotes={() => setShowDataNotes(true)} />
          ) : <p className="no-selection">Select a trajectory to inspect its shot-by-shot curve.</p>}
        </aside>
      </section>
        ) : (
          <ScreeningPipeline />
        )}
      </section>

      <CoverageAudit onChooseOperation={chooseOperation} />

      <section className="reading-guide inview">
        <div><span className="section-kicker">Interpretation</span><h2>Limits of the trajectory comparison</h2></div>
        <div className="guide-grid">
          <article><span>01</span><strong>Normalized values show direction and shape</strong><p>They do not make scores from different metrics directly comparable in magnitude.</p></article>
          <article><span>02</span><strong>Two observations show endpoint direction only</strong><p>At least three shot conditions are required to identify a reversal or non-monotonic path.</p></article>
          <article><span>03</span><strong>Statistical support is recorded separately</strong><p>A numerical increase or decline is not treated as significant without sufficient reported test output.</p></article>
        </div>
      </section>

      <footer className="footer"><span>ICL Atlas · schema v{atlas.meta.schemaVersion}</span><span>This static site does not collect or transmit personal data.</span><span>Source refreshed {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(atlas.meta.generatedAt))}</span></footer>

      {showDataNotes ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowDataNotes(false); }}>
          <section className="data-modal" role="dialog" aria-modal="true" aria-labelledby="data-modal-title">
            <button className="modal-close" type="button" onClick={() => setShowDataNotes(false)} aria-label="Close data notes">×</button>
            <h2 id="data-modal-title">Data and methodology</h2>
            <p>The interface is generated from <strong>{atlas.meta.sourceFile}</strong>. A paper enters the dataset only when the source provides exact comparable results for at least two prompt demonstration counts.</p>
            <div className="modal-stats"><div><strong>{atlas.meta.reviewedPaperCount}</strong><span>Reviewed papers</span></div><div><strong>{atlas.meta.paperCount}</strong><span>Included papers</span></div><div><strong>{atlas.meta.resultCount}</strong><span>Shot results</span></div></div>
            <dl className="method-list">
              <div><dt>Metric directionality</dt><dd>Lower-is-better metrics are reversed only for analysis; raw reported values remain visible.</dd></div>
              <div><dt>Evidence tier</dt><dd>Three or more points support a trajectory shape. Two points support direction only.</dd></div>
              <div><dt>Statistical support</dt><dd>Numerical degradation is not treated as significant unless the source reports sufficient test output.</dd></div>
              <div><dt>Verification status</dt><dd>{atlas.meta.verificationNotice}</dd></div>
            </dl>
            <div className="modal-actions">
              <a className="modal-download" href="./icl-master-extraction.xlsx" download>Download the master extraction workbook (.xlsx)</a>
              <button className="modal-done" type="button" onClick={() => setShowDataNotes(false)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
