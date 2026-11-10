# Mise en production — Gestion École

À faire une seule fois, avant d'ouvrir le site au public.

## 1. Fichier `.env` (à la racine, jamais envoyé sur Git)

```
DEBUG=False
SECRET_KEY=<40 caractères aléatoires minimum>
ALLOWED_HOSTS=ecole.exemple.bf
SITE_ORIGINS=https://ecole.exemple.bf
DB_HOST=127.0.0.1
DB_NAME=gestion_ecole
DB_USER=<utilisateur dédié, pas root>
DB_PASSWORD=<mot de passe fort>
```

Générer la clé secrète :

```
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
```

Avec `DEBUG=False`, le serveur **refuse de démarrer** si la clé secrète est faible ou si `ALLOWED_HOSTS` vaut `*`.
Il active alors la redirection HTTPS, les cookies sécurisés et HSTS.

## 2. Comptes

- Changer le mot de passe du super admin (page « Mon compte »).
- Supprimer ou changer les mots de passe des comptes de démonstration listés dans `COMPTES.md`.

## 3. Surveillance

Brancher un service de surveillance (UptimeRobot, Better Stack…) sur `https://<domaine>/api/sante/`.
Il doit répondre en quelques secondes ; sinon, alerter par SMS ou e-mail.

## 4. Sauvegardes

La sauvegarde de la base se télécharge depuis la page « Sauvegarde » du super admin. Programmer aussi une sauvegarde
automatique de MariaDB (mysqldump chaque nuit) et garder les copies hors du serveur.

## 5. Vérification

```
python manage.py check --deploy
python manage.py test --noinput
```
