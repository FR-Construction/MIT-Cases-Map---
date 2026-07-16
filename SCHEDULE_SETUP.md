# Cómo conectar el Schedule Tool a Google Sheets (guardado compartido)

Sigue estos pasos en tu cuenta de Google. Toma unos 5 minutos.

## 1. Crear la Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
2. Nómbrala, por ejemplo: **MIT Schedule Tool - Data**.
3. No hace falta que escribas nada dentro — el script crea la pestaña y los encabezados automáticamente la primera vez que se use.

## 2. Añadir el script

1. Dentro de la hoja, ve al menú **Extensiones → Apps Script**.
2. Borra todo el código de ejemplo que aparece (`function myFunction() {...}`).
3. Abre el archivo [google-apps-script.gs](google-apps-script.gs) de este proyecto, copia todo su contenido, y pégalo en el editor de Apps Script.
4. Guarda (ícono de disco o Ctrl+S). Ponle un nombre al proyecto si te lo pide, ej. "MIT Schedule Backend".

## 3. Publicar como Web App

1. Arriba a la derecha, haz clic en **Implementar (Deploy) → Nueva implementación**.
2. En "Seleccionar tipo", elige **Aplicación web**.
3. Configuración:
   - **Ejecutar como:** Yo (tu cuenta)
   - **Quién tiene acceso:** Cualquier usuario (Anyone) — esto es necesario para que la página web pueda guardar/leer sin que cada persona inicie sesión en Google.
4. Haz clic en **Implementar**.
5. Google te va a pedir **autorizar permisos** (verás una pantalla de "esta app no está verificada"). Como el script es tuyo, dale clic en "Avanzado" → "Ir a [nombre del proyecto] (no seguro)" → Permitir. Esto es normal para scripts personales.
6. Copia la **URL de la aplicación web** que te da al final (algo como `https://script.google.com/macros/s/AKfycb.../exec`).

## 4. Dame la URL

Pégamela en el chat y yo conecto el Schedule Tool de la página para que lea y guarde en esa Google Sheet en vez de (o además de) el navegador.

## Nota sobre seguridad

Como la URL queda pública ("Anyone" con el enlace puede leer/escribir), cualquier persona con el enlace exacto de la Web App podría escribir datos ahí. No es un riesgo grande para este caso de uso (solo fechas de tareas), pero si más adelante quieres restringirlo, se puede añadir una contraseña simple o cambiar el acceso a "cualquiera con cuenta de Google en tu organización".

## Cuando quieras actualizar el script

Si en el futuro cambio el código de `google-apps-script.gs`, tendrás que repetir el paso 3 (Nueva implementación) para publicar la versión actualizada, o usar "Administrar implementaciones" para actualizar la existente.
