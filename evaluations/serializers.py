from rest_framework import serializers
from scolarite.utils import trimestre_index
from .models import (Evaluation, Note, CalendrierComposition, ProgrammeComposition,
                      CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation)


TYPE_LABELS = {
    'DEVOIR1': 'Devoir 1',
    'DEVOIR2': 'Devoir 2',
    'COMPOSITION': 'Composition',
    'EXAMEN_BLANC': 'Examen blanc',
    'INTERROGATION': 'Interrogation',
    'INTERRO': 'Interrogation',
}


def _eval_type_libelle(evaluation):
    """Toujours Devoir / Composition / etc. — pas un libellé vide."""
    if not evaluation:
        return 'Évaluation'
    code = getattr(evaluation, 'type', None) or ''
    if hasattr(evaluation, 'get_type_display'):
        label = evaluation.get_type_display()
        if label and label != code:
            return label
    return TYPE_LABELS.get(code, code or 'Évaluation')


def _eval_trimestre_court(evaluation):
    if not evaluation:
        return ''
    seq = getattr(evaluation, 'sequence', None)
    if seq:
        return str(seq).strip()
    trim = getattr(evaluation, 'trimestre', None)
    nom = getattr(trim, 'nom', '') or ''
    idx = trimestre_index(nom)
    if idx:
        return f'T{idx}'
    return nom.strip()


def _eval_libelle(evaluation):
    base = _eval_type_libelle(evaluation)
    court = _eval_trimestre_court(evaluation)
    if court and court.lower() not in base.lower():
        return f'{base} {court}'
    return base or 'Évaluation'


def _eval_note_sur(evaluation):
    val = getattr(evaluation, 'note_sur', None)
    try:
        val = int(val)
        return val if val > 0 else 20
    except (TypeError, ValueError):
        return 20


TYPES_DIRECTION = ('COMPOSITION', 'EXAMEN_BLANC')


class EvaluationSerializer(serializers.ModelSerializer):
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    matiere_nom = serializers.CharField(source='classe_matiere.matiere.nom', read_only=True)
    classe_nom = serializers.CharField(source='classe_matiere.classe.nom', read_only=True)
    niveau_nom = serializers.CharField(source='classe_matiere.classe.niveau.nom', read_only=True)
    type_libelle = serializers.SerializerMethodField()

    class Meta:
        model = Evaluation
        fields = '__all__'
        read_only_fields = ['id']

    def get_type_libelle(self, obj):
        return _eval_type_libelle(obj)

    def validate(self, attrs):
        eval_type = attrs.get('type', getattr(self.instance, 'type', None))
        classe_matiere = attrs.get('classe_matiere', getattr(self.instance, 'classe_matiere', None))
        trimestre_cible = attrs.get('trimestre', getattr(self.instance, 'trimestre', None))

        # Composition et examen blanc : le directeur ou le secrétaire les programme. L'enseignant ne programme que les devoirs.
        request = self.context.get('request')
        if request is not None and eval_type and (self.instance is None or 'type' in attrs):
            from accounts.roles import a_un_role
            programme_epreuves = a_un_role(request.user, 'ADMIN', 'SECRETAIRE')
            if eval_type in TYPES_DIRECTION and not programme_epreuves:
                raise serializers.ValidationError({
                    'type': "Seuls le directeur et le secrétaire programment les compositions et les examens blancs."
                })
            if eval_type not in TYPES_DIRECTION and request.user.role == 'ADMIN':
                raise serializers.ValidationError({
                    'type': "Les devoirs sont programmés par les enseignants."
                })

        # Une seule évaluation de chaque type par cours et par trimestre
        if (self.instance is None or {'type', 'classe_matiere', 'trimestre'} & set(attrs)) \
                and eval_type and classe_matiere and trimestre_cible:
            deja = Evaluation.objects.filter(
                type=eval_type, classe_matiere=classe_matiere, trimestre=trimestre_cible,
            )
            if self.instance is not None:
                deja = deja.exclude(pk=self.instance.pk)
            if deja.exists():
                raise serializers.ValidationError({
                    'type': f"{dict(Evaluation.TYPE_CHOICES)[eval_type]} est déjà programmé pour ce cours "
                            f"au {trimestre_cible.nom}. Il ne peut pas être programmé une deuxième fois."
                })
        if eval_type == 'EXAMEN_BLANC' and classe_matiere and not classe_matiere.classe.niveau.is_classe_examen:
            raise serializers.ValidationError({
                'type': "L'Examen Blanc n'est disponible que pour les classes d'examen (3ème, Terminale)."
            })
        if eval_type == 'COMPOSITION' and classe_matiere:
            try:
                from caisse.models import DossierScolarite
                trimestre = attrs.get('trimestre', getattr(self.instance, 'trimestre', None))
                annee_id = trimestre.annee_scolaire_id if trimestre else None
                blocked = DossierScolarite.objects.filter(
                    inscription__classe=classe_matiere.classe,
                    composition_bloquee=True,
                )
                if annee_id:
                    blocked = blocked.filter(inscription__annee_scolaire_id=annee_id)
                if blocked.exists():
                    raise serializers.ValidationError({
                        'type': "La composition est bloquée pour au moins un élève de cette classe "
                                "(impayé avec blocage activé)."
                    })
            except serializers.ValidationError:
                raise
            except Exception:
                pass
        return attrs


class NoteSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    matiere = serializers.CharField(source='evaluation.classe_matiere.matiere.nom', read_only=True)
    matiere_nom = serializers.CharField(source='evaluation.classe_matiere.matiere.nom', read_only=True)
    type_evaluation = serializers.CharField(source='evaluation.type', read_only=True)
    type_libelle = serializers.SerializerMethodField()
    evaluation_type = serializers.SerializerMethodField()
    evaluation_libelle = serializers.SerializerMethodField()
    coefficient = serializers.FloatField(source='evaluation.coefficient', read_only=True)
    note_sur = serializers.SerializerMethodField()
    evaluation_note_sur = serializers.SerializerMethodField()
    date = serializers.DateField(source='evaluation.date', read_only=True)
    trimestre_id = serializers.IntegerField(source='evaluation.trimestre_id', read_only=True)
    trimestre_nom = serializers.CharField(source='evaluation.trimestre.nom', read_only=True)

    class Meta:
        model = Note
        fields = [
            'id', 'valeur', 'evaluation', 'eleve',
            'eleve_nom', 'eleve_prenom', 'eleve_matricule',
            'matiere', 'matiere_nom',
            'type_evaluation', 'type_libelle', 'evaluation_type', 'evaluation_libelle',
            'coefficient', 'note_sur', 'evaluation_note_sur',
            'date', 'trimestre_id', 'trimestre_nom',
        ]
        read_only_fields = ['id']

    def get_type_libelle(self, obj):
        return _eval_type_libelle(obj.evaluation)

    def get_evaluation_type(self, obj):
        return _eval_libelle(obj.evaluation)

    def get_evaluation_libelle(self, obj):
        return _eval_libelle(obj.evaluation)

    def get_note_sur(self, obj):
        return _eval_note_sur(obj.evaluation)

    def get_evaluation_note_sur(self, obj):
        return _eval_note_sur(obj.evaluation)


class BulletinNoteSerializer(serializers.ModelSerializer):
    matiere = serializers.CharField(source='evaluation.classe_matiere.matiere.nom', read_only=True)
    coefficient = serializers.FloatField(source='evaluation.coefficient', read_only=True)
    type_evaluation = serializers.CharField(source='evaluation.type', read_only=True)

    class Meta:
        model = Note
        fields = ['id', 'valeur', 'matiere', 'coefficient', 'type_evaluation']


class ProgrammeCompositionSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='matiere.nom', read_only=True)
    classe_nom = serializers.CharField(source='classe.nom', read_only=True)

    class Meta:
        model = ProgrammeComposition
        fields = ['id', 'calendrier', 'classe', 'classe_nom', 'matiere', 'matiere_nom', 'contenu',
                  'date_composition', 'heure_debut', 'heure_fin']
        validators = []  # doublon classe/matière contrôlé dans validate(), avec un message clair

    def validate(self, attrs):
        inst = self.instance
        get = lambda k: attrs[k] if k in attrs else getattr(inst, k, None)
        # collège : même programme pour toutes les classes du niveau ; lycée : programme propre à chaque classe
        from .programme import programme_par_classe
        classe, matiere, calendrier = get('classe'), get('matiere'), get('calendrier')
        niveau = calendrier.niveau if calendrier else None
        if niveau is not None and not programme_par_classe(niveau):
            attrs['classe'] = classe = None
            if matiere and not matiere.classe_matieres.filter(classe__niveau=niveau).exists():
                raise serializers.ValidationError({'matiere': f"{matiere.nom} n'est enseignée dans aucune classe de {niveau.nom}."})
        else:
            if classe is None and inst is None:
                raise serializers.ValidationError({'classe': 'Choisissez la classe : chaque classe a son propre programme.'})
            if classe is not None:
                if calendrier and classe.niveau_id != calendrier.niveau_id:
                    raise serializers.ValidationError({'classe': f"La classe {classe.nom} n'appartient pas au niveau {calendrier.niveau.nom}."})
                if matiere and not classe.classe_matieres.filter(matiere=matiere).exists():
                    raise serializers.ValidationError({'matiere': f"{matiere.nom} n'est pas enseignée en {classe.nom}."})
        if matiere and calendrier:
            deja = ProgrammeComposition.objects.filter(calendrier=calendrier, classe=classe, matiere=matiere)
            if inst is not None:
                deja = deja.exclude(pk=inst.pk)
            if deja.exists():
                cible = classe.nom if classe else niveau.nom
                raise serializers.ValidationError(
                    f"{matiere.nom} est déjà programmée pour {cible} : modifiez-la au lieu d'en créer une seconde.")
        debut, fin = get('heure_debut'), get('heure_fin')
        if debut and fin and fin <= debut:
            raise serializers.ValidationError("L'heure de fin doit être après l'heure de début.")
        jour, cal = get('date_composition'), get('calendrier')
        if jour and cal and not (cal.date_debut <= jour <= cal.date_fin):
            raise serializers.ValidationError(
                f"La date doit être comprise entre le {cal.date_debut:%d/%m/%Y} et le {cal.date_fin:%d/%m/%Y}.")
        return attrs


class CalendrierCompositionSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    annee_libelle = serializers.CharField(source='trimestre.annee_scolaire.libelle', read_only=True)
    programmes = serializers.SerializerMethodField()

    def get_programmes(self, obj):
        # chacun ne voit que le programme de sa classe (parent : celle de son enfant ; enseignant : ses classes)
        from .views import classes_visibles
        request = self.context.get('request')
        visibles = classes_visibles(request.user, request.query_params.get('eleve_id')) if request else None
        lignes = [p for p in obj.programmes.all() if visibles is None or p.classe_id is None or p.classe_id in visibles]
        return ProgrammeCompositionSerializer(lignes, many=True, context=self.context).data

    class Meta:
        model = CalendrierComposition
        fields = ['id', 'niveau', 'niveau_nom', 'trimestre', 'trimestre_nom',
                  'annee_libelle', 'date_debut', 'date_fin', 'programmes', 'is_active', 'publie', 'publie_le']
        read_only_fields = ['publie', 'publie_le']
        validators = []  # doublon niveau/trimestre contrôlé dans validate(), avec un message clair

    def validate(self, attrs):
        niveau = attrs.get('niveau', getattr(self.instance, 'niveau', None))
        trimestre = attrs.get('trimestre', getattr(self.instance, 'trimestre', None))
        if niveau and trimestre:
            deja = self.Meta.model.objects.filter(niveau=niveau, trimestre=trimestre)
            if self.instance is not None:
                deja = deja.exclude(pk=self.instance.pk)
            if deja.exists():
                raise serializers.ValidationError(
                    f"Un calendrier existe déjà pour {niveau.nom} au {trimestre.nom} : modifiez-le au lieu d'en créer un second.")
        debut = attrs.get('date_debut', getattr(self.instance, 'date_debut', None))
        fin = attrs.get('date_fin', getattr(self.instance, 'date_fin', None))
        if debut and fin and fin < debut:
            raise serializers.ValidationError("La date de fin doit être après la date de début.")
        return attrs


class ProgrammeExamenBlancSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='matiere.nom', read_only=True)
    classe_nom = serializers.CharField(source='classe.nom', read_only=True)

    class Meta:
        model = ProgrammeExamenBlanc
        fields = ['id', 'calendrier', 'classe', 'classe_nom', 'matiere', 'matiere_nom', 'contenu',
                  'date_examen', 'heure_debut', 'heure_fin']
        validators = []  # doublon classe/matière contrôlé dans validate(), avec un message clair

    def validate(self, attrs):
        inst = self.instance
        get = lambda k: attrs[k] if k in attrs else getattr(inst, k, None)
        # 3ème : même programme pour toutes les classes ; Terminale : programme propre à chaque classe
        from .programme import examen_blanc_par_classe
        classe, matiere, calendrier = get('classe'), get('matiere'), get('calendrier')
        niveau = calendrier.niveau if calendrier else None
        if niveau is not None and not examen_blanc_par_classe(niveau):
            attrs['classe'] = classe = None
        else:
            if classe is None and inst is None:
                raise serializers.ValidationError({'classe': 'Choisissez la classe : chaque classe a son propre programme.'})
            if classe is not None:
                if calendrier and classe.niveau_id != calendrier.niveau_id:
                    raise serializers.ValidationError({'classe': f"La classe {classe.nom} n'appartient pas au niveau {calendrier.niveau.nom}."})
                if matiere and not classe.classe_matieres.filter(matiere=matiere).exists():
                    raise serializers.ValidationError({'matiere': f"{matiere.nom} n'est pas enseignée en {classe.nom}."})
        if matiere and calendrier:
            deja = ProgrammeExamenBlanc.objects.filter(calendrier=calendrier, classe=classe, matiere=matiere)
            if inst is not None:
                deja = deja.exclude(pk=inst.pk)
            if deja.exists():
                cible = classe.nom if classe else niveau.nom
                raise serializers.ValidationError(
                    f"{matiere.nom} est déjà programmée pour {cible} : modifiez-la au lieu d'en créer une seconde.")
        debut, fin = get('heure_debut'), get('heure_fin')
        if debut and fin and fin <= debut:
            raise serializers.ValidationError("L'heure de fin doit être après l'heure de début.")
        jour, cal = get('date_examen'), get('calendrier')
        if jour and cal and not (cal.date_debut <= jour <= cal.date_fin):
            raise serializers.ValidationError(
                f"La date doit être comprise entre le {cal.date_debut:%d/%m/%Y} et le {cal.date_fin:%d/%m/%Y}.")
        return attrs


class CalendrierExamenBlancSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    annee_libelle = serializers.CharField(source='trimestre.annee_scolaire.libelle', read_only=True)
    programmes = serializers.SerializerMethodField()

    def get_programmes(self, obj):
        # chacun ne voit que le programme de sa classe (parent : celle de son enfant ; enseignant : ses classes)
        from .views import classes_visibles
        request = self.context.get('request')
        visibles = classes_visibles(request.user, request.query_params.get('eleve_id')) if request else None
        lignes = [p for p in obj.programmes.all() if visibles is None or p.classe_id is None or p.classe_id in visibles]
        return ProgrammeExamenBlancSerializer(lignes, many=True, context=self.context).data

    class Meta:
        model = CalendrierExamenBlanc
        fields = ['id', 'niveau', 'niveau_nom', 'trimestre', 'trimestre_nom',
                  'annee_libelle', 'date_debut', 'date_fin', 'programmes', 'is_active', 'publie', 'publie_le']
        read_only_fields = ['publie', 'publie_le']
        validators = []  # doublon niveau/trimestre contrôlé dans validate(), avec un message clair

    def validate(self, attrs):
        niveau = attrs.get('niveau', getattr(self.instance, 'niveau', None))
        trimestre = attrs.get('trimestre', getattr(self.instance, 'trimestre', None))
        if niveau and trimestre:
            deja = self.Meta.model.objects.filter(niveau=niveau, trimestre=trimestre)
            if self.instance is not None:
                deja = deja.exclude(pk=self.instance.pk)
            if deja.exists():
                raise serializers.ValidationError(
                    f"Un calendrier existe déjà pour {niveau.nom} au {trimestre.nom} : modifiez-le au lieu d'en créer un second.")
        debut = attrs.get('date_debut', getattr(self.instance, 'date_debut', None))
        fin = attrs.get('date_fin', getattr(self.instance, 'date_fin', None))
        if debut and fin and fin < debut:
            raise serializers.ValidationError("La date de fin doit être après la date de début.")
        return attrs

    def validate_niveau(self, value):
        if not value.is_classe_examen:
            raise serializers.ValidationError(
                "Le calendrier d'Examen Blanc n'est disponible que pour les niveaux d'examen (3ème, Terminale)."
            )
        return value


class DeliberationSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    decide_par_nom = serializers.CharField(source='decide_par.username', read_only=True)

    class Meta:
        model = Deliberation
        fields = ['id', 'niveau', 'niveau_nom', 'trimestre', 'trimestre_nom',
                  'date_deliberation', 'decide_par', 'decide_par_nom']
        read_only_fields = ['id', 'date_deliberation', 'decide_par']

    def validate_niveau(self, value):
        if not value.is_classe_examen:
            raise serializers.ValidationError(
                "La délibération d'Examen Blanc n'est disponible que pour les niveaux d'examen (3ème, Terminale)."
            )
        return value
