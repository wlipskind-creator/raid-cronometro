# Cronometraje de Raid: cómo ponerla en marcha

La app tiene dos páginas:

- **Panel público** (`index.html`): lo abre cualquiera con el link. Muestra las llegadas por grupo y la largada de la 2ª etapa, y se actualiza solo.
- **Cronometristas** (`carga.html`): se entra con correo y contraseña. Es la pantalla para cargar las llegadas.

Los datos se guardan en **Firebase**, la base de datos de Google, que es gratis para este uso. Las páginas se publican en **Netlify**.

> Si subís la carpeta a Netlify sin hacer los pasos de Firebase, la app funciona en **modo demostración**: sirve para probar la pantalla, pero cada teléfono guarda sus propios datos.

---

## 1. Crear el proyecto en Firebase (una sola vez)

1. Entrá a https://console.firebase.google.com con tu cuenta de Google.
2. **Crear un proyecto** → nombre, por ejemplo `raid-cronometro` → podés desactivar Google Analytics → Crear.

## 2. Crear la base de datos

1. En el menú de la izquierda: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: `southamerica-east1 (São Paulo)`, la más cercana a Uruguay.
3. Elegí **modo de producción** → Crear.
4. Andá a la pestaña **Reglas**, borrá todo lo que aparece y pegá el contenido del archivo `firestore.rules`.
5. En ese texto, reemplazá los correos de ejemplo por los de tus cronometristas:
   ```
   'juan@gmail.com',
   'maria@gmail.com'
   ```
6. **Publicar**.

## 3. Crear los usuarios de los cronometristas

1. **Compilación → Authentication → Comenzar**.
2. En **Método de acceso**, elegí **Correo electrónico/contraseña**, activalo y guardá.
3. En la pestaña **Usuarios**, tocá **Agregar usuario** una vez por cronometrista (correo + contraseña).
   Usá los mismos correos que pusiste en las reglas.

## 4. Conectar la app con Firebase

1. Tocá el engranaje ⚙ → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, tocá el ícono **`</>`** (Web) → apodo `raid` → **Registrar app** (no marques Hosting).
3. Aparece un bloque `const firebaseConfig = { apiKey: "...", ... }`.
4. Abrí el archivo `config.js` con el Bloc de notas y reemplazá cada `PEGAR_AQUI` por el valor correspondiente. Guardá.

## 5. Publicar en Netlify

1. Entrá a https://app.netlify.com → **Add new site → Deploy manually**.
2. Arrastrá **la carpeta completa** `raid-cronometro`.
3. Netlify te da una dirección, por ejemplo `https://raid-xxxx.netlify.app`. En **Site configuration → Change site name** podés ponerle un nombre más lindo.
4. Opcional: en Firebase, **Authentication → Configuración → Dominios autorizados**, agregá esa dirección.

Cada vez que cambies algo, por ejemplo `config.js`, volvé a arrastrar la carpeta en **Deploys**.

## 6. Primer uso

1. Entrá a `https://TU-SITIO.netlify.app/carga.html` con un usuario de cronometrista.
2. Pestaña **Carrera** → poné el nombre → **Empezar carrera nueva**.
3. Compartí con el público el link principal: `https://TU-SITIO.netlify.app`

---

## El día de la carrera

- **Abrí `carga.html` al menos una vez con señal** en cada teléfono antes de salir al campo. Así la app queda guardada y abre aunque no haya internet.
- En el teléfono, usá **"Agregar a pantalla de inicio"** para abrirla como una app.
- **Sin señal:** seguí cargando normalmente. Arriba va a decir *"Sin señal · pendiente de enviar"*. Cuando vuelve la conexión, los datos se envían solos. No cierres sesión mientras haya datos pendientes.
- **El reloj:** al entrar, cada teléfono se sincroniza con la hora del servidor, así todos marcan la misma hora aunque el reloj de algún teléfono esté corrido. Lo podés ver en la pestaña **Carrera**.
- **Recomendación:** que **una sola persona toque LLEGÓ** y las demás carguen los números. Si dos personas marcan el mismo caballo, aparece dos veces.
- Los tiempos se toman al segundo. Los caballos que cruzan en el mismo segundo quedan en el mismo grupo. Con **"+ Otro caballo, mismo tiempo"** sumás un caballo al último grupo.
- Al terminar, en **Carrera → Copiar planilla** tenés todo listo para pegar en Excel.

## Costos

Con el plan gratuito de Firebase (Spark) y de Netlify alcanza de sobra para una carrera con cientos de personas mirando el panel.
