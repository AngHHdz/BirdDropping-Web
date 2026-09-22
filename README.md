# BirdDropping

Aplicación web adaptable para capturar VIN de 17 caracteres con la cámara del móvil, confirmar cada lectura y generar archivos TXT. El modo PC permite consultar y descargar el historial.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo y sube el contenido de esta carpeta a la rama `main`.
2. En **Settings → Pages**, selecciona **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
3. Abre la URL HTTPS generada. La cámara requiere HTTPS (o `localhost`).

## Activar sincronización móvil ↔ PC

Sin configuración adicional, los datos se guardan únicamente en el navegador actual. Para compartir archivos entre dispositivos:

1. Crea un proyecto gratuito en [Firebase](https://console.firebase.google.com/).
2. Agrega una aplicación Web y copia su objeto de configuración en `firebase-config.js`.
3. Activa **Firestore Database**.
4. Copia el contenido de `firestore.rules` en **Firestore → Rules** y publícalo.
5. Vuelve a publicar el repositorio. En ambos dispositivos escribe el mismo **código de espacio de trabajo**.

> El código de espacio funciona como identificador compartido, no como contraseña. Para datos sensibles o acceso público amplio, agrega Firebase Authentication y reglas por usuario.

## Uso

- En **Móvil**, inicia la cámara, apunta a un código Code 39/Code 128, corrobora el VIN y pulsa **Capturar**.
- Al finalizar, pulsa **Finalizar y guardar TXT**. Se descargará `BirdDropping_DD-MM-AAAA.txt`; los siguientes archivos del mismo día usarán `(2)`, `(3)`, etc.
- En **PC**, conecta el mismo espacio y descarga cualquier archivo del historial.

La lectura automática usa `BarcodeDetector`, disponible principalmente en Chrome/Edge modernos. Si el navegador no lo admite, el campo permite captura manual o mediante un lector físico que actúe como teclado.
