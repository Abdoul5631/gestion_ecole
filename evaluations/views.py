from django.db.models import Q
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import (Evaluation, Note, CalendrierComposition, ProgrammeComposition,
                      CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation)
from .serializers import (EvaluationSerializer, NoteSerializer, BulletinNoteSerializer,
                          CalendrierCompositionSerializer, ProgrammeCompositionSerializer,
                          CalendrierExamenBlancSerializer, ProgrammeExamenBlancSerializer,
                          DeliberationSerializer)
from accounts.permissions import IsAdmin, IsAdminOrEnseignant, DroitsParAction
from accounts.roles import a_un_role
from config.pagination import StandardPagination
from config.tenancy import scoped, ecole_of
from config.soft_delete import SoftDeleteMixin


def _eleve_niveau_id(eleve):
    from scolarite.utils import inscription_pour
    ins = inscription_pour(eleve)
    return ins.classe.niveau_id if ins and ins.classe else None


def _can_view_eleve(user, eleve_id):
    """ADMIN/ENSEIGNANT : accès dans leur école. ELEVE : lui-même. PARENT : ses enfants."""
    from eleves.models import Eleve
    if user.role in ('ADMIN', 'ENSEIGNANT'):
        if user.ecole_id:
            return Eleve.objects.filter(id=eleve_id, ecole_id=user.ecole_id).exists()
        return False
    eleve_id = str(eleve_id)
    if user.role == 'ELEVE':
        return user.eleve_id is not None and str(user.eleve_id) == eleve_id
    if user.role == 'PARENT':
        enfant_ids = {str(i) for i in user.enfants.values_list('id', flat=True)}
        if user.eleve_id:
            enfant_ids.add(str(user.eleve_id))
        return eleve_id in enfant_ids
    return False


