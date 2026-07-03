import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useSearchParams, useLocation } from 'react-router-dom'
import { useTheme } from './useTheme'
import { api } from './services/api'
import Dashboard from './pages/Dashboard'
import TopicManager from './pages/TopicManager'
import LlmConfig from './pages/LlmConfig'
import SourceManager from './pages/SourceManager'

const POLL_INTERVAL_MS = 5000
const APP_VERSION = 'v0.2'

export default function App() {
  const { theme, toggle } = useTheme()
  const [language, setLanguage] = useState('ORIG')
  const [langLoading, setLangLoading] = useState(true)
  const [enrichingBg, setEnrichingBg] = useState(false)
  const [fetchingBg, setFetchingBg] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const ageFilter = searchParams.get('age') || ''
  const keywordFilter = searchParams.get('keyword') || ''
  const keywordMode = (searchParams.get('kmode') || 'OR').toUpperCase() === 'AND' ? 'AND' : 'OR'
  const isDashboard = location.pathname === '/'

  useEffect(() => {
    api.settings.language().then((res) => {
      setLanguage(res.language)
      setLangLoading(false)
    }).catch(() => setLangLoading(false))
  }, [])

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const s = await api.fetch.enrichStatus()
        setFetchingBg((prev) => {
          if (prev && !s.fetching) window.dispatchEvent(new CustomEvent('fetch-done'))
          return s.fetching
        })
        setEnrichingBg((prev) => {
          if (prev && !s.enriching) window.dispatchEvent(new CustomEvent('enrich-done'))
          return s.enriching
        })
      } catch (e) { console.error('Poll error', e) }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const handleLanguageChange = async (lang: string) => {
    setLanguage(lang)
    try {
      await api.settings.setLanguage(lang)
    } catch (e) { console.error('Language change error', e) }
  }

  return (
    <div className="app-layout">
      {fetchingBg && (
        <div className="enrich-banner">
          <span className="spinner" style={{ marginRight: '0.5rem' }} />
          News-Aktualisierung läuft…
        </div>
      )}
      {!fetchingBg && enrichingBg && (
        <div className="enrich-banner">
          <span className="spinner" style={{ marginRight: '0.5rem' }} />
          Tag-Analyse läuft im Hintergrund…
        </div>
      )}
      <nav>
        <h1><img src="/favicon.svg" alt="" className="nav-icon" /> NewsCompacter</h1>
        <div className={`nav-links${menuOpen ? ' open' : ''}`}>
          <NavLink to="/" end onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
          <NavLink to="/topics" onClick={() => setMenuOpen(false)}>Themen</NavLink>
          <NavLink to="/llm-config" onClick={() => setMenuOpen(false)}>LLM</NavLink>
          <NavLink to="/sources" onClick={() => setMenuOpen(false)}>Quellen</NavLink>
          {!langLoading && (
            <select
              className="lang-select"
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
            >
              <option value="DEU">DEU</option>
              <option value="ENG">ENG</option>
              <option value="ORIG">ORIG</option>
            </select>
          )}
          <select
            className="lang-select"
            value={ageFilter}
            onChange={(e) => {
              const v = e.target.value
              setSearchParams(v ? { age: v } : {}, { replace: true })
              setMenuOpen(false)
            }}
          >
            <option value="">Alle</option>
            <option value="1">Max. 1 Tag</option>
            <option value="2">Max. 2 Tage</option>
          </select>
          <button className="theme-btn" onClick={toggle} aria-label="Theme umschalten">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        <button
          className="hamburger"
          aria-label="Menü"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span /> <span /> <span />
        </button>
      </nav>

      {isDashboard && (
        <div className="app-filter-bar">
          <div className="filter-bar-row">
            <div className="filter-input-wrap">
              <input
                type="text"
                placeholder="Nach Schlagworten filtern... (Komma-getrennt)"
                value={keywordFilter}
                onChange={(e) => {
                  const v = e.target.value
                  const params = new URLSearchParams(searchParams.toString())
                  if (v) params.set('keyword', v)
                  else params.delete('keyword')
                  setSearchParams(params, { replace: true })
                }}
              />
              {keywordFilter && (
                <button className="clear-btn" onClick={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.delete('keyword')
                  setSearchParams(params, { replace: true })
                }}>×</button>
              )}
            </div>
            <div className="filter-mode">
              <button
                className={`filter-mode-btn${keywordMode === 'OR' ? ' active' : ''}`}
                onClick={() => {
                  const p = new URLSearchParams(searchParams.toString())
                  p.set('kmode', 'OR')
                  setSearchParams(p, { replace: true })
                }}
              >OR</button>
              <button
                className={`filter-mode-btn${keywordMode === 'AND' ? ' active' : ''}`}
                onClick={() => {
                  const p = new URLSearchParams(searchParams.toString())
                  p.set('kmode', 'AND')
                  setSearchParams(p, { replace: true })
                }}
              >AND</button>
            </div>
          </div>
        </div>
      )}

      <div className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topics" element={<TopicManager />} />
          <Route path="/llm-config" element={<LlmConfig />} />
          <Route path="/sources" element={<SourceManager />} />
        </Routes>

        <footer className="footer">
          <span>Powered by</span>
          <a href="https://fastapi.tiangolo.com" target="_blank" rel="noopener noreferrer">FastAPI</a>
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer">React</a>
          <a href="https://www.sqlite.org" target="_blank" rel="noopener noreferrer">SQLite</a>
          <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">OpenRouter</a>
          <span>· NewsCompacter {APP_VERSION}</span>
        </footer>
      </div>
    </div>
  )
}
