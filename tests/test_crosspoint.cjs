// Run with: node --test tests/test_crosspoint.cjs
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {test} = require("node:test");
const {runInNewContext} = require("node:vm");

const source = readFileSync(resolve(__dirname, "../flibusta/plugin.js"), "utf8");

async function setup({status = 200, body = '{"access_token":"reader-token"}', writeError = false, config,
  root = "/plugins", capabilities = "catalog.bundle_install,catalog.version_tracking", updaterExists = false,
  mkdirError = false, otaAvailable = true} = {}) {
  let render, submit, saveFolder, enableOta;
  const server = {value: "https://library.example/"};
  const code = {value: "1234 5678"};
  const folder = {value: "/Books/Flibusta"};
  const button = {disabled: false};
  const folderButton = {disabled: false, addEventListener: (_event, handler) => { saveFolder = handler; }};
  const otaButton = {disabled: false, addEventListener: (_event, handler) => { enableOta = handler; }};
  const message = {textContent: ""};
  const writes = [], requests = [], localRequests = [];
  const form = {
    elements: {server, code, dest_dir: folder},
    querySelector: (selector) => selector === "[data-save-folder]" ? folderButton : button,
    addEventListener: (_event, handler) => { submit = handler; }
  };
  const container = {querySelector: (selector) => {
    if (selector === "form") return form;
    return selector === "[data-enable-ota]" ? otaButton : message;
  }};
  runInNewContext(source, {
    CrossPoint: {registerPlugin: (fn) => { render = fn; }},
    TextEncoder, URL, URLSearchParams, btoa,
    fetch: async (url, options) => {
      localRequests.push({url, options});
      if (url === "/api/status") return {ok: true, json: async () => ({pluginCapabilities: capabilities})};
      if (url.startsWith("/api/files?")) return {ok: true, json: async () =>
        updaterExists ? [{name: "flibusta-update", isDirectory: true}] : []};
      if (url === "/mkdir") return {ok: !mkdirError};
      return {ok: !!config, json: async () => config};
    }
  });
  assert.equal(typeof render, "function", "register synchronously for the CrossPoint loader");
  await render(container, {
    dir: root + "/flibusta",
    relay: async (...args) => {
      requests.push(args);
      if (args[0] === "GET") return {status: otaAvailable ? 200 : 404,
        body: otaAvailable ? '{"items":[{"id":"flibusta"}]}' : "<html>Old server</html>"};
      return {status, body};
    },
    writeFile: async (path, encoded) => {
      if (writeError) throw new Error("SD full");
      writes.push({path, data: JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))});
    }
  });
  return {server, code, folder, button, message, writes, requests, localRequests, saveFolder, enableOta,
    submit: () => submit({preventDefault() {}})};
}

test("setup uses the reader relay and stores a session without retaining the login code", async () => {
  const page = await setup();
  await page.submit();
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0][1], "https://library.example/api/crosspoint/login");
  assert.equal(page.requests[0][3], "code=12345678");
  assert.deepEqual(page.writes, [
    {path: "/plugins/flibusta/config.json", data: {
      server: "https://library.example", access_token: "reader-token", dest_dir: "/Books/Flibusta"
    }}
  ]);
  assert.equal(page.code.value, "");
  assert.match(page.message.textContent, /Подключено/);
  assert.equal(page.button.disabled, false);
});

test("a refused code cannot overwrite the reader's existing settings", async () => {
  const page = await setup({status: 401, body: '{"error":"Код устарел"}'});
  await page.submit();
  assert.equal(page.writes.length, 0);
  assert.equal(page.message.textContent, "Код устарел");
  assert.equal(page.button.disabled, false);
});

test("an old server returning HTML reports the missing API without saving it", async () => {
  const page = await setup({body: "<html>Sign in</html>"});
  await page.submit();
  assert.equal(page.writes.length, 0);
  assert.match(page.message.textContent, /Обновите веб-сервис/);
});

test("invalid URL schemes and credentials never reach the relay", async () => {
  for (const url of ["javascript:alert(1)", "ftp://library.example", "https://user:pass@library.example"]) {
    const page = await setup();
    page.server.value = url;
    await page.submit();
    assert.equal(page.requests.length, 0);
    assert.equal(page.writes.length, 0);
  }
});

test("a malformed code is refused locally", async () => {
  const page = await setup();
  page.code.value = "1234";
  await page.submit();
  assert.equal(page.requests.length, 0);
  assert.match(page.message.textContent, /8 цифр/);
});

test("a failed SD write cannot report a successful connection", async () => {
  const page = await setup({writeError: true});
  await page.submit();
  assert.equal(page.message.textContent, "SD full");
  assert.equal(page.button.disabled, false);
});

test("changing the folder preserves the server and session without another login", async () => {
  const config = {server: "https://library.example", access_token: "existing-token", dest_dir: "/Old"};
  const page = await setup({config});
  assert.equal(page.folder.value, "/Old");
  page.folder.value = " /Книги//Фантастика/ ";
  page.server.value = "https://other.example";
  page.code.value = "";
  await page.saveFolder();
  assert.equal(page.requests.length, 0);
  assert.deepEqual(page.writes[0].data, {...config, dest_dir: "/Книги/Фантастика"});
  assert.match(page.message.textContent, /Папка сохранена/);
});

