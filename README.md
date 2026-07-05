# 📰 NewsCompacter

Lokale Web-App zur intelligenten Bündelung von Nachrichten aus RSS-Quellen mit LLM-gestützter Analyse.

**Features:**
- Sammelt Nachrichten aus beliebigen RSS-Feeds + Google News (konfigurierbar)
- LLM-generierte **Zusammenfassungen** (1–2 Sätze) und **Tags** (5–8 Schlagwörter)
- Erkennt Duplikate – gleiche Meldung aus verschiedenen Quellen wird **einmal** dargestellt mit allen Quellen + separaten Links
- Semantische LLM-Deduplizierung fasst auch Artikel mit unterschiedlichen Titeln zusammen, inkl. konsolidierter Summary
- **Thematische Gruppierung** im Dashboard (auch als Themengruppen), **Tags** per Klick als relevant/irrelevant bewertbar
- Nachrichten als **Favoriten** speichern, ungespeicherte ältere Einträge automatisch aufgeräumt
- **Dark Mode**, **Sprachsteuerung** (DEU/ENG/ORIG), automatischer Fetch per Intervall
- **Pagination** ("Mehr laden", 50er Blöcke), **J/K-Tastaturnavigation** zwischen Kapiteln
- **Keyword-Filter** mit Hervorhebung: Suchbegriffe eingeben, passende Nachrichten werden gefiltert und Treffer farbig markiert
- **API-Key verschlüsselt** (Fernet), opt-in **Auth-Middleware** (`NC_API_KEY`), Rate Limiting
- **ErrorBoundary**, Lösch-Bestätigungsdialoge, Toast-Benachrichtigungen, 18 Unit-Tests
- Vollständig lokal – Daten bleiben in SQLite auf deinem Rechner

---

## Screenshots

_– Dashboard: Nachrichten gruppiert nach Thema mit Tags, Summary und Quellenlinks –_

## Quick Start

**Voraussetzungen:** Python 3.10+, Node.js 18+

```bash
# 1. Backend starten
cd backend
pip install -r requirements.txt --break-system-packages
uvicorn main:app --host 0.0.0.0 --port 8000 &

# 2. Frontend bauen (einmalig)
cd frontend
npm install
npm run build

# 3. Öffnen
xdg-open http://localhost:8000
```

Optional im Dev-Modus: `npm run dev` im `frontend/`-Verzeichnis → Frontend unter `http://localhost:5173`.

### Raspberry Pi

Ausführliche Schritt-für-Schritt-Anleitung in [`raspberry-pi-setup.md`](raspberry-pi-setup.md) – von der SD-Karte bis zum fertigen Systemd-Dienst.

---

## Architektur

```
┌─────────────┐     ┌───────────────────┐     ┌──────────────┐
│  React/TS   │────▶│  FastAPI Backend  │────▶│   SQLite DB  │
│  (Vite)     │ HTTP│  (Python)         │     │  (SQLAlchemy)│
└─────────────┘     └───────┬───────────┘     └──────────────┘
                            │
                    ┌───────┴───────────┐
                     │  NewsFetcher (RSS)│──▶ RSS-Feeds
                     │  LLM-Service     │──▶ OpenRouter / DeepSeek
                     │  Scheduler       │
                    └──────────────────┘
```

## API-Übersicht

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/topics` | Themengebiete |
| `POST` | `/api/topics` | Thema anlegen |
| `PUT` | `/api/topics/{id}` | Thema aktualisieren (auch `group_id`) |
| `DELETE` | `/api/topics/{id}` | Thema löschen |
| `GET` | `/api/topic-groups` | Themengruppen |
| `POST` | `/api/topic-groups` | Themengruppe anlegen |
| `PUT` | `/api/topic-groups/{id}` | Themengruppe aktualisieren |
| `DELETE` | `/api/topic-groups/{id}` | Themengruppe löschen |
| `GET` | `/api/news` | Nachrichten (optional `?topic_id=`, `?keyword=` clientseitig filtern + highlight) |
| `PATCH` | `/api/news/{id}` | Speicherstatus ändern |
| `POST` | `/api/fetch/now` | Manueller Fetch + Anreicherung |
| `POST` | `/api/fetch/enrich` | Nur LLM-Anreicherung |
| `GET` | `/api/llm-config` | LLM-Konfiguration abrufen |
| `PUT` | `/api/llm-config` | LLM-Konfiguration speichern |
| `GET` | `/api/llm-config/models` | Verfügbare Modelle vom Provider abrufen |
| `GET` | `/api/sources` | RSS-Quellen |
| `PUT` | `/api/tag-prefs` | Tag bewerten |
| `GET` | `/api/settings/language` | Sprache abrufen |

Vollständige Liste in [`documentation.md`](documentation.md).

## Konfiguration

1. **LLM-API-Key** eintragen unter `/llm-config` (Provider-Presets: OpenRouter, DeepSeek oder benutzerdefinierter OpenAI-kompatibler Anbieter). Modelle werden live vom Provider gefetcht.
2. **Themengebiete** anlegen unter `/topics` → bestimmen die Kapitel im Dashboard. Mehrere Themen können zu **Themengruppen** zusammengefasst werden, sodass sie gemeinsam als ein Kapitel erscheinen
3. **RSS-Quellen** verwalten unter `/sources` (15 Defaults inkl. BBC, Tagesschau, Spiegel, Heise, …)
4. **Sprache / Intervall** über Navigationselemente
5. **Keyword-Filter** im Dashboard: Komma-getrennte Begriffe eingeben → News-Liste wird gefiltert + Treffer gelb markiert

## Technologie-Stack

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi)][fastapi]
[![React](https://img.shields.io/badge/React-20232A?logo=react)][react]
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript)][ts]
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite)][sqlite]
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite)][vite]

[fastapi]: https://fastapi.tiangolo.com
[react]: https://react.dev
[ts]: https://www.typescriptlang.org
[sqlite]: https://www.sqlite.org
[vite]: https://vite.dev

## Lizenz

MIT
