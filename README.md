# Driver License Status Probe (Poland / info-car.pl)

CLI-скрипт на Node.js + TypeScript, который:

1. Перебирает наиболее вероятные REST-эндпоинты info-car.pl для проверки статуса prawa jazdy.
2. При отсутствии рабочего API автоматически запускает fallback через Playwright (headless браузер) и пытается пройти веб-флоу как пользователь.
3. Возвращает структурированный JSON-результат.

## ⚠️ Важные юридические и privacy-предупреждения

- Этот проект предназначен для технического исследования и внутреннего тестирования.
- Работа с персональными данными (имя, фамилия, PESEL, номера документов) подпадает под GDPR/RODO.
- Использование недокументированных API и автоматизации внешнего сервиса может нарушать ToS владельца ресурса.
- Перед коммерческим использованием проконсультируйтесь с юристом и обеспечьте правовое основание обработки ПДн.
- В логах и демо-примерах используйте только маскированные данные.

## Что проверяет API probe

Реализован перебор следующих кандидатов:

- `GET  https://info-car.pl/api/prawojazdy/status?firstName=...&lastName=...&pesel=...`
- `POST https://info-car.pl/api/prawojazdy/check`
- `POST https://info-car.pl/api/driving-license/status`
- `GET  https://info-car.pl/services/driving-licence/{pesel}`
- `POST https://info-car.pl/ibdkSearchPrawoJazdy/search`
- `POST https://info-car.pl/dl-status/api/v1/status`
- `GET  https://info-car.pl/api/dl/status`
- `POST https://info-car.pl/new/api/prawo-jazdy/status`
- `POST https://info-car.pl/sprawdz-status-prawa-jazdy`

## Установка

```bash
npm install
npx playwright install chromium
```

## Запуск

```bash
npm run dev -- --firstName Jan --lastName Kowalski --pesel 12345678901
```

или после сборки:

```bash
npm run build
npm start -- --firstName Jan --lastName Kowalski --pesel 12345678901
```

Можно также передать `--documentNumber` или `--applicationNumber`.

## Пример JSON-ответа

```json
{
  "success": true,
  "strategy": "api",
  "inputMasked": {
    "firstName": "J***",
    "lastName": "K***",
    "pesel": "*******8901"
  },
  "result": {
    "endpoint": "https://info-car.pl/api/...",
    "method": "POST",
    "httpStatus": 200,
    "statuses": ["Wniosek przyjęty", "Dokument zamówiony"]
  },
  "attempts": []
}
```

## Структура файлов

- `src/api_probe.ts` — зонд для проверки REST-эндпоинтов.
- `src/playwright_fallback.ts` — headless fallback через Playwright.
- `src/index.ts` — CLI entrypoint и JSON-вывод.
- `.gitignore`, `package.json`, `tsconfig.json` — базовая инфраструктура проекта.
