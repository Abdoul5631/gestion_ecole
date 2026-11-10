"""Un élève inscrit a TOUJOURS son dossier de scolarité, sans geste du comptable.

  * toute inscription (création, changement de classe, import, passage d'année…) ouvre / met à jour le dossier ;
  * toute modification de la grille des frais recalcule le montant dû des dossiers concernés.
Le montant dû d'un dossier qui a déjà des paiements n'est jamais modifié (voir services.ouvrir_dossier).
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='scolarite.Inscription')
def dossier_a_l_inscription(sender, instance, raw=False, **kwargs):
    if raw:
        return
    from .services import ouvrir_dossier
    ouvrir_dossier(instance)


@receiver(post_save, sender='caisse.TarifNiveau')
def dossiers_apres_changement_de_grille(sender, instance, raw=False, **kwargs):
    if raw:
        return
    from scolarite.models import Inscription
    from .services import ouvrir_dossier
    for ins in Inscription.objects.filter(
        classe__niveau_id=instance.niveau_id, annee_scolaire_id=instance.annee_scolaire_id,
    ).select_related('classe', 'annee_scolaire', 'ecole'):
        ouvrir_dossier(ins)
