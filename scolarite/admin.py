from django.contrib import admin
from .models import (
    AnneeScolaire, Niveau, Classe, Trimestre, Inscription,
    DemandeInscription, ResultatExamenNational, PassageAnnee,
)


@admin.register(AnneeScolaire)
class AnneeScolaireAdmin(admin.ModelAdmin):
    list_display = ['libelle']
    search_fields = ['libelle']


@admin.register(Niveau)
class NiveauAdmin(admin.ModelAdmin):
    list_display = ['nom']
    search_fields = ['nom']


@admin.register(Classe)
class ClasseAdmin(admin.ModelAdmin):
    list_display = ['nom', 'niveau', 'professeur_principal']
    list_filter = ['niveau']
    search_fields = ['nom', 'niveau__nom']


@admin.register(Trimestre)
class TrimestreAdmin(admin.ModelAdmin):
    list_display = ['nom', 'annee_scolaire']
    list_filter = ['annee_scolaire']


@admin.register(Inscription)
class InscriptionAdmin(admin.ModelAdmin):
    list_display = ['eleve', 'classe', 'annee_scolaire', 'redoublant', 'statut', 'date_inscription']
    list_filter = ['annee_scolaire', 'classe__niveau', 'redoublant', 'statut']
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']


@admin.register(DemandeInscription)
class DemandeInscriptionAdmin(admin.ModelAdmin):
    list_display = ['prenom', 'nom', 'niveau_souhaite', 'statut', 'date_depot', 'ecole', 'is_active']
    list_filter = ['statut', 'ecole', 'is_active']
    search_fields = ['nom', 'prenom', 'nom_parent', 'telephone_parent']


@admin.register(ResultatExamenNational)
class ResultatExamenNationalAdmin(admin.ModelAdmin):
    list_display = ['eleve', 'examen', 'annee_scolaire', 'admis', 'serie_2nde']
    list_filter = ['examen', 'annee_scolaire', 'admis']
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']


@admin.register(PassageAnnee)
class PassageAnneeAdmin(admin.ModelAdmin):
    list_display = ['annee_source', 'annee_cible', 'date_lancement', 'admis', 'redoublants', 'diplomes']
