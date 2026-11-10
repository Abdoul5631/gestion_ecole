from django.db.models import Q
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Eleve, Presence, AppelJournalier
from . import documents
from .serializers import EleveSerializer, PresenceSerializer, AppelJournalierSerializer
from accounts.permissions import IsAdmin, IsAdminOrEnseignant, DroitsParAction
from accounts.roles import voit_toute_l_ecole
from config.pagination import StandardPagination
from config.tenancy import scoped, ecole_of
from config.soft_delete import SoftDeleteMixin


class EleveViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = EleveSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['matricule', 'nom', 'prenom']
    pagination_class = StandardPagination

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        from scolarite.utils import resolve_annee
        ctx['annee'] = resolve_annee(self.request)
        return ctx

    def get_queryset(self):
        user = self.request.user
        niveau_id = self.request.query_params.get('niveau_id')
        classe_id = self.request.query_params.get('classe_id')
        from django.db.models import Prefetch
        from accounts.models import User
        from scolarite.models import Inscription
        from scolarite.utils import resolve_annee, ids_enfants

        qs = scoped(Eleve.objects.all(), user)
        annee = resolve_annee(self.request)
        ins_qs = Inscription.objects.all()
        if annee:
            ins_qs = ins_qs.filter(annee_scolaire=annee)

        # Le serializer lit classe_actuelle / niveau_actuel / username : on les précharge
        # en 2 requêtes au lieu de 2 requêtes par élève.
        def avec_relations(queryset):
            return queryset.prefetch_related(
                Prefetch(
                    'inscriptions',
                    queryset=ins_qs.select_related('classe__niveau'),
                    to_attr='inscriptions_annee',
                ),
                Prefetch(
                    'comptes',
                    queryset=User.objects.filter(role='ELEVE').only('id', 'username', 'eleve_id'),
                    to_attr='comptes_eleve',
                ),
            )

        if classe_id:
            ids = ins_qs.filter(classe_id=classe_id).values_list('eleve_id', flat=True)
            qs = qs.filter(id__in=ids)
        elif niveau_id:
            ids = ins_qs.filter(classe__niveau_id=niveau_id).values_list('eleve_id', flat=True)
            qs = qs.filter(id__in=ids)
        elif annee and self.request.query_params.get('tous') not in ('1', 'true', 'oui'):
            # Inscrits cette année + élèves jamais inscrits (créés sans classe) pour qu'ils restent visibles
            qs = qs.filter(Q(id__in=ins_qs.values('eleve_id')) | ~Q(id__in=Inscription.objects.values('eleve_id')))

        if voit_toute_l_ecole(user):
            return avec_relations(qs.order_by('nom', 'prenom'))

        if user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            classes = ClasseMatiere.objects.filter(
                enseignant=user.enseignant
            ).values_list('classe_id', flat=True).distinct()
            ids = ins_qs.filter(classe_id__in=classes).values_list('eleve_id', flat=True)
            return avec_relations(qs.filter(id__in=ids).order_by('nom', 'prenom'))

        if user.role == 'ELEVE' and user.eleve:
            return avec_relations(scoped(Eleve.objects.filter(id=user.eleve.id), user))

        if user.role == 'PARENT':
            return avec_relations(scoped(Eleve.objects.filter(id__in=ids_enfants(user)), user))

        return Eleve.objects.none()

    def create(self, request, *args, **kwargs):
        """Fiche + compte élève en une seule opération (tout ou rien) : le secrétaire comme le
        directeur ajoutent un élève sans passer par la gestion des comptes (réservée au directeur)."""
        from django.db import transaction
        with transaction.atomic():
            response = super().create(request, *args, **kwargs)
        if response.status_code == 201 and getattr(self, '_compte', None):
            response.data['compte'] = self._compte
        return response

    def perform_create(self, serializer):
        from accounts.passwords import creer_compte_eleve
        from .matricules import prochain_matricule
        ecole = ecole_of(self.request.user)
        extra = {} if serializer.validated_data.get('matricule') else {'matricule': prochain_matricule(ecole)}
        eleve = serializer.save(ecole=ecole, **extra)
        # mot de passe fourni par l'appli hors ligne (déjà montré à l'utilisateur), sinon généré
        mot_de_passe = (self.request.data.get('mot_de_passe') or '').strip() or None
        user, pwd = creer_compte_eleve(eleve, ecole=eleve.ecole, username=eleve.matricule, password=mot_de_passe)
        self._compte = {'username': user.username, 'mot_de_passe_temporaire': pwd} if user else None

    @action(detail=False, methods=['get'], url_path='prochain-matricule')
    def prochain_matricule(self, request):
        """Matricule proposé pour le prochain élève de l'école (modifiable avant l'enregistrement)."""
        from .matricules import prochain_matricule
        return Response({'matricule': prochain_matricule(ecole_of(request.user))})

    @action(detail=False, methods=['get'], url_path='ma-classe')
    def ma_classe(self, request):
        """Page « Ma classe » d'un élève (ou d'un parent pour l'un de ses enfants) :
        classe, effectif, professeur principal, matières avec enseignants, camarades.
        Les camarades n'exposent ni matricule ni coordonnées (le matricule sert d'identifiant)."""
        from cours.models import ClasseMatiere
        from scolarite.models import Inscription
        from scolarite.utils import get_annee_active, ids_enfants

        user = request.user
        if user.role == 'ELEVE':
            eleve_id = user.eleve_id
        elif user.role == 'PARENT':
            enfants = ids_enfants(user)
            demande = request.query_params.get('eleve_id')
            try:
                eleve_id = int(demande) if demande else (enfants[0] if enfants else None)
            except ValueError:
                eleve_id = None
            if eleve_id not in enfants:
                eleve_id = None
        else:
            return Response({'detail': 'Réservé aux élèves et aux parents.'}, status=403)
        if not eleve_id:
            return Response({'eleve': None, 'classe': None})

        eleve = scoped(Eleve.objects.all(), user).filter(id=eleve_id).first()
        if eleve is None:
            return Response({'eleve': None, 'classe': None})
        annee = get_annee_active(ecole_of(user))
        ins = (Inscription.objects.filter(eleve=eleve, is_active=True)
               .select_related('classe__niveau', 'classe__professeur_principal'))
        if annee:
            ins = ins.filter(annee_scolaire=annee)
        ins = ins.first()
        base = {'eleve': {'id': eleve.id, 'nom': eleve.nom, 'prenom': eleve.prenom}}
        if ins is None or ins.classe is None:
            return Response({**base, 'classe': None})

        classe = ins.classe
        camarades_qs = Inscription.objects.filter(
            classe=classe, is_active=True, eleve__is_active=True,
        ).exclude(eleve_id=eleve.id).select_related('eleve').order_by('eleve__nom', 'eleve__prenom')
        if annee:
            camarades_qs = camarades_qs.filter(annee_scolaire=annee)
        camarades = [{
            'id': i.eleve_id, 'nom': i.eleve.nom, 'prenom': i.eleve.prenom,
            'photo_url': request.build_absolute_uri(i.eleve.photo.url) if i.eleve.photo else None,
        } for i in camarades_qs]

        matieres = [{
            'id': cm.id, 'matiere_nom': cm.matiere.nom, 'coef': cm.coef,
            'enseignant_nom': (f"{cm.enseignant.prenom} {cm.enseignant.nom}".strip() if cm.enseignant else ''),
        } for cm in ClasseMatiere.objects.filter(classe=classe, is_active=True)
            .select_related('matiere', 'enseignant').order_by('-coef', 'matiere__nom')]

        pp = classe.professeur_principal
        return Response({
            **base,
            'classe': {
                'id': classe.id, 'nom': classe.nom,
                'niveau_nom': classe.niveau.nom if classe.niveau_id else '',
                'effectif': len(camarades) + 1,
                'professeur_principal': (f"{pp.prenom} {pp.nom}".strip() if pp else ''),
            },
            'matieres': matieres,
            'camarades': camarades,
        })

    @action(detail=True, methods=['patch'], url_path='corriger-nom')
    def corriger_nom(self, request, pk=None):
        """Le directeur corrige le nom / prénom d'un élève (faute de saisie) — rien d'autre."""
        eleve = self.get_object()
        champs = {}
        for cle in ('nom', 'prenom'):
            if cle in request.data:
                valeur = str(request.data.get(cle) or '').strip()
                if not valeur:
                    return Response({cle: ['Ce champ ne peut pas être vide.']}, status=status.HTTP_400_BAD_REQUEST)
                champs[cle] = valeur
        if not champs:
            return Response({'detail': 'Indiquez le nom et/ou le prénom.'}, status=status.HTTP_400_BAD_REQUEST)
        for cle, valeur in champs.items():
            setattr(eleve, cle, valeur)
        eleve.save(update_fields=list(champs))
        return Response(self.get_serializer(eleve).data)

    @action(detail=True, methods=['get'], url_path='carte', permission_classes=[IsAdmin])
    def carte(self, request, pk=None):
        """Carte scolaire (PDF, format carte bancaire) — réservée aux élèves des classes d'examen."""
        from django.http import HttpResponse
        from django.shortcuts import get_object_or_404
        from scolarite.models import Inscription
        from scolarite.utils import get_annee_active
        from . import carte as carte_pdf
        eleve = get_object_or_404(scoped(Eleve.objects.all(), request.user), pk=pk)
        ecole = ecole_of(request.user)
        annee = get_annee_active(ecole)
        ins = Inscription.objects.filter(eleve=eleve, is_active=True).select_related('classe__niveau')
        if annee:
            ins = ins.filter(annee_scolaire=annee)
        ins = ins.first()
        if ins is None or ins.classe is None:
            return Response({'detail': "Cet élève n'est inscrit dans aucune classe cette année."}, status=400)
        if not ins.classe.niveau.is_classe_examen:
            return Response({'detail': "La carte scolaire est réservée aux élèves des classes d'examen."}, status=400)
        pdf = carte_pdf.pdf_une_carte(eleve, ins.classe, ecole, annee.libelle if annee else '',
                                      request.query_params.get('modele'), request.query_params.get('couleur'))
        rep = HttpResponse(pdf, content_type='application/pdf')
        rep['Content-Disposition'] = f'inline; filename="carte-{eleve.matricule}.pdf"'
        return rep

    @action(detail=True, methods=['get', 'post'], url_path='documents', parser_classes=documents.PARSERS)
    def documents(self, request, pk=None):
        """Dossier administratif : GET = liste + pièces manquantes, POST = ajout d'une pièce (direction)."""
        eleve = self.get_object()
        if request.method == 'POST':
            return documents.ajouter_document(request, eleve)
        return Response(documents.liste_documents(eleve))

    @action(detail=True, methods=['get', 'delete'], url_path=r'documents/(?P<doc_id>\d+)')
    def document(self, request, pk=None, doc_id=None):
        """Consulter (GET, authentifié) ou supprimer (DELETE) une pièce du dossier."""
        eleve = self.get_object()
        if request.method == 'DELETE':
            return documents.supprimer_document(eleve, doc_id)
        return documents.telecharger_document(eleve, doc_id)

    @action(detail=True, methods=['post'], url_path='compte-parent', permission_classes=[IsAdmin])
    def compte_parent(self, request, pk=None):
        """Crée le compte du parent (identifiant = téléphone) ou relie l'enfant à un compte existant."""
        from django.shortcuts import get_object_or_404
        from accounts.passwords import creer_compte_parent
        eleve = get_object_or_404(scoped(Eleve.objects.all(), request.user), pk=pk)
        user, pwd, cree = creer_compte_parent(eleve, ecole=ecole_of(request.user))
        if user is None:
            return Response({'cree': False, 'lie': False, 'raison': 'telephone',
                             'detail': "Numéro de téléphone du parent absent ou invalide."})
        return Response({
            'cree': cree, 'lie': not cree, 'username': user.username,
            'mot_de_passe_temporaire': pwd if cree else None,
            'parent_nom': f"{user.first_name} {user.last_name}".strip(),
            'nb_enfants': user.enfants.count(),
        })

    @action(detail=False, methods=['post'], url_path='creer-comptes-parents', permission_classes=[IsAdmin])
    def creer_comptes_parents(self, request):
        """Crée les comptes parents manquants pour tous les élèves actifs de l'école."""
        from accounts.models import User
        from accounts.passwords import creer_compte_parent
        ecole = ecole_of(request.user)
        deja_lies = set(User.objects.filter(role='PARENT', ecole=ecole).values_list('enfants__id', flat=True))
        crees, lies, sans_tel = [], 0, 0
        for eleve in scoped(Eleve.objects.filter(is_active=True), request.user).order_by('nom', 'prenom'):
            if eleve.id in deja_lies:
                continue
            user, pwd, cree = creer_compte_parent(eleve, ecole=ecole)
            if user is None:
                sans_tel += 1
            elif cree:
                crees.append({
                    'matricule': eleve.matricule, 'nom': f"{eleve.prenom} {eleve.nom}",
                    'username': user.username, 'mot_de_passe_temporaire': pwd,
                })
            else:
                lies += 1
        return Response({'crees': len(crees), 'lies': lies, 'sans_telephone': sans_tel, 'comptes': crees})

    @action(detail=False, methods=['post'], url_path='creer-comptes-manquants', permission_classes=[IsAdmin])
    def creer_comptes_manquants(self, request):
        """Crée les comptes utilisateurs pour tous les élèves qui n'en ont pas."""
        from accounts.models import User
        eleves_sans_compte = scoped(Eleve.objects.filter(is_active=True), request.user).exclude(
            id__in=User.objects.filter(role='ELEVE', eleve__isnull=False).values_list('eleve_id', flat=True)
        )
        created = 0
        errors = []
        comptes = []
        from accounts.passwords import creer_compte_eleve
        for eleve in eleves_sans_compte:
            try:
                user, pwd = creer_compte_eleve(eleve, ecole=ecole_of(request.user))
                if user and pwd:
                    created += 1
                    comptes.append({
                        'matricule': eleve.matricule,
                        'nom': f"{eleve.prenom} {eleve.nom}",
                        'username': user.username,
                        'mot_de_passe_temporaire': pwd,
                    })
            except Exception as e:
                errors.append({'matricule': eleve.matricule, 'erreur': str(e)})
        return Response({'created': created, 'errors': errors, 'comptes': comptes}, status=200)

    @action(detail=False, methods=['get'], url_path='template-excel', permission_classes=[IsAdmin])
    def template_excel(self, request):
        """Télécharger un fichier Excel modèle pour l'import."""
        import io
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
        from django.http import HttpResponse

        wb = Workbook()
        ws = wb.active
        ws.title = 'Élèves'

        headers = ['matricule', 'nom', 'prenom', 'date_naissance', 'lieu_naissance',
                   'sexe', 'nom_parent', 'prenom_parent', 'telephone_parent']
        header_help = ['Laissez vide : attribué automatiquement', 'Nom de famille', 'Prénom', 'JJ/MM/AAAA',
                        'Ville de naissance', 'M ou F', 'Nom du parent', 'Prénom du parent', 'Ex: 06XXXXXXXX']

        header_fill = PatternFill(start_color='1976D2', end_color='1976D2', fill_type='solid')
        help_fill  = PatternFill(start_color='E3F2FD', end_color='E3F2FD', fill_type='solid')

        for col, (h, help_text) in enumerate(zip(headers, header_help), start=1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = Font(bold=True, color='FFFFFF')
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal='center')
            ws.column_dimensions[cell.column_letter].width = 18

            help_cell = ws.cell(row=2, column=col, value=help_text)
            help_cell.fill = help_fill
            help_cell.font = Font(italic=True, color='555555')

        # Ligne d'exemple
        ws.append(['', 'DIALLO', 'Moussa', '15/08/2010', 'Bamako', 'M', 'DIALLO', 'Amadou', '0612345678'])

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="modele_import_eleves.xlsx"'
        return response

    @action(detail=False, methods=['post'], url_path='import-excel',
            permission_classes=[IsAdmin])
    def import_excel(self, request):
        """Importer des élèves depuis un fichier Excel, avec inscription optionnelle."""
        import io
        from openpyxl import load_workbook
        from datetime import datetime

        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Aucun fichier fourni.'}, status=400)

        # Classe cible (optionnelle) — tous les élèves importés y seront inscrits
        classe_id = request.data.get('classe_id') or None
        classe = None
        if classe_id:
            from scolarite.models import Classe
            try:
                classe = scoped(Classe.objects.all(), request.user).get(id=classe_id)
            except Classe.DoesNotExist:
                return Response({'detail': 'Classe introuvable.'}, status=400)

        try:
            wb = load_workbook(io.BytesIO(file.read()), data_only=True)
            ws = wb.active
        except Exception:
            return Response({'detail': 'Fichier Excel invalide.'}, status=400)

        created, updated, inscrits, errors = 0, 0, 0, []
        comptes = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
            if not any(row):
                continue

            def cell(i):
                v = row[i] if i < len(row) else None
                return str(v).strip() if v is not None else ''

            matricule = cell(0)  # vide : attribué automatiquement (initiales de l'école + numéro)

            # Parsing date
            date_naissance = None
            raw_date = cell(3)
            if raw_date:
                for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
                    try:
                        date_naissance = datetime.strptime(raw_date, fmt).date()
                        break
                    except ValueError:
                        pass
                if date_naissance is None and hasattr(row[3], 'date'):
                    date_naissance = row[3].date() if callable(row[3].date) else row[3]

            sexe = cell(5).upper()
            if sexe not in ('M', 'F'):
                sexe = ''

            defaults = {
                'nom':              cell(1).upper() or None,
                'prenom':           cell(2) or None,
                'date_naissance':   date_naissance,
                'lieu_naissance':   cell(4),
                'sexe':             sexe,
                'nom_parent':       cell(6),
                'prenom_parent':    cell(7),
                'telephone_parent': cell(8),
            }
            defaults = {k: v for k, v in defaults.items() if v is not None and v != ''}

            ecole = ecole_of(request.user)
            # un matricule déjà attribué (dans la base ou plus haut dans ce fichier) n'est jamais écrasé : la ligne est refusée
            deja = Eleve.objects.filter(matricule__iexact=matricule, ecole=ecole).first() if matricule else None
            if deja:
                errors.append({'ligne': row_idx, 'matricule': matricule,
                               'erreur': f'Matricule déjà attribué à {deja.prenom} {deja.nom} : ligne ignorée'})
                continue
            if not defaults.get('nom'):
                errors.append({'ligne': row_idx, 'matricule': matricule, 'erreur': 'Nom manquant'})
                continue
            if not matricule:
                from .matricules import prochain_matricule
                matricule = prochain_matricule(ecole)

            try:
                defaults['ecole'] = ecole
                eleve = Eleve.objects.create(matricule=matricule, **defaults)
                created += 1

                from accounts.models import User
                from accounts.passwords import creer_compte_eleve
                if not User.objects.filter(eleve=eleve).exists():
                    user, pwd = creer_compte_eleve(eleve, ecole=ecole, username=matricule)
                    if user and pwd:
                        comptes.append({
                            'matricule': matricule,
                            'nom': f"{eleve.prenom} {eleve.nom}",
                            'username': user.username,
                            'mot_de_passe_temporaire': pwd,
                        })

                # Inscription dans la classe cible (année en cours)
                if classe:
                    from scolarite.models import Inscription
                    from scolarite.utils import get_annee_active
                    from caisse.services import ouvrir_dossier
                    annee = get_annee_active(ecole)
                    ins, ins_created = Inscription.objects.get_or_create(
                        eleve=eleve,
                        annee_scolaire=annee,
                        defaults={'classe': classe, 'ecole': ecole},
                    )
                    if ins_created:
                        inscrits += 1
                        try:
                            ouvrir_dossier(ins)
                        except Exception:
                            pass

            except Exception as e:
                errors.append({'ligne': row_idx, 'matricule': matricule, 'erreur': str(e)})

        return Response({
            'created':  created,
            'updated':  updated,
            'inscrits': inscrits,
            'errors':   errors,
            'total':    created + updated,
            'comptes':  comptes,
        }, status=200)

    @action(detail=True, methods=['get'])
    def presences(self, request, pk=None):
        eleve = self.get_object()
        presences = Presence.objects.filter(eleve=eleve).order_by('-date')
        serializer = PresenceSerializer(presences, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='appels')
    def appels(self, request, pk=None):
        eleve = self.get_object()
        appels = AppelJournalier.objects.filter(eleve=eleve).select_related('classe').order_by('-date')
        return Response(AppelJournalierSerializer(appels, many=True).data)

    @action(detail=True, methods=['get'])
    def inscriptions(self, request, pk=None):
        from scolarite.models import Inscription
        from scolarite.serializers import InscriptionSerializer
        eleve = self.get_object()
        inscriptions = Inscription.objects.filter(eleve=eleve).select_related(
            'classe__niveau', 'annee_scolaire', 'eleve',
        ).order_by('-annee_scolaire__is_active', '-annee_scolaire__libelle', '-id')
        serializer = InscriptionSerializer(inscriptions, many=True)
        return Response(serializer.data)


