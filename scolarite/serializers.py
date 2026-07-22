from rest_framework import serializers
from .models import AnneeScolaire, Niveau, Classe, Trimestre, Inscription


class AnneeScolaireSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnneeScolaire
        fields = '__all__'
        read_only_fields = ['id']


class NiveauSerializer(serializers.ModelSerializer):
    class Meta:
        model = Niveau
        fields = '__all__'
        read_only_fields = ['id']


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

    def get_nb_eleves(self, obj):
        return obj.inscriptions.count()

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

    class Meta:
        model = Trimestre
        fields = '__all__'
        read_only_fields = ['id']


class InscriptionSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    classe_nom = serializers.SerializerMethodField()
    niveau_nom = serializers.SerializerMethodField()

    def get_classe_nom(self, obj):
        return obj.classe.nom if obj.classe else None

    def get_niveau_nom(self, obj):
        return obj.classe.niveau.nom if obj.classe else None

    class Meta:
        model = Inscription
        fields = '__all__'
        read_only_fields = ['id', 'date_inscription']
