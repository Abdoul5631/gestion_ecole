from rest_framework import serializers
from .models import (
    Actualite,
    AnneeScolaire, Niveau, Classe, Trimestre, Inscription,
    ResultatExamenNational, PassageAnnee,
)
from .utils import get_annee_active


class AnneeScolaireSerializer(serializers.ModelSerializer):
    # En cours / à venir / terminée : l'année en cours est unique et se change par « Définir comme année en cours »
    etat = serializers.SerializerMethodField()
    nb_trimestres = serializers.SerializerMethodField()

    class Meta:
        model = AnneeScolaire
        fields = '__all__'
        extra_kwargs = {'ecole': {'read_only': True}}
        read_only_fields = ['id', 'is_active']

    def _en_cours(self, obj):
        cache = self.context.setdefault('_annee_en_cours', {})
        if obj.ecole_id not in cache:
            cache[obj.ecole_id] = AnneeScolaire.objects.filter(ecole_id=obj.ecole_id, is_active=True) \
                .values_list('libelle', flat=True).first()
        return cache[obj.ecole_id]

    def get_etat(self, obj):
        if obj.is_active:
            return 'EN_COURS'
        courante = self._en_cours(obj)
        return 'A_VENIR' if courante and obj.libelle > courante else 'TERMINEE'

    def get_nb_trimestres(self, obj):
        return obj.trimestres.count()

    def validate_libelle(self, value):
        import re
        v = (value or '').strip().replace(' ', '').replace('/', '-')
        m = re.fullmatch(r'(\d{4})-(\d{4})', v)
        if not m or int(m.group(2)) != int(m.group(1)) + 1:
            raise serializers.ValidationError("Écrivez l'année sous la forme 2026-2027 (deux années qui se suivent).")
        if self.instance is not None and v != self.instance.libelle and (
                self.instance.inscriptions.exists() or Trimestre.objects.filter(
                    annee_scolaire=self.instance, evaluations__isnull=False).exists()):
            raise serializers.ValidationError(
                f"L'année {self.instance.libelle} contient déjà des inscriptions ou des notes : son libellé ne peut plus changer "
                "(bulletins, reçus et historiques en dépendent).")
        request = self.context.get('request')
        ecole_id = getattr(getattr(request, 'user', None), 'ecole_id', None)
        deja = AnneeScolaire.objects.filter(libelle=v, ecole_id=ecole_id)
        if self.instance is not None:
            deja = deja.exclude(pk=self.instance.pk)
        if deja.exists():
            raise serializers.ValidationError(f"L'année {v} existe déjà.")
        return v


class NiveauSerializer(serializers.ModelSerializer):
    nb_classes = serializers.SerializerMethodField()
    nb_eleves = serializers.SerializerMethodField()
    programme_par_classe = serializers.SerializerMethodField()
    examen_blanc_par_classe = serializers.SerializerMethodField()

    def get_examen_blanc_par_classe(self, obj):
        from evaluations.programme import examen_blanc_par_classe
        return examen_blanc_par_classe(obj)

    def get_programme_par_classe(self, obj):
        from evaluations.programme import programme_par_classe
        return programme_par_classe(obj)

    def get_nb_classes(self, obj):
        return obj.classes.filter(is_active=True).count()

    def get_nb_eleves(self, obj):
        qs = Inscription.objects.filter(classe__niveau=obj, is_active=True)
        annee = self.context.get('annee')
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        return qs.count()

    class Meta:
        model = Niveau
        fields = '__all__'
        extra_kwargs = {'ecole': {'read_only': True}}
        read_only_fields = ['id', 'nb_classes', 'nb_eleves']


class ClasseSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    niveau_is_classe_examen = serializers.BooleanField(source='niveau.is_classe_examen', read_only=True)
    professeur_nom = serializers.CharField(source='professeur_principal.nom', read_only=True)
    nom_complet = serializers.SerializerMethodField()
    nb_eleves = serializers.SerializerMethodField()
    professeur_principal_nom = serializers.SerializerMethodField(read_only=True)
    professeur_principal_signature = serializers.SerializerMethodField(read_only=True)

    def get_nom_complet(self, obj):
        return obj.nom

    def validate(self, attrs):
        """On saisit seulement la lettre de la classe (A, B, C…) : la classe s'appelle « niveau + lettre », ex. 6ème A."""
        import re
        niveau = attrs.get('niveau') or getattr(self.instance, 'niveau', None)
        if 'nom' in attrs or ('niveau' in attrs and self.instance is not None):
            brut = str(attrs.get('nom', getattr(self.instance, 'nom', '')) or '').strip()
            ancien = getattr(self.instance, 'nom', None)
            if self.instance is not None and brut == ancien and attrs.get('niveau', niveau) == self.instance.niveau:
                return attrs  # classe existante inchangée (anciens noms libres conservés)
            # « 6ème A » (nom complet) ou « A » : on ne garde que la lettre
            for prefixe in {getattr(niveau, 'nom', ''), getattr(getattr(self.instance, 'niveau', None), 'nom', '')}:
                if prefixe and brut.lower().startswith(prefixe.lower() + ' '):
                    brut = brut[len(prefixe):].strip()
            lettre = brut.upper()
            if not re.fullmatch(r'[A-ZÀ-ÖØ-Ý]{1,3}', lettre):
                raise serializers.ValidationError({
                    'nom': "Saisissez seulement la lettre de la classe : A, B, C… (lettres uniquement, sans chiffre ni espace)."
                })
            if niveau is None:
                raise serializers.ValidationError({'niveau': 'Choisissez le niveau de la classe.'})
            nom = f'{niveau.nom} {lettre}'
            deja = Classe.objects.filter(niveau=niveau, nom__iexact=nom)
            if self.instance is not None:
                deja = deja.exclude(pk=self.instance.pk)
            if deja.exists():
                raise serializers.ValidationError({'nom': f'La classe {nom} existe déjà.'})
            attrs['nom'] = nom
        return attrs

    def get_nb_eleves(self, obj):
        annee = self.context.get('annee')
        if 'annee' not in self.context:
            request = self.context.get('request')
            ecole = getattr(getattr(request, 'user', None), 'ecole', None) or getattr(obj, 'ecole', None)
            annee = get_annee_active(ecole)
            self.context['annee'] = annee
        qs = obj.inscriptions.filter(is_active=True)
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        return qs.count()

    def get_professeur_principal_nom(self, obj):
        return obj.professeur_principal.nom if obj.professeur_principal else None

    def get_professeur_principal_signature(self, obj):
        if obj.professeur_principal and obj.professeur_principal.signature:
            request = self.context.get('request')
            url = obj.professeur_principal.signature.url
            return request.build_absolute_uri(url) if request else url
        return None

    class Meta:
        model = Classe
        fields = [
            'id', 'nom', 'niveau', 'niveau_nom', 'niveau_is_classe_examen', 'is_active',
            'professeur_principal', 'professeur_nom',
            'nom_complet', 'nb_eleves',
            'professeur_principal_nom', 'professeur_principal_signature',
        ]
        read_only_fields = [
            'id', 'niveau_nom', 'niveau_is_classe_examen', 'professeur_nom', 'nom_complet', 'nb_eleves',
            'professeur_principal_nom', 'professeur_principal_signature',
        ]


class TrimestreSerializer(serializers.ModelSerializer):
    annee_libelle = serializers.CharField(source='annee_scolaire.libelle', read_only=True)
    annee_active = serializers.BooleanField(source='annee_scolaire.is_active', read_only=True)

    class Meta:
        model = Trimestre
        fields = '__all__'
        extra_kwargs = {'ecole': {'read_only': True}}
        read_only_fields = ['id', 'bulletins_ouverts']
        validators = []  # doublon contrôlé dans validate(), avec un message clair

    def validate(self, attrs):
        nom = (attrs.get('nom', getattr(self.instance, 'nom', '')) or '').strip()
        annee = attrs.get('annee_scolaire', getattr(self.instance, 'annee_scolaire', None))
        from .utils import trimestre_index
        if 'nom' in attrs:
            attrs['nom'] = nom
        a_des_notes = self.instance is not None and self.instance.evaluations.exists()
        if a_des_notes and 'nom' in attrs and nom != self.instance.nom:
            raise serializers.ValidationError({'nom': f"{self.instance.nom} contient déjà des évaluations : son nom ne peut plus changer "
                                                      "(le calcul de la moyenne annuelle en dépend)."})
        if a_des_notes and attrs.get('is_active') is False:
            raise serializers.ValidationError({'is_active': f"{self.instance.nom} contient déjà des évaluations : il ne peut pas être "
                                                            "suspendu, ses notes disparaîtraient des bulletins."})
        # le numéro du trimestre (1, 2 ou 3) sert aux bulletins et à la moyenne annuelle : il doit être clair et unique
        if 'nom' in attrs and trimestre_index(nom) not in (1, 2, 3):
            raise serializers.ValidationError({'nom': 'Choisissez Trimestre 1, Trimestre 2 ou Trimestre 3.'})
        if annee and nom:
            meme_numero = [t for t in Trimestre.objects.filter(annee_scolaire=annee)
                           if trimestre_index(t.nom) == trimestre_index(nom) and (self.instance is None or t.pk != self.instance.pk)]
            if meme_numero:
                raise serializers.ValidationError({'nom': f"« {meme_numero[0].nom} » existe déjà pour l'année {annee.libelle}."})
        # un trimestre qui a déjà des notes ne change pas d'année : elles se mélangeraient
        if self.instance is not None and annee and annee.pk != self.instance.annee_scolaire_id \
                and self.instance.evaluations.exists():
            raise serializers.ValidationError({'annee_scolaire': "Ce trimestre a déjà des évaluations : il ne peut pas changer d'année."})
        return attrs


class InscriptionSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    eleve_date_naissance = serializers.DateField(source='eleve.date_naissance', read_only=True, allow_null=True)
    classe_nom = serializers.SerializerMethodField()
    niveau_nom = serializers.SerializerMethodField()
    annee_libelle = serializers.CharField(source='annee_scolaire.libelle', read_only=True)
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)

    def get_classe_nom(self, obj):
        return obj.classe.nom if obj.classe else None

    def get_niveau_nom(self, obj):
        return obj.classe.niveau.nom if obj.classe else None

    def validate(self, attrs):
        eleve = attrs.get('eleve') or getattr(self.instance, 'eleve', None)
        annee = attrs.get('annee_scolaire')
        if annee is None and self.instance and self.instance.annee_scolaire_id:
            # PUT sans année (ou année nulle) : on conserve l'année existante,
            # sinon DRF la remet à None et l'élève sort de l'année en cours.
            annee = self.instance.annee_scolaire
            attrs['annee_scolaire'] = annee
        if annee is None:
            request = self.context.get('request')
            ecole = getattr(getattr(request, 'user', None), 'ecole', None)
            annee = get_annee_active(ecole)
            if annee:
                attrs['annee_scolaire'] = annee
        classe = attrs.get('classe') or getattr(self.instance, 'classe', None)
        if classe and (
            not getattr(classe, 'is_active', True)
            or (classe.niveau_id and not classe.niveau.is_active)
        ):
            raise serializers.ValidationError(
                "Cette classe (ou son niveau) est suspendue. Choisissez une classe active."
            )
        if eleve and annee:
            qs = Inscription.objects.filter(eleve=eleve, annee_scolaire=annee)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "Cet élève est déjà inscrit pour cette année scolaire. "
                    "Utilisez le passage / la réinscription pour l'année suivante."
                )
        return attrs

    def create(self, validated_data):
        if not validated_data.get('annee_scolaire'):
            request = self.context.get('request')
            ecole = getattr(getattr(request, 'user', None), 'ecole', None)
            validated_data['annee_scolaire'] = get_annee_active(ecole)
        if not validated_data.get('ecole'):
            request = self.context.get('request')
            ecole = getattr(getattr(request, 'user', None), 'ecole', None)
            if ecole:
                validated_data['ecole'] = ecole
        return super().create(validated_data)

    class Meta:
        model = Inscription
        fields = '__all__'
        read_only_fields = ['id', 'date_inscription']
        # année facultative : à défaut, l'année en cours (validate). Le doublon élève/année est contrôlé
        # dans validate() et par la contrainte unique en base — pas par le validateur DRF qui exige l'année.
        extra_kwargs = {'annee_scolaire': {'required': False}}
        validators = []


class ResultatExamenNationalSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    annee_libelle = serializers.CharField(source='annee_scolaire.libelle', read_only=True)
    examen_libelle = serializers.CharField(source='get_examen_display', read_only=True)

    class Meta:
        model = ResultatExamenNational
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'saisi_par']


class PassageAnneeSerializer(serializers.ModelSerializer):
    annee_source_libelle = serializers.CharField(source='annee_source.libelle', read_only=True)
    annee_cible_libelle = serializers.CharField(source='annee_cible.libelle', read_only=True)
    lance_par_nom = serializers.CharField(source='lance_par.username', read_only=True)

    class Meta:
        model = PassageAnnee
        fields = '__all__'
        read_only_fields = fields


class ActualiteSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()
    retirer_image = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Actualite
        fields = ['id', 'titre', 'contenu', 'image', 'image_url', 'retirer_image', 'photos',
                  'publie', 'epingle', 'date_publication', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'image': {'write_only': True, 'required': False}}

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url

    def get_photos(self, obj):
        request = self.context.get('request')
        return [
            {'id': p.id, 'url': request.build_absolute_uri(p.image.url) if request else p.image.url}
            for p in obj.photos.all()
        ]

    def validate_titre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Le titre est obligatoire.')
        return value

    def validate_image(self, f):
        if f and f.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Image trop lourde (5 Mo maximum).')
        return f

    def update(self, instance, validated_data):
        if validated_data.pop('retirer_image', False):
            instance.image = None
        return super().update(instance, validated_data)

    def create(self, validated_data):
        validated_data.pop('retirer_image', None)
        return super().create(validated_data)