test("new login uses the selected folder", async () => {
  const page = await setup();
  page.folder.value = "/Reading";
  await page.submit();
  assert.equal(page.writes[0].data.dest_dir, "/Reading");
  assert.match(page.message.textContent, /Книги сохраняются в \/Reading/);
});

test("empty folder uses the default and SD root is allowed", async () => {
  for (const [input, expected] of [["", "/Books/Flibusta"], ["/", "/"]]) {
    const page = await setup({config: {server: "https://library.example", access_token: "existing-token"}});
    page.folder.value = input;
    await page.saveFolder();
    assert.equal(page.writes[0].data.dest_dir, expected);
  }
});

test("missing configuration cannot be overwritten by a folder-only save", async () => {
  const page = await setup();
  await page.saveFolder();
  assert.equal(page.writes.length, 0);
  assert.match(page.message.textContent, /Сначала подключите/);
});

test("invalid paths cannot overwrite settings or consume a login code", async () => {
  for (const folder of ["Books", "/Books/../Other", "/Books/.", "/Books\\Other", "/Books:Other", "/Books\nOther",
    "/Books..Archive", "/.crosspoint/wifi.json", "/.CROSSPOINT/OPDS.JSON.backup",
    "/ .crosspoint./koreader.json", "/CROSSP~1/Books", "/Books/CROSSP~1"]) {
    const page = await setup();
    page.folder.value = folder;
    await page.saveFolder();
    await page.submit();
    assert.equal(page.requests.length, 0);
    assert.equal(page.writes.length, 0);
    assert.match(page.message.textContent, /Укажите путь/);
  }
});

test("OTA installs a separate native updater without touching the session or book folder", async () => {
  for (const root of ["/plugins", "/.plugins", "/.crosspoint/plugins"]) {
    const config = {server: "https://library.example", access_token: "secret", dest_dir: "/Reading"};
    const page = await setup({config, root});
    await page.enableOta();
    assert.equal(page.requests.length, 1);
    assert.equal(page.requests[0][0], "GET");
    assert.equal(page.requests[0][1], "https://library.example/api/crosspoint/updates");
    assert.ok(!JSON.stringify(page.requests).includes("secret"));
    assert.equal(page.writes.length, 1);
    assert.equal(page.writes[0].path, root + "/flibusta-update/device.json");
    const updater = page.writes[0].data;
    assert.equal(updater.browse.url, "https://library.example/api/crosspoint/updates");
    assert.equal(updater.download.dest_dir, root);
    assert.equal(updater.download.bundle.subdir, "{id}");
    assert.equal(updater.config, undefined);
    assert.equal(updater.token, undefined);
    assert.ok(!JSON.stringify(updater).includes("secret"));
    assert.match(page.message.textContent, /OTA включено/);
    const mkdir = page.localRequests.find((request) => request.url === "/mkdir");
    assert.equal(mkdir.options.body.get("path"), root);
  }
});

test("OTA can reconfigure an existing updater without mkdir", async () => {
  const page = await setup({config: {server: "https://library.example"}, updaterExists: true});
  await page.enableOta();
  assert.equal(page.writes.length, 1);
  assert.ok(!page.localRequests.some((request) => request.url === "/mkdir"));
});

test("unsupported firmware or failed folder creation cannot report OTA success", async () => {
  for (const options of [{capabilities: ""}, {mkdirError: true}, {config: undefined}, {otaAvailable: false}]) {
    const page = await setup({config: {server: "https://library.example"}, ...options});
    await page.enableOta();
    assert.equal(page.writes.length, 0);
    assert.doesNotMatch(page.message.textContent, /OTA включено/);
    assert.equal(page.button.disabled, false);
  }
});

test("oversized UTF-8 settings preserve the existing configuration", async () => {
  const config = {server: "https://library.example", access_token: "old-token", dest_dir: "/Old"};
  const page = await setup({config});
  page.folder.value = "/" + "Книги/".repeat(240);
  await page.saveFolder();
  assert.equal(page.writes.length, 0);
  assert.match(page.message.textContent, /2048/);
  page.folder.value = "/New";
  await page.saveFolder();
  assert.deepEqual(page.writes[0].data, {...config, dest_dir: "/New"});
});

test("new sign-in cannot replace working settings with an oversized configuration", async () => {
  const page = await setup({config: {server: "https://library.example", access_token: "old-token"}});
  page.folder.value = "/" + "Книги/".repeat(240);
  await page.submit();
  assert.equal(page.writes.length, 0);
  assert.match(page.message.textContent, /2048/);
});

test("the config size limit counts bytes and accepts the boundary", async () => {
  const config = {server: "https://library.example", access_token: "old-token", dest_dir: "/"};
  const overhead = Buffer.byteLength(JSON.stringify(config));
  const count = Math.floor((2048 - overhead) / 2);
  const folder = "/" + "я".repeat(count) + "a".repeat((2048 - overhead) % 2);
  const page = await setup({config});
  page.folder.value = folder;
  await page.saveFolder();
  assert.equal(Buffer.byteLength(JSON.stringify(page.writes[0].data)), 2048);
  page.folder.value = folder + "a";
  await page.saveFolder();
  assert.equal(page.writes.length, 1);
  assert.match(page.message.textContent, /2048/);
});