class EvaluationViewSet(DroitsParAction, viewsets.ModelViewSet):
    serializer_class = EvaluationSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['classe_matiere__matiere__nom']

    def get_queryset(self):
        user = self.request.user
        qs = scoped(Evaluation.objects.all(), user)

        classe_id = self.request.query_params.get('classe_id')
        niveau_id = self.request.query_params.get('niveau_id')
        trimestre_id = self.request.query_params.get('trimestre_id')
        from scolarite.utils import resolve_annee, inscription_pour, ids_enfants
        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(trimestre__annee_scolaire=annee)
        if classe_id:
            qs = qs.filter(classe_matiere__classe_id=classe_id)
        elif niveau_id:
            qs = qs.filter(classe_matiere__classe__niveau_id=niveau_id)
        if trimestre_id:
            qs = qs.filter(trimestre_id=trimestre_id)

        if a_un_role(user, 'ADMIN', 'SECRETAIRE'):
            return qs
        if user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            cms = ClasseMatiere.objects.filter(enseignant=user.enseignant)
            return qs.filter(classe_matiere__in=cms)
        if user.role == 'ELEVE' and user.eleve:
            ins = inscription_pour(user.eleve, annee=annee)
            if ins and ins.classe:
                return qs.filter(classe_matiere__classe=ins.classe)
        if user.role == 'PARENT':
            from scolarite.models import Inscription
            enfant_ids = ids_enfants(user)
            ins_qs = Inscription.objects.filter(eleve_id__in=enfant_ids)
            if annee:
                ins_qs = ins_qs.filter(annee_scolaire=annee)
            classes = ins_qs.values_list('classe_id', flat=True).distinct()
            return qs.filter(classe_matiere__classe_id__in=classes)
        return Evaluation.objects.none()

    def _verifier_proprietaire(self, instance):
        from rest_framework.exceptions import PermissionDenied
        user = self.request.user
        epreuve = instance.type in ('COMPOSITION', 'EXAMEN_BLANC')
        if epreuve and not a_un_role(user, 'ADMIN', 'SECRETAIRE'):
            raise PermissionDenied("Les compositions et examens blancs sont programmés par le directeur ou le secrétaire.")
        if not epreuve and user.role == 'ADMIN':
            raise PermissionDenied("Les devoirs sont programmés par les enseignants.")

    def perform_update(self, serializer):
        self._verifier_proprietaire(serializer.instance)
        serializer.save()

    @action(detail=False, methods=['post'], url_path='generer')
    def generer(self, request):
        """Le directeur ou le secrétaire programme les compositions / examens blancs d'un trimestre pour tous les cours
        d'une classe, d'un niveau ou de toute l'école. Les évaluations déjà programmées sont laissées telles quelles."""
        from cours.models import ClasseMatiere
        from scolarite.models import Trimestre

        type_eval = request.data.get('type')
        if type_eval not in ('COMPOSITION', 'EXAMEN_BLANC'):
            return Response({'detail': "Type invalide : COMPOSITION ou EXAMEN_BLANC."}, status=400)
        trimestre = scoped(Trimestre.objects.all(), request.user).filter(id=request.data.get('trimestre_id')).first()
        if trimestre is None:
            return Response({'detail': 'Choisissez un trimestre.'}, status=400)

        cms = scoped(ClasseMatiere.objects.select_related('classe__niveau', 'matiere'), request.user).filter(
            is_active=True, classe__isnull=False, classe__is_active=True,
        )
        if request.data.get('classe_id'):
            cms = cms.filter(classe_id=request.data['classe_id'])
        elif request.data.get('niveau_id'):
            cms = cms.filter(classe__niveau_id=request.data['niveau_id'])
        if type_eval == 'EXAMEN_BLANC':
            cms = cms.filter(classe__niveau__is_classe_examen=True)

        # Date de l'épreuve, quand le calendrier de la matière est déjà renseigné
        dates = {}
        if type_eval == 'COMPOSITION':
            for p in ProgrammeComposition.objects.filter(calendrier__trimestre=trimestre).select_related('calendrier'):
                # programme de la classe en priorité ; à défaut, ancienne ligne valable pour tout le niveau
                cle = ('classe', p.classe_id, p.matiere_id) if p.classe_id else ('niveau', p.calendrier.niveau_id, p.matiere_id)
                dates[cle] = p.date_composition
        else:
            for p in ProgrammeExamenBlanc.objects.filter(calendrier__trimestre=trimestre).select_related('calendrier'):
                dates[(p.calendrier.niveau_id, p.matiere_id)] = p.date_examen

        existants = set(Evaluation.objects.filter(type=type_eval, trimestre=trimestre).values_list('classe_matiere_id', flat=True))
        ecole = ecole_of(request.user)
        crees = 0
        for cm in cms:
            if cm.id in existants:
                continue
            Evaluation.objects.create(
                type=type_eval, trimestre=trimestre, classe_matiere=cm, ecole=ecole,
                coefficient=1.0,
                date=(dates.get(('classe', cm.classe_id, cm.matiere_id)) or dates.get(('niveau', cm.classe.niveau_id, cm.matiere_id)))
                if type_eval == 'COMPOSITION' else dates.get((cm.classe.niveau_id, cm.matiere_id)),
            )
            crees += 1
        deja = len(existants & set(cms.values_list('id', flat=True)))
        if not crees and not deja:
            return Response({'detail': "Aucun cours trouvé pour cette sélection (classes d'examen seulement pour l'examen blanc)."}, status=400)
        libelle = 'compositions' if type_eval == 'COMPOSITION' else 'examens blancs'
        return Response({
            'crees': crees, 'deja_programmes': deja,
            'message': f"{crees} {libelle} programmé(s)" + (f", {deja} déjà programmé(s) (inchangés)." if deja else "."),
        }, status=201 if crees else 200)

    @action(detail=False, methods=['get'], url_path='carnet')
    def carnet(self, request):
        """Carnet de notes d'un cours (classe + matière) pour un trimestre :
        tous les élèves de la classe, toutes les évaluations, la moyenne et le rang de chacun."""
        from cours.models import ClasseMatiere
        from scolarite.models import Inscription, Trimestre

        user = request.user
        if not a_un_role(user, 'ENSEIGNANT', 'ADMIN', 'SECRETAIRE'):
            return Response({'detail': 'Accès réservé aux enseignants, au secrétariat et à la direction.'}, status=403)
        cm_id = request.query_params.get('classe_matiere_id')
        tri_id = request.query_params.get('trimestre_id')
        if not cm_id or not tri_id:
            return Response({'detail': 'classe_matiere_id et trimestre_id sont requis.'}, status=400)

        cm = scoped(ClasseMatiere.objects.select_related('classe', 'matiere', 'enseignant'), user).filter(id=cm_id).first()
        if cm is None or cm.classe_id is None:
            return Response({'detail': 'Cours introuvable.'}, status=404)
        if user.role == 'ENSEIGNANT' and cm.enseignant_id != user.enseignant_id:
            return Response({'detail': "Vous n'enseignez pas ce cours."}, status=403)
        trimestre = scoped(Trimestre.objects.select_related('annee_scolaire'), user).filter(id=tri_id).first()
        if trimestre is None:
            return Response({'detail': 'Trimestre introuvable.'}, status=404)

        ordre = {'DEVOIR1': 1, 'DEVOIR2': 2, 'COMPOSITION': 3}
        evals = [
            e for e in Evaluation.objects.filter(
                classe_matiere=cm, trimestre=trimestre, is_active=True,
            ).exclude(type='EXAMEN_BLANC')
        ]
        evals.sort(key=lambda e: (ordre.get(e.type, 9), str(e.date or ''), e.id))

        ins = Inscription.objects.filter(
            classe_id=cm.classe_id, is_active=True, eleve__is_active=True,
            annee_scolaire=trimestre.annee_scolaire,
        ).select_related('eleve').order_by('eleve__nom', 'eleve__prenom')

        notes = {}
        for n in Note.objects.filter(evaluation__in=evals):
            notes.setdefault(n.eleve_id, {})[n.evaluation_id] = n.valeur

        eleves = []
        for i in ins:
            e = i.eleve
            vals = notes.get(e.id, {})
            tot = coef = 0.0
            for ev in evals:
                v = vals.get(ev.id)
                if v is None:
                    continue
                sur = ev.note_sur or 20
                tot += (float(v) / sur * 20) * float(ev.coefficient)
                coef += float(ev.coefficient)
            eleves.append({
                'eleve_id': e.id, 'nom': e.nom, 'prenom': e.prenom, 'matricule': e.matricule,
                'notes': {str(k): v for k, v in vals.items()},
                'moyenne': round(tot / coef, 2) if coef else None,
            })

        classes = sorted([x['moyenne'] for x in eleves if x['moyenne'] is not None], reverse=True)
        for x in eleves:
            x['rang'] = (classes.index(x['moyenne']) + 1) if x['moyenne'] is not None else None

        stats = {
            'effectif': len(eleves),
            'avec_moyenne': len(classes),
            'sans_note': len(eleves) - len(classes),
            'moyenne_classe': round(sum(classes) / len(classes), 2) if classes else None,
            'meilleure': classes[0] if classes else None,
            'plus_faible': classes[-1] if classes else None,
            'taux_reussite': round(100 * sum(1 for m in classes if m >= 10) / len(classes)) if classes else None,
        }
        return Response({
            'classe_matiere': {
                'id': cm.id, 'matiere_nom': cm.matiere.nom, 'classe_nom': cm.classe.nom,
                'enseignant_nom': f"{cm.enseignant.prenom} {cm.enseignant.nom}".strip() if cm.enseignant else '',
            },
            'trimestre': {'id': trimestre.id, 'nom': trimestre.nom},
            'evaluations': [{
                'id': e.id, 'type': e.type, 'libelle': e.libelle, 'date': e.date.isoformat() if e.date else None,
                'coefficient': e.coefficient, 'note_sur': e.note_sur,
            } for e in evals],
            'eleves': eleves,
            'stats': stats,
        })

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    def create(self, request, *args, **kwargs):
        from accounts.sync_dedupe import replay_if_seen, store_receipt
        existing = replay_if_seen(request)
        if existing is not None:
            return existing
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data.pop('client_id', None)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        response = Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        store_receipt(request, response)
        return response

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'detail': "La suppression n'est pas autorisée. Utilisez l'annulation."},
            status=status.HTTP_403_FORBIDDEN
        )

    @action(detail=True, methods=['get'])
    def notes(self, request, pk=None):
        evaluation = self.get_object()
        notes = Note.objects.filter(evaluation=evaluation)
        serializer = NoteSerializer(notes, many=True)
        return Response(serializer.data)


