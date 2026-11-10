# Frontend Gestion École

L’interface n’est **pas** à la racine de `frontend/`.
Elle se trouve dans le template React + Vite + MUI :

`frontend/materially-free-react-admin-template`

Ce dossier contient un `package.json` relais : `npm start` depuis `frontend/` lance l’app imbriquée.

## Démarrer (Windows)

```bat
cd C:\Users\Dell\Desktop\gestion_ecole-main\frontend
npm install
npm start
```

Ou directement dans le vrai projet :

```bat
cd C:\Users\Dell\Desktop\gestion_ecole-main\frontend\materially-free-react-admin-template
npm install
npm start
```

L’UI s’ouvre sur **http://localhost:3000** et appelle l’API Django **http://127.0.0.1:8000/api** (voir `.env`).
