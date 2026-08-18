"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import atlas from "./data/atlas.json";

type Lens = "Task" | "Model" | "Metric" | "Pattern";
type ScoreMode = "raw" | "normalized";
type Trajectory = (typeof atlas.trajectories)[number];
type ResultPoint = Trajectory["results"][number];

const lenses: Lens[] = ["Task", "Model", "Metric", "Pattern"];

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
  if (lens === "Task") return trajectory.taskGroup;
  if (lens === "Model") return trajectory.modelType;
  if (lens === "Metric") return trajectory.metricGroup;
  return trajectory.category;
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

export default function Home() {
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
        <MagneticButton className="update-button magnetic" onClick={() => setShowDataNotes(true)}>
          Data & methodology <span aria-hidden="true">↗</span>
        </MagneticButton>
      </header>

      <section className="hero reveal reveal-two" id="top">
        <p className="eyebrow">A navigable evidence map for in-context learning</p>
        <h1>See what happens when<span> the shot count moves.</span></h1>
        <p className="hero-copy">
          Move from broad trends to the exact paper, prompting setup, and reported score—without losing the shape of the evidence.
        </p>
      </section>

      <section className="atlas-frame reveal reveal-three" aria-label="ICL trend explorer">
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
            <div className="inspector-content" key={selectedTrajectory.trajectoryId}>
              <div className="pattern-pill" style={{ "--pattern": patternColors[selectedTrajectory.category] } as React.CSSProperties}><span /> {selectedTrajectory.category}</div>
              <h2>{selectedTrajectory.modelName}</h2>
              <p className="preview-context">{selectedTrajectory.task}<br />{selectedTrajectory.dataset} · {selectedTrajectory.metric}</p>
              <TrajectoryChart trajectory={selectedTrajectory} />

              <div className="preview-details">
                <div><span>Baseline</span><strong>{formatNumber(selectedTrajectory.baselineRawScore, 3)}</strong></div>
                <div><span>Endpoint</span><strong>{formatNumber(selectedTrajectory.endpointRawScore, 3)}</strong></div>
                <div><span>Conditions</span><strong>{selectedTrajectory.numberOfConditions}</strong></div>
              </div>

              <div className="shot-table-wrap">
                <div className="detail-heading"><span>Reported shot setup</span><span>{selectedTrajectory.metricDirection?.replaceAll("_", " ")}</span></div>
                <table className="shot-table">
                  <thead><tr><th>Shots</th><th>Raw score</th><th>Step Δ</th></tr></thead>
                  <tbody>
                    {selectedTrajectory.results.map((point, index) => (
                      <tr key={`${point.shotCount}-${index}`}><td>{point.shotCount ?? "—"}</td><td>{formatNumber(point.rawScore ?? point.rawScoreReported, 3)}</td><td>{formatNumber(point.stepChange, 3)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedTrajectory.statisticalTests.length > 0 ? (
                <div className="stat-note">
                  <span>Reported statistics</span>
                  <strong>{selectedTrajectory.statisticalTests[0].testName ?? "Statistical comparison"}</strong>
                  <p>{selectedTrajectory.statisticalTests[0].description ?? selectedTrajectory.statisticalTests[0].interpretation ?? "See the paper for the reported comparison."}</p>
                </div>
              ) : <div className="stat-note muted-note"><span>Reported statistics</span><p>No trajectory-linked significance claim is recorded for this setup.</p></div>}

              <div className="inspector-actions">
                {selectedTrajectory.resultTableLink ? <a className="source-button" href={selectedTrajectory.resultTableLink} target="_blank" rel="noreferrer">Open table in paper <span>↗</span></a> : null}
                <button className="method-button" type="button" onClick={() => setShowDataNotes(true)}>How to read this</button>
              </div>
            </div>
          ) : <p className="no-selection">Select a trajectory to inspect its shot-by-shot curve.</p>}
        </aside>
      </section>

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
            <h2 id="data-modal-title">Built to grow with the extraction.</h2>
            <p>The interface is generated from <strong>{atlas.meta.sourceFile}</strong>. Updating the master workbook and rerunning the importer refreshes every lens, paper, trajectory, shot value, and statistical-test record.</p>
            <div className="modal-stats"><div><strong>{atlas.meta.paperCount}</strong><span>Papers</span></div><div><strong>{atlas.meta.trajectoryCount}</strong><span>Trajectories</span></div><div><strong>{atlas.meta.resultCount}</strong><span>Shot results</span></div></div>
            <div className="update-flow"><span>Workbook</span><i>→</i><span>Importer</span><i>→</i><span>Atlas data</span><i>→</i><span>Deploy</span></div>
            <div className="method-grid">
              <div><strong>Metric directionality</strong><p>Lower-is-better metrics are reversed only for analysis; raw reported values remain visible.</p></div>
              <div><strong>Evidence tier</strong><p>Three or more points support a trajectory shape. Two points support direction only.</p></div>
              <div><strong>Statistical support</strong><p>Numerical degradation is not treated as significant unless the source reports sufficient test output.</p></div>
              <div><strong>Current limitation</strong><p>{atlas.meta.verificationNotice}</p></div>
            </div>
            <MagneticButton className="modal-done magnetic" onClick={() => setShowDataNotes(false)}>Return to the atlas <span>→</span></MagneticButton>
          </section>
        </div>
      ) : null}
    </main>
  );
}
