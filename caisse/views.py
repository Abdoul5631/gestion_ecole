from datetime import date

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin, DroitsParAction
from accounts.roles import voit_toute_l_ecole
from config.tenancy import scoped, ecole_of
from config.soft_delete import SoftDeleteMixin
from scolarite.utils import resolve_annee, ids_enfants, get_annee_active

from .models import TarifNiveau, DossierScolarite, Paiement, Depense
from .serializers import TarifNiveauSerializer, DossierScolariteSerializer, PaiementSerializer, DepenseSerializer
from .services import ouvrir_dossier, enregistrer_paiement, PaiementInvalide


def _peut_voir_dossier(user, dossier):
    if voit_toute_l_ecole(user):
        return True
    if user.role == 'PARENT':
        return dossier.inscription.eleve_id in ids_enfants(user)
    if user.role == 'ELEVE' and user.eleve_id:
        return dossier.inscription.eleve_id == user.eleve_id
    return False


class TarifNiveauViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = TarifNiveauSerializer

    def get_queryset(self):
        qs = scoped(TarifNiveau.objects.select_related('niveau', 'annee_scolaire'), self.request.user)
        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        niveau_id = self.request.query_params.get('niveau_id')
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))


class DossierScolariteViewSet(DroitsParAction, viewsets.ModelViewSet):
    serializer_class = DossierScolariteSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        qs = scoped(DossierScolarite.objects.select_related(
            'inscription__eleve',
            'inscription__classe__niveau',
            'inscription__annee_scolaire',
        ).prefetch_related('paiements__recu_par'), user)

        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(inscription__annee_scolaire=annee)

        classe_id = self.request.query_params.get('classe_id')
        niveau_id = self.request.query_params.get('niveau_id')
        statut = self.request.query_params.get('statut')
        eleve_id = self.request.query_params.get('eleve_id')
        if classe_id:
            qs = qs.filter(inscription__classe_id=classe_id)
        if niveau_id:
            qs = qs.filter(inscription__classe__niveau_id=niveau_id)
        if statut:
            qs = qs.filter(statut=statut)
        if eleve_id:
            qs = qs.filter(inscription__eleve_id=eleve_id)

        if voit_toute_l_ecole(user):
            return qs
        if user.role == 'PARENT':
            return qs.filter(inscription__eleve_id__in=ids_enfants(user))
        if user.role == 'ELEVE' and user.eleve_id:
            return qs.filter(inscription__eleve_id=user.eleve_id)
        return DossierScolarite.objects.none()

    @action(detail=False, methods=['post'], url_path='ouvrir-manquants')
    def ouvrir_manquants(self, request):
        """Ouvre un dossier pour chaque inscription de l'année qui n'en a pas."""
        from scolarite.models import Inscription
        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        qs = Inscription.objects.select_related('classe__niveau', 'annee_scolaire')
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        created = 0
        for ins in qs:
            _, was = DossierScolarite.objects.get_or_create(
                inscription=ins,
                defaults={'montant_du': 0, 'statut': 'IMPAYE'},
            )
            if was:
                ouvrir_dossier(ins)
                created += 1
            else:
                ouvrir_dossier(ins)
        return Response({'created': created, 'total': qs.count()})

    @action(detail=True, methods=['post'])
    def paiement(self, request, pk=None):
        from accounts.sync_dedupe import replay_if_seen, store_receipt, extract_client_id
        existing = replay_if_seen(request)
        if existing is not None:
            return existing

        dossier = self.get_object()
        montant = request.data.get('montant')
        try:
            montant = int(montant)
        except (TypeError, ValueError):
            return Response({'detail': 'Le montant doit être un nombre.'}, status=400)

        # La date d'un paiement est celle du jour où il est encaissé : elle ne se choisit pas.
        # Seule exception : un encaissement fait hors ligne (client_id) garde le jour réel de la saisie,
        # au plus 30 jours en arrière et jamais dans le futur.
        date_paiement = date.today()
        if extract_client_id(request) and request.data.get('date_paiement'):
            try:
                saisie = date.fromisoformat(str(request.data['date_paiement'])[:10])
            except ValueError:
                return Response({'detail': 'Date de paiement invalide.'}, status=400)
            if 0 <= (date.today() - saisie).days <= 30:
                date_paiement = saisie

        # Un paiement compte pour le total de la scolarité (pas de tranche) ; soldé = terminé.
        # Toutes les règles (montant, reste, référence) sont contrôlées sous verrou dans le service.
        try:
            paiement = enregistrer_paiement(
                dossier,
                montant=montant,
                date_paiement=date_paiement,
                mode=request.data.get('mode') or 'ESPECES',
                recu_par=request.user,
                commentaire=request.data.get('commentaire') or '',
                controler=True,
            )
        except PaiementInvalide as e:
            return Response({'detail': str(e)}, status=400)
        dossier.refresh_from_db()
        response = Response({
            'paiement': PaiementSerializer(paiement, context={'request': request}).data,
            'dossier': DossierScolariteSerializer(dossier, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)
        store_receipt(request, response)
        return response


    @action(detail=True, methods=['get'], url_path='certificat-non-redevance')
    def certificat_non_redevance(self, request, pk=None):
        """Certificat de non redevance (PDF) : seulement si l'élève ne doit plus rien. ?telecharger=1 force le téléchargement."""
        from django.http import HttpResponse
        from accounts.journal import noter
        from . import certificat
        dossier = self.get_object()
        refus = certificat.verifier(dossier)
        if refus:
            return Response({'detail': refus}, status=400)
        ecole = ecole_of(request.user)
        signature = request.user.signature.path if request.user.signature else None
        from .services import numero_certificat
        numero = numero_certificat(dossier, request.user, ecole)
        pdf = certificat.pdf_certificat(dossier, ecole, request.user, signature, numero)
        eleve = dossier.inscription.eleve
        noter('MODIFICATION', 'Certificat de non redevance', f'{numero} — {eleve.nom} {eleve.prenom}', objet_id=eleve.pk, user=request.user, ecole=ecole)
        rep = HttpResponse(pdf, content_type='application/pdf')
        nom = ''.join(c if c.isalnum() else '_' for c in f'non_redevance_{eleve.nom}_{eleve.prenom}')
        disposition = 'attachment' if request.query_params.get('telecharger') else 'inline'
        rep['Content-Disposition'] = f'{disposition}; filename="{nom}.pdf"'
        return rep

    @action(detail=False, methods=['post'])
    def informer(self, request):
        """Message libre aux parents des élèves dont la scolarité n'est pas soldée."""
        from notifications.services import notifier_parents
        titre = (request.data.get('titre') or '').strip() or 'Information de la caisse'
        message = (request.data.get('message') or '').strip()
        if not message:
            return Response({'detail': 'Le texte du message est obligatoire.'}, status=400)
        if len(message) > 800:
            return Response({'detail': 'Message trop long (800 caractères max).'}, status=400)
        qs = self.get_queryset().exclude(statut='SOLDE').select_related('inscription__eleve')
        if request.data.get('classe_id'):
            qs = qs.filter(inscription__classe_id=request.data['classe_id'])
        if request.data.get('statut') in ('IMPAYE', 'PARTIEL'):
            qs = qs.filter(statut=request.data['statut'])
        eleves = {}
        for d in qs:
            eleves[d.inscription.eleve_id] = d.inscription.eleve
        if not eleves:
            return Response({'detail': 'Aucun élève avec une scolarité à régler.'}, status=400)
        notifications = 0
        for eleve in eleves.values():
            notifs, _ = notifier_parents(
                eleve, type='FRAIS', titre=titre, message=message, lien='/messages',
            )
            notifications += len(notifs)
        return Response({
            'eleves': len(eleves), 'notifications': notifications,
            'message': f"Message envoyé aux parents de {len(eleves)} élève(s).",
        })

    @action(detail=False, methods=['post'])
    def relancer(self, request):
        """Envoie une relance (notification + SMS) aux parents des dossiers impayés / partiels."""
        from notifications.services import relancer_frais
        ids = request.data.get('dossier_ids') or []
        if ids:
            qs = self.get_queryset().filter(id__in=ids).exclude(statut='SOLDE')
        else:
            qs = self.get_queryset().exclude(statut='SOLDE')
        result = relancer_frais(qs, auteur=request.user)
        if not result.get('envoyes'):
            return Response(
                result,
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(result)


class PaiementViewSet(DroitsParAction, viewsets.ReadOnlyModelViewSet):
    serializer_class = PaiementSerializer

    def get_queryset(self):
        user = self.request.user
        qs = scoped(Paiement.objects.select_related(
            'dossier__inscription__eleve',
            'dossier__inscription__classe',
            'dossier__inscription__annee_scolaire',
            'recu_par',
        ), user)
        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(dossier__inscription__annee_scolaire=annee)
        dossier_id = self.request.query_params.get('dossier_id')
        if dossier_id:
            qs = qs.filter(dossier_id=dossier_id)

        if voit_toute_l_ecole(user):
            return qs
        if user.role == 'PARENT':
            return qs.filter(dossier__inscription__eleve_id__in=ids_enfants(user))
        if user.role == 'ELEVE' and user.eleve_id:
            return qs.filter(dossier__inscription__eleve_id=user.eleve_id)
        return Paiement.objects.none()


class DepenseViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    """Sorties d'argent : saisies par le comptable, consultées par le directeur. Une dépense n'est jamais effacée (annulée)."""
    serializer_class = DepenseSerializer

    def get_queryset(self):
        qs = scoped(Depense.objects.select_related('saisi_par'), self.request.user)
        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        categorie = self.request.query_params.get('categorie')
        if categorie:
            qs = qs.filter(categorie=categorie)
        return qs

    def perform_create(self, serializer):
        from django.db import transaction
        from parametres.models import Parametres
        from .services import prochain_numero_depense
        ecole = ecole_of(self.request.user)
        with transaction.atomic():
            if ecole is not None:
                Parametres.objects.select_for_update().get(pk=ecole.pk)  # deux saisies simultanées : numéros distincts
            serializer.save(
                ecole=ecole, saisi_par=self.request.user, annee_scolaire=get_annee_active(ecole),
                date_depense=date.today(), numero=prochain_numero_depense(ecole, date.today()),
            )

    @action(detail=False, methods=['get'])
    def journal(self, request):
        """Journal de caisse d'un jour (?date=AAAA-MM-JJ, par défaut aujourd'hui) : chaque entrée et chaque sortie, avec les totaux."""
        from django.db.models import Sum
        try:
            jour = date.fromisoformat(request.query_params['date']) if request.query_params.get('date') else date.today()
        except ValueError:
            return Response({'detail': 'Date invalide (AAAA-MM-JJ).'}, status=400)
        user = request.user
        paiements = list(scoped(Paiement.objects.filter(date_paiement=jour).select_related(
            'dossier__inscription__eleve', 'dossier__inscription__classe', 'recu_par',
        ).prefetch_related('dossier__paiements'), user).order_by('id'))
        depenses = list(scoped(Depense.objects.filter(is_active=True, date_depense=jour).select_related('saisi_par'), user).order_by('id'))
        entrees = [PaiementSerializer(p).data for p in paiements]
        sorties = DepenseSerializer(depenses, many=True).data
        par_mode = {}
        for p in paiements:
            par_mode[p.mode] = par_mode.get(p.mode, 0) + int(p.montant)
        total_entrees = sum(int(p.montant) for p in paiements)
        total_sorties = sum(int(d.montant) for d in depenses)
        libelles = dict(Paiement.MODE_CHOICES)
        return Response({
            'date': jour.isoformat(),
            'entrees': entrees, 'sorties': sorties,
            'total_entrees': total_entrees, 'total_sorties': total_sorties, 'solde': total_entrees - total_sorties,
            'entrees_par_mode': [{'mode': k, 'libelle': libelles.get(k, k), 'total': v} for k, v in sorted(par_mode.items())],
        })

    @action(detail=False, methods=['get'])
    def bilan(self, request):
        """État financier de l'année : entrées (scolarité encaissée), sorties (dépenses), solde, reste à recouvrer."""
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncMonth

        user = request.user
        annee = resolve_annee(request)
        paiements = scoped(Paiement.objects.all(), user)
        depenses = scoped(Depense.objects.filter(is_active=True), user)
        dossiers = scoped(DossierScolarite.objects.filter(inscription__is_active=True), user)
        if annee:
            paiements = paiements.filter(dossier__inscription__annee_scolaire=annee)
            depenses = depenses.filter(annee_scolaire=annee)
            dossiers = dossiers.filter(inscription__annee_scolaire=annee)

        def somme(qs, champ='montant'):
            return int(qs.aggregate(s=Sum(champ))['s'] or 0)

        aujourdhui = date.today()
        debut_mois = aujourdhui.replace(day=1)
        entrees, sorties = somme(paiements), somme(depenses)
        attendu = somme(dossiers, 'montant_du')

        mois = {}
        for r in paiements.annotate(m=TruncMonth('date_paiement')).values('m').annotate(t=Sum('montant')):
            mois.setdefault(r['m'].strftime('%Y-%m'), {'entrees': 0, 'sorties': 0})['entrees'] = int(r['t'])
        for r in depenses.annotate(m=TruncMonth('date_depense')).values('m').annotate(t=Sum('montant')):
            mois.setdefault(r['m'].strftime('%Y-%m'), {'entrees': 0, 'sorties': 0})['sorties'] = int(r['t'])

        statuts = {r['statut']: r['n'] for r in dossiers.values('statut').annotate(n=Count('id'))}

        # Pour le tableau de bord : les derniers mouvements et les plus gros restes à payer
        derniers_paiements = list(paiements.select_related(
            'dossier__inscription__eleve', 'dossier__inscription__classe').order_by('-created_at')[:8])
        dernieres_depenses = list(depenses.order_by('-created_at')[:8])
        mouvements = [{
            'type': 'entree', 'date': p.date_paiement.isoformat(), 'horodatage': p.created_at.isoformat(),
            'libelle': f"{p.dossier.inscription.eleve.prenom} {p.dossier.inscription.eleve.nom}",
            'detail': f"{p.numero_recu} · {p.get_mode_display()}", 'montant': int(p.montant),
        } for p in derniers_paiements] + [{
            'type': 'sortie', 'date': d.date_depense.isoformat(), 'horodatage': d.created_at.isoformat(),
            'libelle': d.libelle, 'detail': f"{d.numero} · {d.get_categorie_display()}", 'montant': int(d.montant),
        } for d in dernieres_depenses]
        mouvements.sort(key=lambda m: m['horodatage'], reverse=True)

        from django.db.models import DecimalField, Value
        from django.db.models.functions import Coalesce
        restes = []
        for d in dossiers.exclude(statut='SOLDE').select_related('inscription__eleve', 'inscription__classe').annotate(
            verse=Coalesce(Sum('paiements__montant'), Value(0), output_field=DecimalField(max_digits=12, decimal_places=0)),
        ):
            reste = int(d.montant_du or 0) - int(d.verse or 0)
            if reste > 0:
                restes.append({
                    'dossier': d.id, 'eleve': f"{d.inscription.eleve.prenom} {d.inscription.eleve.nom}",
                    'classe': d.inscription.classe.nom if d.inscription.classe else '', 'reste': reste,
                    'statut': d.statut,
                })
        restes.sort(key=lambda r: r['reste'], reverse=True)

        libelles_categories = dict(Depense.CATEGORIE_CHOICES)
        libelles_modes = dict(Paiement.MODE_CHOICES)
        return Response({
            'entrees': entrees,
            'sorties': sorties,
            'solde': entrees - sorties,
            'attendu': attendu,
            'reste_a_recouvrer': max(0, attendu - entrees),
            'taux_recouvrement': round(entrees * 100 / attendu) if attendu else 0,
            'aujourdhui': {
                'entrees': somme(paiements.filter(date_paiement=aujourdhui)),
                'sorties': somme(depenses.filter(date_depense=aujourdhui)),
                'nb_recus': paiements.filter(date_paiement=aujourdhui).count(),
            },
            'derniers_mouvements': mouvements[:8],
            'plus_gros_restes': restes[:5],
            'ce_mois': {
                'entrees': somme(paiements.filter(date_paiement__gte=debut_mois)),
                'sorties': somme(depenses.filter(date_depense__gte=debut_mois)),
            },
            'dossiers': {
                'total': sum(statuts.values()),
                'solde': statuts.get('SOLDE', 0),
                'partiel': statuts.get('PARTIEL', 0),
                'impaye': statuts.get('IMPAYE', 0),
            },
            'par_mois': [{'mois': k, **v} for k, v in sorted(mois.items())],
            'depenses_par_categorie': [
                {'categorie': r['categorie'], 'libelle': libelles_categories.get(r['categorie'], r['categorie']), 'total': int(r['t'])}
                for r in depenses.values('categorie').annotate(t=Sum('montant')).order_by('-t')
            ],
            'entrees_par_mode': [
                {'mode': r['mode'], 'libelle': libelles_modes.get(r['mode'], r['mode']), 'total': int(r['t'])}
                for r in paiements.values('mode').annotate(t=Sum('montant')).order_by('-t')
            ],
        })
