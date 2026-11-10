"""Rôles du personnel de l'école, entre le directeur (ADMIN) et les enseignants.

Ce que chaque rôle a le droit de faire est décidé dans config/droits.py ; ce module dit seulement
quels comptes appartiennent à l'école entière (et non à une classe ou à une famille).
"""

ROLES_PERSONNEL = ('SECRETAIRE', 'COMPTABLE', 'SURVEILLANT', 'COMMUNICATION')

DESCRIPTION_ROLES = {
    'SECRETAIRE': "Inscriptions, élèves et leurs dossiers, inscriptions en ligne. Pas d'accès à la caisse ni aux notes.",
    'COMPTABLE': "Caisse : tarifs, frais de scolarité, paiements, relances. Pas d'accès aux notes ni aux dossiers des élèves.",
    'SURVEILLANT': "Voir les absents du jour et les classes. Ne fait pas l'appel. Pas d'accès à la caisse ni aux notes.",
    'COMMUNICATION': "Site public de l'école : présentation, photo, contacts, actualités. Aucun accès aux élèves, aux notes ni à la caisse.",
}


# Petites écoles : une même personne peut faire le travail de secrétaire et de comptable, ou de secrétaire et
# de responsable du site public. Un seul compte, ses droits sont l'addition des rôles. Aucun autre cumul n'est possible
# (le directeur, les enseignants et les surveillants gardent un rôle unique ; la caisse reste séparée de la communication).
CUMULS_AUTORISES = {
    'SECRETAIRE': ('COMPTABLE', 'COMMUNICATION'),
    'COMPTABLE': ('SECRETAIRE',),
    'COMMUNICATION': ('SECRETAIRE',),
}


def roles_de(user):
    """Tous les rôles d'un compte : le rôle principal, puis les rôles cumulés autorisés."""
    role = getattr(user, 'role', None)
    if not role:
        return ()
    permis = CUMULS_AUTORISES.get(role, ())
    extras = [r for r in (getattr(user, 'roles_supplementaires', None) or []) if r in permis]
    return (role, *dict.fromkeys(extras))


def a_un_role(user, *roles):
    """Le compte a-t-il l'un de ces rôles (principal ou cumulé) ?"""
    return any(r in roles for r in roles_de(user))


def q_roles(roles):
    """Filtre ORM : comptes ayant l'un de ces rôles, en principal ou en cumul."""
    from django.db.models import Q
    q = Q(role__in=list(roles))
    for r in roles:
        if any(r in cumuls for cumuls in CUMULS_AUTORISES.values()):
            q |= Q(roles_supplementaires__contains=[r])
    return q


def est_personnel(user):
    return getattr(user, 'role', None) in ROLES_PERSONNEL


def voit_toute_l_ecole(user):
    """Directeur ou personnel : les données de toute son école (les droits par action limitent ce qu'il en fait)."""
    return getattr(user, 'role', None) == 'ADMIN' or est_personnel(user)
