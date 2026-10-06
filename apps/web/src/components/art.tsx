// Decorative SVG illustrations in the brand palette. All are aria-hidden:
// they never carry information the text around them doesn't.

import { useCallback, useEffect, useRef, useState } from 'react'

type ArtProps = { className?: string }

type Pip = readonly [number, number]
const C: Pip = [92, 198]
const TL: Pip = [70, 176]
const TR: Pip = [114, 176]
const ML: Pip = [70, 198]
const MR: Pip = [114, 198]
const BL: Pip = [70, 220]
const BR: Pip = [114, 220]
const DIE_FACES: readonly (readonly Pip[])[] = [
  [C],
  [TL, BR],
  [TL, C, BR],
  [TL, TR, BL, BR],
  [TL, TR, C, BL, BR],
  [TL, TR, ML, MR, BL, BR],
]
const ROLL_MS = 700

/** Four-point sparkle centred on (x, y). */
function sparkle(x: number, y: number, r: number) {
  const k = r * 0.28
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`
}

/**
 * Home page: a die, an arched door and coins on a table line.
 * Plays an entrance once, then idles: the door creaks open with light behind it,
 * sparkles twinkle. Tapping the die rolls it. Only transform/opacity are
 * animated (see .hero-* in index.css), so it stays cheap on phones.
 */
export function HeroArt({ className = '' }: ArtProps) {
  const [face, setFace] = useState(2)
  const [roll, setRoll] = useState(0)
  const timers = useRef<number[]>([])

  const rollDie = useCallback(() => {
    setRoll((n) => n + 1)
    // Swap the face mid-spin, while it is blurred by the motion
    timers.current.push(
      window.setTimeout(() => setFace((f) => (f + 1 + Math.floor(Math.random() * 5)) % 6), ROLL_MS / 2),
    )
  }, [])

  // One roll after the entrance hints that the die is tappable
  useEffect(() => {
    const pending = timers.current
    pending.push(window.setTimeout(rollDie, 1900))
    return () => pending.forEach(clearTimeout)
  }, [rollDie])

  return (
    <svg viewBox="0 0 390 300" fill="none" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="hero-glow" cx="0.5" cy="0.6" r="0.5">
          <stop offset="0" stopColor="var(--mustard)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--mustard)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="hero-sun">
        <circle cx="330" cy="40" r="90" fill="var(--sand)" />
      </g>

      <g className="hero-door">
        <ellipse className="hero-glow" cx="210" cy="215" rx="110" ry="95" fill="url(#hero-glow)" />
        <path d="M150 300V170a60 60 0 0 1 120 0v130Z" fill="var(--terracotta)" />
        <path d="M170 300V176a40 40 0 0 1 80 0v124Z" fill="#f6c46a" />
        <path className="hero-leaf" d="M170 300V176a40 40 0 0 1 80 0v124Z" fill="var(--terracotta-deep)" />
        {/* Moves with the leaf instead of scaling, so it stays round */}
        <circle className="hero-knob" cx="236" cy="236" r="5" fill="var(--mustard)" />
      </g>

      <g className="hero-die-in">
        <g className="animate-float [transform-box:fill-box]">
          <g
            key={roll}
            className={`cursor-pointer ${roll ? 'hero-die-roll' : ''}`}
            onClick={rollDie}
          >
            <g transform="rotate(-12 92 198)">
              <rect x="44" y="150" width="96" height="96" rx="22" fill="var(--mustard)" />
              <g fill="var(--cocoa)">
                {DIE_FACES[face]!.map(([cx, cy]) => (
                  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" />
                ))}
              </g>
            </g>
          </g>
        </g>
      </g>

      <g className="hero-coin-in [animation-delay:450ms]">
        <g className="animate-float-slow [transform-box:fill-box]">
          <circle cx="306" cy="232" r="30" fill="var(--mustard)" />
          <circle cx="306" cy="232" r="21" stroke="var(--cocoa)" strokeOpacity="0.35" strokeWidth="2" />
        </g>
      </g>
      <g className="hero-coin-in [animation-delay:600ms]">
        <circle cx="336" cy="268" r="22" fill="var(--amber)" />
        <circle cx="336" cy="268" r="14" stroke="var(--cocoa)" strokeOpacity="0.35" strokeWidth="2" />
      </g>

      <g fill="var(--mustard)">
        <path className="hero-spark" d={sparkle(278, 188, 9)} />
        <path className="hero-spark [animation-delay:1.3s]" d={sparkle(362, 222, 7)} />
        <path className="hero-spark [animation-delay:2.4s]" d={sparkle(128, 128, 8)} />
      </g>

      <path className="hero-line" d="M30 300h330" stroke="var(--cocoa)" strokeWidth="2" pathLength={1} />
    </svg>
  )
}

/** Waiting for players: a door left ajar, light spilling out. */
export function DoorArt({ className = '' }: ArtProps) {
  return (
    <svg viewBox="0 0 200 170" fill="none" className={className} aria-hidden="true">
      <circle cx="150" cy="40" r="34" fill="var(--sand)" />
      <path d="M60 160V80a40 40 0 0 1 80 0v80Z" fill="var(--terracotta-deep)" />
      <path d="M100 160V42a40 40 0 0 1 40 38v80Z" fill="var(--mustard)" opacity="0.9" />
      <path d="M100 160 L160 170 H40 Z" fill="var(--mustard)" opacity="0.25" />
      <path d="M60 160V80a40 40 0 0 1 40-40v120Z" fill="var(--terracotta)" />
      <circle cx="90" cy="112" r="4" fill="var(--mustard)" />
      <path d="M20 160h160" stroke="var(--cocoa)" strokeWidth="2" />
    </svg>
  )
}

/** Victory: a crown in a slowly turning burst. */
export function CrownArt({ className = '' }: ArtProps) {
  return (
    <svg viewBox="0 0 160 160" fill="none" className={className} aria-hidden="true">
      <g className="animate-rays origin-center [transform-box:fill-box]" fill="var(--mustard)" opacity="0.35">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M80 80 L76 8 L84 8 Z" transform={`rotate(${i * 30} 80 80)`} />
        ))}
      </g>
      <circle cx="80" cy="80" r="46" fill="var(--terracotta)" />
      <g className="animate-pop origin-center [transform-box:fill-box]">
        <path d="M54 98 L50 64 L66 76 L80 56 L94 76 L110 64 L106 98 Z" fill="var(--mustard)" />
        <rect x="53" y="98" width="54" height="8" rx="3" fill="var(--mustard)" />
        <circle cx="50" cy="62" r="4" fill="var(--mustard)" />
        <circle cx="80" cy="54" r="4" fill="var(--mustard)" />
        <circle cx="110" cy="62" r="4" fill="var(--mustard)" />
        <circle cx="80" cy="84" r="4" fill="var(--terracotta-deep)" />
      </g>
    </svg>
  )
}

/** Game over without a winner: a flag on a hill. */
export function FlagArt({ className = '' }: ArtProps) {
  return (
    <svg viewBox="0 0 160 160" fill="none" className={className} aria-hidden="true">
      <circle cx="80" cy="80" r="56" fill="var(--sand)" />
      <path d="M30 128 Q80 96 130 128 Z" fill="var(--terracotta-deep)" />
      <path d="M72 120V40" stroke="var(--cocoa)" strokeWidth="4" strokeLinecap="round" />
      <path className="animate-float-slow [transform-box:fill-box]" d="M74 42h40l-10 14 10 14H74Z" fill="var(--terracotta)" />
    </svg>
  )
}

/** Brand mark: a sword, for the header. */
export function SwordMark({ className = '' }: ArtProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g transform="rotate(-45 12 12)">
        <path d="M12 2l2 3v10h-4V5Z" fill="var(--terracotta)" />
        <rect x="7" y="15" width="10" height="2.4" rx="1.2" fill="var(--cocoa)" />
        <rect x="11" y="17.4" width="2" height="3.4" rx="0.8" fill="var(--cocoa)" />
        <circle cx="12" cy="21.4" r="1.4" fill="var(--mustard)" />
      </g>
    </svg>
  )
}
