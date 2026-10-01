"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import atlas from "./data/atlas.json";

type Lens = "I/O" | "Task" | "Scope" | "Model" | "Metric" | "Pattern";
type ScoreMode = "raw" | "normalized";
type FieldColorMode = "Pattern" | "I/O family" | "Operation" | "Scope";
type FieldXMode = "progress" | "shots" | "logShots";
type WorkspaceView = "comparison" | "evidence";
type Trajectory = (typeof atlas.trajectories)[number];
type ResultPoint = Trajectory["results"][number];

const lenses: Lens[] = ["I/O", "Task", "Scope", "Model", "Metric", "Pattern"];

const patternColors: Record<string, string> = {
  "Monotonic improvement": "#46d7a8",
  "Monotonic decline": "#ff6d6d",
  "Improve then decline": "#f7b84b",
  "Decline then recover": "#9f8bff",
  "Mixed / non-monotonic": "#7393a7",
  "Flat / stable": "#a8b5bd",
  "Two-point improvement": "#56b8df",
  "Two-point decline": "#ff9c72",
  "Insufficient points": "#6d7780",
};

function valueForLens(trajectory: Trajectory, lens: Lens) {
  if (lens === "I/O") return trajectory.ioFamily;
  if (lens === "Task") return trajectory.taskGroup;
  if (lens === "Scope") return trajectory.semanticScope;
  if (lens === "Model") return trajectory.modelType;
  if (lens === "Metric") return trajectory.metricGroup;
  return trajectory.category;
}

