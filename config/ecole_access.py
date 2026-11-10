"""Bloque pédagogie / caisse si l'école n'est pas VALIDEE. Indépendant des permissions DRF."""
from django.http import JsonResponse
from rest_framework_simplejwt.authentication import JWTAuthentication


def _user_from_jwt(request):
    jwt_auth = JWTAuthentication()
    try:
        header = jwt_auth.get_header(request)
        if header is None:
            return None
        raw = jwt_auth.get_raw_token(header)
        validated = jwt_auth.get_validated_token(raw)
        return jwt_auth.get_user(validated)
    except Exception:
        return None


class EcoleStatutMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ''
        if not path.startswith('/api/'):
            return self.get_response(request)
        if (
            path.startswith('/api/auth/login')
            or path.startswith('/api/auth/refresh')
            or path.startswith('/api/auth/change-password')
            or path.startswith('/api/auth/mon-compte')
            or path.startswith('/api/ecoles/inscription')
            or path.startswith('/api/vitrine/')
            or path.startswith('/api/sante')
            or path.startswith('/api/accueil')
            or path.startswith('/api/maintenance')
            or path.startswith('/api/annonces-actives')
            or path.startswith('/api/erreur-client')
        ):
            return self.get_response(request)

        user = _user_from_jwt(request)
        if user is None:
            return self.get_response(request)

        from config.tenancy import ecole_of, is_plateforme

        if is_plateforme(user):
            # plateforme : écoles, son profil, journal d'activité et sauvegarde complète — jamais la pédagogie
            if path.startswith(('/api/ecoles', '/api/auth/me', '/api/journal', '/api/sauvegarde', '/api/plateforme',
                                '/api/notifications', '/api/maintenance')):
                return self.get_response(request)
            return JsonResponse(
                {'detail': "Compte plateforme : validez les écoles ici, sans accéder à la pédagogie."},
                status=403,
            )

        ecole = ecole_of(user)
        if ecole is None or ecole.statut == 'VALIDEE':
            return self.get_response(request)

        if path.startswith('/api/auth/me'):
            return self.get_response(request)

        if ecole.statut == 'REFUSEE':
            msg = "Votre demande d'école a été refusée."
            if ecole.motif:
                msg += f" Motif : {ecole.motif}"
        elif ecole.statut == 'SUSPENDUE':
            msg = "Votre école est suspendue."
            if ecole.motif:
                msg += f" Motif : {ecole.motif}"
        else:
            msg = "Votre école est en attente de validation."
        return JsonResponse({'detail': msg}, status=403)
