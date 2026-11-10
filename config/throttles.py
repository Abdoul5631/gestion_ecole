"""Limitation du débit des points d'accès publics : essais de connexion et dépôts anonymes."""
import re

from django.conf import settings
from rest_framework.exceptions import Throttled
from rest_framework.throttling import SimpleRateThrottle


class _Limiteur(SimpleRateThrottle):
    """Base : peut être désactivée (THROTTLES_DESACTIVES) pour la suite de tests, qui se reconnecte sans cesse."""

    def allow_request(self, request, view):
        if getattr(settings, 'THROTTLES_DESACTIVES', False):
            return True
        return super().allow_request(request, view)


def _identifiant(brut):
    """Clé stable : un même numéro de téléphone écrit de plusieurs façons compte pour un seul compte."""
    ident = str(brut or '').strip().lower()[:150]
    chiffres = re.sub(r'\D', '', ident)
    if '@' not in ident and len(chiffres) >= 8:
        return chiffres[-8:]
    return ident


class ConnexionParIdentifiant(_Limiteur):
    """Essais de connexion sur un même compte (identifiant, téléphone, matricule)."""
    scope = 'connexion_identifiant'

    def get_cache_key(self, request, view):
        ident = _identifiant(request.data.get('username') if hasattr(request.data, 'get') else '')
        return self.cache_format % {'scope': self.scope, 'ident': ident} if ident else None


class ConnexionParAdresse(_Limiteur):
    """Essais de connexion depuis une même adresse IP (toutes identités confondues)."""
    scope = 'connexion_adresse'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class ChangementMotDePasse(_Limiteur):
    """Essais de « mot de passe actuel » depuis un compte déjà connecté (téléphone volé, session ouverte)."""
    scope = 'changement_mdp'

    def get_cache_key(self, request, view):
        uid = getattr(request.user, 'pk', None)
        return self.cache_format % {'scope': self.scope, 'ident': uid} if uid else None


class ErreurClient(_Limiteur):
    """Remontées d'erreurs du navigateur : 20 par heure et par compte, pour ne pas inonder la supervision."""
    scope = 'erreur_client'

    def get_cache_key(self, request, view):
        uid = getattr(request.user, 'pk', None) or self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': uid}


class DepotPublic(_Limiteur):
    """Créations anonymes (nouvelle école, dépôt de dossier d'inscription) par adresse IP."""
    scope = 'depot_public'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


def lever_trop_de_tentatives(wait):
    raise Throttled(wait=wait, detail="Trop de tentatives de connexion.")