class NoteViewSet(DroitsParAction, viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        qs = scoped(Note.objects.select_related(
            'eleve',
            'evaluation',
            'evaluation__classe_matiere__matiere',
            'evaluation__trimestre',
        ), user).order_by('-evaluation_id', '-id')

        evaluation_id = self.request.query_params.get('evaluation_id')
        eleve_id = self.request.query_params.get('eleve_id')
        from scolarite.utils import resolve_annee, ids_enfants
        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(evaluation__trimestre__annee_scolaire=annee)
        if evaluation_id:
            qs = qs.filter(evaluation_id=evaluation_id)
        if eleve_id:
            qs = qs.filter(eleve_id=eleve_id)

        if a_un_role(user, 'ADMIN', 'SECRETAIRE'):
            return qs
        if user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            cms = ClasseMatiere.objects.filter(enseignant=user.enseignant)
            return qs.filter(evaluation__classe_matiere__in=cms)
        if user.role == 'ELEVE' and user.eleve:
            return qs.filter(eleve=user.eleve)
        if user.role == 'PARENT':
            enfant_ids = ids_enfants(user)
            if eleve_id and int(eleve_id) in enfant_ids:
                return qs.filter(eleve_id=eleve_id)
            return qs.filter(eleve_id__in=enfant_ids)
        return Note.objects.none()

    @action(detail=False, methods=['post'], url_path='saisie-masse')
    def saisie_masse(self, request):
        from accounts.sync_dedupe import replay_if_seen, store_receipt
        existing = replay_if_seen(request)
        if existing is not None:
            return existing

        evaluation_id = request.data.get('evaluation_id')
        notes_data = request.data.get('notes', [])
        if not evaluation_id:
            return Response({'detail': 'evaluation_id est requis.'}, status=400)

        # L'évaluation doit être de l'école ; un enseignant ne note que ses propres cours.
        evaluation = scoped(Evaluation.objects.select_related('classe_matiere'), request.user).filter(id=evaluation_id).first()
        if evaluation is None:
            return Response({'detail': 'Évaluation introuvable.'}, status=404)
        if request.user.role == 'ENSEIGNANT' and evaluation.classe_matiere.enseignant_id != request.user.enseignant_id:
            return Response({'detail': "Vous n'enseignez pas ce cours."}, status=403)

        from eleves.models import Eleve
        eleves_ok = set(scoped(Eleve.objects.all(), request.user).filter(
            id__in=[n.get('eleve_id') for n in notes_data if isinstance(n, dict) and n.get('eleve_id')]
        ).values_list('id', flat=True))
        sur = float(evaluation.note_sur or 20)
        results = []
        for n in notes_data:
            if not isinstance(n, dict) or n.get('eleve_id') not in eleves_ok:
                continue
            try:
                valeur = float(n['valeur'])
            except (KeyError, TypeError, ValueError):
                continue
            if not 0 <= valeur <= sur:
                return Response({'detail': f"Note invalide : {valeur} (entre 0 et {sur:g})."}, status=400)
            obj, _ = Note.objects.update_or_create(
                eleve_id=n['eleve_id'],
                evaluation_id=evaluation.id,
                defaults={'valeur': valeur, 'ecole': ecole_of(request.user)}
            )
            results.append(obj.id)
        response = Response({'count': len(results), 'ids': results}, status=201)
        store_receipt(request, response)
        return response

    @action(detail=False, methods=['post'], url_path='publier-bulletin', permission_classes=[IsAdmin])
    def publier_bulletin(self, request):
        """Prévenir les parents que le bulletin de la classe / du trimestre est disponible."""
        trimestre_id = request.data.get('trimestre_id')
        classe_id = request.data.get('classe_id')
        if not trimestre_id:
            return Response({'detail': 'trimestre_id est requis.'}, status=400)
        from scolarite.models import Inscription, Trimestre
        try:
            trimestre = scoped(Trimestre.objects.select_related('annee_scolaire'), request.user).get(id=trimestre_id)
        except Trimestre.DoesNotExist:
            return Response({'detail': 'Trimestre introuvable.'}, status=404)
        qs = scoped(Inscription.objects.filter(
            annee_scolaire=trimestre.annee_scolaire
        ).select_related('eleve'), request.user)
        if classe_id:
            qs = qs.filter(classe_id=classe_id)
        if not trimestre.bulletins_ouverts:
            return Response({'detail': "Ouvrez d'abord la récupération des bulletins de ce trimestre, "
                                       "sinon les parents ne pourront pas les consulter."}, status=400)
        from notifications.services import publier_bulletins
        return Response(publier_bulletins(qs, trimestre, auteur=request.user))

    def _bulletin_ou_erreur(self, request):
        eleve_id = request.query_params.get('eleve_id')
        trimestre_id = request.query_params.get('trimestre_id')
        if not eleve_id or not trimestre_id:
            return None, Response({'detail': 'eleve_id et trimestre_id sont requis.'}, status=400)
        if not _can_view_eleve(request.user, eleve_id):
            return None, Response({'detail': "Vous n'êtes pas autorisé à consulter ce bulletin."}, status=403)
        from eleves.models import Eleve
        from scolarite.models import Trimestre
        try:
            eleve = scoped(Eleve.objects.all(), request.user).get(id=eleve_id)
            trimestre = scoped(Trimestre.objects.select_related('annee_scolaire'), request.user).get(id=trimestre_id)
        except (Eleve.DoesNotExist, Trimestre.DoesNotExist):
            return None, Response({'detail': 'Élève ou trimestre introuvable.'}, status=404)
        if request.user.role in ('ELEVE', 'PARENT') and not trimestre.bulletins_ouverts:
            return None, Response({
                'detail': "Le bulletin de ce trimestre n'est pas encore disponible. "
                          "La direction vous préviendra dès qu'il sera ouvert.",
                'code': 'bulletins_fermes',
            }, status=403)
        from evaluations.bulletin import construire_bulletin
        return construire_bulletin(request, eleve, trimestre), None

    @action(detail=False, methods=['get'])
    def bulletin(self, request):
        data, err = self._bulletin_ou_erreur(request)
        if err:
            return err
        return Response(data)

    @action(detail=False, methods=['get'], url_path='historique-bulletins')
    def historique_bulletins(self, request):
        """Années et trimestres où l'élève a été inscrit (toutes années, même passées) : de quoi tirer un duplicata."""
        eleve_id = request.query_params.get('eleve_id')
        from eleves.models import Eleve
        from scolarite.models import Inscription, Trimestre
        eleve = scoped(Eleve.objects.all(), request.user).filter(id=eleve_id).first() if eleve_id else None
        if eleve is None:
            return Response({'detail': 'Élève introuvable.'}, status=404)
        annees = []
        inscriptions = (Inscription.objects.filter(eleve=eleve).select_related('classe', 'annee_scolaire')
                        .order_by('-annee_scolaire__libelle'))
        for ins in inscriptions:
            trimestres = []
            for t in Trimestre.objects.filter(annee_scolaire=ins.annee_scolaire, ecole=eleve.ecole).order_by('nom'):
                trimestres.append({
                    'id': t.id, 'nom': t.nom, 'ouvert': t.bulletins_ouverts,
                    'a_des_notes': Note.objects.filter(eleve=eleve, evaluation__trimestre=t).exists(),
                })
            annees.append({
                'annee_id': ins.annee_scolaire_id, 'annee': ins.annee_scolaire.libelle,
                'classe': ins.classe.nom if ins.classe_id else None,
                'en_cours': ins.annee_scolaire.is_active, 'trimestres': trimestres,
            })
        return Response({
            'eleve': {'id': eleve.id, 'nom': eleve.nom, 'prenom': eleve.prenom, 'matricule': eleve.matricule},
            'annees': annees,
        })

    @action(detail=False, methods=['get'], url_path='duplicata-bulletin')
    def duplicata_bulletin(self, request):
        """PDF « DUPLICATA » d'un bulletin d'une année quelconque. Réservé au directeur ; chaque duplicata est tracé."""
        data, err = self._bulletin_ou_erreur(request)
        if err:
            return err
        from datetime import date
        from django.http import HttpResponse
        from accounts.journal import noter
        from evaluations.bulletin import generer_bulletin_pdf
        eleve = data.get('eleve') or {}
        trim = data.get('trimestre') or {}
        par = f"{request.user.first_name} {request.user.last_name}".strip() or (data.get('ecole') or {}).get('directeur') or ''
        pdf = generer_bulletin_pdf(data, duplicata={'date': date.today().strftime('%d/%m/%Y'), 'par': par})
        noter('AUTRE', 'Duplicata de bulletin',
              f"{eleve.get('prenom', '')} {eleve.get('nom', '')} — {trim.get('nom', '')} {trim.get('annee', '')}".strip(),
              eleve.get('id', ''))
        nom = f"duplicata_{eleve.get('nom') or 'eleve'}_{(trim.get('nom') or 'T').replace(' ', '_')}_{trim.get('annee') or ''}"
        resp = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{nom}.pdf"'
        return resp

    @action(detail=False, methods=['get'], url_path='bulletin-pdf')
    def bulletin_pdf(self, request):
        data, err = self._bulletin_ou_erreur(request)
        if err:
            return err
        from django.http import HttpResponse
        from evaluations.bulletin import generer_bulletin_pdf
        pdf = generer_bulletin_pdf(data)
        nom = f"{(data.get('eleve') or {}).get('nom') or 'eleve'}_{(data.get('eleve') or {}).get('prenom') or ''}"
        trim = ((data.get('trimestre') or {}).get('nom') or 'T').replace(' ', '_')
        resp = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="bulletin_{nom}_{trim}.pdf"'
        return resp

    @action(detail=False, methods=['get'], url_path='bulletin-examen-blanc')
    def bulletin_examen_blanc(self, request):
        eleve_id = request.query_params.get('eleve_id')
        trimestre_id = request.query_params.get('trimestre_id')

        if not eleve_id or not trimestre_id:
            return Response({'detail': 'eleve_id et trimestre_id sont requis.'}, status=400)

        if not _can_view_eleve(request.user, eleve_id):
            return Response({'detail': "Vous n'êtes pas autorisé à consulter ce bulletin."}, status=403)

        from eleves.models import Eleve
        from scolarite.models import Inscription, Trimestre
        from collections import defaultdict

        try:
            eleve = scoped(Eleve.objects.all(), request.user).get(id=eleve_id)
            trimestre = scoped(Trimestre.objects.select_related('annee_scolaire'), request.user).get(id=trimestre_id)
        except (Eleve.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Élève ou trimestre introuvable.'}, status=404)

        inscription = Inscription.objects.select_related('classe__niveau').filter(
            eleve=eleve, annee_scolaire=trimestre.annee_scolaire
        ).first()
        classe = inscription.classe if inscription else None

        if not classe or not classe.niveau.is_classe_examen:
            return Response({
                'detail': "Cet élève n'est pas dans une classe d'examen (3ème/Terminale) — pas de bulletin d'Examen Blanc."
            }, status=400)

        from cours.models import ClasseMatiere as CM_model
        class_cms = list(CM_model.objects.filter(classe=classe).select_related('matiere', 'enseignant'))
        cm_map = {cm.matiere_id: cm for cm in class_cms}  # par matière (élève changé de classe)

        notes = Note.objects.filter(
            eleve=eleve,
            evaluation__trimestre_id=trimestre_id,
            evaluation__type='EXAMEN_BLANC'
        ).select_related('evaluation__classe_matiere__matiere')

        by_cm = defaultdict(list)
        for note in notes:
            by_cm[note.evaluation.classe_matiere.matiere_id].append(note)
        for cm in class_cms:
            if cm.matiere_id not in by_cm:
                by_cm[cm.matiere_id] = []

        def calc_avg(note_list):
            total_v = sum(float(n.valeur) * float(n.evaluation.coefficient) for n in note_list)
            total_c = sum(float(n.evaluation.coefficient) for n in note_list)
            return round(total_v / total_c, 2) if total_c else None

        def get_appreciation(moy):
            if moy >= 18: return 'Excellent'
            if moy >= 16: return 'Très Bien'
            if moy >= 14: return 'Bien'
            if moy >= 12: return 'Assez Bien'
            if moy >= 10: return 'Passable'
            if moy >= 8:  return 'Insuffisant'
            if moy >= 6:  return 'Faible'
            return 'Très Faible'

        class_eleve_ids = list(Inscription.objects.filter(
            classe=classe, annee_scolaire=trimestre.annee_scolaire
        ).values_list('eleve_id', flat=True))
        nb_eleves = len(class_eleve_ids)

        all_class_notes = defaultdict(lambda: defaultdict(list))
        if class_eleve_ids:
            cn = Note.objects.filter(
                evaluation__trimestre_id=trimestre_id,
                evaluation__type='EXAMEN_BLANC',
                eleve_id__in=class_eleve_ids
            ).select_related('evaluation__classe_matiere')
            for n in cn:
                all_class_notes[n.evaluation.classe_matiere.matiere_id][n.eleve_id].append(n)

        disciplines = []
        total_coef = 0.0
        total_moy_coef = 0.0

        for cm_id, cm_notes in by_cm.items():
            cm = cm_map.get(cm_id) or (cm_notes[0].evaluation.classe_matiere if cm_notes else None)
            if cm is None:
                continue
            subject_coef = float(cm.coef)
            moy_20 = calc_avg(cm_notes) if cm_notes else 0.0

            moy_coef = round(moy_20 * subject_coef, 2)
            total_coef     += subject_coef
            total_moy_coef += moy_coef

            rang = None
            if class_eleve_ids:
                cm_notes_class = all_class_notes.get(cm_id, {})
                avgs = [calc_avg(cm_notes_class.get(e_id, [])) or 0.0 for e_id in class_eleve_ids]
                rang = sum(1 for a in avgs if a > moy_20) + 1

            disciplines.append({
                'matiere': cm.matiere.nom,
                'matiere_type': cm.matiere.type,
                'moy_20': moy_20,
                'coef': subject_coef,
                'moy_coef': moy_coef,
                'rang': rang,
                'appreciation': get_appreciation(moy_20),
            })

        TYPE_ORDER = {'LITTERATURE': 0, 'SCIENTIFIQUE': 1, 'AUTRES': 2}
        disciplines.sort(key=lambda x: (TYPE_ORDER.get(x['matiere_type'], 9), x['matiere']))

        moyenne_generale = round(total_moy_coef / total_coef, 2) if total_coef else 0.0

        rang_general = None
        if class_eleve_ids and class_cms:
            cn_all = Note.objects.filter(
                evaluation__trimestre_id=trimestre_id,
                evaluation__type='EXAMEN_BLANC',
                eleve_id__in=class_eleve_ids
            ).select_related('evaluation__classe_matiere')
            by_eleve_cm = defaultdict(lambda: defaultdict(list))
            for n in cn_all:
                by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere.matiere_id].append(n)

            all_avgs = {}
            for e_id in class_eleve_ids:
                tc, tmc = 0.0, 0.0
                for cm in class_cms:
                    coef = float(cm.coef)
                    e_notes = by_eleve_cm[e_id].get(cm.matiere_id, [])
                    avg = calc_avg(e_notes) if e_notes else 0.0
                    tc += coef
                    tmc += avg * coef
                if tc:
                    all_avgs[e_id] = round(tmc / tc, 2)

            rang_general = sum(1 for a in all_avgs.values() if a > moyenne_generale) + 1

        deliberated = Deliberation.objects.filter(niveau=classe.niveau, trimestre_id=trimestre_id).exists()

        return Response({
            'eleve': {
                'id': eleve.id,
                'nom': eleve.nom,
                'prenom': eleve.prenom,
                'matricule': eleve.matricule,
            },
            'trimestre': {
                'nom': trimestre.nom,
                'annee': trimestre.annee_scolaire.libelle,
            },
            'classe': classe.nom,
            'niveau_id': classe.niveau_id,
            'niveau_nom': classe.niveau.nom,
            'deliberated': deliberated,
            'nb_eleves': nb_eleves,
            'disciplines': disciplines,
            'total_coef': round(total_coef, 2),
            'total_moy_coef': round(total_moy_coef, 2),
            'moyenne_generale': moyenne_generale,
            'rang_general': rang_general,
        })

    @action(detail=False, methods=['get'], url_path='classement')
    def classement(self, request):
        """Palmarès d'une classe pour un trimestre (bulletin normal, hors Examen Blanc), du 1er au dernier."""
        classe_id = request.query_params.get('classe_id')
        trimestre_id = request.query_params.get('trimestre_id')
        if not classe_id or not trimestre_id:
            return Response({'detail': 'classe_id et trimestre_id sont requis.'}, status=400)

        if request.user.role not in ('ADMIN', 'ENSEIGNANT'):
            return Response({'detail': "Vous n'êtes pas autorisé à consulter ce classement."}, status=403)

        from scolarite.models import Classe, Inscription, Trimestre
        from cours.models import ClasseMatiere as CM_model
        from eleves.models import Eleve
        from collections import defaultdict

        try:
            classe = scoped(Classe.objects.select_related('niveau'), request.user).get(id=classe_id)
            trimestre = scoped(Trimestre.objects.select_related('annee_scolaire'), request.user).get(id=trimestre_id)
        except (Classe.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Classe ou trimestre introuvable.'}, status=404)

        class_cms = list(CM_model.objects.filter(classe=classe))
        eleve_ids = list(Inscription.objects.filter(
            classe=classe, annee_scolaire=trimestre.annee_scolaire
        ).values_list('eleve_id', flat=True).distinct())
        eleves_map = {e.id: e for e in Eleve.objects.filter(id__in=eleve_ids)}

        notes = Note.objects.filter(
            evaluation__trimestre_id=trimestre_id,
            eleve_id__in=eleve_ids
        ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere')

        by_eleve_cm = defaultdict(lambda: defaultdict(list))
        for n in notes:
            by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere.matiere_id].append(n)

        def calc_avg(note_list):
            total_v = sum(float(n.valeur) * float(n.evaluation.coefficient) for n in note_list)
            total_c = sum(float(n.evaluation.coefficient) for n in note_list)
            return round(total_v / total_c, 2) if total_c else 0.0

        results = []
        for e_id in eleve_ids:
            eleve = eleves_map.get(e_id)
            if not eleve:
                continue
            tc, tmc = 0.0, 0.0
            for cm in class_cms:
                coef = float(cm.coef)
                e_notes = by_eleve_cm[e_id].get(cm.matiere_id, [])
                avg = calc_avg(e_notes) if e_notes else 0.0
                tc += coef
                tmc += avg * coef
            moyenne = round(tmc / tc, 2) if tc else 0.0
            results.append({
                'eleve_id': eleve.id,
                'nom': eleve.nom,
                'prenom': eleve.prenom,
                'matricule': eleve.matricule,
                'moyenne_generale': moyenne,
            })

        results.sort(key=lambda r: r['moyenne_generale'], reverse=True)
        for i, r in enumerate(results):
            if i > 0 and r['moyenne_generale'] == results[i - 1]['moyenne_generale']:
                r['rang'] = results[i - 1]['rang']
            else:
                r['rang'] = i + 1

        return Response({
            'classe': classe.nom,
            'trimestre': {'nom': trimestre.nom, 'annee': trimestre.annee_scolaire.libelle},
            'nb_eleves': len(results),
            'classement': results,
        })

    @action(detail=False, methods=['get'], url_path='classement-examen-blanc')
    def classement_examen_blanc(self, request):
        """Palmarès Examen Blanc pour tout un niveau (toutes classes confondues), du 1er au dernier,
        avec statut ADMIS (>=10) / DEUXIEME_TOUR (7.5 à <10) / AJOURNE (<7.5)."""
        niveau_id = request.query_params.get('niveau_id')
        trimestre_id = request.query_params.get('trimestre_id')
        if not niveau_id or not trimestre_id:
            return Response({'detail': 'niveau_id et trimestre_id sont requis.'}, status=400)

        from scolarite.models import Niveau, Classe, Inscription, Trimestre
        from cours.models import ClasseMatiere as CM_model
        from eleves.models import Eleve
        from collections import defaultdict

        user = request.user

        try:
            niveau = scoped(Niveau.objects.all(), request.user).get(id=niveau_id)
            trimestre = scoped(Trimestre.objects.select_related('annee_scolaire'), request.user).get(id=trimestre_id)
        except (Niveau.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Niveau ou trimestre introuvable.'}, status=404)

        if not niveau.is_classe_examen:
            return Response({
                'detail': "Ce niveau n'est pas une classe d'examen (3ème, Terminale) — pas de classement Examen Blanc."
            }, status=400)

        # Contrôle d'accès par rôle
        if user.role == 'ADMIN':
            pass
        elif user.role == 'ENSEIGNANT' and user.enseignant:
            if not CM_model.objects.filter(enseignant=user.enseignant, classe__niveau=niveau).exists():
                return Response({'detail': "Vous n'enseignez pas dans ce niveau."}, status=403)
        elif user.role in ('ELEVE', 'PARENT'):
            if not Deliberation.objects.filter(niveau=niveau, trimestre_id=trimestre_id).exists():
                return Response({
                    'detail': "La délibération n'a pas encore eu lieu pour ce niveau/trimestre.",
                    'deliberated': False,
                }, status=403)
        else:
            return Response({'detail': "Vous n'êtes pas autorisé à consulter ce classement."}, status=403)

        classes = list(Classe.objects.filter(niveau=niveau))
        classe_map = {c.id: c for c in classes}
        class_cms_by_classe = defaultdict(list)
        for cm in CM_model.objects.filter(classe__niveau=niveau):
            class_cms_by_classe[cm.classe_id].append(cm)

        inscriptions = list(Inscription.objects.filter(
            classe__niveau=niveau, annee_scolaire=trimestre.annee_scolaire
        ).select_related('eleve', 'classe'))
        eleve_classe = {ins.eleve_id: ins.classe_id for ins in inscriptions}
        eleve_ids = list(eleve_classe.keys())
        eleves_map = {e.id: e for e in Eleve.objects.filter(id__in=eleve_ids)}

        notes = Note.objects.filter(
            evaluation__trimestre_id=trimestre_id,
            evaluation__type='EXAMEN_BLANC',
            eleve_id__in=eleve_ids
        ).select_related('evaluation__classe_matiere')

        by_eleve_cm = defaultdict(lambda: defaultdict(list))
        for n in notes:
            by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere.matiere_id].append(n)

        def calc_avg(note_list):
            total_v = sum(float(n.valeur) * float(n.evaluation.coefficient) for n in note_list)
            total_c = sum(float(n.evaluation.coefficient) for n in note_list)
            return round(total_v / total_c, 2) if total_c else 0.0

        def get_statut(moy):
            if moy >= 10:
                return 'ADMIS'
            if moy >= 7.5:
                return 'DEUXIEME_TOUR'
            return 'AJOURNE'

        results = []
        for e_id in eleve_ids:
            eleve = eleves_map.get(e_id)
            classe = classe_map.get(eleve_classe[e_id])
            if not eleve or not classe:
                continue
            class_cms = class_cms_by_classe.get(classe.id, [])
            tc, tmc = 0.0, 0.0
            for cm in class_cms:
                coef = float(cm.coef)
                e_notes = by_eleve_cm[e_id].get(cm.matiere_id, [])
                avg = calc_avg(e_notes) if e_notes else 0.0
                tc += coef
                tmc += avg * coef
            moyenne = round(tmc / tc, 2) if tc else 0.0
            results.append({
                'eleve_id': eleve.id,
                'nom': eleve.nom,
                'prenom': eleve.prenom,
                'matricule': eleve.matricule,
                'classe_nom': classe.nom,
                'moyenne_generale': moyenne,
                'statut': get_statut(moyenne),
            })

        results.sort(key=lambda r: r['moyenne_generale'], reverse=True)
        for i, r in enumerate(results):
            if i > 0 and r['moyenne_generale'] == results[i - 1]['moyenne_generale']:
                r['rang'] = results[i - 1]['rang']
            else:
                r['rang'] = i + 1

        response_data = {
            'niveau': niveau.nom,
            'trimestre': {'nom': trimestre.nom, 'annee': trimestre.annee_scolaire.libelle},
            'nb_eleves': len(results),
            'nb_admis': sum(1 for r in results if r['statut'] == 'ADMIS'),
            'nb_deuxieme_tour': sum(1 for r in results if r['statut'] == 'DEUXIEME_TOUR'),
            'nb_ajournes': sum(1 for r in results if r['statut'] == 'AJOURNE'),
        }

        # ELEVE / PARENT : uniquement leur(s) propre(s) résultat(s), pas le classement complet des autres
        if user.role == 'ELEVE':
            results = [r for r in results if str(r['eleve_id']) == str(user.eleve_id)]
        elif user.role == 'PARENT':
            enfant_ids = {str(i) for i in user.enfants.values_list('id', flat=True)}
            if user.eleve_id:
                enfant_ids.add(str(user.eleve_id))
            results = [r for r in results if str(r['eleve_id']) in enfant_ids]

        response_data['classement'] = results
        return Response(response_data)


def _filtrer_publies(qs, user, prefixe=''):
    """Enseignants, élèves, parents : seulement les calendriers publiés ; élèves et parents ne les voient plus
    une fois la session terminée (le trimestre est passé)."""
    if user.role not in ('ENSEIGNANT', 'ELEVE', 'PARENT'):
        return qs
    qs = qs.filter(**{f'{prefixe}publie': True})
    if user.role in ('ELEVE', 'PARENT'):
        from django.utils import timezone
        qs = qs.filter(**{f'{prefixe}date_fin__gte': timezone.localdate()})
    return qs


def _publier(cal, request, quoi, lien):
    """Publie (ou republie après modification) un calendrier et prévient les parents et les élèves du niveau."""
    from django.utils import timezone
    from scolarite.models import Inscription
    from scolarite.utils import get_annee_active
    from notifications.services import comptes_a_notifier, creer_notification
    from accounts.journal import noter
    deja = cal.publie
    cal.publie = True
    cal.publie_le = timezone.now()
    cal.save(update_fields=['publie', 'publie_le'])
    ins = Inscription.objects.filter(classe__niveau=cal.niveau, is_active=True, statut='INSCRIT').select_related('eleve')
    annee = cal.trimestre.annee_scolaire if cal.trimestre_id else get_annee_active(ecole_of(request.user))
    if annee:
        ins = ins.filter(annee_scolaire=annee)
    titre = f"{quoi} {'mis à jour' if deja else 'disponible'} — {cal.niveau.nom}"
    message = (f"Le {quoi.lower()} de {cal.niveau.nom} ({cal.trimestre.nom}) "
               f"{'a été modifié' if deja else 'est disponible'} : du {cal.date_debut:%d/%m/%Y} au {cal.date_fin:%d/%m/%Y}.")
    prevenus = set()
    for i in ins:
        for u in comptes_a_notifier(i.eleve):
            if u.id not in prevenus:
                prevenus.add(u.id)
                creer_notification(destinataire=u, type='INFO', titre=titre, message=message, eleve=i.eleve, lien=lien)
    noter('MODIFICATION', quoi, f"{'Republication' if deja else 'Publication'} : {cal.niveau.nom}, {cal.trimestre.nom}")
    return Response({'publie': True, 'publie_le': cal.publie_le, 'prevenus': len(prevenus)})


def _retirer(cal, quoi):
    from accounts.journal import noter
    cal.publie = False
    cal.publie_le = None
    cal.save(update_fields=['publie', 'publie_le'])
    noter('MODIFICATION', quoi, f'Publication retirée : {cal.niveau.nom}, {cal.trimestre.nom}')
    return Response({'publie': False})


def _enfants_choisis(user, eleve_id=None):
    """Enfants du parent ; un seul si ?eleve_id= le désigne (et rien s'il n'est pas à lui)."""
    from scolarite.utils import ids_enfants
    ids = list(ids_enfants(user))
    if eleve_id:
        ids = [i for i in ids if str(i) == str(eleve_id)]
    return ids


def classes_visibles(user, eleve_id=None):
    """Classes dont ce compte voit le programme des compositions (None : toutes, pour la direction et le personnel)."""
    if user.role == 'ENSEIGNANT':
        from cours.models import ClasseMatiere
        if not user.enseignant:
            return set()
        return set(ClasseMatiere.objects.filter(enseignant=user.enseignant, classe__isnull=False).values_list('classe_id', flat=True))
    if user.role in ('ELEVE', 'PARENT'):
        from eleves.models import Eleve
        from scolarite.utils import inscription_pour
        eleves = [user.eleve] if user.role == 'ELEVE' and user.eleve else Eleve.objects.filter(id__in=_enfants_choisis(user, eleve_id))
        ids = set()
        for e in eleves:
            ins = inscription_pour(e)
            if ins and ins.classe_id:
                ids.add(ins.classe_id)
        return ids
    return None


def _niveaux_visibles(user, eleve_id=None):
    """Niveaux dont ce compte voit le calendrier des compositions (None : tous, pour la direction et le personnel)."""
    if user.role == 'ENSEIGNANT':
        from cours.models import ClasseMatiere
        if not user.enseignant:
            return []
        return list(ClasseMatiere.objects.filter(enseignant=user.enseignant, classe__niveau__isnull=False)
                    .values_list('classe__niveau_id', flat=True).distinct())
    if user.role == 'ELEVE':
        n = _eleve_niveau_id(user.eleve) if user.eleve else None
        return [n] if n else []
    if user.role == 'PARENT':
        from eleves.models import Eleve
        return [n for n in (_eleve_niveau_id(e) for e in Eleve.objects.filter(id__in=_enfants_choisis(user, eleve_id))) if n]
    return None


class CalendrierCompositionViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = CalendrierCompositionSerializer

    def get_queryset(self):
        qs = scoped(CalendrierComposition.objects.select_related(
            'niveau', 'trimestre__annee_scolaire'
        ).prefetch_related('programmes__matiere', 'programmes__classe'), self.request.user)
        niveau_id = self.request.query_params.get('niveau_id')
        trimestre_id = self.request.query_params.get('trimestre_id')
        from scolarite.utils import resolve_annee
        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(trimestre__annee_scolaire=annee)
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        if trimestre_id:
            qs = qs.filter(trimestre_id=trimestre_id)
        visibles = _niveaux_visibles(self.request.user, self.request.query_params.get('eleve_id'))
        if visibles is not None:
            qs = qs.filter(niveau_id__in=visibles)
        return _filtrer_publies(qs, self.request.user)

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    @action(detail=True, methods=['post'])
    def publier(self, request, pk=None):
        return _publier(self.get_object(), request, 'Calendrier des compositions', '/calendrier-compositions')

    @action(detail=True, methods=['post'])
    def retirer(self, request, pk=None):
        return _retirer(self.get_object(), 'Calendrier des compositions')


class ProgrammeCompositionViewSet(DroitsParAction, viewsets.ModelViewSet):
    serializer_class = ProgrammeCompositionSerializer

    def get_queryset(self):
        qs = scoped(
            ProgrammeComposition.objects.select_related('matiere', 'calendrier', 'classe'),
            self.request.user,
        )
        calendrier_id = self.request.query_params.get('calendrier_id')
        if calendrier_id:
            qs = qs.filter(calendrier_id=calendrier_id)
        if self.request.query_params.get('classe_id'):
            qs = qs.filter(classe_id=self.request.query_params['classe_id'])
        visibles = _niveaux_visibles(self.request.user, self.request.query_params.get('eleve_id'))
        if visibles is not None:
            qs = qs.filter(calendrier__niveau_id__in=visibles)
        classes = classes_visibles(self.request.user, self.request.query_params.get('eleve_id'))
        if classes is not None:
            qs = qs.filter(Q(classe_id__in=classes) | Q(classe__isnull=True))
        return _filtrer_publies(qs, self.request.user, 'calendrier__')

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))


