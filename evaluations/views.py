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
from accounts.permissions import IsAdmin, IsAdminOrEnseignant


def _eleve_niveau_id(eleve):
    from scolarite.models import Inscription
    ins = Inscription.objects.filter(eleve=eleve).select_related('classe__niveau').first()
    return ins.classe.niveau_id if ins and ins.classe else None


def _can_view_eleve(user, eleve_id):
    """ADMIN/ENSEIGNANT : accès large. ELEVE : lui-même uniquement. PARENT : ses enfants uniquement."""
    if user.role in ('ADMIN', 'ENSEIGNANT'):
        return True
    eleve_id = str(eleve_id)
    if user.role == 'ELEVE':
        return user.eleve_id is not None and str(user.eleve_id) == eleve_id
    if user.role == 'PARENT':
        enfant_ids = {str(i) for i in user.enfants.values_list('id', flat=True)}
        if user.eleve_id:
            enfant_ids.add(str(user.eleve_id))
        return eleve_id in enfant_ids
    return False


class EvaluationViewSet(viewsets.ModelViewSet):
    serializer_class = EvaluationSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['classe_matiere__matiere__nom']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrEnseignant()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = Evaluation.objects.all()

        classe_id = self.request.query_params.get('classe_id')
        niveau_id = self.request.query_params.get('niveau_id')
        trimestre_id = self.request.query_params.get('trimestre_id')
        if classe_id:
            qs = qs.filter(classe_matiere__classe_id=classe_id)
        elif niveau_id:
            qs = qs.filter(classe_matiere__classe__niveau_id=niveau_id)
        if trimestre_id:
            qs = qs.filter(trimestre_id=trimestre_id)

        if user.role == 'ADMIN':
            return qs
        if user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            cms = ClasseMatiere.objects.filter(enseignant=user.enseignant)
            return qs.filter(classe_matiere__in=cms)
        if user.role == 'ELEVE' and user.eleve:
            from scolarite.models import Inscription
            ins = Inscription.objects.filter(eleve=user.eleve).first()
            if ins and ins.classe:
                return qs.filter(classe_matiere__classe=ins.classe)
        if user.role == 'PARENT':
            from scolarite.models import Inscription
            enfant_ids = list(user.enfants.values_list('id', flat=True))
            classes = Inscription.objects.filter(
                eleve_id__in=enfant_ids
            ).values_list('classe_id', flat=True).distinct()
            return qs.filter(classe_matiere__classe_id__in=classes)
        return Evaluation.objects.none()

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


