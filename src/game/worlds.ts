import type { WorldDef } from '../lib/types'

// MVP ships one fully playable world. The others are defined as "locked" stubs so
// the map screen shows where the universe is going without pretending they work.

export const ALGEBRA_FOREST: WorldDef = {
  id: 'algebra-forest',
  name: 'Algebra Forest',
  glyph: '🌲',
  subject: 'Mathematics',
  topic: 'Linear equations and basic algebra',
  blurb: 'Tangled vines of unknowns. Balance both sides to find your way through.',
  ladder: [
    {
      id: 'slime',
      name: 'Variable Slime',
      glyph: '🟢',
      tier: 'trivial',
      maxHp: 30,
      taunt: 'It jiggles. "x... x... what am iiii?"',
    },
    {
      id: 'wolf',
      name: 'Coefficient Wolf',
      glyph: '🐺',
      tier: 'easy',
      maxHp: 55,
      taunt: 'It circles you, multiplying its shadows.',
    },
    {
      id: 'mage',
      name: 'Substitution Mage',
      glyph: '🧙',
      tier: 'medium',
      maxHp: 80,
      taunt: '"Two truths at once — can you hold them both?"',
    },
    {
      id: 'guardian',
      name: 'Stone Guardian of Balance',
      glyph: '🗿',
      tier: 'hard',
      maxHp: 110,
      taunt: 'It will not move until the scales are even.',
    },
    {
      id: 'equation-beast',
      name: 'The Equation Beast',
      glyph: '👑',
      tier: 'boss',
      maxHp: 160,
      taunt: 'It rewrites the problem as you watch. Understanding is the only weapon that lands.',
    },
  ],
}

export interface WorldStub {
  id: string
  name: string
  glyph: string
  subject: string
  locked: true
}

export const LOCKED_WORLDS: WorldStub[] = [
  { id: 'code-kingdom', name: 'Code Kingdom', glyph: '⚔️', subject: 'Programming', locked: true },
  { id: 'bioforge', name: 'Bioforge', glyph: '🧬', subject: 'Biology', locked: true },
  { id: 'chronicle-realm', name: 'Chronicle Realm', glyph: '🏛️', subject: 'History', locked: true },
  { id: 'quantum-peaks', name: 'Quantum Peaks', glyph: '⚡', subject: 'Physics', locked: true },
  { id: 'the-library', name: 'The Library', glyph: '📖', subject: 'English', locked: true },
]

export const WORLDS = [ALGEBRA_FOREST]
