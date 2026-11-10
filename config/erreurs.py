"""Toute erreur de l'API est expliquée en français, avec une phrase que l'utilisateur comprend.
Le détail technique n'est jamais montré : il part dans les incidents suivis par le super admin."""
import traceback

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.db import IntegrityError
from django.db.models import ProtectedError, RestrictedError
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler

MESSAGE_SERVEUR = ("Une erreur est survenue sur le serveur. L'équipe technique en a été informée. "
                   "Réessayez dans un instant ; si le problème continue, contactez l'administrateur.")
MESSAGE_INTROUVABLE = "Cet élément est introuvable. Il a peut-être été supprimé ou déplacé."
MESSAGE_SESSION = "Votre session a expiré ou n'est plus valide. Reconnectez-vous pour continuer."
MESSAGE_INTERDIT = "Vous n'avez pas le droit d'effectuer cette action avec votre compte."
MESSAGE_DOUBLON = ("Enregistrement impossible : cette information existe déjà ou elle est liée à d'autres données. "
                   "Vérifiez qu'elle n'est pas déjà enregistrée.")
MESSAGE_SUPPRESSION = ("Suppression impossible : cet élément est utilisé ailleurs (notes, paiements, inscriptions…). "
                       "Vous pouvez le suspendre ou le désactiver à la place.")


def _par_defaut(exc):
    """Vrai si l'exception porte le message générique de DRF (et non un message écrit pour l'utilisateur)."""
    return isinstance(exc.detail, (str, exceptions.ErrorDetail)) and str(exc.detail) == str(getattr(exc, 'default_detail', None))


def _message(exc):
    """Message clair pour les erreurs génériques ; None pour garder celui qu'une vue a écrit elle-même."""
    if isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)) and _par_defaut(exc):
        return MESSAGE_SESSION
    if getattr(exc, 'default_code', '') == 'token_not_valid' or 'token' in str(getattr(exc, 'detail', '')).lower() and 'valid' in str(exc.detail).lower():
        return MESSAGE_SESSION
    if isinstance(exc, exceptions.PermissionDenied) and _par_defaut(exc):
        return MESSAGE_INTERDIT
    if isinstance(exc, exceptions.NotFound) and (_par_defaut(exc) or str(exc.detail).startswith('No ') or str(exc.detail) == 'Not found.'):
        return MESSAGE_INTROUVABLE
    if isinstance(exc, exceptions.MethodNotAllowed):
        return "Cette action n'est pas possible à cet endroit."
    if isinstance(exc, exceptions.NotAcceptable):
        return "Le serveur ne peut pas fournir ce format de réponse."
    if isinstance(exc, exceptions.UnsupportedMediaType):
        return "Ce type de fichier n'est pas accepté. Choisissez un autre fichier."
    if isinstance(exc, exceptions.ParseError):
        return "Les données envoyées sont illisibles. Rechargez la page et recommencez."
    if isinstance(exc, exceptions.Throttled):
        attente = int(exc.wait or 0)
        return ("Trop de tentatives en peu de temps. "
                + (f"Patientez {attente} seconde(s) puis réessayez." if attente else "Patientez un instant puis réessayez."))
    return None


def gestionnaire(exc, context):
    """Gestionnaire d'erreurs de l'API (voir REST_FRAMEWORK['EXCEPTION_HANDLER'])."""
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.messages)
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound(*(exc.args or ()))
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied(*(exc.args or ()))
    reponse = exception_handler(exc, context)
    if reponse is not None:
        message = _message(exc) if isinstance(exc, exceptions.APIException) else None
        if message:
            reponse.data = {'detail': message, **({'code': 'session'} if message == MESSAGE_SESSION else {})}
        return reponse

    if isinstance(exc, (ProtectedError, RestrictedError)):
        return Response({'detail': MESSAGE_SUPPRESSION}, status=409)
    if isinstance(exc, IntegrityError):
        _signaler(exc, context)
        return Response({'detail': MESSAGE_DOUBLON}, status=400)

    # erreur imprévue : l'utilisateur lit une phrase claire, le super admin reçoit l'incident avec le détail technique
    _signaler(exc, context)
    return Response({'detail': MESSAGE_SERVEUR}, status=500)


def _signaler(exc, context):
    try:
        from config.supervision import _enregistrer
        requete = context['request']
        brute = getattr(requete, '_request', requete)
        brute._incident_enregistre = True
        _enregistrer(brute, 'ERREUR', 500, f'{type(exc).__name__} : {exc}',
                     detail=''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-6000:])
    except Exception:
        pass
