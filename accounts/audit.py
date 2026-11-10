"""Audit des droits d'accès : pour chaque point d'accès de l'API et chaque rôle, qui est autorisé ?

On n'exécute aucune vue : on construit une requête factice pour chaque rôle et on interroge les
`permission_classes` effectives de la vue (get_permissions), exactement comme DRF le fait.
Sert à la commande `manage.py audit_permissions` et au test de non-régression des droits.
"""
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.roles import ROLES_PERSONNEL

ROLES = ['ANONYME', 'ELEVE', 'PARENT', 'ENSEIGNANT', *ROLES_PERSONNEL, 'ADMIN', 'SUPER_ADMIN']
METHODES = ['get', 'post', 'put', 'patch', 'delete']


def _routes(patterns=None, prefixe=''):
    """Parcourt récursivement les URL : (chemin, callback)."""
    patterns = patterns if patterns is not None else get_resolver().url_patterns
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from _routes(p.url_patterns, prefixe + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefixe + str(p.pattern), p.callback


def _utilisateurs():
    """Un compte par rôle (comptes de démonstration), None pour l'anonyme."""
    from accounts.models import User
    cibles = {
        'ELEVE': User.objects.filter(role='ELEVE', is_active=True, ecole__statut='VALIDEE').first(),
        'PARENT': User.objects.filter(role='PARENT', is_active=True, ecole__statut='VALIDEE').first(),
        'ENSEIGNANT': User.objects.filter(role='ENSEIGNANT', is_active=True, ecole__statut='VALIDEE').first(),
        'ADMIN': User.objects.filter(role='ADMIN', is_active=True, ecole__statut='VALIDEE').first(),
        'SUPER_ADMIN': User.objects.filter(role='SUPER_ADMIN', is_active=True).first(),
        'ANONYME': None,
    }
    # Personnel (secrétaire, comptable, surveillant) : comptes en mémoire dans l'école du directeur, jamais enregistrés
    admin = cibles['ADMIN']
    for role in ROLES_PERSONNEL:
        cibles[role] = User(username=f'audit-{role.lower()}', role=role, is_active=True,
                            ecole=getattr(admin, 'ecole', None))
    return cibles


def _autorise(cls, initkwargs, action, methode, chemin, utilisateur):
    factory = APIRequestFactory()
    brute = getattr(factory, methode)('/' + chemin.lstrip('^').replace('$', '').replace('\\.', '.'))
    if utilisateur is not None:
        force_authenticate(brute, user=utilisateur)
    vue = cls(**initkwargs)
    vue.action = action
    vue.args, vue.kwargs = (), {}
    vue.format_kwarg = None
    req = Request(brute, authenticators=[a() for a in cls.authentication_classes])
    if utilisateur is not None:
        req._force_auth_user = utilisateur
        req._user = utilisateur
    else:
        req._user = None
    vue.request = req
    vue.headers = {}
    try:
        perms = vue.get_permissions()
        return all(p.has_permission(req, vue) for p in perms)
    except Exception:
        return False


def matrice_permissions():
    """Retourne {"METHODE chemin [action]": [rôles autorisés]} pour toute l'API."""
    users = _utilisateurs()
    sortie = {}
    for chemin, cb in _routes():
        if not chemin.startswith('api/') or chemin.startswith('api-auth') or '(?P<format>' in chemin:
            continue
        cls = getattr(cb, 'cls', None)
        if cls is None:
            continue
        actions = getattr(cb, 'actions', None)  # ViewSet : {methode: action}
        initkwargs = getattr(cb, 'initkwargs', {}) or {}
        if actions:
            elements = [(m.upper(), a) for m, a in actions.items()]
        else:
            elements = [(m.upper(), None) for m in METHODES if hasattr(cls, m)]
        for methode, action in elements:
            if methode == 'OPTIONS' or methode == 'HEAD':
                continue
            autorises = [
                r for r in ROLES
                if _autorise(cls, initkwargs, action, methode.lower(), chemin, users.get(r))
                and (r == 'ANONYME' or users.get(r) is not None)
            ]
            joli = chemin.replace('^', '').replace('$', '').replace('(?P<pk>[^/.]+)', '{id}').replace('(?P<slug>[-a-zA-Z0-9_]+)', '{slug}')
            joli = joli.replace('(?P<action>[^/.]+)', '{action}')
            cle = f"{methode} {joli}"
            sortie[cle] = autorises
    return dict(sorted(sortie.items()))


def droits_par_vue():
    """{NomDeLaVue: {action: [rôles autorisés]}} pour tous les ViewSets de l'API (comptes de démonstration)."""
    users = _utilisateurs()
    res = {}
    for chemin, cb in _routes():
        if not chemin.startswith('api/') or '(?P<format>' in chemin or chemin.startswith('api-auth'):
            continue
        cls = getattr(cb, 'cls', None)
        actions = getattr(cb, 'actions', None)
        if cls is None or not actions:
            continue
        for m, a in actions.items():
            if m in ('options', 'head'):
                continue
            ok = {r for r in ROLES if _autorise(cls, getattr(cb, 'initkwargs', {}) or {}, a, m, chemin, users.get(r))
                  and (r == 'ANONYME' or users.get(r) is not None)}
            res.setdefault(cls.__name__, {}).setdefault(a, set()).update(ok)
    return res
