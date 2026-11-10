from django.db import migrations


def ouvrir_les_dossiers_manquants(apps, schema_editor):
    """Rattrapage unique : tout élève déjà inscrit reçoit son dossier (montant dû d'après la grille des frais)."""
    Inscription = apps.get_model('scolarite', 'Inscription')
    Dossier = apps.get_model('caisse', 'DossierScolarite')
    Tarif = apps.get_model('caisse', 'TarifNiveau')
    tarifs = {(t.niveau_id, t.annee_scolaire_id): int(t.tranche1 or 0) + int(t.tranche2 or 0) + int(t.tranche3 or 0)
              for t in Tarif.objects.all()}
    deja = set(Dossier.objects.values_list('inscription_id', flat=True))
    nouveaux = []
    for ins in Inscription.objects.select_related('classe').exclude(id__in=deja):
        montant = tarifs.get((ins.classe.niveau_id, ins.annee_scolaire_id), 0) if ins.classe_id else 0
        nouveaux.append(Dossier(inscription=ins, montant_du=montant, statut='IMPAYE', ecole_id=ins.ecole_id))
    Dossier.objects.bulk_create(nouveaux, batch_size=500)


class Migration(migrations.Migration):

    dependencies = [
        ('caisse', '0005_depense_numero'),
        ('scolarite', '0015_actualite'),
    ]

    operations = [
        migrations.RunPython(ouvrir_les_dossiers_manquants, migrations.RunPython.noop),
    ]
