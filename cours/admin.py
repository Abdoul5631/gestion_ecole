from django.contrib import admin
from .models import Enseignant, Matiere, ClasseMatiere


@admin.register(Enseignant)
class EnseignantAdmin(admin.ModelAdmin):
    list_display = ['nom']
    search_fields = ['nom']
    ordering = ['nom']


@admin.register(Matiere)
class MatiereAdmin(admin.ModelAdmin):
    list_display = ['nom', 'type']
    list_filter = ['type']
    search_fields = ['nom']
    ordering = ['nom']


@admin.register(ClasseMatiere)
class ClasseMatiereAdmin(admin.ModelAdmin):
    list_display = ['classe', 'matiere', 'enseignant', 'coef']
    list_filter = ['classe__niveau', 'matiere']
    search_fields = ['enseignant__nom', 'matiere__nom', 'classe__nom']
    ordering = ['classe', 'matiere']