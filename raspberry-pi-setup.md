# NewsCompacter auf dem Raspberry Pi

## Übersicht

| Schritt | Dauer | Beschreibung |
|---------|-------|-------------|
| 1. OS installieren | 30 min | Raspberry Pi OS Lite 64-bit auf SD-Karte |
| 2. System einrichten | 10 min | Updates, Hostname, SSH |
| 3. Abhängigkeiten | 15 min | Python 3, Node.js 18, Git |
| 4. Repository klonen | 5 min | Code von GitHub holen |
| 5. Backend | 5 min | Python-Pakete installieren |
| 6. Frontend bauen | 10 min | Node-Pakete + Vite-Build |
| 7. Systemd-Dienst | 5 min | Autostart einrichten |
| 8. Fertig | – | `http://raspberrypi:8000` öffnen |

---

## Schritt für Schritt

### 1. Raspberry Pi OS installieren

- **Empfohlen:** Raspberry Pi OS Lite (64-bit) – kein Desktop nötig
- Download: https://www.raspberrypi.com/software/
- Mit dem Raspberry Pi Imager auf SD-Karte schreiben
- **Wichtig:** Vor dem Schreiben bei Zahnrad-Icon:
  - SSH aktivieren
  - Benutzername/Passwort setzen (z. B. `pi`)
  - WLAN konfigurieren (falls kein LAN-Kabel)

### 2. System einrichten

```bash
# Anmelden
ssh pi@raspberrypi

# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Hostname setzen (optional)
sudo raspi-config nonint do_hostname newscompacter
sudo reboot
```

Nach Neustart erneut anmelden.

### 3. Abhängigkeiten installieren

```bash
# Python 3 vorinstalliert – prüfen
python3 --version   # 3.10+ erforderlich

# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node --version      # 20+
```

### 4. Repository klonen

```bash
cd /opt
sudo mkdir -p NewsCompacter
sudo chown $USER:$USER NewsCompacter
git clone https://github.com/<DEIN_USER>/NewsCompacter.git NewsCompacter
cd NewsCompacter
```

### 5. Backend einrichten

```bash
cd backend
pip install --break-system-packages -r requirements.txt
```

### 6. Frontend bauen

```bash
cd ../frontend
npm install
npm run build
```

### 7. Systemd-Dienst einrichten

```bash
# Vorlage anpassen
cd /opt/NewsCompacter
cp newscompacter.service.example newscompacter.service
nano newscompacter.service   # User=<dein Benutzer> setzen
```

Für den Autostart die Service-Datei aktivieren:

```bash
sudo ln -s /opt/NewsCompacter/newscompacter.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable newscompacter
sudo systemctl start newscompacter
sudo systemctl status newscompacter   # Prüfen
```

**Alternative – von Hand starten (zum Testen):**

```bash
cd /opt/NewsCompacter/backend
rm -f newscompacter.db
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
```

### 8. Nutzung

- Im Browser: `http://raspberrypi:8000` oder `http://<IP-ADRESSE>:8000`
- **LLM-API-Key eintragen:** Unter `/llm-config` (OpenRouter-Key nötig für Tags/Summaries)
- **Quellen verwalten:** Unter `/sources` RSS-Feeds aktivieren/hinzufügen
- **Themengebiete:** Unter `/topics` verwalten

---

## Nach einem Update

```bash
cd /opt/NewsCompacter
git pull
cd frontend && npm install && npm run build
sudo systemctl restart newscompacter
```

## Fehlersuche

```bash
# Dienst-Status
sudo systemctl status newscompacter

# Logs
sudo journalctl -u newscompacter -f

# Port-Konflikt
sudo ss -tlnp | grep 8000
sudo kill -9 $(sudo lsof -ti:8000)
```
