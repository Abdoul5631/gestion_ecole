from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Enseignant, Matiere, ClasseMatiere, EmploiDuTemps, Exercice
from .serializers import (EnseignantSerializer, MatiereSerializer, ClasseMatiereSerializer,
                          EmploiDuTempsSerializer, ExerciceSerializer)
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from accounts.permissions import IsAdmin, IsAdminOrEnseignant, IsEnseignant, DroitsParAction
from config.tenancy import scoped, ecole_of
from config.soft_delete import SoftDeleteMixin


class EnseignantViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = EnseignantSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nom']

    def get_queryset(self):
        user = self.request.user
        from django.db.models import Prefetch
        qs = scoped(Enseignant.objects.all(), user).select_related('user').prefetch_related(
            Prefetch(
                'classe_matieres',
                queryset=ClasseMatiere.objects.filter(is_active=True).select_related('classe', 'matiere'),
                to_attr='affectations_actives',
            ),
            'classes_principales',
        )
        if user.role == 'ADMIN':
            return qs
        if user.role == 'ENSEIGNANT' and user.enseignant:
            return qs.filter(id=user.enseignant.id)
        return qs

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    @action(detail=True, methods=['get'])
    def matieres(self, request, pk=None):
        enseignant = self.get_object()
        classe_matieres = ClasseMatiere.objects.filter(enseignant=enseignant)
        serializer = ClasseMatiereSerializer(classe_matieres, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['patch'], permission_classes=[IsAuthenticated],
            url_path='ma-signature')
    def ma_signature(self, request):
        if not request.user.enseignant:
            return Response({'detail': 'Aucun profil enseignant lié à ce compte.'}, status=400)
        if 'signature' not in request.FILES:
            return Response({'detail': 'Fichier signature requis.'}, status=400)
        enseignant = request.user.enseignant
        enseignant.signature = request.FILES['signature']
        enseignant.save()
        serializer = self.get_serializer(enseignant, context={'request': request})
        return Response(serializer.data)


class MatiereViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    queryset = Matiere.objects.all()
    serializer_class = MatiereSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nom']

    def get_queryset(self):
        return scoped(Matiere.objects.all(), self.request.user)

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    def extra_suspend_payload(self, instance):
        from evaluations.models import Evaluation
        nb_eval = Evaluation.objects.filter(classe_matiere__matiere=instance).count()
        if not nb_eval:
            return {}
        return {
            'detail': (
                f"Matière « {instance.nom} » suspendue. "
                f"{nb_eval} évaluation(s) et leurs notes restent dans l'historique."
            ),
            'nb_evaluations': nb_eval,
        }


class ClasseMatiereViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = ClasseMatiereSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['matiere__nom', 'classe__nom', 'enseignant__nom']
    structure_actif_lookups = ('classe__is_active', 'classe__niveau__is_active')

    def get_queryset(self):
        user = self.request.user
        qs = scoped(
            ClasseMatiere.objects.select_related('classe__niveau', 'matiere', 'enseignant'),
            self.request.user,
        )
        classe_id = self.request.query_params.get('classe_id')
        niveau_id = self.request.query_params.get('niveau_id')
        if classe_id:
            qs = qs.filter(classe_id=classe_id)
        elif niveau_id:
            qs = qs.filter(classe__niveau_id=niveau_id)
        if user.role == 'ENSEIGNANT' and user.enseignant:
            return qs.filter(enseignant=user.enseignant)
        return qs

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    @action(detail=False, methods=['post'])
    def copier(self, request):
        """Copie les matières et leurs coefficients d'une classe vers d'autres classes (les professeurs ne sont pas copiés :
        chaque classe a les siens). Une matière déjà présente dans la classe cible est laissée telle quelle."""
        from scolarite.models import Classe
        source_id = request.data.get('source')
        cibles_ids = request.data.get('classes') or []
        if not source_id or not isinstance(cibles_ids, list) or not cibles_ids:
            return Response({'detail': 'Choisissez la classe à copier et au moins une classe de destination.'}, status=400)
        classes = scoped(Classe.objects.all(), request.user)
        source = classes.filter(pk=source_id).first()
        if source is None:
            return Response({'detail': 'Classe à copier introuvable.'}, status=404)
        cibles = list(classes.filter(pk__in=cibles_ids).exclude(pk=source.pk))
        if not cibles:
            return Response({'detail': 'Choisissez au moins une classe de destination différente de la classe copiée.'}, status=400)
        modeles = list(ClasseMatiere.objects.filter(classe=source, is_active=True).select_related('matiere'))
        if not modeles:
            return Response({'detail': f"La classe {source.nom} n'a encore aucune matière à copier."}, status=400)
        ecole = ecole_of(request.user)
        ajoutees = deja = 0
        for cible in cibles:
            for m in modeles:
                _, cree = ClasseMatiere.objects.get_or_create(
                    classe=cible, matiere=m.matiere, defaults={'coef': m.coef, 'ecole': ecole})
                ajoutees += 1 if cree else 0
                deja += 0 if cree else 1
        return Response({
            'ajoutees': ajoutees, 'deja_presentes': deja,
            'message': f"{ajoutees} matière(s) ajoutée(s) dans {len(cibles)} classe(s)"
                       + (f" ({deja} déjà présente(s), laissée(s) telle(s) quelle(s))" if deja else '')
                       + ". Pensez à affecter un professeur à chaque matière.",
        })


class EmploiDuTempsViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = EmploiDuTempsSerializer
    structure_actif_lookups = (
        'classe_matiere__classe__is_active',
        'classe_matiere__classe__niveau__is_active',
    )

    def get_queryset(self):
        user = self.request.user
        qs = scoped(EmploiDuTemps.objects.select_related(
            'classe_matiere__classe', 'classe_matiere__matiere', 'classe_matiere__enseignant'
        ), self.request.user)
        classe_id = self.request.query_params.get('classe_id')
        enseignant_id = self.request.query_params.get('enseignant_id')
        if classe_id:
            qs = qs.filter(classe_matiere__classe_id=classe_id)
        if enseignant_id:
            qs = qs.filter(classe_matiere__enseignant_id=enseignant_id)
        if user.role in ('ELEVE', 'PARENT'):
            from scolarite.models import Inscription
            from scolarite.utils import ids_enfants, get_annee_active
            ins = Inscription.objects.filter(eleve_id__in=ids_enfants(user), is_active=True)
            annee = get_annee_active(ecole_of(user))
            if annee:
                ins = ins.filter(annee_scolaire=annee)
            qs = qs.filter(classe_matiere__classe_id__in=ins.values('classe_id'))
        # sans classe demandée, un enseignant ne voit que ses propres cours ; avec ?classe_id= il consulte la classe
        if user.role == 'ENSEIGNANT' and user.enseignant and not classe_id:
            qs = qs.filter(classe_matiere__enseignant=user.enseignant)
        return qs

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    @action(detail=False, methods=['get'], url_path='aujourdhui')
    def aujourdhui(self, request):
        """Tableau de bord enseignant : ses cours du jour (emploi du temps), l'état de l'appel,
        et quelques totaux (classes, élèves) en une seule requête."""
        from datetime import date as date_cls
        from django.db.models import Count
        from eleves.models import Presence
        from scolarite.models import Inscription
        from scolarite.utils import get_annee_active

        user = request.user
        if user.role != 'ENSEIGNANT' or not user.enseignant_id:
            return Response({'detail': 'Réservé aux enseignants.'}, status=403)
        raw = request.query_params.get('date')
        try:
            jour = date_cls.fromisoformat(raw) if raw else date_cls.today()
        except ValueError:
            return Response({'detail': 'Date invalide (AAAA-MM-JJ).'}, status=400)
        noms_jours = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
        jour_nom = noms_jours[jour.weekday()] if jour.weekday() < 6 else None

        mes_cms = list(scoped(ClasseMatiere.objects.filter(
            enseignant_id=user.enseignant_id, is_active=True, classe__isnull=False, classe__is_active=True,
        ).select_related('classe', 'matiere'), user))
        classes_ids = {c.classe_id for c in mes_cms}
        annee = get_annee_active(ecole_of(user))
        ins = Inscription.objects.filter(is_active=True, classe_id__in=classes_ids)
        if annee:
            ins = ins.filter(annee_scolaire=annee)
        effectifs = {r['classe_id']: r['n'] for r in ins.values('classe_id').annotate(n=Count('id'))}

        horaires = {}
        if jour_nom:
            for e in EmploiDuTemps.objects.filter(
                classe_matiere__in=mes_cms, jour=jour_nom, is_active=True,
            ).order_by('heure_debut'):
                horaires.setdefault(e.classe_matiere_id, []).append(
                    (e.heure_debut.strftime('%H:%M'), e.heure_fin.strftime('%H:%M'))
                )

        appels = {}
        for pr in Presence.objects.filter(date=jour, classe_matiere_id__in=horaires.keys()).values('classe_matiere_id', 'statut'):
            a = appels.setdefault(pr['classe_matiere_id'], {'absents': 0, 'retards': 0})
            if pr['statut'] == 'ABSENT':
                a['absents'] += 1
            elif pr['statut'] == 'RETARD':
                a['retards'] += 1

        cours = []
        for cm in mes_cms:
            if cm.id not in horaires:
                continue
            h = horaires[cm.id]
            cours.append({
                'classe_matiere_id': cm.id,
                'classe_id': cm.classe_id,
                'classe_nom': cm.classe.nom,
                'matiere_nom': cm.matiere.nom,
                'debut': h[0][0],
                'horaires': [f"{a}–{b}" for a, b in h],
                'effectif': effectifs.get(cm.classe_id, 0),
                'appel_fait': cm.id in appels,
                'absents': appels.get(cm.id, {}).get('absents', 0),
                'retards': appels.get(cm.id, {}).get('retards', 0),
            })
        cours.sort(key=lambda c: (c['debut'], c['classe_nom']))
        faits = sum(1 for c in cours if c['appel_fait'])
        return Response({
            'date': jour.isoformat(),
            'jour': jour_nom,
            'cours': cours,
            'resume': {
                'cours_du_jour': len(cours),
                'appels_faits': faits,
                'appels_a_faire': len(cours) - faits,
                'classes': len(classes_ids),
                'eleves': sum(effectifs.get(c, 0) for c in classes_ids),
            },
        })


