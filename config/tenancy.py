"""Isolation multi-établissement : une seule base, chaque ligne appartient à une école."""


def ecole_of(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    return getattr(user, 'ecole', None)


def ecole_id_of(user):
    ecole = ecole_of(user)
    return ecole.pk if ecole else None


def is_plateforme(user):
    """Compte plateforme (SUPER_ADMIN / is_plateforme). Pas Django is_superuser."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_plateforme', False):
        return True
    return getattr(user, 'role', None) == 'SUPER_ADMIN'


def ecole_statut_of(user):
    ecole = ecole_of(user)
    return getattr(ecole, 'statut', None) if ecole else None


def ecole_validee(user):
    ecole = ecole_of(user)
    return bool(ecole and getattr(ecole, 'statut', None) == 'VALIDEE')


def ecole_session_payload(user):
    if is_plateforme(user):
        return {
            'ecole_id': None,
            'ecole_nom': None,
            'ecole_statut': None,
            'ecole_motif': None,
            'ecole_couleur': None,
            'ecole_logo': None,
            'is_plateforme': True,
        }
    ecole = ecole_of(user)
    return {
        'ecole_id': ecole.pk if ecole else None,
        'ecole_nom': ecole.nom_ecole if ecole else None,
        'ecole_statut': ecole.statut if ecole else None,
        'ecole_motif': getattr(ecole, 'motif', None) if ecole else None,
        'ecole_couleur': (getattr(ecole, 'couleur_primaire', '') or None) if ecole else None,
        # chemin relatif (/media/…) : passe par le même serveur que l'appli, en local comme via le tunnel
        'ecole_logo': ecole.logo.url if ecole and getattr(ecole, 'logo', None) else None,
        'is_plateforme': False,
    }


def scoped(qs, user, field='ecole'):
    """Filtre un queryset par l'école. La plateforme ne voit pas la pédagogie."""
    if is_plateforme(user):
        return qs.none()
    eid = ecole_id_of(user)
    if eid is None:
        return qs.none()
    return qs.filter(**{f'{field}_id': eid})


def belongs_to_user_ecole(obj, user):
    if is_plateforme(user):
        return False
    eid = ecole_id_of(user)
    if eid is None or obj is None:
        return False
    obj_eid = getattr(obj, 'ecole_id', None)
    if obj_eid is None and hasattr(obj, 'ecole'):
        ecole = getattr(obj, 'ecole', None)
        obj_eid = ecole.pk if ecole else None
    return obj_eid == eid


def attach_ecole(user, defaults=None):
    """Ajoute ecole dans un dict de création si l'utilisateur a une école."""
    data = dict(defaults or {})
    ecole = ecole_of(user)
    if ecole is not None:
        data['ecole'] = ecole
    return data


class EcoleScopedMixin:
    """Filtre les listes et attache l'école à la création."""

    def get_queryset(self):
        qs = super().get_queryset()
        return scoped(qs, self.request.user)

    def perform_create(self, serializer):
        extra = {}
        ecole = ecole_of(self.request.user)
        if ecole is not None:
            extra['ecole'] = ecole
        serializer.save(**extra)


def setup_needed(user):
    """True si l'admin d'une école VALIDEE n'a pas encore créé de niveaux / classes."""
    if not user or getattr(user, 'role', None) != 'ADMIN':
        return False
    if is_plateforme(user):
        return False
    ecole = ecole_of(user)
    if ecole is None or getattr(ecole, 'statut', None) != 'VALIDEE':
        return False
    from scolarite.models import Classe, Niveau
    return not Niveau.objects.filter(ecole=ecole).exists() or not Classe.objects.filter(ecole=ecole).exists()
