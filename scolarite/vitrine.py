"""API publique site vitrine + dossiers de préinscription."""
import mimetypes
import os

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Q

from accounts.passwords import creer_compte_eleve
from accounts.permissions import IsAdmin, DroitsParAction
from caisse.models import TarifNiveau
from config.soft_delete import SoftDeleteMixin
from config.tenancy import ecole_of, scoped
from eleves.models import Eleve
from parametres.models import Parametres
from scolarite.models import Classe, DemandeInscription, Inscription, Niveau, PieceDemande
from scolarite.utils import annee_scolaire_courante, get_annee_active


def ecole_vitrine_or_404(slug):
    ecole = get_object_or_404(Parametres, slug=slug)
    if not ecole.vitrine_publique:
        from rest_framework.exceptions import NotFound
        raise NotFound('Cette école n’a pas de site public.')
    return ecole


def generer_matricule(ecole):
    """Matricule de l'école (initiales + numéro, ex. CSCG12), identique à celui de l'ajout par le secrétariat."""
    from eleves.matricules import prochain_matricule
    return prochain_matricule(ecole)


class VitrineNiveauSerializer(serializers.ModelSerializer):
    classes = serializers.SerializerMethodField()

    class Meta:
        model = Niveau
        fields = ['id', 'nom', 'classes']

    def get_classes(self, obj):
        return list(
            obj.classes.filter(is_active=True).order_by('nom').values_list('nom', flat=True)
        )


class VitrineEcoleSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    niveaux = serializers.SerializerMethodField()
    presentation = serializers.SerializerMethodField()
    tarifs = serializers.SerializerMethodField()
    annee_scolaire = serializers.SerializerMethodField()
    actualites = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    atouts = serializers.JSONField(source='vitrine_atouts', read_only=True)
    horaires = serializers.CharField(source='vitrine_horaires', read_only=True)
    whatsapp = serializers.CharField(source='vitrine_whatsapp', read_only=True)
    facebook = serializers.CharField(source='vitrine_facebook', read_only=True)
    carte = serializers.CharField(source='vitrine_carte', read_only=True)
    afficher_tarifs = serializers.BooleanField(source='vitrine_afficher_tarifs', read_only=True)

    class Meta:
        model = Parametres
        fields = [
            'id', 'nom_ecole', 'slug', 'slogan', 'ville', 'telephone', 'email',
            'adresse', 'couleur_primaire', 'logo_url', 'presentation', 'niveaux',
            'tarifs', 'annee_scolaire', 'actualites',
            'devise', 'annee_creation', 'boite_postale',  # informations publiques de l'en-tête officiel
            'photo_url', 'atouts', 'horaires', 'whatsapp', 'facebook', 'carte', 'afficher_tarifs',
        ]

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None

    def get_photo_url(self, obj):
        if obj.vitrine_photo:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.vitrine_photo.url) if request else obj.vitrine_photo.url
        return None

    def get_presentation(self, obj):
        if obj.presentation_vitrine.strip():
            return obj.presentation_vitrine
        parts = []
        if obj.slogan:
            parts.append(obj.slogan)
        if obj.devise:
            parts.append(obj.devise)
        if obj.ville:
            parts.append(f'Établissement situé à {obj.ville}.')
        return ' '.join(parts) or f'Bienvenue au {obj.nom_ecole}.'

    def get_niveaux(self, obj):
        qs = Niveau.objects.filter(ecole=obj, is_active=True).prefetch_related('classes').order_by('ordre', 'nom')
        niveaux = VitrineNiveauSerializer(qs, many=True).data
        if not obj.vitrine_afficher_classes:  # le directeur peut masquer le détail des classes
            for n in niveaux:
                n['classes'] = []
        return niveaux

    def get_actualites(self, obj):
        request = self.context.get('request')
        liste = obj.actualites.filter(publie=True, date_publication__lte=timezone.now()).prefetch_related('photos')[:6]
        url = (lambda f: request.build_absolute_uri(f.url) if request else f.url)
        return [{
            'id': a.id, 'titre': a.titre, 'contenu': a.contenu, 'epingle': a.epingle,
            'date': a.date_publication.isoformat(),
            'image_url': url(a.image) if a.image else None,
            'photos': [url(p.image) for p in a.photos.all()],  # galerie (facultative)
        } for a in liste]

    def get_annee_scolaire(self, obj):
        annee = get_annee_active(obj)
        return annee.libelle if annee else ''

    def get_tarifs(self, obj):
        """Grilles actives de la caisse uniquement (pas de paiements / élèves)."""
        if not obj.vitrine_afficher_tarifs:
            return []
        annee = get_annee_active(obj)
        qs = TarifNiveau.objects.filter(
            is_active=True,
        ).filter(
            Q(ecole=obj) | Q(niveau__ecole=obj),
        ).select_related('niveau', 'annee_scolaire')
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        qs = qs.order_by('niveau__ordre', 'niveau__nom').distinct()
        return [
            {
                'niveau': t.niveau.nom if t.niveau_id else '',
                'tranche1': int(t.tranche1 or 0),
                'tranche2': int(t.tranche2 or 0),
                'tranche3': int(t.tranche3 or 0),
                'montant_total': int(t.montant_total),
            }
            for t in qs
        ]


