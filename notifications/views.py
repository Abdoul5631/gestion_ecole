from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin, DroitsParAction
from config.tenancy import scoped, ecole_of
from eleves.models import Eleve
from .models import Notification, SmsOutbox
from .serializers import NotificationSerializer, SmsOutboxSerializer
from .services import (
    sms_config_publique, envoyer_message_parent, envoyer_message_groupe, relancer_frais,
)


class NotificationViewSet(DroitsParAction, mixins.ListModelMixin,
                          mixins.RetrieveModelMixin,
                          viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    acces_plateforme = True  # le super admin a ses propres notifications (voir EcoleAccesPermission)

    def get_queryset(self):
        return Notification.objects.filter(
            destinataire=self.request.user
        ).select_related('eleve')

    @action(detail=False, methods=['get'])
    def non_lues(self, request):
        qs = self.get_queryset().filter(lu=False)
        return Response({
            'count': qs.count(),
            'results': NotificationSerializer(qs[:20], many=True).data,
        })

    @action(detail=True, methods=['post'])
    def lire(self, request, pk=None):
        notif = self.get_object()
        notif.lu = True
        notif.save(update_fields=['lu'])
        return Response(NotificationSerializer(notif).data)

    @action(detail=False, methods=['post'], url_path='tout-lire')
    def tout_lire(self, request):
        n = self.get_queryset().filter(lu=False).update(lu=True)
        return Response({'updated': n})


class SmsOutboxViewSet(DroitsParAction, mixins.ListModelMixin,
                       mixins.RetrieveModelMixin,
                       viewsets.GenericViewSet):
    serializer_class = SmsOutboxSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = scoped(SmsOutbox.objects.select_related('eleve', 'notification'), self.request.user)
        statut = self.request.query_params.get('statut')
        type_sms = self.request.query_params.get('type')
        if statut:
            qs = qs.filter(statut=statut)
        if type_sms:
            qs = qs.filter(type=type_sms)
        return qs

    @action(detail=False, methods=['get'])
    def envois(self, request):
        """Journal regroupé : un message envoyé = une ligne (et non une ligne par parent)."""
        lignes = list(self.get_queryset().order_by('-created_at')[:5000])
        groupes = {}
        # messages automatiques écrits élève par élève (montant, nom…) : un seul envoi pour la direction
        automatiques = {
            'RELANCE': ('Rappel des frais de scolarité restant à payer (montant propre à chaque élève).',
                        lambda m, t: t == 'FRAIS' and m.startswith(('Rappel : il reste ', 'Rappel de scolarité pour '))),
            'ABSENCE': ("Alerte d'absence envoyée aux parents des élèves marqués absents.",
                        lambda m, t: t == 'ABSENCE' and 'marqué(e) absent(e)' in m),
        }
        encours = {}
        for s in lignes:
            sorte = next((k for k, (_, test) in automatiques.items() if test(s.message, s.type)), None)
            if sorte:
                g = encours.get(sorte)
                if g is None or (g['_debut'] - s.created_at).total_seconds() > 300:
                    g = encours[sorte] = groupes[(sorte, s.id)] = {
                        'id': f'{s.id}', 'date': s.created_at, 'type': s.type,
                        'type_libelle': s.get_type_display(), 'message': automatiques[sorte][0],
                        'total': 0, 'statuts': {}, '_debut': s.created_at,
                    }
                g['_debut'] = s.created_at
            else:
                cle = (s.type, s.message, s.created_at.strftime('%Y-%m-%d %H:%M'))
                g = groupes.get(cle)
            if g is None:
                g = groupes[cle] = {
                    'id': f'{s.id}', 'date': s.created_at, 'type': s.type,
                    'type_libelle': s.get_type_display(), 'message': s.message,
                    'total': 0, 'statuts': {},
                }
            g['total'] += 1
            g['statuts'][s.statut] = g['statuts'].get(s.statut, 0) + 1
        for g in groupes.values():
            g.pop('_debut', None)
        resultat = sorted(groupes.values(), key=lambda g: g['date'], reverse=True)[:100]
        return Response({'results': resultat})

    @action(detail=False, methods=['get'])
    def config(self, request):
        return Response(sms_config_publique())

    @action(detail=False, methods=['post'])
    def envoyer(self, request):
        from accounts.sync_dedupe import replay_if_seen, store_receipt
        existing = replay_if_seen(request)
        if existing is not None:
            return existing

        message = (request.data.get('message') or '').strip()
        if not message:
            return Response({'detail': 'Le texte du message est obligatoire.'}, status=400)
        if len(message) > 800:
            return Response({'detail': 'Message trop long (800 caractères max).'}, status=400)

        type_sms = request.data.get('type') or 'INFO'
        if type_sms not in dict(Notification.TYPE_CHOICES):
            type_sms = 'INFO'
        titre = (request.data.get('titre') or '').strip() or "Message de l'école"
        destinataires = (request.data.get('destinataires') or '').strip().lower()
        if not destinataires:
            destinataires = 'eleve' if request.data.get('eleve_id') else 'tous'

        if destinataires in ('tous', 'tous_les_parents', 'all'):
            result = envoyer_message_groupe(
                titre=titre, message=message, type=type_sms, ecole=ecole_of(request.user),
            )
            response = Response(result, status=status.HTTP_201_CREATED)
            store_receipt(request, response)
            return response

        if destinataires in ('classe', 'une_classe'):
            classe_id = request.data.get('classe_id')
            if not classe_id:
                return Response({'detail': 'Choisissez une classe.'}, status=400)
            from scolarite.models import Classe
            try:
                classe = scoped(Classe.objects.all(), request.user).get(pk=classe_id)
            except (Classe.DoesNotExist, ValueError, TypeError):
                return Response({'detail': 'Classe introuvable.'}, status=404)
            from scolarite.utils import resolve_annee, get_annee_active
            annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
            result = envoyer_message_groupe(
                titre=titre, message=message, type=type_sms, classe=classe, annee=annee,
                ecole=ecole_of(request.user),
            )
            response = Response(result, status=status.HTTP_201_CREATED)
            store_receipt(request, response)
            return response

        eleve_id = request.data.get('eleve_id')
        if not eleve_id:
            return Response(
                {'detail': 'Choisissez « Tous les parents » ou une classe.'},
                status=400,
            )
        try:
            eleve = scoped(Eleve.objects.all(), request.user).get(pk=eleve_id)
        except (Eleve.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Élève introuvable.'}, status=404)
        result = envoyer_message_parent(
            eleve=eleve, message=message, type=type_sms, titre=titre,
        )
        response = Response(result, status=status.HTTP_201_CREATED)
        store_receipt(request, response)
        return response


    @action(detail=False, methods=['post'])
    def relancer(self, request):
        """Relance frais (notification + SMS) pour les dossiers non soldés."""
        from caisse.models import DossierScolarite
        from scolarite.utils import resolve_annee, get_annee_active

        qs = DossierScolarite.objects.exclude(statut='SOLDE').select_related(
            'inscription__eleve', 'inscription__annee_scolaire',
        )
        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        if annee:
            qs = qs.filter(inscription__annee_scolaire=annee)
        ids = request.data.get('dossier_ids') or []
        if ids:
            qs = qs.filter(id__in=ids)
        result = relancer_frais(qs, auteur=request.user)
        if not result.get('envoyes'):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
