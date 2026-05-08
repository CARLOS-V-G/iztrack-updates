# Publicar izTrack con actualizaciones por GitHub

Este flujo usa GitHub Releases gratis para que `electron-updater` detecte nuevas versiones, descargue el instalador y muestre la barra de progreso dentro de izTrack.

## 1. Crear repositorio

En GitHub crea un repositorio publico, por ejemplo:

```text
iztrack-updates
```

Para el actualizador gratis conviene que sea publico. Si el repositorio es privado, la app instalada necesita credenciales para leer releases y eso no es recomendable para distribuir a usuarios.

## 2. Configurar `package.json`

Reemplaza estos valores:

```json
"publish": {
  "provider": "github",
  "owner": "TU_USUARIO_GITHUB",
  "repo": "TU_REPOSITORIO_GITHUB",
  "releaseType": "release"
}
```

Ejemplo:

```json
"publish": {
  "provider": "github",
  "owner": "miusuario",
  "repo": "iztrack-updates",
  "releaseType": "release"
}
```

## 3. Instalar dependencia del actualizador

Ejecuta una vez:

```powershell
npm install
```

Esto instala `electron-updater` y actualiza `package-lock.json`.

## 4. Subir el proyecto a GitHub

Desde la carpeta del proyecto:

```powershell
git init
git add .
git commit -m "Initial izTrack release setup"
git branch -M main
git remote add origin https://github.com/TU_USUARIO_GITHUB/TU_REPOSITORIO_GITHUB.git
git push -u origin main
```

## 5. Crear una actualizacion

Cada actualizacion necesita subir la version de `package.json`.

```powershell
npm version patch
git push
git push origin --tags
```

El workflow `.github/workflows/release.yml` se ejecuta cuando subes un tag como `v1.0.1`. GitHub va a compilar Windows NSIS y publicar los archivos en Releases.

## 6. Como lo ve el usuario

La app instalada verifica actualizaciones automaticamente al abrir y luego cada 6 horas.

Cuando encuentra una version nueva:

- muestra un aviso con la version disponible;
- descarga con barra de progreso;
- permite instalar reiniciando izTrack;
- si pasan 24 horas desde que se detecto, la pantalla se vuelve obligatoria y ya no deja posponer.

## Notas importantes

- El primer instalador debe instalarse con NSIS. La version portable no es buena base para auto-update.
- Para que una actualizacion aparezca, la version publicada debe ser mayor que la version instalada.
- No subas `db.json`, backups locales, `.env`, `node_modules`, `dist` ni `release`; ya estan ignorados en `.gitignore`.
