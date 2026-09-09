# AG-TS AlgoPack Gateway — минимальный PHP-сервис для Timeweb App Platform
FROM php:8.3-cli

WORKDIR /app
COPY index.php /app/index.php

# Порт: Timeweb App Platform обычно задаёт $PORT сам; иначе 8080.
ENV PORT=8080
EXPOSE 8080

# index.php работает как роутер встроенного веб-сервера PHP (обрабатывает все пути).
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT} /app/index.php"]
