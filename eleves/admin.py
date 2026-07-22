from django.contrib import admin
from .models import Eleve, Presence


@admin.register(Eleve)
class EleveAdmin(admin.ModelAdmin):
    list_display = ['matricule', 'nom', 'prenom', 'nom_parent', 'telephone_parent']
    search_fields = ['matricule', 'nom', 'prenom', 'nom_parent', 'telephone_parent']
    ordering = ['nom', 'prenom']


@admin.register(Presence)
class PresenceAdmin(admin.ModelAdmin):
    list_display = ['eleve', 'date', 'statut', 'classe_matiere']
    list_filter = ['statut']
    search_fields = ['eleve__nom', 'eleve__prenom']
    ordering = ['-date']