# Droits d'accès — comment ça marche

## Le principe : **refusé par défaut**

Tout se décide dans **un seul fichier** : [`config/droits.py`](config/droits.py).
Pour chaque vue de l'API et chaque action (`list`, `create`, `reactiver`, une action personnalisée…), il liste les
**rôles autorisés**. Une action qui n'y figure pas est **interdite à tout le monde**.

| Groupe | Rôles |
|---|---|
| `ADMIN` | directeur de l'école |
| `ENSEIGNANT` | enseignants |
| `PERSONNEL` | direction + enseignants |
| `FAMILLE` | élèves + parents |
| `ADMIN_FAMILLE` | direction + élève / parent concerné (finances) |
| `TOUS` | tout compte d'une école |

Le droit « minimal » est vérifié par le rôle. **Le filtrage des données** (un parent ne voit que ses enfants, un
enseignant que ses cours, chacun dans sa seule école) est fait **dans les vues** (`get_queryset`, `scoped()`).

Toujours exigés, sans exception : utilisateur connecté **et** école validée (`EcoleAccesPermission`).
À l'écriture, tout objet lié (élève, classe, évaluation…) doit appartenir à **l'école de l'utilisateur**.

## Ajouter une vue ou une action

1. La vue hérite de `DroitsParAction` : `class MaVue(DroitsParAction, viewsets.ModelViewSet)`.
   **Ne pas** écrire `get_permissions()` à la main, **ni** `permission_classes` dans `@action(...)` : ils sont ignorés.
2. Déclarer ses actions dans `config/droits.py`.
3. Dans une action qui reçoit des identifiants (`request.data`), toujours chercher les objets avec
   `scoped(Modele.objects..., request.user)` — jamais `Modele.objects.get(id=...)` seul.
4. Lancer `python manage.py audit_permissions` pour voir qui peut appeler quoi, puis
   `python manage.py audit_permissions --json > config/matrice_droits.json` pour figer la décision.
5. `python manage.py test config.tests_droits` doit passer.

## Les tests (`config/tests_droits.py`)

* la politique écrite correspond **exactement** à l'API réelle ;
* la matrice complète (`config/matrice_droits.json`) ne change que par décision explicite ;
* les attaques connues restent impossibles : élève qui saisit des notes, enseignant d'un autre cours,
  directeur d'une autre école, injection d'identifiants, école non validée, coordonnées d'enseignants…

## Vues hors ViewSet (déclarées explicitement)

`dashboard_stats` (tous les rôles d'une école), `sauvegarde_download` (direction + plateforme), `me` /
`change_password` (compte connecté), pages publiques voulues : connexion, renouvellement du jeton,
création d'une école, site vitrine et dépôt de dossier d'inscription (limités en débit).