def _niveaux_examen_visibles(user, eleve_id=None):
    """Niveaux d'examen que ce user (ENSEIGNANT/ELEVE/PARENT) est autorisé à consulter."""
    if user.role == 'ENSEIGNANT' and user.enseignant:
        from cours.models import ClasseMatiere
        return list(ClasseMatiere.objects.filter(
            enseignant=user.enseignant, classe__niveau__is_classe_examen=True
        ).values_list('classe__niveau_id', flat=True).distinct())
    if user.role == 'ELEVE' and user.eleve:
        niveau_id_eleve = _eleve_niveau_id(user.eleve)
        return [niveau_id_eleve] if niveau_id_eleve else []
    if user.role == 'PARENT':
        enfant_ids = _enfants_choisis(user, eleve_id)
        from scolarite.models import Inscription
        from scolarite.utils import get_annee_active
        annee = get_annee_active(ecole_of(user))
        qs = Inscription.objects.filter(
            eleve_id__in=enfant_ids, classe__niveau__is_classe_examen=True
        )
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        return list(qs.values_list('classe__niveau_id', flat=True).distinct())
    return []


class CalendrierExamenBlancViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    """Calendrier (dates de session) de l'Examen Blanc — géré par l'admin,
    consultable par les enseignants/élèves/parents concernés (niveaux d'examen uniquement)."""
    serializer_class = CalendrierExamenBlancSerializer

    def get_queryset(self):
        user = self.request.user
        qs = scoped(CalendrierExamenBlanc.objects.select_related(
            'niveau', 'trimestre__annee_scolaire'
        ).prefetch_related('programmes__matiere'), user)

        niveau_id = self.request.query_params.get('niveau_id')
        trimestre_id = self.request.query_params.get('trimestre_id')
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        if trimestre_id:
            qs = qs.filter(trimestre_id=trimestre_id)

        if a_un_role(user, 'ADMIN', 'SECRETAIRE'):
            return qs
        qs = qs.filter(niveau_id__in=_niveaux_examen_visibles(user, self.request.query_params.get('eleve_id')))
        return _filtrer_publies(qs, user)

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    @action(detail=True, methods=['post'])
    def publier(self, request, pk=None):
        return _publier(self.get_object(), request, 'Programme de l’examen blanc', '/programme-examen-blanc')

    @action(detail=True, methods=['post'])
    def retirer(self, request, pk=None):
        return _retirer(self.get_object(), 'Programme de l’examen blanc')