class PresenceViewSet(DroitsParAction, viewsets.ModelViewSet):
    serializer_class = PresenceSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['eleve__nom', 'eleve__prenom']
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        classe_matiere_id = self.request.query_params.get('classe_matiere_id')
        classe_id = self.request.query_params.get('classe_id')
        date = self.request.query_params.get('date')
        eleve_id = self.request.query_params.get('eleve_id')
        statut = self.request.query_params.get('statut')
        from scolarite.utils import resolve_annee, periode_annee, ids_enfants

        if voit_toute_l_ecole(user):
            qs = scoped(Presence.objects.all(), user)
        elif user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            cms = ClasseMatiere.objects.filter(enseignant=user.enseignant)
            qs = scoped(Presence.objects.filter(classe_matiere__in=cms), user)
        elif user.role == 'ELEVE' and user.eleve:
            qs = scoped(Presence.objects.filter(eleve=user.eleve), user)
        elif user.role == 'PARENT':
            qs = scoped(Presence.objects.filter(eleve_id__in=ids_enfants(user)), user)
        else:
            return Presence.objects.none()

        annee = resolve_annee(self.request)
        debut, fin = periode_annee(annee) if annee else (None, None)
        if debut and fin:
            qs = qs.filter(date__gte=debut, date__lte=fin)

        if classe_matiere_id:
            qs = qs.filter(classe_matiere_id=classe_matiere_id)
        if classe_id:
            qs = qs.filter(classe_matiere__classe_id=classe_id)
        if date:
            qs = qs.filter(date=date)
        if eleve_id:
            qs = qs.filter(eleve_id=eleve_id)
        if statut:
            qs = qs.filter(statut=statut)

        return qs.select_related(
            'eleve',
            'classe_matiere__matiere',
            'classe_matiere__classe__niveau',
        ).order_by('-date', '-id')

    @action(detail=False, methods=['post'], url_path='justifier')
    def justifier(self, request):
        """Le directeur justifie (ou dé-justifie) toutes les absences d'un élève pour une journée, avec le motif."""
        from datetime import date as date_cls
        from django.shortcuts import get_object_or_404
        from django.utils import timezone
        from accounts.journal import noter
        try:
            jour = date_cls.fromisoformat(str(request.data.get('date') or '')[:10])
        except ValueError:
            return Response({'detail': 'Date invalide (AAAA-MM-JJ).'}, status=400)
        eleve = get_object_or_404(scoped(Eleve.objects.all(), request.user), pk=request.data.get('eleve_id'))
        annuler = bool(request.data.get('annuler'))
        motif = str(request.data.get('motif') or '').strip()[:200]
        if not annuler and not motif:
            return Response({'motif': ['Indiquez le motif de la justification.']}, status=400)
        valeurs = ({'justifiee': False, 'motif_justification': '', 'justifiee_par': None, 'justifiee_le': None} if annuler
                   else {'justifiee': True, 'motif_justification': motif, 'justifiee_par': request.user, 'justifiee_le': timezone.now()})
        n = scoped(Presence.objects.filter(eleve=eleve, date=jour, statut='ABSENT'), request.user).update(**valeurs)
        n += scoped(AppelJournalier.objects.filter(eleve=eleve, date=jour, statut='ABSENT'), request.user).update(**valeurs)
        if not n:
            return Response({'detail': "Aucune absence enregistrée pour cet élève ce jour-là."}, status=404)
        noter('MODIFICATION', 'Absences',
              f"{'Justification retirée' if annuler else 'Absence justifiée'} : {eleve.prenom} {eleve.nom}, le {jour.strftime('%d/%m/%Y')}"
              + ('' if annuler else f' — {motif}'))
        return Response({'absences': n, 'justifiee': not annuler, 'motif': '' if annuler else motif})

    @action(detail=False, methods=['get'], url_path='absents-du-jour')
    def absents_du_jour(self, request):
        """Absents et retards, regroupés par classe : aujourd'hui par défaut, ou sur une période
        (?debut=AAAA-MM-JJ&fin=AAAA-MM-JJ : semaine passée, mois passé…) pour garder la trace des absences.
        Alimenté par l'appel de chaque enseignant dans son cours et par l'appel du jour."""
        from datetime import date as date_cls
        from django.db.models import Count
        from scolarite.models import Inscription
        from scolarite.utils import get_annee_active

        user = request.user
        aujourdhui = date_cls.today()
        try:
            debut = date_cls.fromisoformat(request.query_params['debut']) if request.query_params.get('debut') else aujourdhui
            fin = date_cls.fromisoformat(request.query_params['fin']) if request.query_params.get('fin') else debut
        except ValueError:
            return Response({'detail': 'Date invalide (AAAA-MM-JJ).'}, status=400)
        if fin < debut:
            debut, fin = fin, debut
        if (fin - debut).days > 366:
            return Response({'detail': 'Période trop longue (366 jours maximum).'}, status=400)
        statuts = ('ABSENT', 'RETARD')
        classes = {}

        def fiche(classe, eleve):
            c = classes.setdefault(classe.id, {'classe_id': classe.id, 'classe': classe.nom, 'eleves': {}})
            if eleve.id not in c['eleves']:
                photo = eleve.photo.url if eleve.photo else None
                c['eleves'][eleve.id] = {
                    'eleve_id': eleve.id, 'nom': eleve.nom, 'prenom': eleve.prenom, 'matricule': eleve.matricule,
                    'telephone_parent': eleve.telephone_parent, 'sexe': eleve.sexe,
                    'photo_url': request.build_absolute_uri(photo) if photo else None,
                    'jours': {},
                }
            return c['eleves'][eleve.id]

        def jour(fiche_eleve, d):
            return fiche_eleve['jours'].setdefault(d, {'date': d.isoformat(), 'appel': '', 'cours': []})

        pres = scoped(Presence.objects.filter(date__gte=debut, date__lte=fin, statut__in=statuts), user).select_related(
            'eleve', 'classe_matiere__matiere', 'classe_matiere__classe')
        for p in pres:
            classe = p.classe_matiere.classe
            if classe is None or not classe.is_active or not p.eleve.is_active:
                continue
            jour(fiche(classe, p.eleve), p.date)['cours'].append({
                'matiere': p.classe_matiere.matiere.nom, 'statut': p.statut,
                'justifiee': p.justifiee, 'motif': p.motif_justification,
            })

        appels = scoped(AppelJournalier.objects.filter(date__gte=debut, date__lte=fin, statut__in=statuts), user).select_related('eleve', 'classe')
        for ap in appels:
            if not ap.classe.is_active or not ap.eleve.is_active:
                continue
            j = jour(fiche(ap.classe, ap.eleve), ap.date)
            j['appel'] = ap.statut
            j['appel_justifiee'] = ap.justifiee
            j['appel_motif'] = ap.motif_justification

        annee = get_annee_active(ecole_of(user))
        effectifs = {}
        if classes:
            ins = Inscription.objects.filter(classe_id__in=classes.keys(), is_active=True, statut='INSCRIT')
            if annee:
                ins = ins.filter(annee_scolaire=annee)
            effectifs = dict(ins.values_list('classe_id').annotate(n=Count('id')))

        resultat = []
        for c in classes.values():
            eleves = []
            for e in c['eleves'].values():
                details = sorted(e.pop('jours').values(), key=lambda x: x['date'], reverse=True)
                for d in details:
                    # absence du jour justifiée si chacune de ses absences (cours, appel du jour) l'est
                    marques = [x['justifiee'] for x in d['cours'] if x['statut'] == 'ABSENT']
                    if d['appel'] == 'ABSENT':
                        marques.append(d.get('appel_justifiee', False))
                    d['absent'] = bool(marques)
                    d['justifiee'] = bool(marques) and all(marques)
                    d['motif'] = next((x['motif'] for x in d['cours'] if x.get('motif')), '') or d.get('appel_motif', '')
                absent_ce_jour = [d for d in details if d['appel'] == 'ABSENT' or any(x['statut'] == 'ABSENT' for x in d['cours'])]
                e['details'] = details
                e['jours_absent'] = len(absent_ce_jour)
                e['jours_retard'] = len(details) - len(absent_ce_jour)
                e['absent'] = bool(absent_ce_jour)
                e['jours_justifies'] = sum(1 for d in absent_ce_jour if d['justifiee'])
                e['justifiee'] = bool(details) and details[0]['justifiee']
                e['motif'] = details[0]['motif'] if details else ''
                # pour une seule journée : l'état du jour, tel qu'affiché en direct
                e['appel'] = details[0]['appel'] if details else ''
                e['cours'] = details[0]['cours'] if details else []
                eleves.append(e)
            eleves.sort(key=lambda e: (-e['jours_absent'], e['nom'], e['prenom']))
            resultat.append({
                'classe_id': c['classe_id'], 'classe': c['classe'], 'effectif': effectifs.get(c['classe_id'], 0),
                'absents': sum(1 for e in eleves if e['absent']),
                'jours_absence': sum(e['jours_absent'] for e in eleves), 'eleves': eleves,
            })
        resultat.sort(key=lambda c: (-c['jours_absence'], -c['absents'], c['classe']))
        return Response({
            'debut': debut.isoformat(), 'fin': fin.isoformat(),
            'date': debut.isoformat(),
            'total_absents': sum(c['absents'] for c in resultat),
            'total_retards': sum(len(c['eleves']) - c['absents'] for c in resultat),
            'total_jours_absence': sum(c['jours_absence'] for c in resultat),
            'classes': resultat,
        })

    @action(detail=False, methods=['get'], url_path='appel-du-jour', permission_classes=[IsAdmin])
    def appel_du_jour(self, request):
        """Appel du jour pour le directeur : pour une date, chaque classe et chaque matière
        avec l'enseignant, l'heure, et le résultat de l'appel fait par l'enseignant dans son cours."""
        from datetime import date as date_cls
        from django.db.models import Count
        from cours.models import ClasseMatiere, EmploiDuTemps
        from scolarite.models import Inscription
        from scolarite.utils import get_annee_active

        user = request.user
        raw = request.query_params.get('date')
        try:
            jour = date_cls.fromisoformat(raw) if raw else date_cls.today()
        except ValueError:
            return Response({'detail': 'Date invalide (AAAA-MM-JJ).'}, status=400)
        noms_jours = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
        jour_nom = noms_jours[jour.weekday()] if jour.weekday() < 6 else None

        cms = scoped(ClasseMatiere.objects.filter(
            is_active=True, classe__isnull=False, classe__is_active=True,
        ).select_related('classe__niveau', 'matiere', 'enseignant'), user)
        classe_id = request.query_params.get('classe_id')
        if classe_id:
            cms = cms.filter(classe_id=classe_id)
        cms = list(cms)
        cm_ids = [c.id for c in cms]

        horaires = {}
        if jour_nom:
            for e in EmploiDuTemps.objects.filter(
                classe_matiere_id__in=cm_ids, jour=jour_nom, is_active=True,
            ).order_by('heure_debut'):
                horaires.setdefault(e.classe_matiere_id, []).append(
                    f"{e.heure_debut.strftime('%H:%M')}–{e.heure_fin.strftime('%H:%M')}"
                )

        stats = {}
        for p in Presence.objects.filter(date=jour, classe_matiere_id__in=cm_ids).values(
            'classe_matiere_id', 'statut', 'eleve_id', 'eleve__nom', 'eleve__prenom', 'eleve__matricule',
        ):
            s = stats.setdefault(p['classe_matiere_id'], {
                'presents': 0, 'absents': 0, 'retards': 0, 'justifies': 0, 'a_suivre': [],
            })
            champ = {'PRESENT': 'presents', 'ABSENT': 'absents', 'RETARD': 'retards'}.get(p['statut'], 'justifies')
            s[champ] += 1
            if p['statut'] in ('ABSENT', 'RETARD'):
                s['a_suivre'].append({
                    'eleve_id': p['eleve_id'],
                    'nom': f"{p['eleve__prenom']} {p['eleve__nom']}".strip(),
                    'matricule': p['eleve__matricule'],
                    'statut': p['statut'],
                })

        annee = get_annee_active(ecole_of(user))
        ins = Inscription.objects.filter(is_active=True, classe_id__in={c.classe_id for c in cms})
        if annee:
            ins = ins.filter(annee_scolaire=annee)
        effectifs = {r['classe_id']: r['n'] for r in ins.values('classe_id').annotate(n=Count('id'))}

        par_classe = {}
        resume = {'cours_prevus': 0, 'cours_appeles': 0, 'cours_non_appeles': 0, 'absences': 0, 'retards': 0}
        for cm in cms:
            prevu = cm.id in horaires
            fait = cm.id in stats
            if not prevu and not fait:
                continue
            s = stats.get(cm.id, {})
            ligne = {
                'classe_matiere_id': cm.id,
                'matiere_nom': cm.matiere.nom,
                'enseignant_nom': (f"{cm.enseignant.prenom} {cm.enseignant.nom}".strip() if cm.enseignant else ''),
                'horaires': horaires.get(cm.id, []),
                'prevu': prevu,
                'fait': fait,
                'presents': s.get('presents', 0),
                'absents': s.get('absents', 0),
                'retards': s.get('retards', 0),
                'justifies': s.get('justifies', 0),
                'a_suivre': s.get('a_suivre', []),
            }
            c = par_classe.setdefault(cm.classe_id, {
                'classe_id': cm.classe_id, 'classe_nom': cm.classe.nom,
                'niveau_nom': cm.classe.niveau.nom if cm.classe.niveau_id else '',
                'effectif': effectifs.get(cm.classe_id, 0), 'cours': [],
            })
            c['cours'].append(ligne)
            if prevu:
                resume['cours_prevus'] += 1
                if not fait:
                    resume['cours_non_appeles'] += 1
            if fait:
                resume['cours_appeles'] += 1
            resume['absences'] += ligne['absents']
            resume['retards'] += ligne['retards']

        classes = sorted(par_classe.values(), key=lambda c: (c['niveau_nom'], c['classe_nom']))
        for c in classes:
            c['cours'].sort(key=lambda x: (x['horaires'][0] if x['horaires'] else '99:99', x['matiere_nom']))
        return Response({'date': jour.isoformat(), 'jour': jour_nom, 'resume': resume, 'classes': classes})

    @action(detail=False, methods=['post'], url_path='saisie-masse')
    def saisie_masse(self, request):
        from accounts.sync_dedupe import replay_if_seen, store_receipt
        existing = replay_if_seen(request)
        if existing is not None:
            return existing

        classe_matiere_id = request.data.get('classe_matiere_id')
        date = request.data.get('date')
        presences_data = request.data.get('presences', [])

        if not classe_matiere_id or not date:
            return Response({'detail': 'classe_matiere_id et date sont requis.'}, status=400)

        from cours.models import ClasseMatiere
        cm_ok = scoped(ClasseMatiere.objects.all(), request.user).filter(id=classe_matiere_id).first()
        if cm_ok is None:
            return Response({'detail': 'Cours introuvable.'}, status=404)
        if request.user.role == 'ENSEIGNANT' and cm_ok.enseignant_id != request.user.enseignant_id:
            return Response({'detail': "Vous n'enseignez pas ce cours."}, status=403)
        if request.user.role == 'ENSEIGNANT':
            from django.utils import timezone
            if str(date)[:10] != timezone.localdate().isoformat():
                return Response({'detail': "L'appel se fait uniquement le jour même, pendant le cours."}, status=400)
            if any(p.get('statut') not in ('PRESENT', 'ABSENT') for p in presences_data):
                return Response({'detail': "L'enseignant indique seulement présent ou absent."}, status=400)
        eleves_valides = set(
            scoped(Eleve.objects.all(), request.user)
            .filter(id__in=[p.get('eleve_id') for p in presences_data if p.get('eleve_id')])
            .values_list('id', flat=True)
        )
        presences_data = [p for p in presences_data if p.get('eleve_id') in eleves_valides]

        results = []
        absents = []
        for p in presences_data:
            obj, _ = Presence.objects.update_or_create(
                eleve_id=p['eleve_id'],
                classe_matiere_id=classe_matiere_id,
                date=date,
                defaults={'statut': p['statut'], 'ecole': ecole_of(request.user)}
            )
            results.append(obj.id)
            if p.get('statut') == 'ABSENT':
                absents.append(p['eleve_id'])

        if absents:
            try:
                from notifications.services import notifier_absence
                from cours.models import ClasseMatiere
                cm = ClasseMatiere.objects.select_related('matiere').filter(id=classe_matiere_id).first()
                matiere = cm.matiere.nom if cm else ''
                for eid in set(absents):
                    eleve = scoped(Eleve.objects.all(), request.user).filter(id=eid).first()
                    if eleve:
                        notifier_absence(eleve, jour=date, matiere_nom=matiere)
            except Exception:
                pass

        response = Response({'count': len(results), 'ids': results}, status=201)
        store_receipt(request, response)
        return response


