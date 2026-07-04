# NewsCompacter – Vollständige Anforderungsübersicht

> Ursprüngliche Anforderung: Nachrichten aus RSS-Feeds und Google News einholen, per LLM bewerten/deduplizieren/taggen, nach benutzerdefinierten Themengebieten gruppiert präsentieren. Quellen-Links kompakt (Domain-Only). LLM-Provider und Authentifizierung frei konfigurierbar. Recherche manuell oder zyklisch.

## 1. Tech-Stack & Architektur

- **Backend**: Python mit FastAPI (async), SQLAlchemy, SQLite (aiosqlite)
- **Frontend**: Vite + React 18 + TypeScript, React Router
- **Datenhaltung**: SQLite (lokal, keine Server-Installation)
- **Architektur**: Lokale Web-App (Backend localhost:8000, Frontend localhost:5173)
- **News-Quellen**: Konfigurierbare RSS-Feeds + Google News
- **Sicherheit**: API-Key-Verschlüsselung (Fernet), Auth-Middleware (opt-in per `NC_API_KEY`), Rate Limiting, Prompt-Injection-Schutz
- **Migrations-System**: Schema-Version-Tabelle mit versionierten Migrationen
- **Tests**: pytest (Backend), 18 Unit-Tests

## 2. Seiten / Bereiche

### 2.1 Dashboard (`/`)
- Linke Sidebar: Kapitel-Übersicht (wichtige Themengebiete + "Allgemein")
- News werden **intelligent gruppiert**: Eine Nachricht erscheint unter einem Thema, wenn
  - ein LLM-generierter **Tag**, der **Titel**, die **Summary** oder der **Content** das Thema als ganzes Wort (Word-Boundary-Regex) enthält
  - Alle vier Felder prüfen einheitlich mit `\b`-Word-Boundary → kein False-Positive (z.B. "Politik" matcht nicht "Politiker")
- **Score-basierte Sortierung** innerhalb jeder Gruppe:
  - Score = (Anzahl `important`-Tags) − (Anzahl `unimportant`-Tags)
  - Höherer Score → weiter oben
  - Kein Ausblenden von Nachrichten mehr
- Jede Nachricht zeigt: Kurzfassung (Summary), ausklappbare Detailansicht, kompakte Quellen-Links (nur Domain)
- Bei mehreren Quellen (Dublette) werden Quellen-Namen mit ` + ` und URLs verknüpft
- Tags mit `+` (links) und `−` (rechts) Buttons, immer sichtbar
- Bewertete Tags zeigen aktiven Button farblich markiert (grün/rot)
- Bild-Popup bei Mouseover oder Klick auf Titel (aus RSS extrahiert, HTML gestrippt)
- Buttons: "Jetzt aktualisieren" + "Anreichern" (LLM-Nachbearbeitung)
- Sprachumschalter in der Navigation: DEU / ENG / ORIG (Default)
- **Pagination**: "Mehr laden"-Button lädt 50 weitere Artikel pro Gruppe
- **Tastatur-Navigation**: J/K zum Navigieren zwischen Kapiteln
- **Lösch-Bestätigungsdialoge** bei Topics, Gruppen und Quellen
- **Toast-Benachrichtigungen** für Fehler
- **ErrorBoundary** – verhindert kompletten App-Crash bei Render-Fehlern
- **Kapitel** zeigen Nachrichten-Anzahl (Gesamtsumme + pro Topic)

### 2.2 Themengebiete (`/topics`)
- Default-Themengebiete (Weltpolitik, Deutschlandpolitik, etc.) werden beim ersten Start automatisch angelegt
- Nur hier werden Themengebiete vom Benutzer angelegt/bearbeitet
- Kompakte Liste mit farbigem Punkt (grün = wichtig, rot = unwichtig)
- **Inline-Editing**: Klick auf Namen → Eingabefeld, Enter/Blur speichert, Escape bricht ab
- Toggle "Interessant" / "Unwichtig"
- Löschen per ✕
- Tags unter jedem Thema: immer `+`, `−` und `✕` sichtbar
- Bewertete Tags zeigen farbige Buttons

