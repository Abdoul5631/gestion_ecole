from django.contrib import admin
from .models import Eleve, Presence


@admin.register(Eleve)
class EleveAdmin(admin.ModelAdmin):
    list_display = ['matricule', 'nom', 'prenom', 'sexe', 'date_naissance', 'est_actif']
    list_filter = ['sexe', 'est_actif']
    search_fields = ['matricule', 'nom', 'prenom']
    ordering = ['nom', 'prenom']


@admin.register(Presence)
class PresenceAdmin(admin.ModelAdmin):
    list_display = ['eleve', 'date', 'statut', 'classe_matiere']
    list_filter = ['statut', 'date']
    search_fields = ['eleve__nom', 'eleve__prenom']
    ordering = ['-date']