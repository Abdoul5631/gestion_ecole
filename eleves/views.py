from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Eleve, Presence
from .serializers import EleveSerializer, PresenceSerializer
from accounts.permissions import IsAdmin, IsAdminOrEnseignant
from config.pagination import StandardPagination


class EleveViewSet(viewsets.ModelViewSet):
    serializer_class = EleveSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['matricule', 'nom', 'prenom']
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        niveau_id = self.request.query_params.get('niveau_id')
        classe_id = self.request.query_params.get('classe_id')

        qs = Eleve.objects.all()

        if classe_id:
            from scolarite.models import Inscription
            ids = Inscription.objects.filter(classe_id=classe_id).values_list('eleve_id', flat=True)
            qs = qs.filter(id__in=ids)
        elif niveau_id:
            from scolarite.models import Inscription
            ids = Inscription.objects.filter(classe__niveau_id=niveau_id).values_list('eleve_id', flat=True)
            qs = qs.filter(id__in=ids)

        if user.role == 'ADMIN':
            return qs.order_by('nom', 'prenom')

        if user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            from scolarite.models import Inscription
            classes = ClasseMatiere.objects.filter(
                enseignant=user.enseignant
            ).values_list('classe_id', flat=True).distinct()
            ids = Inscription.objects.filter(classe_id__in=classes).values_list('eleve_id', flat=True)
            return qs.filter(id__in=ids).order_by('nom', 'prenom')

        if user.role in ['ELEVE', 'PARENT'] and user.eleve:
            return Eleve.objects.filter(id=user.eleve.id)

        return Eleve.objects.none()

    @action(detail=False, methods=['post'], url_path='creer-comptes-manquants', permission_classes=[IsAdmin])
    def creer_comptes_manquants(self, request):
        """Crée les comptes utilisateurs pour tous les élèves qui n'en ont pas."""
        from accounts.models import User
        eleves_sans_compte = Eleve.objects.filter(is_active=True).exclude(
            id__in=User.objects.filter(role='ELEVE', eleve__isnull=False).values_list('eleve_id', flat=True)
        )
        created = 0
        errors = []
        for eleve in eleves_sans_compte:
            try:
                # Vérifier que le username n'est pas déjà pris par un autre compte
                if User.objects.filter(username=eleve.matricule).exists():
                    username = f"{eleve.matricule}_eleve"
                else:
                    username = eleve.matricule
                u = User(username=username, role='ELEVE', eleve=eleve, is_active=True)
                u.set_password('Ecole@2024')
                u.save()
                created += 1
            except Exception as e:
                errors.append({'matricule': eleve.matricule, 'erreur': str(e)})
        return Response({'created': created, 'errors': errors}, status=200)

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
        header_help = ['Ex: E2024001', 'Nom de famille', 'Prénom', 'JJ/MM/AAAA',
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
        ws.append(['E2024001', 'DIALLO', 'Moussa', '15/08/2010', 'Bamako', 'M', 'DIALLO', 'Amadou', '0612345678'])

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
                classe = Classe.objects.get(id=classe_id)
            except Classe.DoesNotExist:
                return Response({'detail': 'Classe introuvable.'}, status=400)

        try:
            wb = load_workbook(io.BytesIO(file.read()), data_only=True)
            ws = wb.active
        except Exception:
            return Response({'detail': 'Fichier Excel invalide.'}, status=400)

        created, updated, inscrits, errors = 0, 0, 0, []

        for row_idx, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
            if not any(row):
                continue

            def cell(i):
                v = row[i] if i < len(row) else None
                return str(v).strip() if v is not None else ''

            matricule = cell(0)
            if not matricule:
                errors.append({'ligne': row_idx, 'erreur': 'Matricule manquant'})
                continue

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

            if not defaults.get('nom') and not Eleve.objects.filter(matricule=matricule).exists():
                errors.append({'ligne': row_idx, 'matricule': matricule, 'erreur': 'Nom manquant'})
                continue

            try:
                eleve, was_created = Eleve.objects.update_or_create(
                    matricule=matricule,
                    defaults=defaults
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

                # Compte utilisateur — créer seulement s'il n'existe pas
                from accounts.models import User
                if not User.objects.filter(eleve=eleve).exists():
                    u = User(
                        username=matricule,
                        role='ELEVE',
                        eleve=eleve,
                        is_active=True,
                    )
                    u.set_password('Ecole@2024')
                    u.save()

                # Inscription dans la classe cible
                if classe:
                    from scolarite.models import Inscription
                    _, ins_created = Inscription.objects.get_or_create(
                        eleve=eleve,
                        classe=classe,
                    )
                    if ins_created:
                        inscrits += 1

            except Exception as e:
                errors.append({'ligne': row_idx, 'matricule': matricule, 'erreur': str(e)})

        return Response({
            'created':  created,
            'updated':  updated,
            'inscrits': inscrits,
            'errors':   errors,
            'total':    created + updated,
        }, status=200)

    @action(detail=True, methods=['get'])
    def presences(self, request, pk=None):
        eleve = self.get_object()
        presences = Presence.objects.filter(eleve=eleve).order_by('-date')
        serializer = PresenceSerializer(presences, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def inscriptions(self, request, pk=None):
        from scolarite.models import Inscription
        from scolarite.serializers import InscriptionSerializer
        eleve = self.get_object()
        inscriptions = Inscription.objects.filter(eleve=eleve)
        serializer = InscriptionSerializer(inscriptions, many=True)
        return Response(serializer.data)


class PresenceViewSet(viewsets.ModelViewSet):
    serializer_class = PresenceSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['eleve__nom', 'eleve__prenom']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrEnseignant()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        classe_matiere_id = self.request.query_params.get('classe_matiere_id')
        date = self.request.query_params.get('date')
        eleve_id = self.request.query_params.get('eleve_id')

        if user.role == 'ADMIN':
            qs = Presence.objects.all()
        elif user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            cms = ClasseMatiere.objects.filter(enseignant=user.enseignant)
            qs = Presence.objects.filter(classe_matiere__in=cms)
        elif user.role in ['ELEVE', 'PARENT'] and user.eleve:
            qs = Presence.objects.filter(eleve=user.eleve)
        else:
            return Presence.objects.none()

        if classe_matiere_id:
            qs = qs.filter(classe_matiere_id=classe_matiere_id)
        if date:
            qs = qs.filter(date=date)
        if eleve_id:
            qs = qs.filter(eleve_id=eleve_id)

        return qs.order_by('-date')

    @action(detail=False, methods=['post'], url_path='saisie-masse')
    def saisie_masse(self, request):
        classe_matiere_id = request.data.get('classe_matiere_id')
        date = request.data.get('date')
        presences_data = request.data.get('presences', [])

        if not classe_matiere_id or not date:
            return Response({'detail': 'classe_matiere_id et date sont requis.'}, status=400)

        results = []
        for p in presences_data:
            obj, _ = Presence.objects.update_or_create(
                eleve_id=p['eleve_id'],
                classe_matiere_id=classe_matiere_id,
                date=date,
                defaults={'statut': p['statut']}
            )
            results.append(obj.id)

        return Response({'count': len(results), 'ids': results}, status=201)
