const OUTER_ARC = 'M 338.9 100.2 A 176.5 176.5 0 0 0 173.1 100.2';
const INNER_ARC = 'M 305.0 175.2 A 94.5 94.5 0 0 0 207.0 175.2';
const QUARTERS = [0, 90, 180, 270];

type Props = {
  x: number;
  y: number;
  size: number;
};

const layer = 'absolute inset-0 size-full motion-reduce:animate-none';

export function Mark({ x, y, size }: Props) {
  return (
    <div className="absolute" style={{ left: x, top: y, width: size, height: size }} aria-hidden>
      <svg
        viewBox="0 0 512 512"
        className={`${layer} animate-orbit`}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="17"
        strokeLinecap="round"
      >
        {QUARTERS.map((deg) => (
          <path key={deg} d={OUTER_ARC} transform={`rotate(${-deg} 256 256)`} />
        ))}
        <g fill="var(--primary)" stroke="none">
          {QUARTERS.map((deg) => (
            <circle key={deg} cx="380.8" cy="131.2" r="19" transform={`rotate(${-deg} 256 256)`} />
          ))}
        </g>
      </svg>
      <svg
        viewBox="0 0 512 512"
        className={`${layer} animate-orbit-back`}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="17"
        strokeLinecap="round"
      >
        {QUARTERS.map((deg) => (
          <path key={deg} d={INNER_ARC} transform={`rotate(${-deg} 256 256)`} />
        ))}
      </svg>
      <svg viewBox="0 0 512 512" className={`${layer} animate-breathe`} fill="var(--primary)">
        <circle cx="256" cy="256" r="21" />
      </svg>
    </div>
  );
}