def _classes_enseignant(user):
    from cours.models import ClasseMatiere
    from scolarite.models import Classe
    if not user.enseignant:
        return Classe.objects.none()
    ids = set(
        ClasseMatiere.objects.filter(enseignant=user.enseignant).values_list('classe_id', flat=True)
    )
    ids.update(
        Classe.objects.filter(professeur_principal=user.enseignant).values_list('id', flat=True)
    )
    return scoped(Classe.objects.filter(id__in=ids), user)


class AppelJournalierViewSet(DroitsParAction, viewsets.ModelViewSet):
    """Appel du jour : présent / absent / retard / justifié par classe et date."""
    serializer_class = AppelJournalierSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        from scolarite.utils import resolve_annee, periode_annee, ids_enfants

        if voit_toute_l_ecole(user):
            qs = scoped(AppelJournalier.objects.all(), user)
        elif user.role == 'ENSEIGNANT' and user.enseignant:
            classes = _classes_enseignant(user)
            qs = scoped(AppelJournalier.objects.filter(classe__in=classes), user)
        elif user.role == 'ELEVE' and user.eleve:
            qs = scoped(AppelJournalier.objects.filter(eleve=user.eleve), user)
        elif user.role == 'PARENT':
            qs = scoped(AppelJournalier.objects.filter(eleve_id__in=ids_enfants(user)), user)
        else:
            return AppelJournalier.objects.none()

        annee = resolve_annee(self.request)
        debut, fin = periode_annee(annee) if annee else (None, None)
        if debut and fin:
            qs = qs.filter(date__gte=debut, date__lte=fin)

        classe_id = self.request.query_params.get('classe_id')
        date = self.request.query_params.get('date')
        eleve_id = self.request.query_params.get('eleve_id')
        statut = self.request.query_params.get('statut')
        if classe_id:
            qs = qs.filter(classe_id=classe_id)
        if date:
            qs = qs.filter(date=date)
        if eleve_id:
            qs = qs.filter(eleve_id=eleve_id)
        if statut:
            qs = qs.filter(statut=statut)

        return qs.select_related('eleve', 'classe__niveau').order_by('-date', '-id')

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    @action(detail=False, methods=['post'], url_path='saisie-masse')
    def saisie_masse(self, request):
        classe_id = request.data.get('classe_id')
        date = request.data.get('date')
        presences_data = request.data.get('presences', [])
        if not classe_id or not date:
            return Response({'detail': 'classe_id et date sont requis.'}, status=400)

        user = request.user
        from scolarite.models import Classe
        try:
            classe = scoped(Classe.objects.all(), user).get(id=classe_id)
        except Classe.DoesNotExist:
            return Response({'detail': 'Classe introuvable.'}, status=404)

        if user.role == 'ENSEIGNANT':
            if not _classes_enseignant(user).filter(id=classe.id).exists():
                return Response({'detail': "Vous n'enseignez pas cette classe."}, status=403)

        ecole = ecole_of(user)
        results = []
        absents = []
        for p in presences_data:
            obj, _ = AppelJournalier.objects.update_or_create(
                eleve_id=p['eleve_id'],
                classe_id=classe.id,
                date=date,
                defaults={'statut': p['statut'], 'ecole': ecole},
            )
            results.append(obj.id)
            if p.get('statut') == 'ABSENT':
                absents.append(p['eleve_id'])

        if absents:
            try:
                from notifications.services import notifier_absence
                for eid in set(absents):
                    eleve = Eleve.objects.filter(id=eid, ecole=ecole).first()
                    if eleve:
                        notifier_absence(eleve, jour=date, matiere_nom='appel du jour')
            except Exception:
                pass

        return Response({'count': len(results), 'ids': results}, status=201)
