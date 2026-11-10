"""Tableau de bord du super admin : toutes les écoles, l'état de la plateforme, les incidents."""
import shutil
import time
from datetime import timedelta

from django.conf import settings
from django.db import connection
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import IncidentServeur, JournalAction, User
from accounts.permissions import IsPlateforme


def _sante():
    """Contrôles rapides : chacun dit OK / ATTENTION / PROBLEME avec une phrase compréhensible."""
    controles = []

    def ajouter(code, libelle, etat, texte):
        controles.append({'code': code, 'libelle': libelle, 'etat': etat, 'texte': texte})

    # base de données
    try:
        t = time.monotonic()
        with connection.cursor() as c:
            c.execute('SELECT 1')
        ms = int((time.monotonic() - t) * 1000)
        ajouter('base', 'Base de données', 'OK' if ms < 300 else 'ATTENTION',
                f'Répond en {ms} ms.' if ms < 300 else f'Lente : {ms} ms pour une requête simple.')
    except Exception as e:
        ajouter('base', 'Base de données', 'PROBLEME', f'Injoignable : {e}')

    # migrations en attente (mise à jour incomplète)
    try:
        from django.db.migrations.executor import MigrationExecutor
        plan = MigrationExecutor(connection).migration_plan(MigrationExecutor(connection).loader.graph.leaf_nodes())
        ajouter('migrations', 'Mise à jour de la base', 'OK' if not plan else 'PROBLEME',
                'À jour.' if not plan else f'{len(plan)} migration(s) non appliquée(s) : lancez « manage.py migrate ».')
    except Exception as e:
        ajouter('migrations', 'Mise à jour de la base', 'ATTENTION', f'Vérification impossible : {e}')

    # espace disque (photos, logos, pièces jointes)
    try:
        racine = str(getattr(settings, 'MEDIA_ROOT', '') or settings.BASE_DIR)
        u = shutil.disk_usage(racine)
        libre = u.free / u.total * 100
        etat = 'OK' if libre > 15 else ('ATTENTION' if libre > 5 else 'PROBLEME')
        ajouter('disque', 'Espace disque', etat, f'{u.free / 1e9:.1f} Go libres ({libre:.0f} %).')
    except Exception as e:
        ajouter('disque', 'Espace disque', 'ATTENTION', f'Vérification impossible : {e}')

    # sauvegarde complète
    derniere = JournalAction.objects.filter(objet_type='Sauvegarde', ecole__isnull=True).order_by('-date').first()
    if derniere is None:
        ajouter('sauvegarde', 'Sauvegarde complète', 'PROBLEME', 'Aucune sauvegarde complète enregistrée.')
    else:
        jours = (timezone.now() - derniere.date).days
        ajouter('sauvegarde', 'Sauvegarde complète', 'OK' if jours <= 7 else 'ATTENTION',
                f"Dernière le {timezone.localtime(derniere.date):%d/%m/%Y à %H:%M}" + (f' (il y a {jours} jours).' if jours else '.'))

    # SMS
    try:
        from notifications.models import SmsOutbox
        from notifications.services import sms_config_publique
        conf = sms_config_publique()
        echecs = SmsOutbox.objects.filter(statut='FAILED', created_at__gte=timezone.now() - timedelta(days=1)).count()
        if not conf.get('configured'):
            ajouter('sms', 'Passerelle SMS', 'ATTENTION', "Non configurée : les SMS sont simulés, les parents voient seulement les messages dans l'application.")
        else:
            ajouter('sms', 'Passerelle SMS', 'OK' if echecs == 0 else 'PROBLEME',
                    f"Active ({conf.get('provider')})." + (f' {echecs} SMS en échec ces 24 h.' if echecs else ''))
    except Exception as e:
        ajouter('sms', 'Passerelle SMS', 'ATTENTION', f'Vérification impossible : {e}')

    # erreurs du serveur
    depuis = timezone.now() - timedelta(days=1)
    erreurs = IncidentServeur.objects.filter(niveau='ERREUR', date__gte=depuis, resolu=False).count()
    lents = IncidentServeur.objects.filter(niveau='LENT', date__gte=depuis, resolu=False).count()
    ajouter('erreurs', 'Erreurs du serveur (24 h)', 'OK' if erreurs == 0 else 'PROBLEME',
            'Aucune erreur.' if erreurs == 0 else f'{erreurs} erreur(s) à examiner dans « Incidents ».')
    navigateur = IncidentServeur.objects.filter(niveau='CLIENT', date__gte=depuis, resolu=False).count()
    ajouter('navigateur', 'Pages plantées chez les utilisateurs (24 h)', 'OK' if navigateur == 0 else 'PROBLEME',
            'Aucune.' if navigateur == 0 else f'{navigateur} page(s) plantée(s) dans le navigateur : voir « Incidents ».')
    ajouter('lenteurs', 'Pages lentes (24 h)', 'OK' if lents == 0 else 'ATTENTION',
            'Aucune lenteur.' if lents == 0 else f'{lents} réponse(s) de plus de 5 secondes.')

    # réglages de production
    ajouter('production', 'Réglages de sécurité', 'ATTENTION' if settings.DEBUG else 'OK',
            'Mode développement actif (DEBUG) : à couper en production.' if settings.DEBUG else 'Mode production.')
    return controles


