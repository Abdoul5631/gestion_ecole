# SMS parents (Burkina Faso — Orange / Moov)

Sans clé API, l’application **simule** l’envoi : le message apparaît dans **SMS parents**
avec le statut **Simulé**, et le parent (ou l’élève) reçoit quand même une
**notification dans l’application**.

## Activer un vrai envoi

1. Créez un fichier `.env` à la racine du projet (à côté de `manage.py`).
2. Renseignez au minimum :

```
SMS_API_URL=https://votre-passerelle.example/sms
SMS_API_KEY=votre_cle_secrete
SMS_SENDER=WendPanga
SMS_PROVIDER=generic
```

3. Redémarrez Django.

L’application envoie alors un **POST HTTP** JSON :

```json
{
  "to": "22670123456",
  "to_e164": "+22670123456",
  "from": "WendPanga",
  "sender": "WendPanga",
  "text": "…",
  "message": "…"
}
```

En-têtes : `Authorization: Bearer <SMS_API_KEY>` et `X-API-Key: <SMS_API_KEY>`.

## Orange ou Moov au Burkina

Orange et Moov ne livrent pas un SMS « magique » depuis l’école. Il faut un
**compte professionnel** (API SMS Orange, agrégateur, ou relais local).

Chemin simple et utilisable :

- Demandez à votre prestataire (ou à un petit script chez vous) une **URL webhook**
  qui accepte le JSON ci-dessus et transmet vers Orange / Moov.
- Mettez cette URL dans `SMS_API_URL` et la clé fournie dans `SMS_API_KEY`.

Africa’s Talking : `SMS_PROVIDER=africastalking` + `SMS_USERNAME=...` (envoi
`application/x-www-form-urlencoded` avec l’en-tête `apiKey`).

## Numéros

Les numéros parents (`telephone_parent` sur la fiche élève) sont normalisés en
`226` + 8 chiffres (`70…`, `76…`, `66…`, `+226 70 …`, `00226…`).

Sans numéro sur la fiche élève, le SMS est en **échec** (message clair), mais la
notification in-app est quand même créée s’il existe un compte parent / élève.

## Où cliquer dans l’app

- Menu **SMS parents** : envoyer un message, relancer les impayés, voir les statuts.
- Menu **Caisse / Frais** → bouton **SMS** sur une ligne, ou **Relancer**.