class DepotDossierSerializer(serializers.Serializer):
    nom = serializers.CharField(max_length=100)
    prenom = serializers.CharField(max_length=100)
    date_naissance = serializers.DateField(required=False, allow_null=True)
    sexe = serializers.ChoiceField(choices=['M', 'F'], required=False, allow_blank=True)
    niveau_souhaite = serializers.IntegerField()
    nom_parent = serializers.CharField(max_length=150)
    telephone_parent = serializers.CharField(max_length=30)
    email_parent = serializers.EmailField(required=False, allow_blank=True)
    message = serializers.CharField(required=False, allow_blank=True)
    photo = serializers.ImageField(required=False, allow_null=True)


PIECES_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}
PIECES_TAILLE_MAX = 5 * 1024 * 1024


def _types_pieces():
    from eleves.models import DocumentEleve
    return dict(DocumentEleve.TYPES)


class PieceDemandeSerializer(serializers.ModelSerializer):
    type_libelle = serializers.SerializerMethodField()

    class Meta:
        model = PieceDemande
        fields = ['id', 'type', 'type_libelle', 'nom_fichier', 'taille']

    def get_type_libelle(self, obj):
        return _types_pieces().get(obj.type, obj.type)


class DemandeInscriptionSerializer(serializers.ModelSerializer):
    pieces = PieceDemandeSerializer(many=True, read_only=True)
    niveau_nom = serializers.CharField(source='niveau_souhaite.nom', read_only=True, default='')
    photo_url = serializers.SerializerMethodField()
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)
    age = serializers.SerializerMethodField()

    class Meta:
        model = DemandeInscription
        fields = [
            'id', 'nom', 'prenom', 'date_naissance', 'age', 'sexe',
            'niveau_souhaite', 'niveau_nom',
            'nom_parent', 'telephone_parent', 'email_parent', 'message',
            'photo', 'photo_url', 'statut', 'statut_libelle', 'motif_refus',
            'date_depot', 'date_traitement', 'eleve_cree', 'is_active', 'pieces',
        ]
        read_only_fields = [
            'statut', 'motif_refus', 'date_depot', 'date_traitement',
            'eleve_cree', 'is_active', 'photo', 'age',
        ]

    def get_age(self, obj):
        from .utils import calculer_age
        return calculer_age(obj.date_naissance)

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None


class VitrineEcoleView(APIView):
    """GET /api/vitrine/<slug>/ — page publique (sans login)."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        ecole = ecole_vitrine_or_404(slug)
        return Response(VitrineEcoleSerializer(ecole, context={'request': request}).data)


class EcoleConnexionView(APIView):
    """GET /api/ecole-connexion/<slug>/ — nom, logo et couleur pour la page de connexion de l'école.
    Marche pour toute école validée, qu'elle ait ou non un site public."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        ecole = get_object_or_404(Parametres, slug=slug, statut=Parametres.STATUT_VALIDEE)
        logo = request.build_absolute_uri(ecole.logo.url) if ecole.logo else None
        return Response({
            'nom_ecole': ecole.nom_ecole, 'slug': ecole.slug, 'slogan': ecole.slogan,
            'couleur_primaire': ecole.couleur_primaire, 'logo_url': logo,
            'site_public': ecole.vitrine_publique,
        })