class TableauPlateformeView(APIView):
    """GET /api/plateforme/tableau/ — vue d'ensemble pour le super admin."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        from parametres.models import Parametres
        from scolarite.models import AnneeScolaire, Inscription
        maintenant = timezone.now()
        il_y_a_7j = maintenant - timedelta(days=7)

        ecoles = list(Parametres.objects.all().order_by('nom_ecole'))
        en_cours = {a.ecole_id: a for a in AnneeScolaire.objects.filter(is_active=True)}
        eleves = dict(Inscription.objects.filter(annee_scolaire__is_active=True, is_active=True, statut='INSCRIT')
                      .values_list('ecole_id').annotate(n=Count('id')))
        comptes = {r['ecole_id']: r for r in User.objects.filter(is_active=True, is_plateforme=False).values('ecole_id').annotate(
            enseignants=Count('id', filter=Q(role='ENSEIGNANT')), parents=Count('id', filter=Q(role='PARENT')),
            equipe=Count('id', filter=Q(role__in=('ADMIN', 'SECRETAIRE', 'COMPTABLE', 'SURVEILLANT', 'COMMUNICATION'))))}
        activite = dict(JournalAction.objects.values_list('ecole_id').annotate(d=Max('date')))
        connexions = dict(JournalAction.objects.filter(action='CONNEXION', date__gte=il_y_a_7j)
                          .values_list('ecole_id').annotate(n=Count('id')))
        incidents = dict(IncidentServeur.objects.filter(niveau__in=('ERREUR', 'CLIENT'), resolu=False, date__gte=il_y_a_7j)
                         .values_list('ecole_id').annotate(n=Count('id')))

        lignes, alertes = [], []
        for e in ecoles:
            derniere = activite.get(e.id)
            jours = (maintenant - derniere).days if derniere else None
            ligne = {
                'id': e.id, 'nom': e.nom_ecole, 'ville': e.ville, 'statut': e.statut,
                'annee_en_cours': en_cours[e.id].libelle if e.id in en_cours else None,
                'eleves': eleves.get(e.id, 0),
                'enseignants': comptes.get(e.id, {}).get('enseignants', 0),
                'parents': comptes.get(e.id, {}).get('parents', 0),
                'equipe': comptes.get(e.id, {}).get('equipe', 0),
                'connexions_7j': connexions.get(e.id, 0),
                'derniere_activite': derniere,
                'jours_sans_activite': jours,
                'incidents_7j': incidents.get(e.id, 0),
            }
            lignes.append(ligne)
            if e.statut == 'EN_ATTENTE':
                alertes.append({'niveau': 'info', 'ecole_id': e.id, 'texte': f"{e.nom_ecole} attend votre validation.", 'lien': '/plateforme/ecoles'})
            if e.statut == 'VALIDEE':
                if ligne['incidents_7j']:
                    alertes.append({'niveau': 'error', 'ecole_id': e.id, 'lien': '/plateforme/incidents',
                                    'texte': f"{e.nom_ecole} : {ligne['incidents_7j']} erreur(s) du serveur cette semaine."})
                if not ligne['annee_en_cours']:
                    alertes.append({'niveau': 'warning', 'ecole_id': e.id, 'lien': '/plateforme/ecoles',
                                    'texte': f"{e.nom_ecole} n'a pas d'année scolaire en cours."})
                if jours is None or jours >= 14:
                    alertes.append({'niveau': 'warning', 'ecole_id': e.id, 'lien': '/plateforme/ecoles',
                                    'texte': f"{e.nom_ecole} : aucune activité " + (f'depuis {jours} jours.' if jours is not None else 'enregistrée.')})

        sante = _sante()
        for c in sante:
            if c['etat'] == 'PROBLEME':
                liens = {'erreurs': '/plateforme/incidents', 'navigateur': '/plateforme/incidents', 'sauvegarde': '/admin/sauvegarde'}
                alertes.insert(0, {'niveau': 'error', 'texte': f"{c['libelle']} : {c['texte']}", 'lien': liens.get(c['code'], '')})

        validees = [l for l in lignes if l['statut'] == 'VALIDEE']
        return Response({
            'totaux': {
                'ecoles': len(ecoles), 'validees': len(validees),
                'en_attente': sum(1 for l in lignes if l['statut'] == 'EN_ATTENTE'),
                'eleves': sum(l['eleves'] for l in validees), 'enseignants': sum(l['enseignants'] for l in validees),
                'parents': sum(l['parents'] for l in validees),
                'connexions_24h': JournalAction.objects.filter(action='CONNEXION', date__gte=maintenant - timedelta(days=1)).count(),
            },
            'sante': sante,
            'alertes': alertes,
            'ecoles': lignes,
        })


class IncidentsView(APIView):
    """GET /api/plateforme/incidents/?ecole=&niveau=&resolus=1 — les erreurs regroupées (même page, même message)."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        p = request.query_params
        qs = IncidentServeur.objects.select_related('ecole')
        if p.get('resolus') != '1':
            qs = qs.filter(resolu=False)
        if p.get('ecole'):
            qs = qs.filter(ecole_id=p['ecole'])
        if p.get('niveau') in ('ERREUR', 'LENT', 'CLIENT'):
            qs = qs.filter(niveau=p['niveau'])
        groupes = {}
        for i in qs.order_by('-date')[:2000]:
            cle = (i.niveau, i.methode, i.chemin_type, i.message[:120], i.ecole_id)
            g = groupes.get(cle)
            if g is None:
                g = groupes[cle] = {
                    'id': i.id, 'niveau': i.niveau, 'methode': i.methode, 'chemin': i.chemin, 'message': i.message,
                    'detail': i.detail, 'statut_http': i.statut_http, 'ecole_id': i.ecole_id,
                    'ecole': i.ecole.nom_ecole if i.ecole_id else 'Plateforme / non connecté',
                    'derniere': i.date, 'premiere': i.date, 'nombre': 0, 'utilisateurs': [], 'ids': [], 'resolu': i.resolu,
                }
            g['nombre'] += 1
            g['premiere'] = i.date
            g['ids'].append(i.id)
            nom = f'{i.nom_utilisateur} ({i.role})' if i.nom_utilisateur else ''
            if nom and nom not in g['utilisateurs'] and len(g['utilisateurs']) < 5:
                g['utilisateurs'].append(nom)
        return Response({'results': sorted(groupes.values(), key=lambda g: g['derniere'], reverse=True)[:200]})


class ResoudreIncidentsView(APIView):
    """POST /api/plateforme/incidents/resoudre/ {ids: [...]} — marque des incidents comme traités."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def post(self, request):
        from accounts.journal import noter
        ids = request.data.get('ids') or []
        n = IncidentServeur.objects.filter(id__in=ids, resolu=False).update(
            resolu=True, resolu_le=timezone.now(), resolu_par=request.user)
        if n:
            noter('MODIFICATION', 'Incident', f'{n} incident(s) marqué(s) comme traité(s)')
        return Response({'resolus': n})
