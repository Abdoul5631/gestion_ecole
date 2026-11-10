"""Mots de passe temporaires uniques (plus de mot de passe partagé Ecole@2024)."""
import secrets
import string

MOT_DE_PASSE_PARTAGE_INTERDIT = 'Ecole@2024'


def generer_mot_de_passe_temporaire(longueur=10):
    """Mot de passe lisible, unique, avec majuscule + minuscule + chiffre."""
    longueur = max(8, int(longueur))
    minuscules = string.ascii_lowercase
    majuscules = string.ascii_uppercase
    chiffres = string.digits
    alphabet = minuscules + majuscules + chiffres
    while True:
        chars = [
            secrets.choice(minuscules),
            secrets.choice(majuscules),
            secrets.choice(chiffres),
        ]
        chars += [secrets.choice(alphabet) for _ in range(longueur - 3)]
        secrets.SystemRandom().shuffle(chars)
        pwd = ''.join(chars)
        if pwd != MOT_DE_PASSE_PARTAGE_INTERDIT:
            return pwd


# Anciens mots de passe partagés codés en dur : remplacés par le mot de passe par défaut de l'école.
ANCIENS_DEFAUTS = {MOT_DE_PASSE_PARTAGE_INTERDIT, 'Enseignant@2024'}


def mot_de_passe_a_generer(password):
    """True si le mot de passe est absent ou égal à un ancien défaut partagé codé en dur."""
    return not password or str(password) in ANCIENS_DEFAUTS


def mot_de_passe_defaut_pour_role(role, ecole):
    """Mot de passe par défaut de l'école pour ce rôle ('' si non défini)."""
    champ = {
        'ELEVE': 'mot_de_passe_defaut_eleves',
        'ENSEIGNANT': 'mot_de_passe_defaut_enseignants',
        'PARENT': 'mot_de_passe_defaut_parents',
    }.get(role)
    return (getattr(ecole, champ, '') or '').strip() if champ else ''


def mot_de_passe_defaut_ecole(ecole):
    """Mot de passe par défaut défini par l'école pour ses élèves ('' si non défini)."""
    return (getattr(ecole, 'mot_de_passe_defaut_eleves', '') or '').strip()


def creer_compte_eleve(eleve, ecole=None, username=None, password=None):
    """Crée le compte ELEVE avec mot de passe temporaire unique (ou celui fourni). Retourne (user, password)."""
    from accounts.models import User
    if User.objects.filter(eleve=eleve, role='ELEVE').exists():
        return None, None
    username = username or (eleve.matricule or '').strip()
    if not username:
        username = f"eleve_{eleve.id}"
    if User.objects.filter(username=username).exists():
        username = f"{username}_eleve"
        if User.objects.filter(username=username).exists():
            username = f"{eleve.matricule}_{eleve.id}"
    ecole = ecole or getattr(eleve, 'ecole', None)
    password = password or mot_de_passe_defaut_ecole(ecole) or generer_mot_de_passe_temporaire()
    user = User(
        username=username,
        role='ELEVE',
        eleve=eleve,
        is_active=True,
        ecole=ecole,
        must_change_password=True,
    )
    user.set_password(password)
    user.save()
    return user, password


def mot_de_passe_defaut_parents_ecole(ecole):
    """Mot de passe par défaut défini par l'école pour ses parents ('' si non défini)."""
    return (getattr(ecole, 'mot_de_passe_defaut_parents', '') or '').strip()


def creer_compte_parent(eleve, ecole=None):
    """Crée (ou retrouve) le compte du parent d'un élève et le relie à l'enfant.

    Identifiant = numéro de téléphone du parent (format 226XXXXXXXX). Deux enfants qui ont
    le même numéro partagent un seul compte parent.
    Retourne (user, mot_de_passe, cree) :
      - (None, None, False)            : numéro de téléphone absent ou invalide ;
      - (user, None, False)            : compte déjà existant, enfant ajouté ;
      - (user, mot_de_passe, True)     : nouveau compte (mot de passe à remettre au parent, une seule fois).
    """
    from accounts.models import User
    from notifications.services import normalize_bf_phone, telephone_valide_bf

    ecole = ecole or getattr(eleve, 'ecole', None)
    numero = normalize_bf_phone(getattr(eleve, 'telephone_parent', ''))
    if not telephone_valide_bf(numero):
        return None, None, False

    candidats = [numero] + ([f"{numero}.{ecole.pk}"] if ecole is not None else [])
    for username in candidats:
        existant = User.objects.filter(username=username, role='PARENT', ecole=ecole).first()
        if existant:
            existant.enfants.add(eleve)
            return existant, None, False

    username = numero
    if User.objects.filter(username=username).exists():  # même numéro déjà pris dans une autre école
        username = f"{numero}.{ecole.pk}" if ecole is not None else f"{numero}.p"
    password = mot_de_passe_defaut_parents_ecole(ecole) or generer_mot_de_passe_temporaire()
    user = User(
        username=username,
        role='PARENT',
        ecole=ecole,
        first_name=(getattr(eleve, 'prenom_parent', '') or '')[:150],
        last_name=(getattr(eleve, 'nom_parent', '') or '')[:150],
        is_active=True,
        must_change_password=True,
    )
    user.set_password(password)
    user.save()
    user.enfants.add(eleve)
    return user, password, True


def revoquer_sessions(user, garder=None):
    """Invalide les sessions ouvertes du compte (jetons de rafraîchissement), sauf celle qu'on garde."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
    qs = OutstandingToken.objects.filter(user=user)
    if garder:
        qs = qs.exclude(jti=garder)
    for jeton in qs:
        BlacklistedToken.objects.get_or_create(token=jeton)