class ProgrammeExamenBlancViewSet(DroitsParAction, viewsets.ModelViewSet):
    """Programme à évaluer par matière pour une session d'Examen Blanc."""
    serializer_class = ProgrammeExamenBlancSerializer

    def get_queryset(self):
        user = self.request.user
        qs = scoped(
            ProgrammeExamenBlanc.objects.select_related('matiere', 'calendrier__niveau', 'classe'),
            user,
        )

        calendrier_id = self.request.query_params.get('calendrier_id')
        if calendrier_id:
            qs = qs.filter(calendrier_id=calendrier_id)
        if self.request.query_params.get('classe_id'):
            qs = qs.filter(classe_id=self.request.query_params['classe_id'])

        if a_un_role(user, 'ADMIN', 'SECRETAIRE'):
            return qs
        qs = qs.filter(calendrier__niveau_id__in=_niveaux_examen_visibles(user, self.request.query_params.get('eleve_id')))
        classes = classes_visibles(user, self.request.query_params.get('eleve_id'))
        if classes is not None:
            qs = qs.filter(Q(classe_id__in=classes) | Q(classe__isnull=True))
        return _filtrer_publies(qs, user, 'calendrier__')

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))


class DeliberationViewSet(DroitsParAction, viewsets.ModelViewSet):
    """Acte de délibération de l'Examen Blanc pour un niveau/trimestre — déclenché par l'admin.
    Sa présence conditionne la visibilité du classement pour les élèves/parents."""
    serializer_class = DeliberationSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = scoped(
            Deliberation.objects.select_related('niveau', 'trimestre__annee_scolaire', 'decide_par'),
            self.request.user,
        )
        niveau_id = self.request.query_params.get('niveau_id')
        trimestre_id = self.request.query_params.get('trimestre_id')
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        if trimestre_id:
            qs = qs.filter(trimestre_id=trimestre_id)
        return qs

    def create(self, request, *args, **kwargs):
        from scolarite.models import Niveau, Trimestre
        niveau_id = request.data.get('niveau')
        trimestre_id = request.data.get('trimestre')
        if not niveau_id or not trimestre_id:
            return Response({'detail': 'niveau et trimestre sont requis.'}, status=400)
        try:
            niveau = scoped(Niveau.objects.all(), request.user).get(id=niveau_id)
            trimestre = scoped(Trimestre.objects.all(), request.user).get(id=trimestre_id)
        except (Niveau.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Niveau ou trimestre introuvable.'}, status=404)
        if not niveau.is_classe_examen:
            return Response({
                'detail': "La délibération d'Examen Blanc n'est disponible que pour les niveaux d'examen (3ème, Terminale)."
            }, status=400)

        # Idempotent : re-délibérer met simplement à jour la date et l'auteur.
        deliberation, _ = Deliberation.objects.get_or_create(
            niveau=niveau, trimestre=trimestre,
            defaults={'ecole': ecole_of(request.user)},
        )
        deliberation.decide_par = request.user
        deliberation.save()
        return Response(self.get_serializer(deliberation).data, status=201)


from rest_framework.decorators import api_view, permission_classes  # noqa: E402
from accounts.permissions import EcoleAccesPermission, roles_autorises  # noqa: E402


@api_view(['GET'])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('ADMIN')])
def bilan_pedagogique(request):
    """Bilan du directeur : ?trimestre_id=… pour un trimestre, sinon l'année entière ; ?annee_id=… pour une autre année."""
    from scolarite.models import AnneeScolaire, Trimestre
    from scolarite.utils import resolve_annee, trimestre_index
    from .bilan import calcul_bilan

    ecole = ecole_of(request.user)
    annee = resolve_annee(request)
    if annee is None or ecole is None:
        return Response({'detail': "Aucune année scolaire n'est active : créez ou activez l'année pour voir le bilan."}, status=404)
    trimestres = sorted(Trimestre.objects.filter(annee_scolaire=annee), key=lambda t: (trimestre_index(t.nom), t.id))
    trimestre = None
    if request.query_params.get('trimestre_id'):
        trimestre = next((t for t in trimestres if str(t.id) == request.query_params['trimestre_id']), None)
        if trimestre is None:
            return Response({'detail': "Ce trimestre n'appartient pas à cette année scolaire."}, status=404)
    classe_id = request.query_params.get('classe_id')
    classe_id = int(classe_id) if classe_id and classe_id.isdigit() else None
    bilan = calcul_bilan(ecole, annee, trimestre, classe_id)
    bilan.update({
        'annee': {'id': annee.id, 'libelle': annee.libelle},
        'annees': [{'id': a.id, 'libelle': a.libelle} for a in AnneeScolaire.objects.filter(ecole=ecole).order_by('-libelle')],
        'trimestres': [{'id': t.id, 'nom': t.nom} for t in trimestres],
        'periode': {'type': 'trimestre', 'id': trimestre.id, 'nom': trimestre.nom} if trimestre else {'type': 'annee', 'nom': f'Année {annee.libelle}'},
        'ecole_nom': ecole.nom_ecole,
    })
    if request.query_params.get('pdf'):
        from django.http import HttpResponse
        from .bilan_pdf import pdf_bilan
        rep = HttpResponse(pdf_bilan(bilan, ecole), content_type='application/pdf')
        rep['Content-Disposition'] = 'inline; filename="bilan_pedagogique.pdf"'
        return rep
    return Response(bilan)
