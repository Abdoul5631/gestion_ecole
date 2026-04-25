from django.contrib import admin
from .models import Enseignant, Matiere, ClasseMatiere


@admin.register(Enseignant)
class EnseignantAdmin(admin.ModelAdmin):
    list_display = ['nom', 'prenom', 'sexe', 'telephone', 'email', 'est_actif']
    list_filter = ['sexe', 'est_actif']
    search_fields = ['nom', 'prenom', 'email']
    ordering = ['nom', 'prenom']


@admin.register(Matiere)
class MatiereAdmin(admin.ModelAdmin):
    list_display = ['code', 'nom', 'coefficient', 'type']
    list_filter = ['type']
    search_fields = ['code', 'nom']
    ordering = ['nom']


@admin.register(ClasseMatiere)
class ClasseMatiereAdmin(admin.ModelAdmin):
    list_display = ['niveau', 'matiere', 'enseignant', 'annee', 'volume_horaire']
    list_filter = ['annee', 'niveau', 'matiere']
    search_fields = ['enseignant__nom', 'matiere__nom', 'niveau__nom']
    ordering = ['annee', 'niveau', 'matiere']