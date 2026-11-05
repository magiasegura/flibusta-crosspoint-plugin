// CrossPoint API: https://github.com/crosspoint-reader/crosspoint-reader/blob/develop/docs/sd-plugins.md
CrossPoint.registerPlugin(async (container, api) => {
  container.innerHTML = `
    <h2>Flibusta</h2>
    <p>Настройте один раз. Затем ищите и скачивайте книги на самой читалке.</p>
    <form>
      <p><label>Адрес вашего сервера библиотеки<br>
        <input name="server" type="url" placeholder="https://books.example.org" required
          autocomplete="url" style="width:100%;box-sizing:border-box"></label></p>
      <p><label>Папка для книг на SD-карте<br>
        <input name="dest_dir" type="text" value="/Books/Flibusta" placeholder="/Books/Flibusta"
          style="width:100%;box-sizing:border-box"></label></p>
      <button type="button" class="btn-small" data-save-folder>Сохранить папку</button>
      <p><label>Одноразовый код из команды /web в Telegram-боте<br>
        <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" required
          placeholder="1234 5678" maxlength="20"></label></p>
      <button type="submit" class="btn-small btn-add">Подключить читалку</button>
    </form>
    <p><button type="button" class="btn-small" data-enable-ota>Включить OTA плагина</button></p>
    <p role="status" aria-live="polite"></p>
    <p>Отозвать доступ можно командой /web_logout в боте или в списке сеансов сайта.</p>`;

  const form = container.querySelector("form");
  const serverInput = form.elements.server;
  const codeInput = form.elements.code;
  const folderInput = form.elements.dest_dir;
  const button = form.querySelector('[type="submit"]');
  const folderButton = form.querySelector("[data-save-folder]");
  const otaButton = container.querySelector("[data-enable-ota]");
  let savedConfig = {};
  const status = container.querySelector('[role="status"]');
  const path = (name) => api.dir + "/" + name;
  const destination = () => {
    const value = folderInput.value.trim() || "/Books/Flibusta";
    const parts = value.split("/").filter(Boolean);
    // Match ProtectedPaths.h, including the names SdFat actually opens.
    const canonical = parts.map((part) => part.replace(/^ +|[. ]+$/g, "")).filter(Boolean);
    const normalized = "/" + canonical.join("/").toLowerCase();
    const sensitive = ["wifi.json", "opds.json", "koreader.json"].some(
      (name) => normalized.startsWith("/.crosspoint/" + name)
    );
    const alias = canonical.slice(0, 2).some((part) => {
      const dot = part.indexOf(".");
      const tilde = part.indexOf("~");
      const baseLength = dot < 0 ? part.length : dot;
      const extensionLength = dot < 0 ? 0 : part.length - dot - 1;
      return tilde >= 0 && /[1-9]/.test(part.charAt(tilde + 1)) && baseLength <= 8 && extensionLength <= 3;
    });
    if (!value.startsWith("/") || /[\\:*?"<>|\x00-\x1f\x7f]/.test(value) ||
        value.includes("..") || parts.includes(".") || sensitive || alias) {
      throw new Error("Укажите путь от корня SD-карты, например /Books. Защищённые пути, имена с .., " +
        "короткие имена вида CROSSP~1 и символы \\ : * ? \" < > | запрещены прошивкой.");
    }
    return "/" + parts.join("/");
  };
  const writeJson = (name, value) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    // CrossPoint loads config and token files with a 2 KiB limit.
    if (name === "config.json" && bytes.length > 2048) {
      throw new Error("Настройки превышают лимит читалки 2048 байт. Сократите адрес сервера или путь папки.");
    }
    return api.writeFile(name.startsWith("/") ? name : path(name), btoa(String.fromCharCode(...bytes)));
  };

  try {
    const response = await fetch("/download?path=" + encodeURIComponent(path("config.json")), {cache: "no-store"});
    if (response.ok) {
      const config = await response.json();
      savedConfig = config;
      serverInput.value = config.server || "";
      folderInput.value = config.dest_dir || "/Books/Flibusta";
      status.textContent = "Адрес сохранён. Для нового входа запросите код /web.";
    }
  } catch {
    status.textContent = "Введите адрес сервера и свежий код /web.";
  }

  otaButton.addEventListener("click", async () => {
    if (button.disabled || otaButton.disabled) return;
    otaButton.disabled = button.disabled = folderButton.disabled = true;
    try {
      if (!savedConfig.server) throw new Error("Сначала подключите читалку к серверу библиотеки.");
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error("Не удалось проверить возможности читалки.");
      const capabilities = ((await response.json()).pluginCapabilities || "").split(",");
      if (!["catalog.bundle_install", "catalog.version_tracking"].every((value) => capabilities.includes(value))) {
        throw new Error("Эта версия CrossPoint не поддерживает OTA плагинов.");
      }
      const catalog = await api.relay("GET", savedConfig.server + "/api/crosspoint/updates", {}, "");
      let release;
      try { release = JSON.parse(catalog.body); } catch { /* An old server may return a login page. */ }
      if (catalog.status !== 200 || !Array.isArray(release?.items) ||
          !release.items.some((item) => item.id === "flibusta")) {
        throw new Error("Обновите веб-сервис библиотеки: сервер пока не поддерживает OTA плагина.");
      }
      const root = api.dir.slice(0, api.dir.lastIndexOf("/"));
      const name = "flibusta-update";
      const findUpdater = async () => {
        const listing = await fetch("/api/files?path=" + encodeURIComponent(root), {cache: "no-store"});
        if (!listing.ok) throw new Error("Не удалось прочитать папку плагинов: HTTP " + listing.status);
        return (await listing.json()).find((entry) => entry.name.toLowerCase() === name);
      };
      let existing = await findUpdater();
      if (existing && !existing.isDirectory) throw new Error("Удалите файл flibusta-update: он мешает создать папку OTA.");
      if (!existing) {
        // Match the multipart request used by CrossPoint's built-in file manager.
        const formData = new FormData();
        formData.append("name", name);
        formData.append("path", root);
        const created = await fetch("/mkdir", {method: "POST", body: formData});
        if (!created.ok) {
          const detail = (await created.text()).trim().slice(0, 200);
          if (created.status === 400 && detail === "Folder already exists") existing = await findUpdater();
          if (!existing?.isDirectory) {
            throw new Error("Не удалось создать " + root + "/" + name + ": HTTP " + created.status + " — " + detail);
          }
        }
      }
      const updater = {
        title: "Обновить Flibusta",
        description: "Обновление плагина по Wi-Fi.",
        browse: {
          url: savedConfig.server + "/api/crosspoint/updates", items: "items",
          fields: {id: "id", title: "title", version: "version", description: "description"},
          compatibility: {firmware_family: "compatibility.firmware_family",
            plugin_api_min: "compatibility.plugin_api_min", requires: "compatibility.requires"}
        },
        download: {dest_dir: root, bundle: {base: "base", files: "files", subdir: "{id}"}}
      };
      // A separate manifest avoids the book folder's dest_dir override during installation.
      await writeJson(root + "/" + name + "/device.json", updater);
      status.textContent = "OTA включено. Отключите веб-сервер читалки и откройте Home → Plugins → " +
        "Обновить Flibusta. Выберите Flibusta и Update. Обновляются только файлы плагина.";
    } catch (error) {
      status.textContent = error.message || "Не удалось настроить OTA плагина.";
    } finally {
      otaButton.disabled = button.disabled = folderButton.disabled = false;
    }
  });

  folderButton.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = folderButton.disabled = true;
    try {
      const dest_dir = destination();
      if (!savedConfig?.access_token) throw new Error("Сначала подключите читалку с кодом /web.");
      const config = {...savedConfig, dest_dir};
      await writeJson("config.json", config);
      savedConfig = config;
      folderInput.value = config.dest_dir;
      status.textContent = "Папка сохранена: " + config.dest_dir + ". Уже скачанные книги остаются на прежнем месте.";
    } catch (error) {
      status.textContent = error.message || "Не удалось сохранить папку.";
    } finally {
      button.disabled = folderButton.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = folderButton.disabled = true;
    try {
      const dest_dir = destination();
      const server = new URL(serverInput.value.trim());
      if (!["http:", "https:"].includes(server.protocol) || server.username || server.password ||
          server.search || server.hash) {
        throw new Error("Укажите адрес HTTP(S) без пароля, параметров и #.");
      }
      const code = codeInput.value.replace(/[\s-]/g, "");
      if (!/^\d{8}$/.test(code)) throw new Error("Код /web должен содержать 8 цифр.");
      const base = server.href.replace(/\/+$/, "");
      status.textContent = "Подключение к библиотеке…";
      const response = await api.relay("POST", base + "/api/crosspoint/login", {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CrossPoint Flibusta"
      }, new URLSearchParams({code}).toString());
      let result;
      try { result = JSON.parse(response.body); } catch {
        throw new Error("Сервер не поддерживает плагин. Обновите веб-сервис библиотеки и проверьте адрес.");
      }
      if (response.status !== 200 || !result || typeof result.access_token !== "string" || !result.access_token) {
        throw new Error(result?.error || "Не удалось войти. Запросите новый код /web.");
      }
      // Keep the server and its credential together when setup is interrupted.
      const config = {server: base, access_token: result.access_token, dest_dir};
      await writeJson("config.json", config);
      savedConfig = config;
      codeInput.value = "";
      status.textContent = "Подключено. Отключите веб-сервер читалки и откройте Home → Plugins → Flibusta. " +
        "Нажмите Search, введите название или автора и выберите Fetch. Книги сохраняются в " + dest_dir + ".";
    } catch (error) {
      status.textContent = error.message || "Не удалось сохранить настройки. Проверьте соединение и SD-карту.";
    } finally {
      button.disabled = folderButton.disabled = false;
    }
  });
});
