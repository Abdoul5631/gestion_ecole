from rest_framework import viewsets, filters, mixins
from accounts.roles import voit_toute_l_ecole
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import (
    Actualite, AnneeScolaire, Niveau, Classe, Trimestre, Inscription,
    ResultatExamenNational, PassageAnnee,
)
from .serializers import (
    ActualiteSerializer, AnneeScolaireSerializer, NiveauSerializer, ClasseSerializer,
    TrimestreSerializer, InscriptionSerializer,
    ResultatExamenNationalSerializer, PassageAnneeSerializer,
)
from .utils import resolve_annee, get_annee_active, ids_enfants
from config.soft_delete import SoftDeleteMixin
from .passage import (
    apercu_passage, lancer_passage, examen_pour_niveau, normaliser_niveau,
    inscriptions_examen, eleves_examen_par_matricule,
)
from accounts.permissions import IsAdmin, DroitsParAction
from config.tenancy import scoped, ecole_of


class AnneeScolaireViewSet(DroitsParAction, viewsets.ModelViewSet):
    queryset = AnneeScolaire.objects.all()
    serializer_class = AnneeScolaireSerializer

    def get_queryset(self):
        return scoped(AnneeScolaire.objects.all(), self.request.user)

    def perform_create(self, serializer):
        # une nouvelle année n'est pas l'année en cours, sauf si l'école n'en a aucune ; trois trimestres sont créés
        ecole = ecole_of(self.request.user)
        en_cours = not AnneeScolaire.objects.filter(ecole=ecole, is_active=True).exists()
        annee = serializer.save(ecole=ecole, is_active=en_cours)
        for nom in ('Trimestre 1', 'Trimestre 2', 'Trimestre 3'):
            Trimestre.objects.get_or_create(nom=nom, annee_scolaire=annee, defaults={'ecole': ecole, 'is_active': True})

    @action(detail=True, methods=['get'])
    def contenu(self, request, pk=None):
        """Ce que contient l'année : montré au directeur avant de la modifier ou d'en faire l'année en cours."""
        from evaluations.models import Evaluation, Note
        annee = self.get_object()
        ins = Inscription.objects.filter(annee_scolaire=annee, is_active=True)
        evals = Evaluation.objects.filter(trimestre__annee_scolaire=annee)
        try:
            from caisse.models import Paiement
            paiements = Paiement.objects.filter(dossier__inscription__annee_scolaire=annee).count()
        except Exception:
            paiements = 0
        return Response({
            'inscriptions': ins.count(),
            'classes': ins.values('classe').distinct().count(),
            'trimestres': annee.trimestres.count(),
            'evaluations': evals.count(),
            'notes': Note.objects.filter(evaluation__in=evals).count(),
            'paiements': paiements,
        })

    @action(detail=True, methods=['post'], url_path='en-cours')
    def en_cours(self, request, pk=None):
        """Fait de cette année l'année en cours (une seule à la fois) : tout l'établissement bascule dessus."""
        from django.db import transaction
        from accounts.journal import noter
        annee = self.get_object()
        if (request.data.get('confirmation') or '').strip() != annee.libelle:
            return Response({'detail': f"Pour confirmer, écrivez exactement « {annee.libelle} »."}, status=400)
        with transaction.atomic():
            AnneeScolaire.objects.filter(ecole_id=annee.ecole_id).exclude(pk=annee.pk).update(is_active=False)
            if not annee.is_active:
                annee.is_active = True
                annee.save(update_fields=['is_active'])
        noter('MODIFICATION', 'Année scolaire', f"{annee.libelle} devient l'année en cours")
        return Response(self.get_serializer(annee).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        return Response({
            'detail': (
                "Les années scolaires ne se suppriment pas. "
                "Choisissez une autre année en cours si celle-ci est terminée."
            ),
            'id': instance.id,
            'is_active': instance.is_active,
        }, status=200)

    @action(detail=False, methods=['get'])
    def active(self, request):
        obj = get_annee_active(ecole_of(request.user))
        if not obj:
            return Response({'detail': 'Aucune année scolaire.'}, status=404)
        return Response(self.get_serializer(obj).data)


class NiveauViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    queryset = Niveau.objects.all()
    serializer_class = NiveauSerializer

    def get_queryset(self):
        return scoped(Niveau.objects.all(), self.request.user)

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    def extra_suspend_payload(self, instance):
        annee = get_annee_active(instance.ecole)
        qs = Inscription.objects.filter(classe__niveau=instance, is_active=True)
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        nb = qs.count()
        if not nb:
            return {}
        return {
            'detail': (
                f"Niveau « {instance.nom} » suspendu. {nb} élève(s) restent inscrits "
                "cette année (historique et notes conservés)."
            ),
            'warning': 'Ces élèves restent inscrits cette année.',
            'nb_eleves': nb,
        }


class ClasseViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = ClasseSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nom', 'niveau__nom']
    structure_actif_lookups = ('niveau__is_active',)

    def _eleves_carte(self, classe):
        """Élèves inscrits (année active) de la classe, ou (None, erreur) si ce n'est pas une classe d'examen."""
        if not classe.niveau.is_classe_examen:
            return None
        ecole = ecole_of(self.request.user)
        annee = get_annee_active(ecole)
        ins = Inscription.objects.filter(classe=classe, is_active=True, eleve__is_active=True).select_related('eleve')
        if annee:
            ins = ins.filter(annee_scolaire=annee)
        return [i.eleve for i in ins.order_by('eleve__nom', 'eleve__prenom')], (annee.libelle if annee else '')

    @action(detail=True, methods=['get'], url_path='liste-pdf')
    def liste_pdf(self, request, pk=None):
        """Liste des élèves d'une classe (PDF) : une classe, un document. ?telecharger=1 force le téléchargement."""
        from django.http import HttpResponse
        from . import liste_classe
        classe = self.get_object()
        ecole = ecole_of(request.user)
        annee = get_annee_active(ecole)
        ins = Inscription.objects.filter(classe=classe, is_active=True, eleve__is_active=True).select_related('eleve')
        if annee:
            ins = ins.filter(annee_scolaire=annee)
        lignes = [(i.eleve.matricule, i.eleve.nom, i.eleve.prenom, {'M': 'M', 'F': 'F'}.get(i.eleve.sexe, ''), i.eleve.date_naissance)
                  for i in ins.order_by('eleve__nom', 'eleve__prenom')]
        prof = getattr(classe.professeur_principal, 'nom', '') if getattr(classe, 'professeur_principal_id', None) else ''
        pdf = liste_classe.pdf_liste_classe(classe, ecole, annee.libelle if annee else '', lignes, prof)
        rep = HttpResponse(pdf, content_type='application/pdf')
        nom = ''.join(c if c.isalnum() else '_' for c in f'liste_{classe.nom}')
        disposition = 'attachment' if request.query_params.get('telecharger') else 'inline'
        rep['Content-Disposition'] = f'{disposition}; filename="{nom}.pdf"'
        return rep

    @action(detail=True, methods=['get'], url_path='cartes-apercu')
    def cartes_apercu(self, request, pk=None):
        """Avant impression : combien de cartes, et quels élèves n'ont pas de photo."""
        classe = self.get_object()
        res = self._eleves_carte(classe)
        if res is None:
            return Response({'examen': False, 'total': 0, 'sans_photo': []})
        eleves, _ = res
        return Response({
            'examen': True, 'total': len(eleves),
            'sans_photo': [{'id': e.id, 'nom': f"{e.prenom} {e.nom}".strip()} for e in eleves if not e.photo],
        })

    @action(detail=True, methods=['get'], url_path='cartes')
    def cartes(self, request, pk=None):
        """Cartes scolaires de toute la classe : PDF A4 (8 cartes par feuille) — classes d'examen uniquement."""
        from django.http import HttpResponse
        from eleves import carte as carte_pdf
        classe = self.get_object()
        res = self._eleves_carte(classe)
        if res is None:
            return Response({'detail': "La carte scolaire est réservée aux classes d'examen."}, status=400)
        eleves, annee_libelle = res
        choisis = request.query_params.get('eleves')
        if choisis:  # sélection : ?eleves=1,2,3
            try:
                ids = {int(x) for x in choisis.split(',') if x.strip()}
            except ValueError:
                return Response({'detail': "Liste d'élèves invalide."}, status=400)
            eleves = [e for e in eleves if e.id in ids]
        if not eleves:
            return Response({'detail': "Aucun élève à imprimer dans cette classe."}, status=400)
        pdf = carte_pdf.pdf_cartes_classe(eleves, classe, ecole_of(request.user), annee_libelle,
                                          request.query_params.get('modele'), request.query_params.get('couleur'))
        rep = HttpResponse(pdf, content_type='application/pdf')
        rep['Content-Disposition'] = f'inline; filename="cartes-{classe.nom}.pdf"'
        return rep

    def get_queryset(self):
        qs = scoped(Classe.objects.select_related('niveau', 'professeur_principal'), self.request.user)
        niveau_id = self.request.query_params.get('niveau_id')
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['annee'] = resolve_annee(self.request)
        return ctx

    def extra_suspend_payload(self, instance):
        annee = get_annee_active(instance.ecole)
        qs = instance.inscriptions.filter(is_active=True)
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        nb = qs.count()
        if not nb:
            return {}
        return {
            'detail': (
                f"Classe « {instance.nom} » suspendue. {nb} élève(s) restent inscrits "
                "cette année (historique et notes conservés)."
            ),
            'warning': 'Ces élèves restent inscrits cette année.',
            'nb_eleves': nb,
        }


class TrimestreViewSet(DroitsParAction, viewsets.ModelViewSet):
    queryset = Trimestre.objects.all()
    serializer_class = TrimestreSerializer

    def get_queryset(self):
        qs = scoped(Trimestre.objects.all(), self.request.user)
        annee_id = self.request.query_params.get('annee_id')
        if annee_id and annee_id not in ('all', 'toutes', '*'):
            qs = qs.filter(annee_scolaire_id=annee_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(ecole=ecole_of(self.request.user))

    @action(detail=True, methods=['get'])
    def contenu(self, request, pk=None):
        from evaluations.models import Note
        t = self.get_object()
        return Response({'evaluations': t.evaluations.count(), 'notes': Note.objects.filter(evaluation__trimestre=t).count(),
                         'bulletins_ouverts': t.bulletins_ouverts})

    @action(detail=True, methods=['post'])
    def bulletins(self, request, pk=None):
        """Ouvre ou ferme la récupération des bulletins du trimestre par les élèves et les parents."""
        trimestre = self.get_object()
        ouverts = request.data.get('ouverts')
        if not isinstance(ouverts, bool):
            return Response({'detail': "Le champ « ouverts » (vrai/faux) est requis."}, status=400)
        trimestre.bulletins_ouverts = ouverts
        trimestre.save(update_fields=['bulletins_ouverts'])
        return Response(self.get_serializer(trimestre).data)


class InscriptionViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class = InscriptionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']

    def get_queryset(self):
        user = self.request.user
        qs = scoped(Inscription.objects.select_related(
            'eleve', 'classe__niveau', 'annee_scolaire'
        ), self.request.user)

        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(annee_scolaire=annee)

        classe_id = self.request.query_params.get('classe_id')
        niveau_id = self.request.query_params.get('niveau_id')
        eleve_id = self.request.query_params.get('eleve_id')
        if classe_id:
            qs = qs.filter(classe_id=classe_id)
        elif niveau_id:
            qs = qs.filter(classe__niveau_id=niveau_id)
        if eleve_id:
            qs = qs.filter(eleve_id=eleve_id)

        if voit_toute_l_ecole(user) or user.role == 'ENSEIGNANT':
            return qs
        if user.role == 'ELEVE' and user.eleve:
            return qs.filter(eleve=user.eleve)
        if user.role == 'PARENT':
            return qs.filter(eleve_id__in=ids_enfants(user))
        return Inscription.objects.none()

    def perform_create(self, serializer):
        ins = serializer.save(ecole=ecole_of(self.request.user))
        try:
            from caisse.services import ouvrir_dossier
            ouvrir_dossier(ins)
        except Exception:
            pass
        from notifications.equipe import prevenir_comptable_inscription
        prevenir_comptable_inscription(ins)

    @action(detail=False, methods=['post'])
    def reinscription(self, request):
        """
        Réinscrit des élèves dans une autre année (passage / réinscription)
        sans mélanger les années : contrainte unique (élève, année).
        Body: { annee_cible_id, items: [{eleve_id, classe_id}, ...] }
        """
        annee_id = request.data.get('annee_cible_id')
        items = request.data.get('items') or []
        if not annee_id or not items:
            return Response(
                {'detail': 'annee_cible_id et items sont requis.'},
                status=400,
            )
        try:
            annee = scoped(AnneeScolaire.objects.all(), request.user).get(pk=annee_id)
        except AnneeScolaire.DoesNotExist:
            return Response({'detail': 'Année scolaire introuvable.'}, status=404)

        from eleves.models import Eleve
        eleves_ok = set(scoped(Eleve.objects.all(), request.user).values_list('id', flat=True))
        classes_ok = set(scoped(Classe.objects.all(), request.user).values_list('id', flat=True))

        created, skipped, errors = [], [], []
        for item in items:
            eleve_id = item.get('eleve_id')
            classe_id = item.get('classe_id')
            if not eleve_id or not classe_id:
                errors.append({'item': item, 'erreur': 'eleve_id et classe_id requis'})
                continue
            if eleve_id not in eleves_ok or classe_id not in classes_ok:
                errors.append({'eleve_id': eleve_id, 'erreur': 'Élève ou classe introuvable.'})
                continue
            if Inscription.objects.filter(eleve_id=eleve_id, annee_scolaire=annee).exists():
                skipped.append(eleve_id)
                continue
            try:
                ins = Inscription.objects.create(
                    eleve_id=eleve_id,
                    classe_id=classe_id,
                    annee_scolaire=annee,
                    ecole=ecole_of(request.user),
                )
                try:
                    from caisse.services import ouvrir_dossier
                    ouvrir_dossier(ins)
                except Exception:
                    pass
                created.append(ins.id)
            except Exception as exc:
                errors.append({'eleve_id': eleve_id, 'erreur': str(exc)})

        return Response({
            'created': len(created),
            'skipped': len(skipped),
            'errors': errors,
            'ids': created,
            'annee': annee.libelle,
        })

    @action(detail=False, methods=['get'], url_path='passage-apercu')
    def passage_apercu(self, request):
        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        if not annee:
            return Response({'detail': 'Aucune année scolaire active.'}, status=404)
        return Response(apercu_passage(annee))

    @action(detail=False, methods=['post'], url_path='passage-lancer')
    def passage_lancer(self, request):
        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        if not annee:
            return Response({'detail': 'Aucune année scolaire active.'}, status=404)
        payload, code = lancer_passage(annee, auteur=request.user)
        return Response(payload, status=code)


class ResultatExamenNationalViewSet(DroitsParAction, viewsets.ModelViewSet):
    serializer_class = ResultatExamenNationalSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = scoped(
            ResultatExamenNational.objects.select_related('eleve', 'annee_scolaire'),
            self.request.user,
        )
        annee = resolve_annee(self.request)
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        examen = self.request.query_params.get('examen')
        if examen:
            qs = qs.filter(examen=examen.upper())
        return qs

    def perform_create(self, serializer):
        serializer.save(saisi_par=self.request.user, ecole=ecole_of(self.request.user))

    @action(detail=False, methods=['get'], url_path='candidats')
    def candidats(self, request):
        """Élèves de 3ème (BEPC) ou Terminale (BAC) de l'année, avec statut admis ou non."""
        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        if not annee:
            return Response({'detail': 'Aucune année scolaire active.'}, status=404)
        examen = (request.query_params.get('examen') or 'BEPC').upper()
        niveau_nom = '3ème' if examen == 'BEPC' else 'Terminale'
        inscriptions = inscriptions_examen(annee, examen)
        resultats = {
            r.eleve_id: r
            for r in ResultatExamenNational.objects.filter(annee_scolaire=annee, examen=examen)
        }
        items = []
        for ins in inscriptions:
            r = resultats.get(ins.eleve_id)
            items.append({
                'eleve_id': ins.eleve_id,
                'matricule': ins.eleve.matricule,
                'nom': ins.eleve.nom,
                'prenom': ins.eleve.prenom,
                'classe': ins.classe.nom if ins.classe else '—',
                'admis': bool(r and r.admis),
                'serie_2nde': r.serie_2nde if r else '',
                'resultat_id': r.id if r else None,
            })
        from .passage import liste_examen_verrouillee
        verrou = liste_examen_verrouillee(annee, examen)
        return Response({
            'examen': examen,
            'niveau': niveau_nom,
            'annee': annee.libelle,
            'nb_admis': sum(1 for i in items if i['admis']),
            'nb_total': len(items),
            'liste_enregistree': bool(resultats),
            'verrouille': bool(verrou),
            'verrou_message': verrou,
            'results': items,
        })

    @action(detail=False, methods=['post'], url_path='saisir')
    def saisir(self, request):
        """
        Enregistre la liste des admis.
        Body: { examen: 'BEPC'|'BAC', eleve_ids: [..], series: {eleve_id: 'A'}, remplacer: true }
        """
        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        if not annee:
            return Response({'detail': 'Aucune année scolaire active.'}, status=404)
        examen = (request.data.get('examen') or '').upper()
        if examen not in ('BEPC', 'BAC'):
            return Response({'detail': 'Choisissez BEPC ou BAC.'}, status=400)
        from django.db import transaction
        from accounts.journal import noter
        from .passage import liste_examen_verrouillee, serie_lycee
        verrou = liste_examen_verrouillee(annee, examen)
        if verrou:
            return Response({'detail': verrou}, status=409)
        candidats = {ins.eleve_id: ins.eleve for ins in inscriptions_examen(annee, examen)}
        try:
            ids = {int(i) for i in (request.data.get('eleve_ids') or [])}
        except (TypeError, ValueError):
            return Response({'detail': 'Liste des élèves invalide.'}, status=400)
        etrangers = ids - set(candidats)
        if etrangers:
            return Response({'detail': f"{len(etrangers)} élève(s) ne sont pas en {'3ème' if examen == 'BEPC' else 'Terminale'} "
                                       f"en {annee.libelle} : enregistrement refusé."}, status=400)
        series = request.data.get('series') or {}
        choix = {}
        if examen == 'BEPC':
            illisibles = []
            for eid in ids:
                s = serie_lycee(series.get(str(eid)) or series.get(eid))
                if s is None:
                    illisibles.append(f"{candidats[eid].prenom} {candidats[eid].nom}")
                choix[eid] = s
            if illisibles:
                return Response({'detail': "Série 2nde invalide (A, C ou D) pour : " + ', '.join(illisibles)}, status=400)
        ecole = ecole_of(request.user)
        with transaction.atomic():
            ResultatExamenNational.objects.filter(annee_scolaire=annee, examen=examen).delete()
            # tous les candidats sont enregistrés, admis ou non : la liste compte même si personne n'est admis
            ResultatExamenNational.objects.bulk_create([
                ResultatExamenNational(eleve_id=eid, annee_scolaire=annee, examen=examen, admis=eid in ids,
                                       serie_2nde=choix.get(eid, '') if eid in ids else '', saisi_par=request.user, ecole=ecole)
                for eid in candidats
            ])
        noter('MODIFICATION', f'Résultats {examen}', f"{len(ids)} admis sur {len(candidats)} ({annee.libelle})")
        return Response({
            'examen': examen,
            'annee': annee.libelle,
            'admis': len(ids),
            'non_admis': len(candidats) - len(ids),
            'message': f"Liste du {examen} enregistrée : {len(ids)} admis, {len(candidats) - len(ids)} non admis (redoubleront).",
        })

    @action(detail=False, methods=['post'], url_path='importer-excel')
    def importer_excel(self, request):
        """Excel : colonne matricule (obligatoire), série 2nde optionnelle (A/C/D)."""
        import io
        from openpyxl import load_workbook
        from eleves.models import Eleve

        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        if not annee:
            return Response({'detail': 'Aucune année scolaire active.'}, status=404)
        examen = (request.data.get('examen') or request.POST.get('examen') or 'BEPC').upper()
        if examen not in ('BEPC', 'BAC'):
            return Response({'detail': 'Choisissez BEPC ou BAC.'}, status=400)
        from .passage import liste_examen_verrouillee, serie_lycee
        verrou = liste_examen_verrouillee(annee, examen)
        if verrou:
            return Response({'detail': verrou}, status=409)
        fichier = request.FILES.get('file')
        if not fichier:
            return Response({'detail': 'Joignez un fichier Excel.'}, status=400)
        try:
            wb = load_workbook(io.BytesIO(fichier.read()), data_only=True)
            ws = wb.active
        except Exception:
            return Response({'detail': 'Fichier Excel invalide.'}, status=400)

        inscrits = eleves_examen_par_matricule(annee, examen)
        created, inconnus, series_corrigees = 0, [], []
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[0]:
                continue
            matricule = str(row[0]).strip().upper()
            eleve = inscrits.get(matricule)
            if not eleve:
                inconnus.append(matricule)
                continue
            serie = serie_lycee(row[1] if len(row) > 1 else '')
            if serie is None:  # illisible : 2nde A, à vérifier dans le tableau
                series_corrigees.append(matricule)
                serie = 'A'
            ResultatExamenNational.objects.update_or_create(
                eleve=eleve, annee_scolaire=annee, examen=examen,
                defaults={
                    'admis': True,
                    'serie_2nde': serie if examen == 'BEPC' else '',
                    'saisi_par': request.user,
                    'ecole': ecole_of(request.user),
                },
            )
            created += 1
        return Response({
            'examen': examen,
            'admis': created,
            'inconnus': inconnus,
            'series_corrigees': series_corrigees,
            'message': f"{created} admis importé(s)." + (f" {len(inconnus)} matricule(s) introuvable(s) en {'3ème' if examen == 'BEPC' else 'Terminale'}." if inconnus else ''),
        })

    @action(detail=False, methods=['post'], url_path='importer-texte')
    def importer_texte(self, request):
        """Collez des matricules (un par ligne)."""
        from eleves.models import Eleve
        annee = resolve_annee(request) or get_annee_active(ecole_of(request.user))
        if not annee:
            return Response({'detail': 'Aucune année scolaire active.'}, status=404)
        examen = (request.data.get('examen') or 'BEPC').upper()
        if examen not in ('BEPC', 'BAC'):
            return Response({'detail': 'Choisissez BEPC ou BAC.'}, status=400)
        from .passage import liste_examen_verrouillee
        verrou = liste_examen_verrouillee(annee, examen)
        if verrou:
            return Response({'detail': verrou}, status=409)
        import re
        from .passage import serie_lycee
        texte = request.data.get('texte') or request.data.get('matricules') or ''
        # une ligne par élève : « matricule » ou « matricule choix » (BEPC : A, C, D, Technique, quitte)
        lignes = [ln.strip() for ln in str(texte).splitlines() if ln.strip()]
        inscrits = eleves_examen_par_matricule(annee, examen)
        created, inconnus, series_corrigees = 0, [], []
        for ligne in lignes:
            morceaux = re.split(r'[\s;,\t]+', ligne, maxsplit=1)
            matricule = morceaux[0].upper()
            eleve = inscrits.get(matricule)
            if not eleve:
                inconnus.append(matricule)
                continue
            serie = ''
            if examen == 'BEPC':
                serie = serie_lycee(morceaux[1] if len(morceaux) > 1 else '')
                if serie is None:
                    series_corrigees.append(matricule)
                    serie = 'A'
            ResultatExamenNational.objects.update_or_create(
                eleve=eleve, annee_scolaire=annee, examen=examen,
                defaults={'admis': True, 'serie_2nde': serie, 'saisi_par': request.user, 'ecole': ecole_of(request.user)},
            )
            created += 1
        return Response({
            'examen': examen,
            'admis': created,
            'inconnus': inconnus,
            'series_corrigees': series_corrigees,
            'message': f"{created} admis ajouté(s)." + (f" {len(inconnus)} matricule(s) introuvable(s) en {'3ème' if examen == 'BEPC' else 'Terminale'}." if inconnus else ''),
        })


class PassageAnneeViewSet(DroitsParAction, mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = PassageAnneeSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return scoped(
            PassageAnnee.objects.select_related('annee_source', 'annee_cible', 'lance_par'),
            self.request.user,
        )


class ActualiteViewSet(DroitsParAction, viewsets.ModelViewSet):
    """Actualités de la page publique : la direction les rédige, les modifie et les retire."""
    serializer_class = ActualiteSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return scoped(Actualite.objects.prefetch_related('photos'), self.request.user)

    def _galerie(self, actualite):
        """Envoi multipart : « photos » (plusieurs fichiers) à ajouter, « retirer_photos » (identifiants) à enlever."""
        from django.db import transaction
        from rest_framework.exceptions import ValidationError
        from PIL import Image
        from .models import PhotoActualite
        data = self.request.data
        a_retirer = data.getlist('retirer_photos') if hasattr(data, 'getlist') else (data.get('retirer_photos') or [])
        fichiers = self.request.FILES.getlist('photos') if hasattr(self.request.FILES, 'getlist') else []
        with transaction.atomic():
            if a_retirer:
                for p in PhotoActualite.objects.filter(actualite=actualite, id__in=[i for i in a_retirer if str(i).isdigit()]):
                    p.image.delete(save=False)
                    p.delete()
            if not fichiers:
                return
            deja = actualite.photos.count()
            if deja + len(fichiers) > PhotoActualite.MAX_PAR_ACTUALITE:
                raise ValidationError({'photos': f'{PhotoActualite.MAX_PAR_ACTUALITE} photos au plus par actualité.'})
            for rang, f in enumerate(fichiers):
                if f.size > 5 * 1024 * 1024:
                    raise ValidationError({'photos': f'« {f.name} » est trop lourde (5 Mo maximum).'})
                try:
                    Image.open(f).verify()
                    f.seek(0)
                except Exception:
                    raise ValidationError({'photos': f'« {f.name} » n’est pas une image valide.'})
                PhotoActualite.objects.create(actualite=actualite, image=f, ordre=deja + rang)

    def perform_create(self, serializer):
        from django.db import transaction
        with transaction.atomic():
            actualite = serializer.save(ecole=ecole_of(self.request.user))
            self._galerie(actualite)

    def perform_update(self, serializer):
        from django.db import transaction
        with transaction.atomic():
            actualite = serializer.save()
            self._galerie(actualite)
