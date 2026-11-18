import type { AssistantState } from "../types/index.ts";

const CENTER = 140;
const RADIUS = 130;
const ROWS = 9;
const COLUMNS = 17;

const surface = Array.from({ length: ROWS }, (_, row) => {
  const latitude = -1.25 + (row * 2.5) / (ROWS - 1);
  return Array.from({ length: COLUMNS }, (_, column) => {
    const longitude = -Math.PI / 2 + (column * Math.PI) / (COLUMNS - 1);
    const cosLatitude = Math.cos(latitude);
    return {
      x: CENTER + RADIUS * cosLatitude * Math.sin(longitude),
      y: CENTER + RADIUS * Math.sin(latitude),
      key: `${row}-${column}`,
    };
  });
}).flat();

const meshEdges = surface.flatMap((point) => {
  const [, rowText, columnText] = point.key.match(/(\d+)-(\d+)/) ?? [];
  const row = Number(rowText);
  const column = Number(columnText);
  const right = surface.find((item) => item.key === `${row}-${column + 1}`);
  const lower = surface.find((item) => item.key === `${row + 1}-${column}`);
  return [
    ...(right ? [{ key: `${point.key}-r`, x1: point.x, y1: point.y, x2: right.x, y2: right.y }] : []),
    ...(lower ? [{ key: `${point.key}-d`, x1: point.x, y1: point.y, x2: lower.x, y2: lower.y }] : []),
  ];
});

export function AstraCore({ state }: { state: AssistantState }) {
  return (
    <div className="astra-core" data-state={state} aria-hidden="true">
      <span className="core-orbit orbit-one" />
      <span className="core-orbit orbit-two" />
      <span className="core-orbit orbit-three" />
      <div className="core-platform">
        <span />
        <span />
        <span />
        <span />
      </div>
      <svg className="core-sphere" viewBox="0 0 280 280">
        <defs>
          <radialGradient id="astra-sphere-fill">
            <stop offset="0" stopColor="#0d4c86" stopOpacity=".4" />
            <stop offset=".72" stopColor="#041c39" stopOpacity=".65" />
            <stop offset="1" stopColor="#03101f" stopOpacity=".9" />
          </radialGradient>
          <filter id="astra-node-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle className="sphere-fill" cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#astra-sphere-fill)" />
        <g className="sphere-latitudes">
          {[-0.82, -0.61, -0.4, -0.2, 0, 0.2, 0.4, 0.61, 0.82].map((latitude) => {
            const y = CENTER + RADIUS * latitude;
            const rx = RADIUS * Math.sqrt(1 - latitude * latitude);
            return <ellipse key={latitude} cx={CENTER} cy={y} rx={rx} ry={Math.max(3, rx * 0.2)} />;
          })}
        </g>
        <g className="sphere-longitudes">
          {[-78, -62, -45, -28, 0, 28, 45, 62, 78].map((angle) => (
            <ellipse
              key={angle}
              cx={CENTER}
              cy={CENTER}
              rx={RADIUS * Math.abs(Math.cos((angle * Math.PI) / 180))}
              ry={RADIUS}
              transform={`rotate(${angle}, ${CENTER}, ${CENTER})`}
            />
          ))}
        </g>
        <g className="sphere-mesh">
          {meshEdges.map((edge) => (
            <line key={edge.key} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
          ))}
        </g>
        <g className="sphere-nodes" filter="url(#astra-node-glow)">
          {surface.filter((_, index) => index % 3 === 0).map((point) => (
            <circle key={point.key} cx={point.x} cy={point.y} r="1.45" />
          ))}
        </g>
        <circle className="sphere-outline" cx={CENTER} cy={CENTER} r={RADIUS} />
        <circle className="sphere-shine" cx="106" cy="89" r="4" />
        <circle className="sphere-shine" cx="196" cy="121" r="3" />
      </svg>
      <div className="core-sphere-label">
        <strong>ASTRA</strong>
        <span>AI CORE</span>
      </div>
      <span className="core-label">ASTRA</span>
    </div>
  );
}
