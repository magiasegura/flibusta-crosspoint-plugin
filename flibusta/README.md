Flibusta for CrossPoint 1.2.3

Search the catalogue of your Flibusta Telegram bot and download EPUB books
directly to /Books/Flibusta on the reader. After setup no phone or open browser
is needed. Book ids in filenames keep different books with the same title apart.

Requirements
- CrossPoint firmware with SD-card plugins and JSON catalogue search.
  The contract was checked against crosspoint-reader/develop on 2026-11-05.
  Xteink X4 Pro is supported by CrossPoint; check your firmware has Plugins.
- Wi-Fi and a running web service from this project with /api/crosspoint routes.
- Access to the bot: an administrator or member of an allowed Telegram group.

Installation and setup
1. Copy this flibusta folder to /plugins/flibusta on the reader's SD card.
   Keep device.json, manifest.json, plugin.js and README.md together.
2. Enable Settings > Connectivity > Plugins.
3. Enable the reader's Wi-Fi web server and open its address on a phone/computer.
   Open the Plugins/settings page and find the Flibusta card.
4. Enter YOUR library web server address (WEB_PUBLIC_URL), not flibusta.is and
   not the reader's own address. The reader must be able to reach this address.
   Use HTTPS over the internet; plain HTTP is for a trusted local network.
5. Send /web to your Telegram bot in a private chat. Enter the fresh 8-digit
   code in the card and press Подключить читалку. The code lasts 10 minutes.
6. Stop the reader's web server. Open Home > Plugins > Flibusta on the reader.
   The first list is empty; select Search and type a title or author.
7. Select a book and Fetch. Open the downloaded book from Library or Files.

CrossPoint 2.0.0 cannot auto-open the search keyboard from a plugin manifest.
The initial screen now says "Поиск: кнопка справа вверху"; tap its Search icon.

EPUB transfer (requires the updated library web service)
The server downloads the complete EPUB before responding, checks ZIP integrity,
mimetype and container.xml, and returns the actual file size. Invalid or truncated
archives fail before a successful download response. Byte ranges are supported for
resuming a dropped transfer. Books above 100 MiB, or archives expanding beyond
100 MiB, are refused. The server keeps up to 1 MiB in RAM and spills larger files
to a temporary file which is removed when the request ends.
After updating the server, download a previously broken book again; the old file
on the SD card cannot repair itself. Firmware crash elimination still needs a
physical-device check.

Download folder
In the Flibusta web card, change "Папка для книг на SD-карте" and press
"Сохранить папку". Use an absolute SD-card path, for example /Books or
/Книги/Фантастика. The default is /Books/Flibusta; / means the SD-card root.
This does not require a new /web code and keeps your current server and session.
The setting affects future downloads; existing books are not moved.
Close and reopen Flibusta on the reader to load the changed setting.
To upgrade, replace the four distributed plugin files and keep config.json.
The folder check follows CrossPoint's protected-path rules: names containing
"..", credential-store paths and short FAT aliases in the first two levels
are refused before saving. Ordinary nested folders and the SD root are allowed.
The complete config.json must fit in 2048 UTF-8 bytes, including the server URL
and token. An oversized change is refused without replacing your current file.

OTA plugin updates (firmware is not changed)
1. Install version 1.2.0 manually once and update/restart the library web service.
2. Open the Flibusta web card after sign-in. Press "Включить OTA плагина".
   No new /web code is needed for an already configured plugin.
3. The button creates a small flibusta-update plugin beside this one. It has no
   token, no book-folder setting and no access to your sign-in code.
4. Stop the reader's web server. Open Home > Plugins > Flibusta — обновления.
   Select Flibusta. A newer server version shows Update; the current version
   shows Installed. Confirm Update, then reopen the regular Flibusta plugin.
5. For future updates the administrator updates the server code and restarts
   the web service; the reader then offers that plugin version over Wi-Fi.

Only manifest.json, device.json, plugin.js and README.md are replaced.
config.json, the access token, the download folder and downloaded books are kept.
The update files are public; private settings are never served by the OTA API.
CrossPoint must advertise catalog.bundle_install and catalog.version_tracking.
The standard installer stages files before replacing them. An SD write failure
during the final replacements can still leave a mixed plugin; reinstall the
release manually if that happens. Do not remove the SD card during an update.
If you change the library server address, press "Включить OTA плагина" again.
OTA setup uses the same multipart mkdir request as CrossPoint 2.0.0's built-in
file manager. Existing folder names are matched case-insensitively for FAT cards.
A directory created during setup is reused; other failures show the actual HTTP
status, target path and reader response instead of a generic error.
OTA files use the request's host and transport, so a local server address stays
local even if WEB_PUBLIC_URL points to a different public domain. A reverse proxy
must preserve the original Host and, with WEB_TRUST_PROXY=true, pass
X-Forwarded-Proto. WEB_COOKIE_SECURE does not change the OTA URL scheme.

Access and limitations
- Only available EPUB downloads are listed. PDFs and other originals that the
  server cannot offer as EPUB are omitted. No conversion runs on the reader.
- Search uses the same ranking as the website. At most 200 candidates are
  searched with Meilisearch, fewer with the database fallback. EPUB filtering
  happens before pagination; this is a search window, not the whole catalogue.
- The code creates a regular web session with WEB_SESSION_DAYS lifetime.
  An expired or revoked session requires a new /web code in the setup card.
- /web_logout revokes all your web sessions, including this reader. A blocked
  user loses access. Individual sessions can be ended on the website/admin panel.
- The session token is stored in config.json on the SD card. Do not share this
  file, your configured plugin folder, or an SD-card backup with other people.
- Downloads/searches appear in the existing website statistics.
- This plugin has not been tested on physical hardware. If search is missing,
  check the firmware's SD-plugin support rather than installing a different
  device's firmware. No firmware modification is part of this plugin.

Source contract:
https://github.com/crosspoint-reader/crosspoint-reader/blob/develop/docs/sd-plugins.md
Search implementation:
https://github.com/crosspoint-reader/crosspoint-reader/blob/develop/src/activities/plugins/PluginCatalogActivity.cpp
