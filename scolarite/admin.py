from django.contrib import admin
from .models import AnneeScolaire, Niveau, Trimestre, Inscription


@admin.register(AnneeScolaire)
class AnneeScolaireAdmin(admin.ModelAdmin):
    list_display = ['libelle', 'date_debut', 'date_fin', 'est_active']
    list_filter = ['est_active']
    search_fields = ['libelle']


@admin.register(Niveau)
class NiveauAdmin(admin.ModelAdmin):
    list_display = ['nom', 'ordre']
    ordering = ['ordre']


@admin.register(Trimestre)
class TrimestreAdmin(admin.ModelAdmin):
    list_display = ['nom', 'annee', 'date_debut', 'date_fin']
    list_filter = ['annee', 'nom']
    ordering = ['annee', 'nom']


@admin.register(Inscription)
class InscriptionAdmin(admin.ModelAdmin):
    list_display = ['eleve', 'niveau', 'annee', 'date_inscription', 'statut', 'montant_scolarite']
    list_filter = ['statut', 'annee', 'niveau']
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']
    ordering = ['-annee', 'eleve__nom']