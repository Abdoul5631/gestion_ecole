from django.contrib import admin
from .models import Evaluation, Note


@admin.register(Evaluation)
class EvaluationAdmin(admin.ModelAdmin):
    list_display = ['type', 'libelle', 'classe_matiere', 'trimestre', 'date', 'coefficient', 'note_sur']
    list_filter = ['type', 'trimestre', 'classe_matiere__niveau']
    search_fields = ['libelle', 'classe_matiere__matiere__nom']
    ordering = ['trimestre', 'date']


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ['eleve', 'evaluation', 'valeur', 'est_absent', 'saisie_le']
    list_filter = ['est_absent', 'evaluation__trimestre', 'evaluation__type']
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']
    ordering = ['evaluation', 'eleve__nom']