from django.contrib import admin
from .models import TarifNiveau, DossierScolarite, Paiement, Depense


@admin.register(TarifNiveau)
class TarifNiveauAdmin(admin.ModelAdmin):
    list_display = ['niveau', 'annee_scolaire', 'tranche1', 'tranche2', 'tranche3']
    list_filter = ['annee_scolaire', 'niveau']


@admin.register(DossierScolarite)
class DossierScolariteAdmin(admin.ModelAdmin):
    list_display = ['inscription', 'montant_du', 'statut', 'composition_bloquee']
    list_filter = ['statut', 'composition_bloquee']
    search_fields = ['inscription__eleve__nom', 'inscription__eleve__matricule']


@admin.register(Paiement)
class PaiementAdmin(admin.ModelAdmin):
    list_display = ['numero_recu', 'dossier', 'tranche', 'montant', 'date_paiement', 'mode']
    list_filter = ['tranche', 'mode']
    search_fields = ['numero_recu']


@admin.register(Depense)
class DepenseAdmin(admin.ModelAdmin):
    list_display = ['libelle', 'categorie', 'montant', 'date_depense', 'is_active']
    list_filter = ['categorie', 'is_active']
