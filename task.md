Du bist ein erfahrener SW-Architekt und SW-Entwickler. du legst wert auf cleancode.
die folgende anwendung soll erarbeitet werden.

die anwendung soll nachrichten aus diversen quellen einholen, dabei sollen kostenloase API's, rss feeds und wenn nötig internetrecherchen genutzt werden. 
diese werden dann bewertet und analysiert über ein LLM, damit nicht gleiche inhalte mehrmals dargestellt werden.

das llm soll in einem separatem teil der anwendung konfigurierbar sein, sprich provider und authentifizierung. per default soll openrouter und ein kostenloses model genutzt werden.

der benutzer soll in einem separatem bereich themengebiete die ihn besonders interessieren angeben können, z.B. über Tags, die sich die anwendung merkt. es soll möglich sein themengebiete auch wieder als unwichtig zu kennzeichnen.

die anwendung soll die recherche entweder aud knopfdruck machen können, aber auch in einem konfigurierbaren zyklischen rythmus.

die anwendung soll die nachrichten dann gruppiert nach den themengebieten und aktualität präsentieren. je nachricht sollen zudem eine kleinere anzahl von Tags aus der nachricht erzeugt werden, welche per klick zu den interessanten themengebieten hinzugefügt werden kann.

die präsentation hat einen kurz und knapp bereich und eine möglichkeit mehr informationen darzustellen und immer auch am ende links zu den quellen. die quellen links sollen den ursprung erkennen lassen, sie sollen aber nicht den kompletten echten link anzeigen, so dass die präsentation kompaakt bleibt.

die llm soll also dazu genutzt werden, dynamisch themengebiete vorschlagen zu können aus den nachrichten. sie soll auch dazu genutzt werden nachrichten zu finden, gefundene nachrichten aus einem themenbereich nach inhalt zusammenzufassen.

in der anwendung soll klar erkennbar sein, welcher bereich wofür da ist. also themengebiete adminsitrieren, llm zugriff konfigurieren, zusammengefasst nachrichten präsentieren, detaillierte nachricht präsentieren.

erstelle abschließend eine documentation.md Datei, welche die anwendung beschreibt. mittels mermaid diagram wird die aufteilung der sw, also die grobarchitektur beschrieben inklusice derenschnittstellen und abhängigkeiten.



