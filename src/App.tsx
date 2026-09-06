import { useApp } from './store'
import { CharacterCard } from './components/CharacterCard'
import { Btn } from './components/ui'
import { ThemeMenu } from './components/ui/theme-menu'
import { Home } from './screens/Home'
import { MapScreen } from './screens/MapScreen'
import { LearnMode } from './screens/LearnMode'
import { RpgMode } from './screens/RpgMode'

function App() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const name = useApp((s) => s.profile.name)
  const setName = useApp((s) => s.setName)

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-edge bg-void/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setView('home')}
            className="text-lg font-black tracking-tight"
          >
            Arcade<span className="text-mana-bright">du</span>
          </button>

          <nav className="ml-4 flex gap-1 text-sm">
            {(['learn', 'rpg', 'map'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 capitalize transition ${
                  view === v
                    ? 'bg-panel-2 text-mana-bright'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {v === 'map' ? 'World Map' : v}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeMenu className="hidden sm:flex" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Character name"
              className="w-36 rounded-lg border border-edge bg-panel px-2 py-1 text-sm outline-none focus:border-mana"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {view === 'home' && <Home />}
        {view === 'map' && <MapScreen />}
        {view === 'learn' && (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <aside className="hidden lg:block">
              <CharacterCard />
              <Btn className="mt-3 w-full" onClick={() => setView('home')}>
                ← Modes
              </Btn>
            </aside>
            <LearnMode />
          </div>
        )}
        {view === 'rpg' && (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <aside className="hidden lg:block">
              <CharacterCard />
              <Btn className="mt-3 w-full" onClick={() => setView('home')}>
                ← Modes
              </Btn>
            </aside>
            <RpgMode />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