def _eleves_de_la_classe(classe, ecole):
    """Ids des élèves inscrits dans la classe pour l'année active."""
    from scolarite.models import Inscription
    from scolarite.utils import get_annee_active
    annee = get_annee_active(ecole)
    qs = Inscription.objects.filter(classe=classe, is_active=True)
    if annee:
        qs = qs.filter(annee_scolaire=annee)
    return list(qs.values_list('eleve_id', flat=True))


def notifier_nouvel_exercice(exercice):
    """Notification in-app aux élèves de la classe et à leurs parents."""
    from django.db.models import Q
    from accounts.models import User
    from notifications.models import Notification

    cm = exercice.classe_matiere
    if not cm.classe_id:
        return 0
    eleves_ids = _eleves_de_la_classe(cm.classe, exercice.ecole)
    if not eleves_ids:
        return 0
    titre = f"Nouvel exercice — {cm.matiere.nom} ({cm.classe.nom})"
    message = exercice.titre
    if exercice.date_limite:
        message += f" — à rendre pour le {exercice.date_limite.strftime('%d/%m/%Y')}"

    notifs = []
    for u in User.objects.filter(role='ELEVE', is_active=True, eleve_id__in=eleves_ids):
        notifs.append(Notification(
            destinataire=u, type='INFO', titre=titre, message=message,
            eleve_id=u.eleve_id, lien='/exercices', ecole=exercice.ecole,
        ))
    parents = (User.objects.filter(role='PARENT', is_active=True)
               .filter(Q(enfants__in=eleves_ids) | Q(eleve_id__in=eleves_ids))
               .distinct().prefetch_related('enfants'))
    for p in parents:
        enfants = {e.id for e in p.enfants.all()} | ({p.eleve_id} if p.eleve_id else set())
        concerne = next((i for i in eleves_ids if i in enfants), None)
        notifs.append(Notification(
            destinataire=p, type='INFO', titre=titre, message=message,
            eleve_id=concerne, lien='/exercices', ecole=exercice.ecole,
        ))
    Notification.objects.bulk_create(notifs)
    return len(notifs)


class ExerciceViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    """Exercices donnés par les enseignants.
    - ENSEIGNANT : crée / modifie / supprime les exercices de ses classes.
    - ADMIN (directeur) : voit tout dans l'école et peut retirer un exercice.
    - ELEVE / PARENT : lecture seule, uniquement les exercices des classes de l'élève (ou de leurs enfants).
    """
    serializer_class = ExerciceSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        from scolarite.models import Inscription
        from scolarite.utils import resolve_annee, ids_enfants
        user = self.request.user
        qs = scoped(Exercice.objects.select_related(
            'classe_matiere__classe', 'classe_matiere__matiere', 'classe_matiere__enseignant',
        ), user)
        params = self.request.query_params

        if user.role == 'ENSEIGNANT':
            if not user.enseignant_id:
                return qs.none()
            qs = qs.filter(classe_matiere__enseignant_id=user.enseignant_id)
        elif user.role in ('ELEVE', 'PARENT'):
            if user.role == 'ELEVE':
                eleves = [user.eleve_id] if user.eleve_id else []
            else:
                eleves = ids_enfants(user)
                if params.get('eleve_id'):
                    try:
                        demande = int(params['eleve_id'])
                    except ValueError:
                        return qs.none()
                    eleves = [demande] if demande in eleves else []
            ins = Inscription.objects.filter(eleve_id__in=eleves, is_active=True)
            annee = resolve_annee(self.request)
            if annee:
                ins = ins.filter(annee_scolaire=annee)
            qs = qs.filter(classe_matiere__classe_id__in=ins.values_list('classe_id', flat=True))
        elif user.role != 'ADMIN':
            return qs.none()

        if params.get('classe_id'):
            qs = qs.filter(classe_matiere__classe_id=params['classe_id'])
        if params.get('classe_matiere_id'):
            qs = qs.filter(classe_matiere_id=params['classe_matiere_id'])
        return qs

    def perform_create(self, serializer):
        exercice = serializer.save(ecole=ecole_of(self.request.user))
        try:
            notifier_nouvel_exercice(exercice)
        except Exception:  # la notification ne doit jamais empêcher la publication
            pass

    def perform_update(self, serializer):
        user = self.request.user
        if user.role == 'ENSEIGNANT' and serializer.instance.classe_matiere.enseignant_id != user.enseignant_id:
            raise PermissionDenied("Cet exercice n'est pas le vôtre.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if request.user.role == 'ENSEIGNANT' and instance.classe_matiere.enseignant_id != request.user.enseignant_id:
            raise PermissionDenied("Cet exercice n'est pas le vôtre.")
        return super().destroy(request, *args, **kwargs)