class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrEnseignant()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = Note.objects.all()

        evaluation_id = self.request.query_params.get('evaluation_id')
        eleve_id = self.request.query_params.get('eleve_id')
        if evaluation_id:
            qs = qs.filter(evaluation_id=evaluation_id)
        if eleve_id:
            qs = qs.filter(eleve_id=eleve_id)

        if user.role == 'ADMIN':
            return qs
        if user.role == 'ENSEIGNANT' and user.enseignant:
            from cours.models import ClasseMatiere
            cms = ClasseMatiere.objects.filter(enseignant=user.enseignant)
            return qs.filter(evaluation__classe_matiere__in=cms)
        if user.role == 'ELEVE' and user.eleve:
            return qs.filter(eleve=user.eleve)
        if user.role == 'PARENT':
            # Autoriser l'accès aux notes de tous les enfants liés (M2M)
            enfant_ids = list(user.enfants.values_list('id', flat=True))
            if eleve_id and int(eleve_id) in enfant_ids:
                return qs.filter(eleve_id=eleve_id)
            return qs.filter(eleve_id__in=enfant_ids)
        return Note.objects.none()

    @action(detail=False, methods=['post'], url_path='saisie-masse')
    def saisie_masse(self, request):
        evaluation_id = request.data.get('evaluation_id')
        notes_data = request.data.get('notes', [])
        if not evaluation_id:
            return Response({'detail': 'evaluation_id est requis.'}, status=400)
        results = []
        for n in notes_data:
            obj, _ = Note.objects.update_or_create(
                eleve_id=n['eleve_id'],
                evaluation_id=evaluation_id,
                defaults={'valeur': n['valeur']}
            )
            results.append(obj.id)
        return Response({'count': len(results), 'ids': results}, status=201)

    @action(detail=False, methods=['get'])
    def bulletin(self, request):
        eleve_id = request.query_params.get('eleve_id')
        trimestre_id = request.query_params.get('trimestre_id')

        if not eleve_id or not trimestre_id:
            return Response({'detail': 'eleve_id et trimestre_id sont requis.'}, status=400)

        if not _can_view_eleve(request.user, eleve_id):
            return Response({'detail': "Vous n'êtes pas autorisé à consulter ce bulletin."}, status=403)

        from eleves.models import Eleve, Presence
        from scolarite.models import Inscription, Trimestre
        from collections import defaultdict

        try:
            eleve = Eleve.objects.get(id=eleve_id)
            trimestre = Trimestre.objects.select_related('annee_scolaire').get(id=trimestre_id)
        except (Eleve.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Élève ou trimestre introuvable.'}, status=404)

        inscription = Inscription.objects.select_related('classe').filter(eleve=eleve).first()
        classe = inscription.classe if inscription else None

        # Toutes les matières de la classe
        from cours.models import ClasseMatiere as CM_model
        if classe:
            class_cms = list(CM_model.objects.filter(classe=classe).select_related('matiere', 'enseignant'))
            cm_map = {cm.id: cm for cm in class_cms}
        else:
            class_cms = []
            cm_map = {}

        # Charger toutes les notes de l'élève ce trimestre (hors Examen Blanc, qui a son propre bulletin)
        notes = Note.objects.filter(
            eleve=eleve,
            evaluation__trimestre_id=trimestre_id
        ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere__matiere')

        # Regrouper par ClasseMatiere
        by_cm = defaultdict(list)
        for note in notes:
            by_cm[note.evaluation.classe_matiere_id].append(note)

        # Inclure toutes les matières de la classe, même sans notes (→ 0)
        for cm in class_cms:
            if cm.id not in by_cm:
                by_cm[cm.id] = []

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

        # Nb élèves dans la classe
        if classe:
            from scolarite.models import Inscription as Ins
            class_eleve_ids = list(
                Ins.objects.filter(classe=classe).values_list('eleve_id', flat=True)
            )
            nb_eleves = len(class_eleve_ids)
        else:
            class_eleve_ids = []
            nb_eleves = 0

        # Toutes les notes de la classe ce trimestre (pour les rangs)
        all_class_notes = defaultdict(lambda: defaultdict(list))
        if class_eleve_ids:
            cn = Note.objects.filter(
                evaluation__trimestre_id=trimestre_id,
                eleve_id__in=class_eleve_ids
            ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere')
            for n in cn:
                all_class_notes[n.evaluation.classe_matiere_id][n.eleve_id].append(n)

        disciplines = []
        total_coef = 0.0
        total_moy_coef = 0.0

        for cm_id, cm_notes in by_cm.items():
            cm = cm_map.get(cm_id) or (cm_notes[0].evaluation.classe_matiere if cm_notes else None)
            if cm is None:
                continue
            subject_coef = float(cm.coef)

            devoirs = [n for n in cm_notes if n.evaluation.type in ('DEVOIR1', 'DEVOIR2')]
            compos  = [n for n in cm_notes if n.evaluation.type == 'COMPOSITION']

            devoir_avg = calc_avg(devoirs) if devoirs else None
            comp_avg   = calc_avg(compos)  if compos  else None
            # Pas de notes → 0.00 (compte dans le calcul)
            moy_20 = calc_avg(cm_notes) if cm_notes else 0.0

            moy_coef = round(moy_20 * subject_coef, 2)
            total_coef     += subject_coef
            total_moy_coef += moy_coef

            # Rang dans la classe pour cette matière
            rang = None
            if class_eleve_ids:
                cm_notes_class = all_class_notes.get(cm_id, {})
                avgs = []
                for e_id in class_eleve_ids:
                    e_notes = cm_notes_class.get(e_id, [])
                    avgs.append(calc_avg(e_notes) if e_notes else 0.0)
                rang = sum(1 for a in avgs if a > moy_20) + 1

            ens = cm.enseignant
            ens_sig_url = None
            if ens and ens.signature:
                ens_sig_url = request.build_absolute_uri(ens.signature.url)

            disciplines.append({
                'matiere': cm.matiere.nom,
                'matiere_type': cm.matiere.type,
                'devoir': devoir_avg,
                'composition': comp_avg,
                'moy_20': moy_20,
                'coef': subject_coef,
                'moy_coef': moy_coef,
                'rang': rang,
                'appreciation': get_appreciation(moy_20),
                'enseignant_signature_url': ens_sig_url,
            })

        # Ordre : LITTERATURE → SCIENTIFIQUE → AUTRES, puis par nom
        TYPE_ORDER = {'LITTERATURE': 0, 'SCIENTIFIQUE': 1, 'AUTRES': 2}
        disciplines.sort(key=lambda x: (TYPE_ORDER.get(x['matiere_type'], 9), x['matiere']))

        moyenne_generale = round(total_moy_coef / total_coef, 2) if total_coef else 0.0

        # Rang général : toutes les matières de la classe comptent, 0 si pas de note
        rang_general = None
        if class_eleve_ids and class_cms:
            cn_all = Note.objects.filter(
                evaluation__trimestre_id=trimestre_id,
                eleve_id__in=class_eleve_ids
            ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere')
            by_eleve_cm = defaultdict(lambda: defaultdict(list))
            for n in cn_all:
                by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere_id].append(n)

            all_avgs = {}
            for e_id in class_eleve_ids:
                tc, tmc = 0.0, 0.0
                for cm in class_cms:
                    coef = float(cm.coef)
                    e_notes = by_eleve_cm[e_id].get(cm.id, [])
                    avg = calc_avg(e_notes) if e_notes else 0.0
                    tc += coef
                    tmc += avg * coef
                if tc:
                    all_avgs[e_id] = round(tmc / tc, 2)

            rang_general = sum(1 for a in all_avgs.values() if a > moyenne_generale) + 1

        # Absences et retards
        absences = Presence.objects.filter(eleve=eleve, statut='ABSENT').count()
        retards  = Presence.objects.filter(eleve=eleve, statut='RETARD').count()

        prof_principal = inscription.classe.professeur_principal if inscription and inscription.classe else None
        professeur_principal_data = {
            'nom': prof_principal.nom if prof_principal else None,
            'prenom': prof_principal.prenom if prof_principal else None,
            'signature_url': request.build_absolute_uri(prof_principal.signature.url) if (prof_principal and prof_principal.signature) else None,
        }

        return Response({
            'eleve': {
                'id': eleve.id,
                'nom': eleve.nom,
                'prenom': eleve.prenom,
                'matricule': eleve.matricule,
                'date_naissance': eleve.date_naissance.strftime('%d/%m/%Y') if eleve.date_naissance else None,
                'lieu_naissance': eleve.lieu_naissance or None,
                'sexe': eleve.sexe or None,
            },
            'trimestre': {
                'nom': trimestre.nom,
                'annee': trimestre.annee_scolaire.libelle,
            },
            'classe': classe.nom if classe else None,
            'nb_eleves': nb_eleves,
            'disciplines': disciplines,
            'total_coef': round(total_coef, 2),
            'total_moy_coef': round(total_moy_coef, 2),
            'moyenne_generale': moyenne_generale,
            'rang_general': rang_general,
            'absences': absences,
            'retards': retards,
            'professeur_principal': professeur_principal_data,
        })

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
            eleve = Eleve.objects.get(id=eleve_id)
            trimestre = Trimestre.objects.select_related('annee_scolaire').get(id=trimestre_id)
        except (Eleve.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Élève ou trimestre introuvable.'}, status=404)

        inscription = Inscription.objects.select_related('classe__niveau').filter(eleve=eleve).first()
        classe = inscription.classe if inscription else None

        if not classe or not classe.niveau.is_classe_examen:
            return Response({
                'detail': "Cet élève n'est pas dans une classe d'examen (3ème/Terminale) — pas de bulletin d'Examen Blanc."
            }, status=400)

        from cours.models import ClasseMatiere as CM_model
        class_cms = list(CM_model.objects.filter(classe=classe).select_related('matiere', 'enseignant'))
        cm_map = {cm.id: cm for cm in class_cms}

        notes = Note.objects.filter(
            eleve=eleve,
            evaluation__trimestre_id=trimestre_id,
            evaluation__type='EXAMEN_BLANC'
        ).select_related('evaluation__classe_matiere__matiere')

        by_cm = defaultdict(list)
        for note in notes:
            by_cm[note.evaluation.classe_matiere_id].append(note)
        for cm in class_cms:
            if cm.id not in by_cm:
                by_cm[cm.id] = []

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

        class_eleve_ids = list(Inscription.objects.filter(classe=classe).values_list('eleve_id', flat=True))
        nb_eleves = len(class_eleve_ids)

        all_class_notes = defaultdict(lambda: defaultdict(list))
        if class_eleve_ids:
            cn = Note.objects.filter(
                evaluation__trimestre_id=trimestre_id,
                evaluation__type='EXAMEN_BLANC',
                eleve_id__in=class_eleve_ids
            ).select_related('evaluation__classe_matiere')
            for n in cn:
                all_class_notes[n.evaluation.classe_matiere_id][n.eleve_id].append(n)

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
                by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere_id].append(n)

            all_avgs = {}
            for e_id in class_eleve_ids:
                tc, tmc = 0.0, 0.0
                for cm in class_cms:
                    coef = float(cm.coef)
                    e_notes = by_eleve_cm[e_id].get(cm.id, [])
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
            classe = Classe.objects.select_related('niveau').get(id=classe_id)
            trimestre = Trimestre.objects.select_related('annee_scolaire').get(id=trimestre_id)
        except (Classe.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Classe ou trimestre introuvable.'}, status=404)

        class_cms = list(CM_model.objects.filter(classe=classe))
        eleve_ids = list(Inscription.objects.filter(classe=classe).values_list('eleve_id', flat=True).distinct())
        eleves_map = {e.id: e for e in Eleve.objects.filter(id__in=eleve_ids)}

        notes = Note.objects.filter(
            evaluation__trimestre_id=trimestre_id,
            eleve_id__in=eleve_ids
        ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere')

        by_eleve_cm = defaultdict(lambda: defaultdict(list))
        for n in notes:
            by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere_id].append(n)

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
                e_notes = by_eleve_cm[e_id].get(cm.id, [])
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
            niveau = Niveau.objects.get(id=niveau_id)
            trimestre = Trimestre.objects.select_related('annee_scolaire').get(id=trimestre_id)
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

        inscriptions = list(Inscription.objects.filter(classe__niveau=niveau).select_related('eleve', 'classe'))
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
            by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere_id].append(n)

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
                e_notes = by_eleve_cm[e_id].get(cm.id, [])
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


class CalendrierCompositionViewSet(viewsets.ModelViewSet):
    serializer_class = CalendrierCompositionSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = CalendrierComposition.objects.select_related(
            'niveau', 'trimestre__annee_scolaire'
        ).prefetch_related('programmes__matiere')
        niveau_id = self.request.query_params.get('niveau_id')
        trimestre_id = self.request.query_params.get('trimestre_id')
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        if trimestre_id:
            qs = qs.filter(trimestre_id=trimestre_id)
        return qs


class ProgrammeCompositionViewSet(viewsets.ModelViewSet):
    serializer_class = ProgrammeCompositionSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = ProgrammeComposition.objects.select_related('matiere', 'calendrier')
        calendrier_id = self.request.query_params.get('calendrier_id')
        if calendrier_id:
            qs = qs.filter(calendrier_id=calendrier_id)
        return qs


def _niveaux_examen_visibles(user):
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
        enfant_ids = list(user.enfants.values_list('id', flat=True))
        if user.eleve_id and user.eleve_id not in enfant_ids:
            enfant_ids.append(user.eleve_id)
        from scolarite.models import Inscription
        return list(Inscription.objects.filter(
            eleve_id__in=enfant_ids, classe__niveau__is_classe_examen=True
        ).values_list('classe__niveau_id', flat=True).distinct())
    return []


class CalendrierExamenBlancViewSet(viewsets.ModelViewSet):
    """Calendrier (dates de session) de l'Examen Blanc — géré par l'admin,
    consultable par les enseignants/élèves/parents concernés (niveaux d'examen uniquement)."""
    serializer_class = CalendrierExamenBlancSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = CalendrierExamenBlanc.objects.select_related(
            'niveau', 'trimestre__annee_scolaire'
        ).prefetch_related('programmes__matiere')

        niveau_id = self.request.query_params.get('niveau_id')
        trimestre_id = self.request.query_params.get('trimestre_id')
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        if trimestre_id:
            qs = qs.filter(trimestre_id=trimestre_id)

        if user.role == 'ADMIN':
            return qs
        return qs.filter(niveau_id__in=_niveaux_examen_visibles(user))


class ProgrammeExamenBlancViewSet(viewsets.ModelViewSet):
    """Programme à évaluer par matière pour une session d'Examen Blanc."""
    serializer_class = ProgrammeExamenBlancSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = ProgrammeExamenBlanc.objects.select_related('matiere', 'calendrier__niveau')

        calendrier_id = self.request.query_params.get('calendrier_id')
        if calendrier_id:
            qs = qs.filter(calendrier_id=calendrier_id)

        if user.role == 'ADMIN':
            return qs
        return qs.filter(calendrier__niveau_id__in=_niveaux_examen_visibles(user))


class DeliberationViewSet(viewsets.ModelViewSet):
    """Acte de délibération de l'Examen Blanc pour un niveau/trimestre — déclenché par l'admin.
    Sa présence conditionne la visibilité du classement pour les élèves/parents."""
    serializer_class = DeliberationSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Deliberation.objects.select_related('niveau', 'trimestre__annee_scolaire', 'decide_par')
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
            niveau = Niveau.objects.get(id=niveau_id)
            trimestre = Trimestre.objects.get(id=trimestre_id)
        except (Niveau.DoesNotExist, Trimestre.DoesNotExist):
            return Response({'detail': 'Niveau ou trimestre introuvable.'}, status=404)
        if not niveau.is_classe_examen:
            return Response({
                'detail': "La délibération d'Examen Blanc n'est disponible que pour les niveaux d'examen (3ème, Terminale)."
            }, status=400)

        # Idempotent : re-délibérer met simplement à jour la date et l'auteur.
        deliberation, _ = Deliberation.objects.get_or_create(niveau=niveau, trimestre=trimestre)
        deliberation.decide_par = request.user
        deliberation.save()
        return Response(self.get_serializer(deliberation).data, status=201)
