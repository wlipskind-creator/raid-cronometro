# Raids FEU: cómo funciona y cómo se mantiene

## Las páginas

- **Panel público** (`index.html`): lista de raids por estado (en curso, próximos, terminados). Se toca uno y se ve solo ese raid, en vivo. Cada raid tiene su propio link (`…/#id-del-raid`).
- **Cronometristas** (`carga.html`): se entra con correo y contraseña, se elige el raid (solo los del club de cada uno) y se cargan llegadas, participantes y estados.
- **Administración** (`admin.html`): solo para administradores FEU. Clubes (con logo), raids (nombre, club, fecha, estado), cronometristas (con sus clubes y su contraseña) y administradores.
- **Instructivo** (`instructivo.html`) y ayuda (`ayuda.html`).

## Quién puede qué

| Quién | Puede |
| --- | --- |
| Público | Ver todos los raids |
| Cronometrista | Cargar llegadas, participantes, estados, hora de largada y estado del raid, solo en los raids de sus clubes |
| Administrador FEU | Todo, en todos los raids |

## Datos en Firebase (Firestore)

- `clubs` · `races` (con `arrivals` y `participants` adentro) · `staff` (cronometristas) · `admins`.

## Reglas

El archivo `firestore.rules` se pega en Firebase → Firestore → Reglas → Publicar.
Arriba de todo, en `adminsIniciales`, van los correos de los administradores iniciales.
Todo lo demás (otros administradores y todos los cronometristas) se maneja desde la página de Administración, sin volver a tocar las reglas.

## Cronometristas

En Administración → Cronometristas: correo, nombre, clubes y contraseña.
La app crea el usuario en Firebase sola. Si la persona ya tenía usuario, se deja la contraseña vacía.
"Contraseña" en la lista le manda un correo para que elija una nueva.

## Actualizar el sitio

Subir los archivos a GitHub (Add file → Upload files → Commit changes). Netlify publica solo en uno o dos minutos. En los celulares, recargar dos veces.
