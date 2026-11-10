from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    ecole, _ = Parametres.objects.get_or_create(
        pk=1,
        defaults={'nom_ecole': 'Complexe Scolaire Wend-Panga', 'ville': 'Bobo-Dioulasso'},
    )
    for name in ('TarifNiveau', 'DossierScolarite', 'Paiement'):
        Model = apps.get_model('caisse', name)
        Model.objects.filter(ecole__isnull=True).update(ecole=ecole)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0005_parametres_seuil_passage'),
        ('caisse', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='tarifniveau', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='tarifs', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='dossierscolarite', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='dossiers_scolarite', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='paiement', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='paiements', to='parametres.parametres'),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
