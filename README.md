# Flibusta для CrossPoint Reader

Поиск книг в каталоге вашего Flibusta Telegram-бота и скачивание EPUB прямо с
читалки. Поддерживаются настройка папки на SD-карте и OTA-обновления плагина.

[Скачать последнюю версию](https://github.com/magiasegura/flibusta-crosspoint-plugin/releases/latest)

## Установка

1. Скачайте ZIP из раздела Releases.
2. Распакуйте папку `flibusta` в `/plugins/` на SD-карте читалки.
3. Включите **Settings → Connectivity → Plugins** и веб-сервер читалки.
4. Откройте веб-интерфейс читалки на телефоне или компьютере. В карточке Flibusta
   укажите адрес вашей библиотеки и одноразовый код `/web` из Telegram-бота.
5. Отключите веб-сервер. На читалке откройте **Home → Plugins → Flibusta → Search**.

Нужен сервер библиотеки с API `/api/crosspoint/`. Сам плагин не содержит каталог
книг, пароли или токены. CrossPoint должен поддерживать SD-card plugins и поиск
JSON-каталогов. Совместимость с физическими устройствами пока не проверена.

## Обновления

При ручном обновлении замените четыре файла плагина и сохраните свой `config.json`.

Для OTA нажмите **Включить OTA плагина** в веб-карточке. После этого обновления
доступны с читалки через **Home → Plugins → Flibusta — обновления**.
OTA загружает релиз, опубликованный вашим сервером библиотеки; релиз на GitHub
предназначен для скачивания и ручной установки. Администратор сервера должен
обновить его копию плагина и перезапустить веб-сервис для публикации новой OTA-версии.
Обновляются файлы плагина; прошивка, настройки и скачанные книги сохраняются.

Полная инструкция и ограничения находятся в [flibusta/README.md](flibusta/README.md).

## Проверка и сборка

Зависимости для плагина не нужны. Тесты требуют Node.js с `node:test`, упаковка — Python 3.11+.

```sh
node --test tests/test_crosspoint.cjs
python scripts/build_release.py
```

ZIP появится в `dist/`. В него входят только `manifest.json`, `device.json`,
`plugin.js` и `README.md`; пользовательский `config.json` не публикуется.

Контракт плагинов: [CrossPoint SD-card plugins](https://github.com/crosspoint-reader/crosspoint-reader/blob/develop/docs/sd-plugins.md).
