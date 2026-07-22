from django.contrib import admin
from .models import Evaluation, Note


@admin.register(Evaluation)
class EvaluationAdmin(admin.ModelAdmin):
    list_display = ['type', 'coefficient', 'trimestre', 'classe_matiere']
    list_filter = ['type', 'trimestre']
    search_fields = ['classe_matiere__matiere__nom']
    ordering = ['trimestre']


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ['eleve', 'evaluation', 'valeur']
    list_filter = ['evaluation__trimestre', 'evaluation__type']
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']
    ordering = ['evaluation', 'eleve__nom']