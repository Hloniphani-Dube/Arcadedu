import type { EnemyTier } from '../lib/types'

/*
  The Learning Atlas.

  A country = a subject. Entering a country lists its topics; each topic is a
  Candy-Crush-style path of nodes. Because the AI generates and grades every
  challenge from the (subject, topic) strings, a node only needs a difficulty
  tier and a title — no authored question bank.

  Region shapes are generated as deterministic blobs so this file stays readable.
*/

export type NodeKind = 'challenge' | 'boss'

export interface AtlasNode {
  id: string
  title: string
  kind: NodeKind
  tier: EnemyTier
}

export interface Topic {
  id: string
  name: string
  blurb: string
  nodes: AtlasNode[]
}

export interface Subject {
  id: string
  name: string
  blurb: string
  /** Visual grouping label only. */
  continent: string
  /** Centre of the region on the map, in atlas coords (viewBox 0 0 1000 640). */
  center: [number, number]
  /** SVG path `d` for the country outline. */
  region: string
  topics: Topic[]
}

export const ATLAS_VIEWBOX = { w: 1000, h: 640 }

// --- deterministic blob generator -----------------------------------------

/** A wobbly closed path around (cx,cy). Same inputs → same shape. */
function blob(cx: number, cy: number, r: number, seed: number): string {
  const points = 10
  let s = seed * 9301 + 49297
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const pts: [number, number][] = []
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const rr = r * (0.78 + rand() * 0.44)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82])
  }
  // Catmull-Rom → cubic bezier for a smooth coastline.
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % points]
    const p3 = pts[(i + 2) % points]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `
  }
  return d + 'Z'
}

// --- node ladder helper --------------------------------------------------

const LADDER: EnemyTier[] = ['trivial', 'easy', 'medium', 'hard']

function path(topicId: string, titles: string[]): AtlasNode[] {
  return titles.map((title, i) => {
    const last = i === titles.length - 1
    return {
      id: `${topicId}-${i + 1}`,
      title,
      kind: last ? 'boss' : 'challenge',
      tier: last ? 'boss' : LADDER[Math.min(i, LADDER.length - 1)],
    }
  })
}

// --- the atlas ---------------------------------------------------------------

export const SUBJECTS: Subject[] = [
  {
    id: 'algebra',
    name: 'Algebra',
    blurb: 'Tangled vines of unknowns. Balance both sides to find your way through.',
    continent: 'Numeria',
    center: [175, 185],
    region: blob(175, 185, 95, 3),
    topics: [
      {
        id: 'linear-equations',
        name: 'Linear Equations',
        blurb: 'Isolate the unknown, one balanced step at a time.',
        nodes: path('linear-equations', [
          'Variable Slime',
          'Coefficient Wolf',
          'Substitution Mage',
          'Stone Guardian of Balance',
          'The Equation Beast',
        ]),
      },
      {
        id: 'inequalities',
        name: 'Inequalities',
        blurb: 'Same balance, but the scales can tip — mind the flip.',
        nodes: path('inequalities', [
          'Lesser Imp',
          'Number-Line Serpent',
          'Sign-Flip Warden',
          'Interval Golem',
          'The Boundary Titan',
        ]),
      },
    ],
  },
  {
    id: 'geometry',
    name: 'Geometry',
    blurb: 'Where angles keep their promises and proofs open every door.',
    continent: 'Numeria',
    center: [165, 400],
    region: blob(165, 400, 88, 7),
    topics: [
      {
        id: 'triangles',
        name: 'Triangles',
        blurb: 'Three sides, endless consequences.',
        nodes: path('triangles', [
          'Acute Sprite',
          'Pythagoras Sentinel',
          'Similarity Djinn',
          'Congruence Warden',
          'The Proof Colossus',
        ]),
      },
      {
        id: 'circles',
        name: 'Circles',
        blurb: 'Every point equidistant from a truth at the centre.',
        nodes: path('circles', [
          'Radius Wisp',
          'Chord Stalker',
          'Tangent Phantom',
          'Arc Guardian',
          'The Circumference Wyrm',
        ]),
      },
    ],
  },
  {
    id: 'physics',
    name: 'Physics',
    blurb: 'Motion, force and energy — the machinery under everything.',
    continent: 'Mechanica',
    center: [510, 150],
    region: blob(510, 150, 100, 11),
    topics: [
      {
        id: 'kinematics',
        name: 'Kinematics',
        blurb: 'Describe the motion before you explain it.',
        nodes: path('kinematics', [
          'Constant-Velocity Drone',
          'Acceleration Hound',
          'Projectile Harpy',
          'Relative-Motion Shade',
          'The Freefall Leviathan',
        ]),
      },
      {
        id: 'forces',
        name: 'Forces',
        blurb: "Newton's three laws, and the free-body diagram that tames them.",
        nodes: path('forces', [
          'Friction Crawler',
          'Tension Revenant',
          'Incline Ogre',
          'Equilibrium Warden',
          'The Momentum Dragon',
        ]),
      },
    ],
  },
  {
    id: 'computing',
    name: 'Computing',
    blurb: 'Think in steps a machine could follow — then reason about their cost.',
    continent: 'Mechanica',
    center: [545, 335],
    region: blob(545, 335, 92, 17),
    topics: [
      {
        id: 'algorithms',
        name: 'Algorithms',
        blurb: 'Correctness first, then speed.',
        nodes: path('algorithms', [
          'Loop Imp',
          'Recursion Echo',
          'Sorting Wraith',
          'Complexity Warden',
          'The Halting Sphinx',
        ]),
      },
      {
        id: 'data-structures',
        name: 'Data Structures',
        blurb: 'Choose the shape that makes the operation cheap.',
        nodes: path('data-structures', [
          'Array Golem',
          'Linked Shade',
          'Tree Guardian',
          'Hash Djinn',
          'The Graph Hydra',
        ]),
      },
    ],
  },
  {
    id: 'biology',
    name: 'Biology',
    blurb: 'Systems within systems — structure always serving function.',
    continent: 'Vitalis',
    center: [830, 195],
    region: blob(830, 195, 96, 23),
    topics: [
      {
        id: 'cells',
        name: 'Cell Biology',
        blurb: 'The smallest thing that counts as alive.',
        nodes: path('cells', [
          'Membrane Mote',
          'Organelle Familiar',
          'Osmosis Phantom',
          'Mitosis Warden',
          'The Metabolism Behemoth',
        ]),
      },
      {
        id: 'genetics',
        name: 'Genetics',
        blurb: 'Inheritance is probability with a history.',
        nodes: path('genetics', [
          'Allele Sprite',
          'Punnett Stalker',
          'Linkage Shade',
          'Pedigree Warden',
          'The Mutation Colossus',
        ]),
      },
    ],
  },
  {
    id: 'english',
    name: 'English',
    blurb: 'Read for what the text does, not just what it says.',
    continent: 'Lexica',
    center: [440, 495],
    region: blob(440, 495, 100, 29),
    topics: [
      {
        id: 'close-reading',
        name: 'Close Reading',
        blurb: 'Evidence, inference, and the gap between them.',
        nodes: path('close-reading', [
          'Diction Wisp',
          'Tone Stalker',
          'Imagery Phantom',
          'Structure Warden',
          'The Theme Leviathan',
        ]),
      },
      {
        id: 'argument',
        name: 'Argument & Rhetoric',
        blurb: 'Claim, warrant, and the counter you did not want to hear.',
        nodes: path('argument', [
          'Claim Imp',
          'Warrant Revenant',
          'Fallacy Hound',
          'Rebuttal Warden',
          'The Synthesis Dragon',
        ]),
      },
    ],
  },
]

export const CONTINENTS: { id: string; name: string; label: [number, number] }[] = [
  { id: 'numeria', name: 'Numeria', label: [135, 300] },
  { id: 'mechanica', name: 'Mechanica', label: [520, 250] },
  { id: 'vitalis', name: 'Vitalis', label: [830, 300] },
  { id: 'lexica', name: 'Lexica', label: [440, 600] },
]

// --- lookups -------------------------------------------------------------

export const getSubject = (id: string | undefined) =>
  SUBJECTS.find((s) => s.id === id)

export function getTopic(subjectId: string | undefined, topicId: string | undefined) {
  return getSubject(subjectId)?.topics.find((t) => t.id === topicId)
}

export function getNode(
  subjectId: string | undefined,
  topicId: string | undefined,
  nodeId: string | undefined,
) {
  return getTopic(subjectId, topicId)?.nodes.find((n) => n.id === nodeId)
}

/** Every subject is open from the start — worlds and topics are never gated,
 *  only the levels inside a topic run in sequence. */
export const DEFAULT_UNLOCKED = SUBJECTS.map((s) => s.id)
