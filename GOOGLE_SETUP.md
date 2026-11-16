# Conectar la app con Google Contacts

Se hace una sola vez (unos 10 minutos y es gratis). Usa la cuenta de Google donde están los contactos del celular.

## 1. Crear el proyecto
1. Entra a https://console.cloud.google.com/ con tu cuenta.
2. Arriba, junto al logo, haz clic en el selector de proyectos y luego en **Proyecto nuevo**. Ponle de nombre `Score Contactos` y dale a **Crear**.
3. Asegúrate de que el proyecto nuevo esté seleccionado arriba.

## 2. Activar la API de contactos
1. Abre https://console.cloud.google.com/apis/library/people.googleapis.com
2. Haz clic en **Habilitar**.

## 3. Pantalla de consentimiento
1. Abre https://console.cloud.google.com/auth/overview y haz clic en **Comenzar**.
2. En nombre de la app pon `Score`, y en correo de asistencia pon tu correo.
3. En público elige **Externo**.
4. En datos de contacto pon tu correo, acepta y dale a **Crear**.
5. Ve a **Público** (https://console.cloud.google.com/auth/audience). En **Usuarios de prueba** haz clic en **Agregar usuarios** y agrega tu propio correo de Google.

## 4. Crear el ID de cliente
1. Abre https://console.cloud.google.com/auth/clients y haz clic en **Crear cliente**.
2. En tipo de aplicación elige **Aplicación web**.
3. En **Orígenes autorizados de JavaScript** agrega:
   - `http://localhost:5173`
   - Si después la publicas en Vercel, agrega también esa dirección, por ejemplo `https://tu-app.vercel.app`.
4. Dale a **Crear** y copia el **ID de cliente**. Termina en `.apps.googleusercontent.com`.

## 5. Pegarlo en la app
1. En la carpeta del proyecto, crea un archivo llamado `.env.local` con esta línea:
   ```
   VITE_GOOGLE_CLIENT_ID=EL_ID_QUE_COPIASTE.apps.googleusercontent.com
   ```
   Si usas Vercel, agrega la misma variable en **Settings → Environment Variables** y vuelve a publicar.
2. Reinicia la app con `npm run dev`.

## 6. Primera sincronización
1. Abre la app, toca el menú ☰ y luego **Conectar con Google**.
2. Elige tu cuenta. Google mostrará el aviso "Google no verificó esta app": haz clic en **Continuar**. Es normal, porque la app es tuya.
3. Marca el permiso de contactos y acepta.

Desde ese momento:
- La app sincroniza sola cada vez que la desbloqueas con el PIN y cada vez que guardas un cambio.
- Puedes tocar el ícono ⟳ junto al título cuando quieras sincronizar a mano.
- Si un contacto se cambió en los dos lados, se queda la versión del celular.
