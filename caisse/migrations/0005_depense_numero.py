from django.db import migrations, models


def numeroter_les_depenses_existantes(apps, schema_editor):
    """Les dépenses déjà saisies reçoivent leur n° de pièce (par école et par année, dans l'ordre de saisie)."""
    Depense = apps.get_model('caisse', 'Depense')
    compteurs = {}
    for d in Depense.objects.order_by('date_depense', 'id'):
        cle = (d.ecole_id, d.date_depense.year)
        compteurs[cle] = compteurs.get(cle, 0) + 1
        d.numero = f"DEP-{d.date_depense.year}-{compteurs[cle]:04d}"
        d.save(update_fields=['numero'])


class Migration(migrations.Migration):

    dependencies = [
        ('caisse', '0004_depense'),
    ]

    operations = [
        migrations.AddField(
            model_name='depense',
            name='numero',
            field=models.CharField(blank=True, db_index=True, default='', max_length=30),
        ),
        migrations.RunPython(numeroter_les_depenses_existantes, migrations.RunPython.noop),
    ]