### 2.3 LLM-Konfiguration (`/llm-config`)
- Provider (frei eingebbar, Default: openrouter)
- API-Key (Passwort-Feld, verschlüsselt gespeichert, "Key löschen"-Button)
- Model: Combobox mit Autocomplete, freie Modelle oben mit "Free"-Badge
- Base URL (Default: https://openrouter.ai/api/v1)
- Zyklischer Abruf: Intervall (stündlich / 6h / 24h / aus)

### 2.4 Quellen (`/sources`)
- CRUD für RSS-Quellen (Name, URL, Typ: RSS / Google News)
- Aktivieren/Deaktivieren per Toggle
- Löschen
- "Intelligente Vorschläge" per LLM (mit Fallback)
- Default-Quellen werden beim ersten Start automatisch angelegt

## 3. Datenmodell

| Tabelle | Beschreibung |
|---|---|
| `topics` | Themengebiete (Name, is_important, group_id) – **nur vom Benutzer** |
| `topic_groups` | Themengruppen (name, display_order) – bündeln mehrere Topics zu einem Kapitel |
| `news` | Nachrichten (Titel, Quelle, URL, Content, Summary, image_url, Fingerprint) |
| `news_tags` | Vom LLM generierte Tags (news_id, tag_name) |
| `tag_preferences` | Benutzer-Feedback zu Tags (tag_name, is_important) |
| `news_sources` | Konfigurierte RSS/News-Quellen (name, url, type, enabled) |
| `llm_config` | Provider, API-Key (verschlüsselt), Model, Base-URL |
| `schema_version` | Migrations-Versionstracking (version, applied_at) |
| `settings` | Fetch-Intervall, Sprache (DEU/ENG/ORIG) |

### Wichtige Trennung
- **Tags ≠ Themengebiete**: Tags werden vom LLM generiert. Themengebiete vom Benutzer.
- **Themengruppen**: Fassen mehrere Topics zusammen, sodass sie im Dashboard als **ein** Kapitel erscheinen. Topics ohne Gruppe bleiben eigenständige Kapitel.
- **Dubletten (Fingerprint)**: Gleicher Titel (source-agnostischer SHA-256-Hash) aus verschiedenen Quellen → ein Eintrag (Quellen + URLs kombiniert, längster Content gewinnt)
- **Dubletten (LLM)**: `deduplicate_articles()` erkennt semantisch ähnliche Artikel auch bei unterschiedlichen Titeln und führt Quellen/URLs/Content zusammen. Läuft automatisch während der LLM-Anreicherung.
- **Artikel-Content**: Falls RSS nur Kurztext liefert (< 80 Zeichen), wird die Artikel-URL abgerufen und Text aus `<article>`/`<body>` extrahiert (script/style/nav entfernt, max 2000 Zeichen)

## 4. LLM-Integration

- Standard-Provider: **OpenRouter** (kostenlos: `meta-llama/llama-3.2-3b-instruct`)
- Verwendung für:
  - **Tag-Generierung**: 3–5 Schlagwörter pro Nachricht
  - **Zusammenfassung**: 1–2 Sätze Summary
  - **Deduplizierung**: semantische Erkennung + Merge von Duplikaten bei unterschiedlichen Titeln
  - **Quellen-Vorschläge**: intelligente RSS-Empfehlungen
  - **Sprachsteuerung**: LLM antwortet in Deutsch/English/Originalsprache je nach Einstellung

## 5. UI-Features

- **Hell/Dunkel-Modus**: Toggle in Navigation, persistiert in localStorage, `prefers-color-scheme`
- **Sprachumschalter**: DEU / ENG / ORIG, persistiert im Backend (Settings)
- **Bild-Popup**: Mouseover oder Klick auf Titel zeigt extrahiertes Artikelbild
- **Pagination**: "Mehr laden"-Button (50 Artikel pro Ladung)
- **Tastaturnavigation**: J/K wechselt zwischen Kapiteln
- **`prefers-reduced-motion`**: Animationen werden bei Systemeinstellung deaktiviert
- **Score-Sortierung**: Nachrichten innerhalb der Gruppen nach Tag-Bewertung sortiert
- **Kompakte Quellen-Links**: nur Domain, abgeschnitten bei 160px mit Ellipsis
- **Favicon/Nav-Icon**: SVG-Logo in Tab-Bar und Navigation

## 6. Start & Betrieb

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn main:app --port 8000

# Frontend
cd frontend && npm install && npm run dev

# Oder beides via start.sh
./start.sh
```

Dann `http://localhost:8000` öffnen (Backend serviert gebautes Frontend)  
oder `http://localhost:5173` im Dev-Modus (mit `npm run dev`).

## 7. REST-Schnittstellen

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/topics` | Themengebiete CRUD (`group_id` im Body) |
| GET/POST/PUT/DELETE | `/api/topic-groups` | Themengruppen CRUD |
| GET | `/api/news` | Nachrichten (optional `?topic_id=`) |
| PATCH | `/api/news/{id}` | Nachricht aktualisieren (z.B. `is_saved`) |
| GET/PUT | `/api/llm-config` | LLM-Konfiguration |
| POST | `/api/fetch/now` | Manueller Fetch + Anreicherung |
| POST | `/api/fetch/enrich` | Nur LLM-Anreicherung (Tags + Summary) |
| GET | `/api/fetch/enrich-status` | Status von Fetch/Enrich (für Polling) |
| GET/POST | `/api/fetch/interval` | Fetch-Intervall |
| GET/PUT/DELETE | `/api/tag-prefs` | Tag-Bewertungen |
| GET/POST/PUT/DELETE | `/api/sources` | Quellen CRUD |
| GET | `/api/sources/suggest` | LLM-Quellen-Vorschläge |
| GET/PUT | `/api/settings/language` | Sprache |