class DepotDossierView(APIView):
    """POST /api/vitrine/<slug>/dossiers/ — déposer un dossier (préinscription)."""
    permission_classes = [AllowAny]
    from config.throttles import DepotPublic
    throttle_classes = [DepotPublic]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, slug):
        from accounts.sync_dedupe import replay_if_seen, store_receipt
        existing = replay_if_seen(request)
        if existing is not None:
            return existing

        ecole = ecole_vitrine_or_404(slug)
        payload = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if hasattr(payload, 'pop'):
            payload.pop('client_id', None)
        serializer = DepotDossierSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        niveau = Niveau.objects.filter(
            pk=data['niveau_souhaite'], ecole=ecole, is_active=True,
        ).first()
        if niveau is None:
            return Response(
                {'niveau_souhaite': ['Niveau invalide pour cette école.']},
                status=400,
            )

        demande = DemandeInscription.objects.create(
            ecole=ecole,
            nom=data['nom'].strip(),
            prenom=data['prenom'].strip(),
            date_naissance=data.get('date_naissance'),
            sexe=data.get('sexe') or '',
            niveau_souhaite=niveau,
            nom_parent=data['nom_parent'].strip(),
            telephone_parent=data['telephone_parent'].strip(),
            email_parent=(data.get('email_parent') or '').strip(),
            message=(data.get('message') or '').strip(),
            photo=data.get('photo'),
            statut=DemandeInscription.STATUT_EN_ATTENTE,
        )
        types = _types_pieces()
        for cle, fichier in request.FILES.items():
            if not cle.startswith('piece_'):
                continue
            code = cle[len('piece_'):]
            ext = os.path.splitext(fichier.name)[1].lower()
            if code not in types or ext not in PIECES_EXTENSIONS or fichier.size > PIECES_TAILLE_MAX:
                continue  # pièce invalide : ignorée, le dossier reste déposé
            PieceDemande.objects.create(
                demande=demande, type=code, fichier=fichier,
                nom_fichier=os.path.basename(fichier.name)[:255], taille=fichier.size,
            )
        try:
            from notifications.models import Notification
            from accounts.models import User
            from accounts.roles import q_roles
            for admin in User.objects.filter(
                q_roles(['ADMIN', 'SECRETAIRE']), ecole=ecole, is_plateforme=False, is_active=True,
            ).distinct():
                Notification.objects.create(
                    destinataire=admin,
                    type='INFO',
                    titre='Nouveau dossier reçu',
                    message=(
                        f'{demande.prenom} {demande.nom} — niveau {niveau.nom}. '
                        f'Parent : {demande.nom_parent} ({demande.telephone_parent}).'
                    ),
                    ecole=ecole,
                )
        except Exception:
            pass

        response = Response(
            {
                'id': demande.id,
                'message': "Dossier envoyé, l'école vous contactera.",
            },
            status=status.HTTP_201_CREATED,
        )
        store_receipt(request, response)
        return response



class DemandeInscriptionViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    """Admin : liste / accepter / refuser les dossiers reçus."""
    serializer_class = DemandeInscriptionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nom', 'prenom', 'nom_parent', 'telephone_parent']
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = scoped(
            DemandeInscription.objects.select_related('niveau_souhaite', 'eleve_cree').prefetch_related('pieces'),
            self.request.user,
        )
        statut = self.request.query_params.get('statut')
        if statut:
            qs = qs.filter(statut=statut)
        return qs

    def create(self, request, *args, **kwargs):
        return Response({'detail': 'Déposez le dossier via le site vitrine.'}, status=405)

    @action(detail=True, methods=['post'])
    def accepter(self, request, pk=None):
        demande = self.get_object()
        if demande.statut != DemandeInscription.STATUT_EN_ATTENTE:
            return Response({'detail': 'Ce dossier a déjà été traité.'}, status=400)
        if not demande.is_active:
            return Response({'detail': 'Ce dossier est suspendu.'}, status=400)

        ecole = ecole_of(request.user)
        if ecole is None or demande.ecole_id != ecole.id:
            return Response({'detail': 'Accès refusé.'}, status=403)

        classe_id = request.data.get('classe_id') or request.data.get('classe')
        if not classe_id:
            return Response({'classe_id': ['Choisissez une classe.']}, status=400)

        classe = Classe.objects.filter(
            pk=classe_id, ecole=ecole, is_active=True,
        ).select_related('niveau').first()
        if classe is None:
            return Response({'classe_id': ['Classe introuvable.']}, status=400)
        if (
            demande.niveau_souhaite_id
            and classe.niveau_id != demande.niveau_souhaite_id
        ):
            return Response(
                {'classe_id': ['La classe doit correspondre au niveau demandé.']},
                status=400,
            )

        annee = get_annee_active(ecole)
        if annee is None:
            return Response(
                {'detail': "Aucune année scolaire active. Créez-en une dans Paramètres."},
                status=400,
            )

        parent_parts = (demande.nom_parent or '').strip().split(None, 1)
        nom_parent = parent_parts[0] if parent_parts else ''
        prenom_parent = parent_parts[1] if len(parent_parts) > 1 else ''

        matricule = generer_matricule(ecole)
        eleve = Eleve.objects.create(
            nom=demande.nom,
            prenom=demande.prenom,
            matricule=matricule,
            date_naissance=demande.date_naissance,
            sexe=demande.sexe or '',
            nom_parent=nom_parent,
            prenom_parent=prenom_parent,
            telephone_parent=demande.telephone_parent,
            ecole=ecole,
            is_active=True,
        )
        if demande.photo:
            eleve.photo = demande.photo
            eleve.save(update_fields=['photo'])

        try:
            from django.core.files.base import ContentFile
            from eleves.models import DocumentEleve
            for piece in demande.pieces.all():
                with piece.fichier.open('rb') as f:
                    contenu = f.read()
                DocumentEleve.objects.create(
                    eleve=eleve, ecole=ecole, type=piece.type, nom_fichier=piece.nom_fichier, taille=piece.taille,
                    fichier=ContentFile(contenu, name=piece.nom_fichier or 'piece'),
                )
        except Exception:
            pass  # l'inscription ne doit pas échouer à cause d'une pièce illisible

        inscription = Inscription.objects.create(
            eleve=eleve,
            classe=classe,
            annee_scolaire=annee,
            statut='INSCRIT',
            is_active=True,
            ecole=ecole,
        )
        try:
            from caisse.services import ouvrir_dossier
            ouvrir_dossier(inscription)
        except Exception:
            pass
        from notifications.equipe import prevenir_comptable_inscription
        prevenir_comptable_inscription(inscription)

        user, password = creer_compte_eleve(eleve, ecole=ecole)
        compte_parent = None
        try:
            from accounts.passwords import creer_compte_parent
            parent_user, parent_pwd, parent_cree = creer_compte_parent(eleve, ecole=ecole)
            if parent_user is not None:
                compte_parent = {
                    'cree': parent_cree, 'lie': not parent_cree, 'username': parent_user.username,
                    'mot_de_passe_temporaire': parent_pwd if parent_cree else None,
                }
        except Exception:
            compte_parent = None

        demande.statut = DemandeInscription.STATUT_ACCEPTEE
        demande.date_traitement = timezone.now()
        demande.traite_par = request.user
        demande.eleve_cree = eleve
        demande.motif_refus = ''
        demande.save()

        return Response({
            'demande': DemandeInscriptionSerializer(demande, context={'request': request}).data,
            'eleve_id': eleve.id,
            'matricule': matricule,
            'username': user.username if user else matricule,
            'mot_de_passe_temporaire': password or '',
            'compte_parent': compte_parent,
            'inscription_id': inscription.id,
            'message': 'Dossier accepté. Élève et inscription créés.',
        })

    @action(detail=True, methods=['get'], url_path=r'pieces/(?P<piece_id>\d+)')
    def piece(self, request, pk=None, piece_id=None):
        """Consulter une pièce jointe à la demande (direction de l'école concernée)."""
        from django.http import FileResponse
        demande = self.get_object()
        piece = get_object_or_404(PieceDemande, pk=piece_id, demande=demande)
        try:
            ouvert = piece.fichier.open('rb')
        except FileNotFoundError:
            return Response({'detail': 'Fichier introuvable sur le serveur.'}, status=404)
        rep = FileResponse(ouvert, content_type=mimetypes.guess_type(piece.nom_fichier)[0] or 'application/octet-stream')
        rep['Content-Disposition'] = f'inline; filename="{piece.nom_fichier}"'
        rep['X-Content-Type-Options'] = 'nosniff'
        return rep

    @action(detail=True, methods=['post'])
    def refuser(self, request, pk=None):
        demande = self.get_object()
        if demande.statut != DemandeInscription.STATUT_EN_ATTENTE:
            return Response({'detail': 'Ce dossier a déjà été traité.'}, status=400)
        motif = (request.data.get('motif') or request.data.get('motif_refus') or '').strip()
        if not motif:
            return Response({'motif': ['Indiquez le motif du refus.']}, status=400)

        demande.statut = DemandeInscription.STATUT_REFUSEE
        demande.motif_refus = motif
        demande.date_traitement = timezone.now()
        demande.traite_par = request.user
        demande.save()
        return Response(
            DemandeInscriptionSerializer(demande, context={'request': request}).data
        )