const fieldPalette = ["#46d7a8", "#ff9c72", "#9f8bff", "#56b8df", "#f7b84b", "#ef6fa8", "#80c783", "#c09bff", "#54c6ba", "#f08080"];

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
  if (value === null || value === "") return "—";
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function formatDelta(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(Math.abs(value) < 1 ? 3 : 1)}`;
}

function MagneticButton({
  children,
  className,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  className: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
    event.currentTarget.style.setProperty("--mx", `${x}px`);
    event.currentTarget.style.setProperty("--my", `${y}px`);
  }

  function reset(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.setProperty("--mx", "0px");
    event.currentTarget.style.setProperty("--my", "0px");
  }

  return (
    <button
      className={className}
      type="button"
      onClick={onClick}
      onPointerMove={move}
      onPointerLeave={reset}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function TrajectoryChart({ trajectory }: { trajectory: Trajectory }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const lastAnimationKey = useRef("");
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

    let animationFrame = 0;
    const context = canvas.getContext("2d");
    if (!context) return;

    const render = (progress: number) => {
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

      const accent = patternColors[trajectory.category] ?? "#d8ff6a";
      const maxSegment = Math.max(0, numericPoints.length - 1) * progress;
      context.strokeStyle = accent;
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.shadowColor = accent;
      context.shadowBlur = 16;
      context.beginPath();
      context.moveTo(xFor(numericPoints[0].shot), yFor(numericPoints[0].score));
      for (let index = 1; index < numericPoints.length; index += 1) {
        if (index <= maxSegment) {
          context.lineTo(xFor(numericPoints[index].shot), yFor(numericPoints[index].score));
        } else if (index - 1 < maxSegment) {
          const fraction = maxSegment - (index - 1);
          const previous = numericPoints[index - 1];
          const current = numericPoints[index];
          context.lineTo(
            xFor(previous.shot + (current.shot - previous.shot) * fraction),
            yFor(previous.score + (current.score - previous.score) * fraction),
          );
        }
      }
      context.stroke();
      context.shadowBlur = 0;

      numericPoints.forEach((point, index) => {
        if (index > Math.ceil(maxSegment)) return;
        const active = hovered === index;
        context.fillStyle = active ? "#ffffff" : accent;
        context.strokeStyle = "#102a30";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(xFor(point.shot), yFor(point.score), active ? 7 : 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      });
    };

    const animationKey = `${trajectory.trajectoryId}:${mode}`;
    const shouldAnimate = lastAnimationKey.current !== animationKey && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastAnimationKey.current = animationKey;
    if (shouldAnimate) {
      const start = performance.now();
      const tick = (time: number) => {
        const linear = Math.min(1, (time - start) / 700);
        const eased = 1 - Math.pow(1 - linear, 4);
        render(eased);
        if (linear < 1) animationFrame = requestAnimationFrame(tick);
      };
      animationFrame = requestAnimationFrame(tick);
    } else {
      render(1);
    }

    let resizeFrame = 0;
    const handleResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => render(1));
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      cancelAnimationFrame(animationFrame);
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
      <div className="axis-caption"><span>Score</span><span>Shot count →</span></div>
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
              <tr key={`${point.shotCount}-${index}`}><td>{point.shotCount ?? "—"}</td><td>{formatNumber(point.rawScore ?? point.rawScoreReported, 3)}</td><td>{formatNumber(point.stepChange, 3)}</td></tr>
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
        {trajectory.resultTableLink ? <a className="source-button" href={trajectory.resultTableLink} target="_blank" rel="noreferrer">Open table in paper <span>↗</span></a> : null}
        <button className="method-button" type="button" onClick={onDataNotes}>Methodology</button>
        {onOpenEvidence ? <button className="evidence-button" type="button" onClick={() => onOpenEvidence(trajectory)}>Open in evidence explorer</button> : null}
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
        context.strokeStyle = value === 0 ? "rgba(216,255,106,.45)" : "rgba(255,255,255,.10)";
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
        context.fillStyle = "rgba(216,255,106,.10)";
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
        context.strokeStyle = "#d8ff6a";
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
    setHoveredId(nearest.trajectory.trajectoryId);
    setTooltip({ x: event.clientX, y: event.clientY, trajectory: nearest.trajectory, score: nearest.score, shot: nearest.shot });
  }

  const paperCount = new Set(prepared.map((item) => item.trajectory.paperId)).size;
  const routeCount = new Set(prepared.map((item) => item.trajectory.ioFamily)).size;

  return (
    <section className={`trajectory-field inview ${embedded ? "embedded-field" : ""}`} aria-labelledby="trajectory-field-title">
      <div className="field-heading">
        <div>
          <span className="section-kicker">All results / Overview</span>
          <h2 id="trajectory-field-title">All normalized trajectories</h2>
          <p>Each curve begins at its first reported shot count and is rescaled to its largest direction-normalized change. Select a curve to inspect its exact reported scores.</p>
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

      <div className="field-canvas" ref={containerRef} onPointerMove={handlePointerMove} onPointerLeave={() => { setHoveredId(""); setTooltip(null); }} onClick={() => { const selected = prepared.find((item) => item.trajectory.trajectoryId === hoveredId); if (selected) onSelect(selected.trajectory); }}>
        <canvas ref={canvasRef} aria-label={`Normalized shapes for ${prepared.length} experimental trajectories`} />
        <div className="field-y-label" aria-hidden="true">Normalized shape</div>
        <div className="field-x-label" aria-hidden="true">{xMode === "progress" ? "Relative shot progression" : xMode === "logShots" ? "Reported shot count · log(1 + shots)" : "Reported shot count"}</div>
        {tooltip ? (
          <div className="field-tooltip" style={{ left: tooltip.x - (containerRef.current?.getBoundingClientRect().left ?? 0), top: tooltip.y - (containerRef.current?.getBoundingClientRect().top ?? 0) }}>
            <span>{tooltip.trajectory.taskSubtype} · {tooltip.shot} shots</span>
            <strong>{tooltip.trajectory.modelName}</strong>
            <small>{tooltip.trajectory.ioFamily} · shape {tooltip.score > 0 ? "+" : ""}{tooltip.score.toFixed(2)}</small>
          </div>
        ) : null}
      </div>

      <div className="field-legend" aria-label={`Legend colored by ${colorMode}`}>
        {legend.map(([name, count]) => <span key={name}><i style={{ background: colorMode === "Pattern" ? (patternColors[name] ?? stableColor(name)) : stableColor(name) }} />{name}<small>{count}</small></span>)}
      </div>
      <p className="field-footnote">Counts can be dominated by papers reporting many model–metric combinations. Use the paper count and the source drilldown before interpreting coverage. Log shots uses log(1 + shot count), which keeps zero-shot points visible.</p>
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
          <span className="section-kicker">Coverage / Next extraction</span>
          <h2 id="coverage-title">Process the gaps, not just the next row.</h2>
        </div>
        <p>Coverage is ranked by independent papers rather than trajectory count. The next extraction queue can prioritize operations represented by only one or two papers.</p>
      </div>

      <div className="coverage-status" aria-label="Paper screening status">
        <div><strong>{meta.reviewedPaperCount}</strong><span>reviewed of {meta.candidatePaperCount}</span></div>
        <div><strong>{meta.paperCount}</strong><span>included with exact multi-shot results</span></div>
        <div><strong>{meta.remainingPaperCount}</strong><span>candidate papers remaining</span></div>
        <div><strong>{meta.readyQueueCount}</strong><span>ready in the compact queue</span></div>
      </div>

      <div className="coverage-body">
        <div className="gap-list">
          <div className="coverage-subhead"><span>Lowest paper coverage</span><small>Click to inspect current evidence</small></div>
          {sparseOperations.map((item, index) => (
            <button key={item.name} type="button" className="gap-row" onClick={() => onChooseOperation(item.name)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.name}</strong>
              <small>{item.papers} {item.papers === 1 ? "paper" : "papers"} · {item.trajectories} trajectories</small>
            </button>
          ))}
        </div>

        <div className="classification-pipeline">
          <div className="coverage-subhead"><span>Paper classification pipeline</span><small>From candidate to Atlas</small></div>
          <ol>
            <li><span>01</span><div><strong>Candidate screen</strong><p>Start with papers whose full text mentions ICL and multiple possible shot counts.</p></div></li>
            <li><span>02</span><div><strong>Experiment check</strong><p>Confirm the shots are prompt demonstrations—not training-set size, retrieval depth, or another variable.</p></div></li>
            <li><span>03</span><div><strong>Comparable evidence</strong><p>Require exact scores for at least two shot-count conditions with the task, model, dataset, and metric held comparable.</p></div></li>
            <li><span>04</span><div><strong>Classification</strong><p>Assign input, output, operation, scope, metric direction, and evidence tier while preserving the source-table link.</p></div></li>
            <li><span>05</span><div><strong>Analysis and audit</strong><p>Normalize direction, classify trajectory shape, record statistical support, and flag every value needing source verification.</p></div></li>
          </ol>
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
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll(".inview").forEach((element) => observer.observe(element));
    const visibility = () => {
      document.documentElement.dataset.motionPaused = String(document.hidden);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

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
    <main className="site-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar reveal reveal-one">
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
          <MagneticButton className="update-button magnetic" onClick={() => setShowDataNotes(true)}>
            Data & methodology <span aria-hidden="true">↗</span>
          </MagneticButton>
        </div>
      </header>

      <section className="hero reveal reveal-two" id="top">
        <p className="eyebrow">Systematic evidence synthesis of in-context learning</p>
        <h1>How model performance changes<span> as in-context examples increase.</span></h1>
        <p className="hero-copy">
          This research atlas compiles published NLP experiments that report the same task, model, dataset, and metric at multiple demonstration counts. Metrics are direction-normalized so upward always means better, while every trajectory remains linked to its paper and source table.
        </p>
      </section>

      <section className="workspace-shell reveal reveal-three" id="research-workspace" aria-label="ICL Atlas research workspace">
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
            <strong>Trajectory comparison</strong>
            <small>All trajectories + selected result</small>
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
            <strong>Evidence explorer</strong>
            <small>Categories, papers + shot setup</small>
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
                <div className="preview-label"><span>02</span> Selected trajectory</div>
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
        ) : (
      <section className="atlas-frame workspace-panel" id="evidence-panel" role="tabpanel" aria-labelledby="evidence-tab" aria-label="ICL evidence explorer">
        <aside className="trend-rail">
          <div className="rail-heading">
            <div><span className="section-kicker">01 / Explore</span><h2>Trend map</h2></div>
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
            {groups.map((group, index) => {
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
                  style={{ "--delay": `${index * 35}ms` } as React.CSSProperties}
                >
                  <span className="group-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="group-body">
                    <span className="group-name">{group.name}</span>
                    <span className="group-meta">{group.trajectories.length} trajectories · {group.papers} papers</span>
                    <span className="distribution" aria-hidden="true">
                      {distribution.map(([category, count]) => <span key={category} style={{ flex: count, background: patternColors[category] ?? "#6d7780" }} />)}
                    </span>
                  </span>
                  <span className="row-arrow" aria-hidden="true">↗</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="evidence-panel">
          <div className="evidence-heading">
            <div><span className="section-kicker">02 / Evidence</span><p className="breadcrumb">{lens} / <strong>{activeGroup?.name}</strong></p></div>
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
            {paperGroups.map((paper, index) => {
              const expanded = paper.paperId === effectiveExpandedPaper;
              return (
                <article className={`paper-card ${expanded ? "expanded" : ""}`} key={paper.paperId} style={{ "--delay": `${index * 55}ms` } as React.CSSProperties}>
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
                        {paper.trajectories[0].resultTableLink ? <a href={paper.trajectories[0].resultTableLink} target="_blank" rel="noreferrer">Open source table ↗</a> : null}
                      </div>
                      {paper.trajectories.map((trajectory) => {
                        const selected = trajectory.trajectoryId === selectedTrajectory?.trajectoryId;
                        return (
                          <button key={trajectory.trajectoryId} type="button" className={`trajectory-row ${selected ? "selected" : ""}`} onClick={() => setSelectedTrajectoryId(trajectory.trajectoryId)}>
                            <span className="trajectory-accent" style={{ background: patternColors[trajectory.category] }} />
                            <span className="trajectory-main"><strong>{trajectory.modelName}</strong><span>{trajectory.dataset} · {trajectory.metric}</span></span>
                            <span className="trajectory-shots">{trajectory.lowestShot} → {trajectory.highestShot}<small>shots</small></span>
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
          <div className="preview-label"><span>03</span> Shot setup</div>
          {selectedTrajectory ? (
            <TrajectoryDetail trajectory={selectedTrajectory} onDataNotes={() => setShowDataNotes(true)} />
          ) : <p className="no-selection">Select a trajectory to inspect its shot-by-shot curve.</p>}
        </aside>
      </section>
        )}
      </section>

      <CoverageAudit onChooseOperation={chooseOperation} />

      <section className="reading-guide inview">
        <div><span className="section-kicker">Reading the atlas</span><h2>Patterns are descriptive.<br />Papers are the evidence.</h2></div>
        <div className="guide-grid">
          <article><span>01</span><strong>Follow direction-normalized shape</strong><p>Higher on the normalized chart always means better, including lower-is-better metrics.</p></article>
          <article><span>02</span><strong>Separate two-point comparisons</strong><p>Two points establish endpoint direction, but cannot establish a reversal or curved trajectory.</p></article>
          <article><span>03</span><strong>Check the source table</strong><p>Every curve retains its exact table link and verification status for auditability.</p></article>
        </div>
      </section>

      <footer className="footer inview"><span>ICL Atlas · schema v{atlas.meta.schemaVersion}</span><span>Source refreshed {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(atlas.meta.generatedAt))}</span></footer>

      {showDataNotes ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowDataNotes(false); }}>
          <section className="data-modal" role="dialog" aria-modal="true" aria-labelledby="data-modal-title">
            <button className="modal-close" type="button" onClick={() => setShowDataNotes(false)} aria-label="Close data notes">×</button>
            <span className="section-kicker">Data & methodology</span>
            <h2 id="data-modal-title">Paper classification and analysis pipeline.</h2>
            <p>The interface is generated from <strong>{atlas.meta.sourceFile}</strong>. Papers first pass a relevance screen, then exact comparable shot-count results are extracted into the master workbook. The importer classifies the experiment and refreshes every lens, trajectory, score, and statistical-test record.</p>
            <div className="modal-stats"><div><strong>{atlas.meta.reviewedPaperCount}</strong><span>Reviewed papers</span></div><div><strong>{atlas.meta.paperCount}</strong><span>Included papers</span></div><div><strong>{atlas.meta.resultCount}</strong><span>Shot results</span></div></div>
            <div className="update-flow"><span>Candidate</span><i>→</i><span>Evidence check</span><i>→</i><span>Exact rows</span><i>→</i><span>Classify</span><i>→</i><span>Atlas</span></div>
            <div className="method-grid">
              <div><strong>Metric directionality</strong><p>Lower-is-better metrics are reversed only for analysis; raw reported values remain visible.</p></div>
              <div><strong>Evidence tier</strong><p>Three or more points support a trajectory shape. Two points support direction only.</p></div>
              <div><strong>Statistical support</strong><p>Numerical degradation is not treated as significant unless the source reports sufficient test output.</p></div>
              <div><strong>Current limitation</strong><p>{atlas.meta.verificationNotice}</p></div>
            </div>
            <a className="modal-download" href="./icl-master-extraction.xlsx" download>Download the master extraction workbook <span>.xlsx ↓</span></a>
            <MagneticButton className="modal-done magnetic" onClick={() => setShowDataNotes(false)}>Return to the atlas <span>→</span></MagneticButton>
          </section>
        </div>
      ) : null}
    </main>
  );
}
