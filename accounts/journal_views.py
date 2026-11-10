"""Consultation du journal d'activité par le directeur (lecture seule)."""
from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from config.tenancy import is_plateforme, scoped
from .models import JournalAction
from .permissions import DroitsParAction


class JournalActionSerializer(serializers.ModelSerializer):
    action_libelle = serializers.CharField(source='get_action_display', read_only=True)
    ecole_nom = serializers.CharField(source='ecole.nom_ecole', read_only=True, default=None)

    class Meta:
        model = JournalAction
        fields = ['id', 'date', 'ecole', 'ecole_nom', 'utilisateur', 'nom_utilisateur', 'role', 'action', 'action_libelle',
                  'objet_type', 'objet_id', 'objet_libelle', 'details', 'ip']


class PageJournal(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


def _jour(texte):
    try:
        return datetime.strptime(texte, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def _journal_visible(user):
    """Directeur : son école, sans les actions de la plateforme (le super admin intervient parfois dans une école :
    réinitialisation d'un mot de passe, validation…). Super admin : toutes les écoles et toutes les actions."""
    if is_plateforme(user):
        return JournalAction.objects.select_related('ecole')
    return (scoped(JournalAction.objects.select_related('ecole'), user)
            .exclude(utilisateur__is_plateforme=True).exclude(role__icontains='SUPER_ADMIN'))


class JournalActionViewSet(DroitsParAction, mixins.ListModelMixin, viewsets.GenericViewSet):
    """GET /api/journal/?du=AAAA-MM-JJ&au=…&utilisateur=…&action=…&objet_type=…&q=…&ecole=… (plateforme)"""
    serializer_class = JournalActionSerializer
    pagination_class = PageJournal
    acces_plateforme = True  # le super admin y accède (voir EcoleAccesPermission)

    def get_queryset(self):
        qs = _journal_visible(self.request.user)
        p = self.request.query_params
        if is_plateforme(self.request.user) and p.get('ecole'):
            qs = qs.filter(ecole=None) if p['ecole'] == 'plateforme' else qs.filter(ecole_id=p['ecole'])
        tz = timezone.get_current_timezone()
        du, au = _jour(p.get('du')), _jour(p.get('au'))
        if du:
            qs = qs.filter(date__gte=timezone.make_aware(datetime.combine(du, time.min), tz))
        if au:
            qs = qs.filter(date__lt=timezone.make_aware(datetime.combine(au + timedelta(days=1), time.min), tz))
        if p.get('utilisateur'):
            qs = qs.filter(utilisateur_id=p['utilisateur'])
        if p.get('action'):
            qs = qs.filter(action=p['action'])
        if p.get('objet_type'):
            qs = qs.filter(objet_type=p['objet_type'])
        if p.get('q'):
            q = p['q'].strip()
            qs = qs.filter(Q(objet_libelle__icontains=q) | Q(nom_utilisateur__icontains=q) | Q(objet_type__icontains=q)
                           | Q(ecole__nom_ecole__icontains=q))
        return qs.order_by('-date', '-id')

    @action(detail=False, methods=['get'])
    def filtres(self, request):
        """Personnes et types d'objets présents dans le journal de l'école (listes des filtres)."""
        qs = _journal_visible(request.user)
        personnes = (qs.exclude(utilisateur=None).values('utilisateur', 'nom_utilisateur', 'role')
                     .order_by('nom_utilisateur').distinct())
        vues, liste = set(), []
        for p in personnes:
            if p['utilisateur'] not in vues:
                vues.add(p['utilisateur'])
                liste.append({'id': p['utilisateur'], 'nom': p['nom_utilisateur'], 'role': p['role']})
        types = sorted(set(qs.exclude(objet_type='').values_list('objet_type', flat=True)))
        donnees = {'personnes': liste, 'types': types, 'actions': [
            {'code': c, 'libelle': l} for c, l in JournalAction.ACTIONS]}
        if is_plateforme(request.user):
            from parametres.models import Parametres
            donnees['ecoles'] = list(Parametres.objects.order_by('nom_ecole').values('id', 'nom_ecole'))
        return Response(donnees)
