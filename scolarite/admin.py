from django.contrib import admin
from .models import AnneeScolaire, Niveau, Classe, Trimestre, Inscription


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
    list_display = ['eleve', 'classe', 'date_inscription']
    list_filter = ['classe__niveau']
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']
